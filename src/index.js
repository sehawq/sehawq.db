// src/index.js - The heart of SehawqDB v4.0.0
const Database = require('./core/Database');
const QueryEngine = require('./core/QueryEngine');
const IndexManager = require('./core/IndexManager');
const Storage = require('./core/Storage');

class SehawqDB {
  constructor(options = {}) {
    this.database = new Database(options);
    this.queryEngine = new QueryEngine(this.database);
    this.indexManager = new IndexManager(this.database, options);
    
    // Database methods
    this.set = this.database.set.bind(this.database);
    this.get = this.database.get.bind(this.database);
    this.delete = this.database.delete.bind(this.database);
    this.has = this.database.has.bind(this.database);
    this.all = this.database.all.bind(this.database);
    this.clear = this.database.clear.bind(this.database);
    
    // 🔥 Query methods
    this.find = this.queryEngine.find.bind(this.queryEngine);
    this.where = this.queryEngine.where.bind(this.queryEngine);
    this.findAll = this.queryEngine.findAll.bind(this.queryEngine);
    this.count = this.queryEngine.count.bind(this.queryEngine);
    this.sum = this.queryEngine.sum.bind(this.queryEngine);
    this.avg = this.queryEngine.avg.bind(this.queryEngine);
    this.min = this.queryEngine.min.bind(this.queryEngine);
    this.max = this.queryEngine.max.bind(this.queryEngine);
    this.groupBy = this.queryEngine.groupBy.bind(this.queryEngine);
    
    // 🔥 Index methods
    this.createIndex = this.indexManager.createIndex.bind(this.indexManager);
    this.dropIndex = this.indexManager.dropIndex.bind(this.indexManager);
    this.getIndexes = this.indexManager.getIndexes.bind(this.indexManager);
    
    // 🔥 ARRAY & MATH Methods
    this.push = this.database.push?.bind(this.database) || this._fallbackPush.bind(this);
    this.pull = this.database.pull?.bind(this.database) || this._fallbackPull.bind(this);
    this.add = this.database.add?.bind(this.database) || this._fallbackAdd.bind(this);
    this.subtract = this.database.subtract?.bind(this.database) || this._fallbackSubtract.bind(this);
    
    // 🔥 BACKUP & RESTORE Methods
    this.backup = this.database.backup?.bind(this.database) || this._fallbackBackup.bind(this);
    this.restore = this.database.restore?.bind(this.database) || this._fallbackRestore.bind(this);
  }

  // 🔥 FALLBACK Methods
  _fallbackPush(key, value) {
    const array = this.get(key) || [];
    array.push(value);
    this.set(key, array);
    return array.length;
  }

  _fallbackPull(key, value) {
    const array = this.get(key) || [];
    const index = array.indexOf(value);
    if (index > -1) {
      array.splice(index, 1);
      this.set(key, array);
      return true;
    }
    return false;
  }

  _fallbackAdd(key, number) {
    const current = this.get(key) || 0;
    const newValue = current + number;
    this.set(key, newValue);
    return newValue;
  }

  _fallbackSubtract(key, number) {
    return this._fallbackAdd(key, -number);
  }

  // 🔥 BACKUP FALLBACK Methods
  async _fallbackBackup(backupPath = null) {
    const path = backupPath || `./sehawq-backup-${Date.now()}.json`;
    const storage = new Storage(path);
    const data = this.all();
    await storage.write(data);
    return path;
  }

  async _fallbackRestore(backupPath) {
    const storage = new Storage(backupPath);
    const data = await storage.read();
    this.clear();
    for (const [key, value] of Object.entries(data)) {
      this.set(key, value);
    }
    return true;
  }

  async start() {
    await new Promise(resolve => this.database.on('ready', resolve));
    return this;
  }

  async stop() {
    await this.database.close();
  }

  // 🔥 STATS Methods 
  getStats() {
    return {
      database: this.database.getStats?.(),
      query: this.queryEngine.getStats?.(),
      indexes: this.indexManager.getStats?.()
    };
  }
}

module.exports = { SehawqDB };