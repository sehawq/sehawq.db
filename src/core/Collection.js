// Collection Engine 📦
// Gives MongoDB-style collection support on top of our key-value store.
// Each collection is basically a namespace prefix. Simple but effective.

let _counter = 0; // global auto-id, resets on restart but thats fine

class Collection {
    constructor(db, name) {
        this.db = db;
        this.name = name;
        this._prefix = `${name}:`;
        this._rules = null; // validation rules

        // sync counter so we dont overwrite existing docs
        this._syncCounter();
    }

    _syncCounter() {
        const all = this.db.all();
        for (const k in all) {
            if (!k.startsWith(this._prefix)) continue;
            const id = k.slice(this._prefix.length);
            const num = parseInt(id, 10);
            if (!isNaN(num) && num >= _counter) _counter = num + 1;
        }
    }

    _genId() {
        return this._prefix + (_counter++);
    }

    // Insert a doc, returns the generated key
    async insert(doc) {
        if (!doc || typeof doc !== 'object') throw new Error('Document must be an object');

        // run validation if we have rules
        if (this._rules) this._validate(doc);

        const id = this._genId();
        doc._id = id;
        await this.db.set(id, doc);
        return id;
    }

    // Bulk insert, not optimized yet but works
    async insertMany(docs) {
        const ids = [];
        for (const doc of docs) {
            ids.push(await this.insert(doc));
        }
        return ids;
    }

    // grabs all docs in this collection
    _getAll() {
        const all = this.db.all();
        const results = [];
        for (const k in all) {
            if (k.startsWith(this._prefix)) results.push(all[k]);
        }
        return results;
    }

    // Query matching - supports basic operators
    // { age: 25 }                   → exact match
    // { age: { $gt: 20, $lt: 50 } } → range query
    // { name: { $in: ['Ali'] } }    → inclusion check
    _matches(doc, query) {
        for (const field in query) {
            const cond = query[field];

            if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
                // operator-based matching
                for (const op in cond) {
                    const target = cond[op];
                    const val = doc[field];

                    if (op === '$gt' && !(val > target)) return false;
                    if (op === '$gte' && !(val >= target)) return false;
                    if (op === '$lt' && !(val < target)) return false;
                    if (op === '$lte' && !(val <= target)) return false;
                    if (op === '$ne' && val === target) return false;
                    if (op === '$in' && !target.includes(val)) return false;
                    // TODO: $regex support would be nice
                }
            } else {
                if (doc[field] !== cond) return false;
            }
        }
        return true;
    }

    find(query = {}) {
        const docs = this._getAll();
        if (!Object.keys(query).length) return docs;
        return docs.filter(d => this._matches(d, query));
    }

    findOne(query = {}) {
        // could optimize this to stop early but meh
        const docs = this._getAll();
        for (const doc of docs) {
            if (this._matches(doc, query)) return doc;
        }
        return null;
    }

    async update(query, changes) {
        const doc = this.findOne(query);
        if (!doc) return false;

        if (changes.$set) {
            Object.assign(doc, changes.$set);
        } else {
            Object.assign(doc, changes);
        }

        if (this._rules) this._validate(doc);

        await this.db.set(doc._id, doc);
        return true;
    }

    async updateMany(query, changes) {
        const docs = this.find(query);
        let count = 0;

        for (const doc of docs) {
            if (changes.$set) Object.assign(doc, changes.$set);
            else Object.assign(doc, changes);

            if (this._rules) this._validate(doc);
            await this.db.set(doc._id, doc);
            count++;
        }
        return count;
    }

    async remove(query) {
        const doc = this.findOne(query);
        if (!doc || !doc._id) return false;
        return this.db.delete(doc._id);
    }

    async removeMany(query) {
        const docs = this.find(query);
        let removed = 0;
        for (const doc of docs) {
            if (doc._id) {
                await this.db.delete(doc._id);
                removed++;
            }
        }
        return removed;
    }

    count(query) {
        return query ? this.find(query).length : this._getAll().length;
    }

    // drops the entire collection, no confirmation lol
    async drop() {
        const all = this.db.all();
        for (const k in all) {
            if (k.startsWith(this._prefix)) await this.db.delete(k);
        }
    }

    // --- Schema ---
    // Sets validation rules for insert/update.
    // col.schema({ name: { type: 'string', required: true }, age: { type: 'number', min: 0 } })
    schema(rules) {
        this._rules = rules;
        return this;
    }

    // Internal validation, throws on first error
    _validate(doc) {
        if (!this._rules) return;

        for (const field in this._rules) {
            const rule = this._rules[field];
            const val = doc[field];

            // required check first
            if (rule.required && (val === undefined || val === null || val === '')) {
                throw new Error(`'${field}' is required`);
            }

            if (val == null) continue; // skip optional missing fields

            // type checking
            if (rule.type) {
                const t = rule.type;
                if (t === 'string' && typeof val !== 'string') throw new Error(`'${field}' must be a string`);
                if (t === 'number' && typeof val !== 'number') throw new Error(`'${field}' must be a number`);
                if (t === 'boolean' && typeof val !== 'boolean') throw new Error(`'${field}' must be boolean`);
                if (t === 'array' && !Array.isArray(val)) throw new Error(`'${field}' should be an array`);
                // TODO: deep object validation someday
                if (t === 'object' && (typeof val !== 'object' || Array.isArray(val))) throw new Error(`'${field}' must be an object`);
            }

            // min/max — for numbers its the value, for strings its length
            if (rule.min !== undefined) {
                const v = typeof val === 'string' ? val.length : val;
                if (v < rule.min) throw new Error(`'${field}' must be >= ${rule.min}`);
            }
            if (rule.max !== undefined) {
                const v = typeof val === 'string' ? val.length : val;
                if (v > rule.max) throw new Error(`'${field}' must be <= ${rule.max}`);
            }

            // enum check
            if (rule.enum && !rule.enum.includes(val)) {
                throw new Error(`'${field}' must be one of: ${rule.enum.join(', ')}`);
            }

            // regex pattern
            if (rule.pattern && typeof val === 'string') {
                const re = rule.pattern instanceof RegExp ? rule.pattern : new RegExp(rule.pattern);
                if (!re.test(val)) throw new Error(`'${field}' does not match pattern`);
            }
        }
    }
}

module.exports = Collection;
