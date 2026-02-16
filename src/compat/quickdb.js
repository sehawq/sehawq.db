// Quick.db Compatibility Layer 🔄
// Drop-in replacement for quick.db users migrating to SehawqDB.
// Not 100% compatible but covers the stuff people actually use.

const Database = require('../core/Database');

let _instance = null;

function getDB() {
    if (!_instance) {
        _instance = new Database({
            path: './quickdb-data.json',
            autoSave: true,
            saveInterval: 5000,
            cache: true
        });
        // hacky auto-init, quick.db users expect everything to "just work"
        _instance._quickInit = _instance.init().catch(e => {
            console.error('quickdb compat init failed:', e);
        });
    }
    return _instance;
}

async function ready() {
    const db = getDB();
    if (db._quickInit) await db._quickInit;
}

module.exports = {
    async set(key, value) {
        await ready();
        const db = getDB();

        // quick.db supports dot notation for nested stuff
        if (key.includes('.')) {
            const parts = key.split('.');
            const base = parts[0];
            let obj = db.get(base) || {};
            if (typeof obj !== 'object') obj = {};
            obj[parts.slice(1).join('.')] = value; // only 1 level deep for now
            await db.set(base, obj);
            return value;
        }

        await db.set(key, value);
        return value;
    },

    async get(key) {
        await ready();
        const db = getDB();

        if (key.includes('.')) {
            const parts = key.split('.');
            const obj = db.get(parts[0]);
            if (!obj || typeof obj !== 'object') return undefined;
            return obj[parts.slice(1).join('.')];
        }

        return db.get(key);
    },

    async delete(key) {
        await ready();
        return getDB().delete(key);
    },

    async has(key) {
        await ready();
        return getDB().has(key);
    },

    async add(key, num) {
        await ready();
        const db = getDB();
        const val = db.get(key) || 0;
        if (typeof val !== 'number') throw new Error(key + ' isnt a number');
        await db.set(key, val + num);
        return val + num;
    },

    async subtract(key, num) {
        return this.add(key, -num);
    },

    async push(key, item) {
        await ready();
        const db = getDB();
        let arr = db.get(key);
        if (!arr) arr = [];
        if (!Array.isArray(arr)) throw new Error(key + ' isnt an array');
        arr.push(item);
        await db.set(key, arr);
        return arr;
    },

    // quick.db returns [{ID, data}] format
    async all() {
        await ready();
        const data = getDB().all();
        return Object.entries(data).map(([ID, data]) => ({ ID, data }));
    },

    async deleteAll() {
        await ready();
        return getDB().clear();
    },

    // escape hatch
    _getRawDB: () => getDB()
};
