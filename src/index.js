const fs = require("fs").promises;
const path = require("path");
const EventEmitter = require("events");

class SehawqDB extends EventEmitter {
  /**
   * Create a new SehawqDB instance.
   * @param {Object} options
   * @param {string} [options.path="sehawq.json"] File path for storage.
   * @param {number} [options.autoSaveInterval=0] Autosave interval in ms (0 disables autosave).
   */
  constructor(options = {}) {
    super();
    this.filePath = path.resolve(options.path || "sehawq.json");
    this.autoSaveInterval = options.autoSaveInterval || 0;
    this.data = {};

    this._init();

    if (this.autoSaveInterval > 0) {
      this._interval = setInterval(() => this.save(), this.autoSaveInterval);
    }
  }

  async _init() {
    try {
      await fs.access(this.filePath);
    } catch {
      await fs.writeFile(this.filePath, JSON.stringify({}), "utf8");
    }

    try {
      const content = await fs.readFile(this.filePath, "utf8");
      this.data = JSON.parse(content);
    } catch {
      this.data = {};
    }
  }

  // ---------------- Core methods ----------------
  set(key, value) {
    this._setByPath(key, value);
    this.emit("set", { key, value });
    this.save();
    return value;
  }

  get(key) {
    return this._getByPath(key);
  }

  delete(key) {
    this._deleteByPath(key);
    this.emit("delete", { key });
    this.save();
  }

  has(key) {
    return this._getByPath(key) !== undefined;
  }

  all() {
    return this.data;
  }

  clear() {
    this.data = {};
    this.emit("clear");
    this.save();
  }

  keys() {
    return Object.keys(this.data);
  }

  values() {
    return Object.values(this.data);
  }

  // ---------------- Array helpers ----------------
  push(key, value) {
    let arr = this._getByPath(key);
    if (!Array.isArray(arr)) arr = [];
    arr.push(value);
    this._setByPath(key, arr);
    this.emit("push", { key, value });
    this.save();
    return arr;
  }

  pull(key, value) {
    let arr = this._getByPath(key);
    if (!Array.isArray(arr)) return [];
    arr = arr.filter(v => v !== value);
    this._setByPath(key, arr);
    this.emit("pull", { key, value });
    this.save();
    return arr;
  }

  // ---------------- Math helpers ----------------
  add(key, number) {
    let val = this._getByPath(key);
    if (typeof val !== "number") val = 0;
    val += number;
    this._setByPath(key, val);
    this.emit("add", { key, number });
    this.save();
    return val;
  }

  subtract(key, number) {
    return this.add(key, -number);
  }

  // ---------------- Backup & Restore ----------------
  async backup(backupPath) {
    await fs.writeFile(backupPath, JSON.stringify(this.data, null, 2), "utf8");
    this.emit("backup", { backupPath });
  }

  async restore(backupPath) {
    const content = await fs.readFile(backupPath, "utf8");
    this.data = JSON.parse(content);
    await this.save();
    this.emit("restore", { backupPath });
  }

  // ---------------- Save ----------------
  async save() {
    const tmpPath = `${this.filePath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(this.data, null, 2), "utf8");
    await fs.rename(tmpPath, this.filePath);
  }

  // ---------------- Internal utilities ----------------
  _getByPath(pathStr) {
    const keys = pathStr.split(".");
    let obj = this.data;
    for (const k of keys) {
      if (obj && Object.prototype.hasOwnProperty.call(obj, k)) {
        obj = obj[k];
      } else {
        return undefined;
      }
    }
    return obj;
  }

  _setByPath(pathStr, value) {
    const keys = pathStr.split(".");
    let obj = this.data;
    while (keys.length > 1) {
      const k = keys.shift();
      if (!obj[k] || typeof obj[k] !== "object") obj[k] = {};
      obj = obj[k];
    }
    obj[keys[0]] = value;
  }

  _deleteByPath(pathStr) {
    const keys = pathStr.split(".");
    let obj = this.data;
    while (keys.length > 1) {
      const k = keys.shift();
      if (!obj[k]) return;
      obj = obj[k];
    }
    delete obj[keys[0]];
  }
}

module.exports = SehawqDB;
