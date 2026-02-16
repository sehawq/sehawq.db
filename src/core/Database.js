const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');
const Collection = require('./Collection');

// Main DB class with WAL support
class SehawqDB extends EventEmitter {
  constructor(opts = {}) {
    super();

    this.conf = Object.assign({
      path: './sehawq.json',
      autoSave: true,
      saveInterval: 30000, // Longer interval because WAL safe guards us
      cache: true,
      cacheLimit: 1000
    }, opts);

    this.logPath = this.conf.path.replace(/\.json$/, '.log');

    // Internal storage
    this._store = new Map();
    this._cache = new Map();
    this._idx = new Map();

    // TTL tracking - key -> timestamp when it expires
    this._ttl = new Map();
    this._ttlTimer = null;

    // Watchers - key -> Set of callbacks
    this._watchers = new Map();

    // Collection instances (lazy, cached)
    this._collections = new Map();

    // Stats
    this.metrics = { r: 0, w: 0, h: 0, m: 0 };

    this._saving = false;
    this._timer = null;
    this._walHandle = null; // File handle for appending
  }

  // Plugin System 🔌
  use(plugin, opts = {}) {
    try {
      plugin(this, opts);
    } catch (e) {
      console.error('Plugin Error:', e.message); // Don't crash, just warn
    }
    return this; // Chainable
  }

  async init() {
    if (this.ready || this._initializing) return;
    this._initializing = true;

    try {
      // 1. Ensure dir exists
      const dir = path.dirname(this.conf.path);
      await fs.mkdir(dir, { recursive: true });

      // 2. Load snapshot
      await this.loadSnapshot();

      // 2. Replay WAL
      await this.replayWAL();

      // 3. Open WAL for appending
      // 'a' flag for append
      this._walHandle = await fs.open(this.logPath, 'a');

      if (this.conf.autoSave) {
        this.startSaver();
      }

      // TTL cleanup loop
      this._startTTLSweep();

      this.ready = true;
      this.emit('ready');
      if (this.conf.debug) console.log('DB Ready (WAL Enabled)');

    } catch (e) {
      this.emit('error', e);
      throw e;
    }
  }

  async loadSnapshot() {
    try {
      const txt = await fs.readFile(this.conf.path, 'utf8');
      const json = JSON.parse(txt);
      for (const k in json) this._store.set(k, json[k]);
      if (this.conf.debug) console.log(`Snapshot loaded: ${this._store.size} items`);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }

  async replayWAL() {
    try {
      const log = await fs.readFile(this.logPath, 'utf8');
      const lines = log.split('\n');
      let replayCount = 0;

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (entry.op === 'put') this._store.set(entry.k, entry.v);
          if (entry.op === 'del') this._store.delete(entry.k);
          if (entry.op === 'clr') this._store.clear();
          if (entry.op === 'ttl') {
            // only restore if not already expired
            if (entry.exp > Date.now()) this._ttl.set(entry.k, entry.exp);
          }
          replayCount++;
        } catch (err) {
          console.warn('Corrupt WAL line ignored:', line);
        }
      }

      if (this.conf.debug && replayCount > 0) {
        console.log(`WAL Replayed: ${replayCount} ops`);
      }
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }

  async appendToWAL(entry) {
    if (!this._walHandle) return;
    const line = JSON.stringify(entry) + '\n';
    await this._walHandle.write(line);
    // Optional: await this._walHandle.sync(); // For extreme safety but slower
  }

  async set(k, v, opts = {}) {
    if (!this.ready) throw new Error('DB not ready');

    const old = this._store.get(k);
    this._store.set(k, v);

    if (this.conf.cache) this.updateCache(k, v);

    // WAL Write
    await this.appendToWAL({ op: 'put', k, v });

    // TTL handling
    if (opts.ttl && typeof opts.ttl === 'number') {
      const exp = Date.now() + (opts.ttl * 1000);
      this._ttl.set(k, exp);
      await this.appendToWAL({ op: 'ttl', k, exp });
    }

    this.metrics.w++;
    this.emit('set', { key: k, value: v, old });

    // Notify watchers
    this._notifyWatchers(k, v, old);

    return this;
  }

  get(k) {
    if (!this.ready) throw new Error('DB not ready');
    this.metrics.r++;

    if (this.conf.cache && this._cache.has(k)) {
      this.metrics.h++;
      return this._cache.get(k);
    }

    this.metrics.m++;
    const v = this._store.get(k);
    if (this.conf.cache && v !== undefined) this.updateCache(k, v);
    return v;
  }

