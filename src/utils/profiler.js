const fs = require("fs").promises;

class Storage {
  constructor(filePath) {
    this.filePath = filePath;
    this.writeQueue = [];
    this.isWriting = false;
    this.debounceTimer = null;
  }

  async init() {
    try {
      await fs.access(this.filePath);
    } catch {
      await fs.writeFile(this.filePath, JSON.stringify({}), "utf8");
    }

    try {
      const content = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  // Debounced write - waits 100ms before writing
  async write(data, immediate = false) {
    if (immediate) {
      return this._writeNow(data);
    }

    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new timer
    return new Promise((resolve) => {
      this.debounceTimer = setTimeout(async () => {
        await this._writeNow(data);
        resolve();
      }, 100);
    });
  }

  async _writeNow(data) {
    const tmpPath = `${this.filePath}.tmp`;
    
    try {
      await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
      await fs.rename(tmpPath, this.filePath);
    } catch (err) {
      // Cleanup temp file if it exists
      try {
        await fs.unlink(tmpPath);
      } catch {}
      throw err;
    }
  }

  async backup(backupPath, data) {
    await fs.writeFile(backupPath, JSON.stringify(data, null, 2), "utf8");
  }

  async restore(backupPath) {
    const content = await fs.readFile(backupPath, "utf8");
    return JSON.parse(content);
  }
}

module.exports = Storage;