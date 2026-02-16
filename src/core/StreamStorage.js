// Stream Storage 💾
// For when your data gets too big for RAM.
// Keeps hot data in an LRU cache, cold data on disk.
// Not the fastest thing ever but way better than crashing.

const fs = require('fs').promises;
const path = require('path');

class StreamStorage {
    constructor(filePath, opts = {}) {
        this.filePath = filePath;
        this.maxItems = opts.maxMemoryItems || 10000;
        this.debug = opts.debug || false;

        // hot cache (LRU-ish)
        this._hot = new Map();
        this._accessOrder = []; // track access for eviction

        // full key index - always in memory, just the keys tho
        this._keyIndex = new Set();

        this._diskData = null; // lazy loaded
        this._dirty = new Set(); // keys that need flushing to disk
    }

    async load() {
        try {
            await fs.access(this.filePath);
            const raw = await fs.readFile(this.filePath, 'utf8');
            const data = JSON.parse(raw);

            // index all keys but only load up to maxItems into hot cache
            const entries = Object.entries(data);
            let loaded = 0;

            for (const [k, v] of entries) {
                this._keyIndex.add(k);

                if (loaded < this.maxItems) {
                    this._hot.set(k, v);
                    this._accessOrder.push(k);
                    loaded++;
                }
            }

            if (this.debug) {
                console.log(`StreamStorage: ${entries.length} total, ${loaded} hot, ${entries.length - loaded} cold`);
            }

            return this._hot;
        } catch {
            return new Map();
        }
    }

    // get a value - check hot cache first, then disk
    async get(key) {
        // hot path
        if (this._hot.has(key)) {
            this._touch(key);
            return this._hot.get(key);
        }

        // cold path - need to read from disk :(
        if (this._keyIndex.has(key)) {
            const val = await this._loadFromDisk(key);
            if (val !== undefined) {
                this._promote(key, val); // bring it into hot cache
                return val;
            }
        }

        return undefined;
    }

    async set(key, value) {
        this._keyIndex.add(key);
        this._hot.set(key, value);
        this._touch(key);
        this._dirty.add(key);

        // evict if over limit
        if (this._hot.size > this.maxItems) {
            this._evict();
        }
    }

    async delete(key) {
        this._keyIndex.delete(key);
        this._hot.delete(key);
        this._dirty.add(key); // mark for disk cleanup too
        this._accessOrder = this._accessOrder.filter(k => k !== key);
        return true;
    }

    has(key) {
        return this._keyIndex.has(key);
    }

    get size() {
        return this._keyIndex.size;
    }

    keys() {
        return [...this._keyIndex];
    }

    // paginated all() - dont try to return 100K items at once
    async all(opts = {}) {
        const limit = opts.limit || 100;
        const offset = opts.offset || 0;

        const allKeys = [...this._keyIndex];
        const pageKeys = allKeys.slice(offset, offset + limit);
        const result = {};

        for (const k of pageKeys) {
            result[k] = await this.get(k);
        }

        return {
            data: result,
            total: allKeys.length,
            limit,
            offset,
            hasMore: offset + limit < allKeys.length
        };
    }

    // flush everything to disk
    async save() {
        // build full object from hot cache + existing disk data
        let diskData = {};

        try {
            await fs.access(this.filePath);
            const raw = await fs.readFile(this.filePath, 'utf8');
            diskData = JSON.parse(raw);
        } catch {
            // no existing file, thats fine
        }

        // merge hot data in
        for (const [k, v] of this._hot) {
            diskData[k] = v;
        }

        // handle deletes
        for (const k of this._dirty) {
            if (!this._keyIndex.has(k)) {
                delete diskData[k];
            }
        }

        // atomic write
        const tmp = this.filePath + '.tmp';
        const json = JSON.stringify(diskData, null, 2);
        await fs.writeFile(tmp, json, 'utf8');
        await fs.rename(tmp, this.filePath);

        this._dirty.clear();
    }

    // move a key to the front (most recently used)
    _touch(key) {
        const idx = this._accessOrder.indexOf(key);
        if (idx > -1) this._accessOrder.splice(idx, 1);
        this._accessOrder.push(key);
    }

    // bring a cold key into hot cache
    _promote(key, value) {
        this._hot.set(key, value);
        this._touch(key);

        if (this._hot.size > this.maxItems) {
            this._evict();
        }
    }

    // kick the least recently used key out of hot cache
    _evict() {
        while (this._hot.size > this.maxItems && this._accessOrder.length > 0) {
            const oldest = this._accessOrder.shift();
            if (oldest && this._hot.has(oldest)) {
                // its already on disk (or will be on next save), just remove from RAM
                this._dirty.add(oldest); // make sure its flushed first
                this._hot.delete(oldest);

                if (this.debug) console.log(`evicted: ${oldest}`);
            }
        }
    }

    // read a single key from disk (slow but necessary)
    async _loadFromDisk(key) {
        try {
            const raw = await fs.readFile(this.filePath, 'utf8');
            const data = JSON.parse(raw);
            return data[key];
        } catch {
            return undefined;
        }
    }

    async clear() {
        this._hot.clear();
        this._keyIndex.clear();
        this._accessOrder = [];
        this._dirty.clear();
    }

    getStats() {
        return {
            totalKeys: this._keyIndex.size,
            hotKeys: this._hot.size,
            coldKeys: this._keyIndex.size - this._hot.size,
            maxItems: this.maxItems,
            dirtyKeys: this._dirty.size,
            memUsage: Math.round(this._hot.size / this.maxItems * 100) + '%'
        };
    }
}

module.exports = StreamStorage;