  async delete(k) {
    if (!this._store.has(k)) return false;

    const old = this._store.get(k);
    this._store.delete(k);
    this._cache.delete(k);
    this._ttl.delete(k); // cleanup ttl if any

    // WAL Write
    await this.appendToWAL({ op: 'del', k });

    this.emit('delete', { key: k, old });
    this._notifyWatchers(k, undefined, old);
    return true;
  }

  has(k) { return this._store.has(k); }
  all() { return Object.fromEntries(this._store); }

  async clear() {
    const size = this._store.size;
    this._store.clear();
    this._cache.clear();
    this._idx.clear(); // If index manager listens to clear, good. If not, manual clear needed in index manager logic.

    await this.appendToWAL({ op: 'clr' });

    this.emit('clear', { size });
    return this;
  }

  updateCache(k, v) {
    if (this._cache.size >= this.conf.cacheLimit) {
      const head = this._cache.keys().next().value;
      this._cache.delete(head);
    }
    this._cache.set(k, v);
  }

  // Snapshotting (Compact WAL)
  async save() {
    if (this._saving) return; // Prevent overlap
    this._saving = true;

    try {
      // 1. Write full state to .json
      const raw = JSON.stringify(Object.fromEntries(this._store), null, 2);
      const tmp = this.conf.path + '.tmp';
      await fs.writeFile(tmp, raw);
      await fs.rename(tmp, this.conf.path);

      // 2. Rotate WAL
      // Close existing handle safely
      if (this._walHandle) {
        await this._walHandle.close();
        this._walHandle = null;
      }

      // Truncate file
      await fs.writeFile(this.logPath, '');

      // Reopen
      this._walHandle = await fs.open(this.logPath, 'a');

      if (this.conf.debug) console.log('Snapshot saved & WAL compacted');
      this.emit('save', { count: this._store.size });
    } catch (e) {
      console.error('Save failed:', e);
      this.emit('error', e);
    } finally {
      this._saving = false;
    }
  }

  startSaver() {
    // Regular snapshotting to keep WAL small
    this._timer = setInterval(() => {
      if (this.ready) this.save();
    }, this.conf.saveInterval);
  }

  // --- TTL Sweep ---
  // Runs every 10s, deletes expired keys. Not the most efficient but
  // for our scale it's more than enough. TODO: batch expire for perf
  _startTTLSweep() {
    this._ttlTimer = setInterval(() => {
      const now = Date.now();
      for (const [k, exp] of this._ttl) {
        if (now >= exp) {
          this._ttl.delete(k);
          this.delete(k).catch(() => { }); // async but we dont wait
          if (this.conf.debug) console.log(`TTL expired: ${k}`);
        }
      }
    }, 10000);
  }

  // --- Watch / Unwatch ---
  // Firebase-style reactive listeners on specific keys
  watch(key, cb) {
    if (!this._watchers.has(key)) this._watchers.set(key, new Set());
    this._watchers.get(key).add(cb);
  }

  unwatch(key, cb) {
    if (!this._watchers.has(key)) return;
    if (cb) {
      this._watchers.get(key).delete(cb);
      if (this._watchers.get(key).size === 0) this._watchers.delete(key);
    } else {
      this._watchers.delete(key); // remove all watchers for this key
    }
  }

  _notifyWatchers(key, newVal, oldVal) {
    if (!this._watchers.has(key)) return;
    for (const cb of this._watchers.get(key)) {
      try { cb(newVal, oldVal); } catch (e) { /* don't let bad callbacks crash us */ }
    }
  }

  // --- Collections ---
  // Returns a Collection instance for the given name.
  // Cached so you always get the same reference.
  collection(name) {
    if (!this._collections.has(name)) {
      this._collections.set(name, new Collection(this, name));
    }
    return this._collections.get(name);
  }

  getStats() {
    const total = this.metrics.h + this.metrics.m;
    const rate = total === 0 ? 0 : ((this.metrics.h / total) * 100).toFixed(2);

    return {
      reads: this.metrics.r,
      writes: this.metrics.w,
      hits: this.metrics.h,
      misses: this.metrics.m,
      rate: `${rate}%`,
      size: this._store.size,
      ttlKeys: this._ttl.size
    };
  }

  async close() {
    if (this._timer) clearInterval(this._timer);
    if (this._ttlTimer) clearInterval(this._ttlTimer);
    await this.save(); // Final snapshot
    if (this._walHandle) await this._walHandle.close();
    this.ready = false;
    this.emit('close');
  }
}

module.exports = SehawqDB;