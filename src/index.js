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

  // ---------------- NEW: Query System ----------------
  
  /**
   * Find all entries that match the filter function
   * @param {Function} filter - Filter function (item, key) => boolean
   * @returns {QueryResult} Chainable query result
   */
  find(filter) {
    const results = [];
    
    if (typeof filter === 'function') {
      for (const [key, value] of Object.entries(this.data)) {
        if (filter(value, key)) {
          results.push({ key, value });
        }
      }
    } else {
      // Eğer filter verilmezse tüm dataları döndür
      for (const [key, value] of Object.entries(this.data)) {
        results.push({ key, value });
      }
    }
    
    return new QueryResult(results);
  }

  /**
   * Find first entry that matches the filter
   * @param {Function} filter - Filter function
   * @returns {Object|undefined} First matching item
   */
  findOne(filter) {
    if (typeof filter === 'function') {
      for (const [key, value] of Object.entries(this.data)) {
        if (filter(value, key)) {
          return { key, value };
        }
      }
    }
    return undefined;
  }

  /**
   * Filter by field value with operators
   * @param {string} field - Field name (supports dot notation)
   * @param {string} operator - Comparison operator (=, !=, >, <, >=, <=, in, contains)
   * @param {*} value - Value to compare
   * @returns {QueryResult} Chainable query result
   */
  where(field, operator, value) {
    return this.find((item, key) => {
      const fieldValue = this._getValueByPath(item, field);
      
      switch (operator) {
        case '=':
        case '==':
          return fieldValue === value;
        case '!=':
          return fieldValue !== value;
        case '>':
          return fieldValue > value;
        case '<':
          return fieldValue < value;
        case '>=':
          return fieldValue >= value;
        case '<=':
          return fieldValue <= value;
        case 'in':
          return Array.isArray(value) && value.includes(fieldValue);
        case 'contains':
          return typeof fieldValue === 'string' && fieldValue.includes(value);
        case 'startsWith':
          return typeof fieldValue === 'string' && fieldValue.startsWith(value);
        case 'endsWith':
          return typeof fieldValue === 'string' && fieldValue.endsWith(value);
        default:
          return false;
      }
    });
  }

  // ---------------- NEW: Aggregation System ----------------
  
  /**
   * Count total entries
   * @param {Function} [filter] - Optional filter function
   * @returns {number} Count of entries
   */
  count(filter) {
    if (filter) {
      return this.find(filter).count();
    }
    return Object.keys(this.data).length;
  }

  /**
   * Sum numeric values by field
   * @param {string} field - Field name to sum
   * @param {Function} [filter] - Optional filter function
   * @returns {number} Sum of values
   */
  sum(field, filter) {
    const items = filter ? this.find(filter).toArray() : this.find().toArray();
    return items.reduce((sum, item) => {
      const val = this._getValueByPath(item.value, field);
      return sum + (typeof val === 'number' ? val : 0);
    }, 0);
  }

  /**
   * Average of numeric values by field
   * @param {string} field - Field name to average
   * @param {Function} [filter] - Optional filter function
   * @returns {number} Average of values
   */
  avg(field, filter) {
    const items = filter ? this.find(filter).toArray() : this.find().toArray();
    if (items.length === 0) return 0;
    
    const sum = items.reduce((total, item) => {
      const val = this._getValueByPath(item.value, field);
      return total + (typeof val === 'number' ? val : 0);
    }, 0);
    
    return sum / items.length;
  }

  /**
   * Minimum value by field
   * @param {string} field - Field name
   * @param {Function} [filter] - Optional filter function
   * @returns {*} Minimum value
   */
  min(field, filter) {
    const items = filter ? this.find(filter).toArray() : this.find().toArray();
    if (items.length === 0) return undefined;
    
    return Math.min(...items.map(item => {
      const val = this._getValueByPath(item.value, field);
      return typeof val === 'number' ? val : Infinity;
    }).filter(val => val !== Infinity));
  }

  /**
   * Maximum value by field
   * @param {string} field - Field name
   * @param {Function} [filter] - Optional filter function
   * @returns {*} Maximum value
   */
  max(field, filter) {
    const items = filter ? this.find(filter).toArray() : this.find().toArray();
    if (items.length === 0) return undefined;
    
    return Math.max(...items.map(item => {
      const val = this._getValueByPath(item.value, field);
      return typeof val === 'number' ? val : -Infinity;
    }).filter(val => val !== -Infinity));
  }

  /**
   * Group entries by field value
   * @param {string} field - Field name to group by
   * @param {Function} [filter] - Optional filter function
   * @returns {Object} Grouped results
   */
  groupBy(field, filter) {
    const items = filter ? this.find(filter).toArray() : this.find().toArray();
    const groups = {};
    
    items.forEach(item => {
      const groupKey = this._getValueByPath(item.value, field);
      const key = groupKey !== undefined ? String(groupKey) : 'undefined';
      
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
    });
    
    return groups;
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

  _getValueByPath(obj, pathStr) {
    const keys = pathStr.split(".");
    let result = obj;
    for (const key of keys) {
      if (result && Object.prototype.hasOwnProperty.call(result, key)) {
        result = result[key];
      } else {
        return undefined;
      }
    }
    return result;
  }
}

