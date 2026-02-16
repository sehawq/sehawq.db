class QueryEngine {
  constructor(db) {
    this.db = db;
    this.idx = null;
    this._cache = new Map();
  }

  setIndexManager(im) {
    this.idx = im;
  }

  // Main find method
  find(fn, opts = {}) {
    const res = new QueryResult([], opts);
    const all = this.db.all();

    // Try to optimize if it's a simple property check
    // This is a bit hacky but fast
    if (fn._indexMeta && this.idx) {
      const { field, op, val } = fn._indexMeta;
      const indexRes = this.idx.find(field, op, val);

      if (indexRes) {
        // Got it from index!
        const data = [];
        for (const k of indexRes) {
          const row = this.db.get(k);
          if (row) data.push(row);
        }
        res.setData(data);
        return res;
      }
    }

    // Slow scan :(
    const data = [];
    const keys = Object.keys(all);

    for (let i = 0; i < keys.length; i++) {
      const row = all[keys[i]];
      if (fn(row)) data.push(row);
    }

    res.setData(data);
    return res;
  }

  // Builder for simple queries
  where(field, op, val) {
    const fn = this._makeFilter(field, op, val);
    // Attach meta for optimizer
    fn._indexMeta = { field, op, val };
    return this.find(fn);
  }

  _makeFilter(field, op, val) {
    // Check cache
    const key = `${field}${op}${JSON.stringify(val)}`;
    if (this._cache.has(key)) return this._cache.get(key);

    let fn;
    switch (op) {
      case '=': fn = r => r[field] === val; break;
      case '!=': fn = r => r[field] !== val; break;
      case '>': fn = r => r[field] > val; break;
      case '<': fn = r => r[field] < val; break;
      case '>=': fn = r => r[field] >= val; break;
      case '<=': fn = r => r[field] <= val; break;
      case 'in': fn = r => val.includes(r[field]); break;
      default: fn = r => r[field] === val;
    }

    this._cache.set(key, fn);
    return fn;
  }

  // Aggregations
  count(fn = null) {
    if (!fn) return this.db.getStats().size;
    return this.find(fn).count();
  }

  sum(field, fn = null) {
    const res = fn ? this.find(fn) : this.find(() => true);
    return res.toArray().reduce((a, b) => a + (b[field] || 0), 0);
  }

  avg(field, fn = null) {
    const res = fn ? this.find(fn) : this.find(() => true);
    const arr = res.toArray();
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + (b[field] || 0), 0) / arr.length;
  }

  min(field, fn = null) {
    const res = fn ? this.find(fn) : this.find(() => true);
    const arr = res.toArray().map(x => x[field]).filter(x => x != null);
    return Math.min(...arr);
  }

  max(field, fn = null) {
    const res = fn ? this.find(fn) : this.find(() => true);
    const arr = res.toArray().map(x => x[field]).filter(x => x != null);
    return Math.max(...arr);
  }
}

// Helper for chaining
class QueryResult {
  constructor(data, opts) {
    this.data = data;
    this.opts = opts;
  }

  setData(d) { this.data = d; }

  sort(fn) {
    if (typeof fn === 'string') {
      const field = fn;
      this.data.sort((a, b) => (a[field] > b[field] ? 1 : -1));
    } else {
      this.data.sort(fn);
    }
    return this;
  }

  limit(n) {
    this.data = this.data.slice(0, n);
    return this;
  }

  skip(n) {
    this.data = this.data.slice(n);
    return this;
  }

  toArray() { return this.data; }
  count() { return this.data.length; }
  first() { return this.data[0]; }
  last() { return this.data[this.data.length - 1]; }
}

module.exports = QueryEngine;