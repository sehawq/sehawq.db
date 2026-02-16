// Handles indexing stuff
class IndexManager {
  constructor(db, opts = {}) {
    this.db = db;
    this._idxs = new Map();
    this.debug = opts.debug || false;

    // Hook into db events
    this.db.on('set', evt => {
      this.update(evt.key, evt.value, evt.old);
    });

    this.db.on('delete', evt => {
      this.update(evt.key, null, evt.old);
    });
  }

  async create(field, type = 'hash') {
    if (this._idxs.has(field)) return;

    // Build index map
    const idx = {
      type,
      data: new Map() // value -> Set(keys)
    };

    const start = Date.now();

    // Populate existing data
    const all = this.db.all();
    for (const k in all) {
      const val = all[k][field];
      if (val === undefined) continue;

      if (!idx.data.has(val)) idx.data.set(val, new Set());
      idx.data.get(val).add(k);
    }

    this._idxs.set(field, idx);

    if (this.debug) {
      console.log(`Index '${field}' built in ${Date.now() - start}ms`);
    }
  }

  drop(field) {
    return this._idxs.delete(field);
  }

  update(key, newVal, oldVal) {
    this._idxs.forEach((idx, field) => {
      // Remove old ref
      if (oldVal && oldVal[field] !== undefined) {
        const val = oldVal[field];
        if (idx.data.has(val)) {
          const set = idx.data.get(val);
          set.delete(key);
          if (set.size === 0) idx.data.delete(val);
        }
      }

      // Add new ref
      if (newVal && newVal[field] !== undefined) {
        const val = newVal[field];
        if (!idx.data.has(val)) idx.data.set(val, new Set());
        idx.data.get(val).add(key);
      }
    });
  }

  // Try to find keys using index
  find(field, op, val) {
    const idx = this._idxs.get(field);
    if (!idx) return null; // No index

    if (idx.type === 'hash' && op === '=') {
      if (idx.data.has(val)) {
        return Array.from(idx.data.get(val));
      }
      return [];
    }

    // Use range index logic if needed later
    // For now just hash support is good enough
    return null;
  }
}

module.exports = IndexManager;