// ---------------- QueryResult Class (for method chaining) ----------------
class QueryResult {
  constructor(results) {
    this.results = results || [];
  }

  /**
   * Sort results by field
   * @param {string} field - Field name to sort by
   * @param {string} direction - 'asc' or 'desc'
   * @returns {QueryResult} Chainable
   */
  sort(field, direction = 'asc') {
    this.results.sort((a, b) => {
      const aVal = this._getValueByPath(a.value, field);
      const bVal = this._getValueByPath(b.value, field);
      
      if (aVal === bVal) return 0;
      
      const comparison = aVal > bVal ? 1 : -1;
      return direction === 'desc' ? -comparison : comparison;
    });
    
    return this;
  }

  /**
   * Limit number of results
   * @param {number} count - Maximum number of results
   * @returns {QueryResult} Chainable
   */
  limit(count) {
    this.results = this.results.slice(0, count);
    return this;
  }

  /**
   * Skip number of results
   * @param {number} count - Number of results to skip
   * @returns {QueryResult} Chainable
   */
  skip(count) {
    this.results = this.results.slice(count);
    return this;
  }

  /**
   * Get count of results
   * @returns {number} Count
   */
  count() {
    return this.results.length;
  }

  /**
   * Get first result
   * @returns {Object|undefined} First result
   */
  first() {
    return this.results[0];
  }

  /**
   * Get last result
   * @returns {Object|undefined} Last result
   */
  last() {
    return this.results[this.results.length - 1];
  }

  /**
   * Convert to array
   * @returns {Array} Results array
   */
  toArray() {
    return this.results;
  }

  /**
   * Get only values (without keys)
   * @returns {Array} Values array
   */
  values() {
    return this.results.map(item => item.value);
  }

  /**
   * Get only keys
   * @returns {Array} Keys array
   */
  keys() {
    return this.results.map(item => item.key);
  }

  /**
   * Apply additional filter
   * @param {Function} filter - Filter function
   * @returns {QueryResult} Chainable
   */
  filter(filter) {
    this.results = this.results.filter(item => filter(item.value, item.key));
    return this;
  }

  /**
   * Map over results
   * @param {Function} mapper - Map function
   * @returns {Array} Mapped results
   */
  map(mapper) {
    return this.results.map(item => mapper(item.value, item.key));
  }

  _getValueByPath(obj, pathStr) {
    const keys = pathStr.split(".");
    let result = obj;
    for (const key of keys) {
      if (result && Object.prototype.hasOwnProperty.call(result, key)) {
        result = result[key];
      } else {
        return undefined;
      }
    }
    return result;
  }
}

module.exports = SehawqDB;