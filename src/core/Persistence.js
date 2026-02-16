// Persistence Layer
// Handles saving/loading data to disk. Supports auto-save,
// basic compression/encryption stubs, and backup recovery.

const fs = require('fs').promises;
const path = require('path');
const { performance } = require('perf_hooks');

class Persistence {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.options = {
      autoSave: true,
      saveInterval: 5000,
      compression: false,
      encryption: false,
      encryptionKey: null,
      ...options
    };

    this.data = new Map();
    this.isSaving = false;
    this.saveQueue = [];
    this.stats = { reads: 0, writes: 0, saves: 0, loads: 0, errors: 0 };

    this._ensureDir();
  }

  async _ensureDir() {
    try {
      const dir = path.dirname(this.filePath);
      await fs.access(dir);
    } catch {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    }
  }

  async load() {
    const t0 = performance.now();
    this.stats.loads++;

    try {
      try { await fs.access(this.filePath); } catch {
        this.data.clear();
        return new Map();
      }

      const raw = await fs.readFile(this.filePath, 'utf8');

      // compression and encryption are stubbed for now
      // TODO: actually implement these if someone needs them
      let parsed;
      if (this.options.compression) {
        parsed = JSON.parse(raw); // same thing for now lol
      } else if (this.options.encryption) {
        if (!this.options.encryptionKey) throw new Error('need encryption key');
        parsed = JSON.parse(raw); // placeholder
      } else {
        parsed = JSON.parse(raw);
      }

      this.data.clear();
      for (const [k, v] of Object.entries(parsed)) {
        this.data.set(k, v);
      }

      if (this.options.debug) {
        const dt = performance.now() - t0;
        console.log(`loaded ${this.data.size} records in ${dt.toFixed(2)}ms`);
      }

      return this.data;
    } catch (e) {
      this.stats.errors++;
      console.error('load failed:', e);
      return await this._recover();
    }
  }

  async save(data = null) {
    if (this.isSaving) {
      // queue it up, dont lose writes
      return new Promise((resolve, reject) => {
        this.saveQueue.push({ data, resolve, reject });
      });
    }

    this.isSaving = true;
    this.stats.saves++;

    try {
      const d = data || this.data;
      const obj = Object.fromEntries(d);

      // same stub situation as load
      let output;
      if (this.options.compression) {
        output = JSON.stringify(obj, null, 2);
      } else if (this.options.encryption) {
        if (!this.options.encryptionKey) throw new Error('need encryption key');
        output = JSON.stringify(obj, null, 2);
      } else {
        output = JSON.stringify(obj, null, 2);
      }

      // atomic write
      const tmp = this.filePath + '.tmp';
      await fs.writeFile(tmp, output, 'utf8');
      await fs.rename(tmp, this.filePath);

      this.stats.writes++;
      return true;
    } catch (e) {
      this.stats.errors++;
      console.error('save error:', e);
      throw e;
    } finally {
      this.isSaving = false;

      // process next in queue
      if (this.saveQueue.length) {
        const next = this.saveQueue.shift();
        this.save(next.data).then(next.resolve).catch(next.reject);
      }
    }
  }

  async set(key, value) {
    this.data.set(key, value);
    if (this.options.autoSave) await this.save();
    return true;
  }

  async get(key) {
    this.stats.reads++;
    return this.data.get(key);
  }

  async delete(key) {
    const ok = this.data.delete(key);
    if (ok && this.options.autoSave) await this.save();
    return ok;
  }

  async has(key) { return this.data.has(key); }
  async getAll() { return new Map(this.data); }

  async clear() {
    this.data.clear();
    if (this.options.autoSave) await this.save();
    return true;
  }

  async backup(backupPath = null) {
    const dest = backupPath || `${this.filePath}.backup_${Date.now()}`;
    try {
      await this.save();
      await fs.copyFile(this.filePath, dest);
      if (this.options.debug) console.log(`backup: ${dest}`);
      return dest;
    } catch (e) {
      console.error('backup failed:', e);
      throw e;
    }
  }

  async _recover() {
    try {
      const dir = path.dirname(this.filePath);
      const base = path.basename(this.filePath);
      const files = await fs.readdir(dir);

      const backups = files
        .filter(f => f.startsWith(base + '.backup_'))
        .sort().reverse();

      for (const bk of backups) {
        try {
          const bkPath = path.join(dir, bk);
          await fs.copyFile(bkPath, this.filePath);
          console.log(`recovered from ${bk}`);
          return await this.load();
        } catch { continue; }
      }
      throw new Error('no valid backup');
    } catch (e) {
      console.error('recovery failed:', e);
      this.data.clear();
      return new Map();
    }
  }

  getStats() {
    return {
      ...this.stats,
      size: this.data.size,
      path: this.filePath,
      busy: this.isSaving,
      queued: this.saveQueue.length
    };
  }

  startAutoSave() {
    if (this._autoTimer) clearInterval(this._autoTimer);
    this._autoTimer = setInterval(() => {
      if (this.data.size > 0) {
        this.save().catch(e => console.error('autosave failed:', e));
      }
    }, this.options.saveInterval);
  }

  stopAutoSave() {
    if (this._autoTimer) {
      clearInterval(this._autoTimer);
      this._autoTimer = null;
    }
  }

  async close() {
    this.stopAutoSave();
    // drain the queue before closing
    while (this.saveQueue.length) {
      const { data, resolve, reject } = this.saveQueue.shift();
      try { await this.save(data); resolve(); } catch (e) { reject(e); }
    }
    if (this.data.size > 0) await this.save();
  }
}

module.exports = Persistence;