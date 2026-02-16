// Storage Layer
// Handles file I/O with atomic writes and backup support.
// Not the most elegant code but it survives crashes.

const fs = require('fs').promises;
const path = require('path');
const { performance } = require('perf_hooks');

class Storage {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.options = {
      compression: false,
      backupOnWrite: true,
      backupRetention: 5,
      maxFileSize: 50 * 1024 * 1024, // 50mb should be enough for anyone right?
      ...options
    };

    this.writeQueue = [];
    this.isWriting = false;
    this.stats = { reads: 0, writes: 0, backups: 0, errors: 0, totalReadTime: 0, totalWriteTime: 0 };

    this._ensureDir();
  }

  async _ensureDir() {
    const dir = path.dirname(this.filePath);
    try { await fs.access(dir); } catch { await fs.mkdir(dir, { recursive: true }); }
  }

  async read() {
    const t0 = performance.now();

    try {
      try { await fs.access(this.filePath); } catch { return {}; }

      const raw = await fs.readFile(this.filePath, 'utf8');
      const dt = performance.now() - t0;
      this.stats.reads++;
      this.stats.totalReadTime += dt;

      if (this.options.debug) console.log(`Read ${raw.length} bytes in ${dt.toFixed(2)}ms`);

      return JSON.parse(raw);
    } catch (e) {
      this.stats.errors++;
      console.error('read failed:', e);
      return await this._tryRecovery();
    }
  }

  // queued writes so we dont corrupt anything
  async write(data) {
    return new Promise((resolve, reject) => {
      this.writeQueue.push({ data, resolve, reject });
      if (!this.isWriting) this._drain();
    });
  }

  async _drain() {
    if (!this.writeQueue.length || this.isWriting) return;
    this.isWriting = true;
    const t0 = performance.now();

    try {
      const { data, resolve, reject } = this.writeQueue.shift();

      const json = JSON.stringify(data, null, 2);
      if (Buffer.byteLength(json) > this.options.maxFileSize) {
        throw new Error('file too big, refusing to write');
      }

      if (this.options.backupOnWrite) await this._backup();

      // atomic write — tmp file then rename
      const tmp = this.filePath + '.tmp';
      await fs.writeFile(tmp, json, 'utf8');
      await fs.rename(tmp, this.filePath);

      this.stats.writes++;
      this.stats.totalWriteTime += performance.now() - t0;

      if (this.options.debug) console.log(`Wrote ${json.length} bytes`);

      resolve();
    } catch (e) {
      this.stats.errors++;
      console.error('write failed:', e);
      // TODO: should we reject here? for now just log it
      this.writeQueue[0]?.reject(e);
    } finally {
      this.isWriting = false;
      if (this.writeQueue.length) setImmediate(() => this._drain());
    }
  }

  async _backup() {
    try {
      try { await fs.access(this.filePath); } catch { return; } // nothing to backup

      const ts = new Date().toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .split('.')[0];

      const backupPath = `${this.filePath}.backup_${ts}`;
      await fs.copyFile(this.filePath, backupPath);
      this.stats.backups++;

      await this._pruneBackups();

      if (this.options.debug) console.log(`backup: ${backupPath}`);
    } catch (e) {
      console.error('backup failed:', e); // not fatal, keep going
    }
  }

  // remove old backups, keep only N most recent
  async _pruneBackups() {
    try {
      const dir = path.dirname(this.filePath);
      const base = path.basename(this.filePath);
      const files = await fs.readdir(dir);

      const backups = files
        .filter(f => f.startsWith(base + '.backup_'))
        .sort()
        .reverse();

      // delete anything past retention limit
      for (const old of backups.slice(this.options.backupRetention)) {
        await fs.unlink(path.join(dir, old));
        if (this.options.debug) console.log(`pruned: ${old}`);
      }
    } catch (e) {
      console.error('cleanup failed:', e);
    }
  }

  // try to recover from a backup if main file is corrupted
  async _tryRecovery() {
    try {
      const dir = path.dirname(this.filePath);
      const base = path.basename(this.filePath);
      const files = await fs.readdir(dir);

      const backups = files
        .filter(f => f.startsWith(base + '.backup_'))
        .sort().reverse();

      for (const bk of backups) {
        try {
          const data = await fs.readFile(path.join(dir, bk), 'utf8');
          const parsed = JSON.parse(data);
          console.log(`recovered from: ${bk}`);
          await this.write(parsed);
          return parsed;
        } catch {
          continue; // try next backup
        }
      }

      throw new Error('no usable backup found');
    } catch (e) {
      console.error('recovery failed:', e);
      return {};
    }
  }

  getStats() {
    return {
      ...this.stats,
      avgRead: this.stats.reads ? (this.stats.totalReadTime / this.stats.reads).toFixed(2) + 'ms' : '0ms',
      avgWrite: this.stats.writes ? (this.stats.totalWriteTime / this.stats.writes).toFixed(2) + 'ms' : '0ms',
      queueLen: this.writeQueue.length,
      busy: this.isWriting
    };
  }

  // public wrappers
  createBackup() { return this._backup(); }

  async listBackups() {
    try {
      const dir = path.dirname(this.filePath);
      const base = path.basename(this.filePath);
      const files = await fs.readdir(dir);
      return files.filter(f => f.startsWith(base + '.backup_')).sort().reverse();
    } catch { return []; }
  }

  async restoreBackup(name) {
    const bkPath = path.join(path.dirname(this.filePath), name);
    try {
      const raw = await fs.readFile(bkPath, 'utf8');
      const data = JSON.parse(raw);
      await this.write(data);
      console.log(`restored: ${name}`);
      return data;
    } catch (e) {
      throw new Error(`restore failed for ${name}: ${e.message}`);
    }
  }
}

module.exports = Storage;