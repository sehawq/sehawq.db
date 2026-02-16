const Database = require('./core/Database');
const QueryEngine = require('./core/QueryEngine');
const IndexManager = require('./core/IndexManager');
const Migration = require('./core/Migration');
const Replication = require('./core/Replication');
const AuditLog = require('./core/AuditLog');
const Compliance = require('./core/Compliance');
const APIServer = require('./server/api');
const WebSocketServer = require('./server/websocket');

class SehawqDB {
  constructor(opts = {}) {
    // Core components
    this.db = new Database(opts);
    this.query = new QueryEngine(this.db);
    this.idx = new IndexManager(this.db, opts);
    this.migration = new Migration(this.db);
    this.repl = opts.replication ? new Replication(this.db, opts.replication) : null;

    // audit + compliance (opt-in)
    this.audit = opts.audit !== false ? new AuditLog(this.db, opts.audit || {}) : null;
    this.compliance = new Compliance(this.db);
    // attach to db instance so plugins/api can find them
    if (this.audit) this.db.audit = this.audit;
    this.db.compliance = this.compliance;

    // Connect them
    this.query.setIndexManager(this.idx);

    // Server stuff
    this.server = null;
    this.socket = null;
    this.opts = opts;

    if (opts.enableServer) {
      this.server = new APIServer(this.db, opts);
    }
  }

  // Core Methods (Delegated dynamically to allow plugins to override them)
  set(key, val, opts) { return this.db.set(key, val, opts); }
  get(key) { return this.db.get(key); }
  delete(key) { return this.db.delete(key); }
  has(key) { return this.db.has(key); }
  all() { return this.db.all(); }

  // Query helpers
  find(fn) { return this.query.find(fn); }
  where(field, op, val) { return this.query.where(field, op, val); }
  count(fn) { return this.query.count(fn); }
  sum(field, fn) { return this.query.sum(field, fn); }
  avg(field, fn) { return this.query.avg(field, fn); }
  min(field, fn) { return this.query.min(field, fn); }
  max(field, fn) { return this.query.max(field, fn); }

  // Index helpers
  createIndex(field, type) { return this.idx.create(field, type); }
  dropIndex(field) { return this.idx.drop(field); }

  // Collections (MongoDB-style)
  collection(name) { return this.db.collection(name); }

  // Reactive watchers (Firebase-style)
  watch(key, cb) { this.db.watch(key, cb); }
  unwatch(key, cb) { this.db.unwatch(key, cb); }

  // Migrations
  migrate(version, name, fn) { this.migration.add(version, name, fn); return this; }
  runMigrations() { return this.migration.run(); }
  migrationStatus() { return this.migration.status(); }

  // Replication
  replicationStatus() { return this.repl ? this.repl.status() : null; }

  // Audit
  auditLog(filter) { return this.audit ? this.audit.query(filter) : Promise.resolve([]); }

  // GDPR / Compliance
  gdprExport(userId) { return this.compliance.exportUserData(userId); }
  gdprDelete(userId) { return this.compliance.deleteUserData(userId); }
  gdprAnonymize(userId) { return this.compliance.anonymizeUserData(userId); }
  complianceReport() { return this.compliance.report(); }

  // Plugin System 🔌
  use(plugin, opts = {}) {
    this.db.use(plugin, opts);
    return this;
  }

  async start() {
    await this.db.init();

    // migrations auto-run on startup
    await this.migration.run();

    if (this.server) {
      await this.server.start();
    }

    // Init Realtime now that server is running
    if (this.opts.enableRealtime && this.server) {
      this.socket = new WebSocketServer(this.db, this.server.httpServer, this.opts);
    }

    // kick off replication if configured
    if (this.repl) {
      // pass the repl instance to api so it can add endpoints
      if (this.server) this.server.repl = this.repl;
      this.repl.start();
    }

    if (this.db.conf?.debug) {
      console.log('SehawqDB Started');
    }
  }

  async stop() {
    if (this.audit) await this.audit.stop();
    if (this.repl) this.repl.stop();
    if (this.server) await this.server.stop();
    if (this.socket) this.socket.close();
    await this.db.close();
  }

  getStats() {
    return {
      database: this.db.getStats(),
      // query: this.query.getStats() // Removed stats from lightweight query engine
    };
  }

  // Fallbacks for array ops
  push(key, item) {
    const list = this.get(key) || [];
    if (!Array.isArray(list)) throw new Error('Key is not a list');
    list.push(item);
    return this.set(key, list);
  }

  pull(key, item) {
    const list = this.get(key);
    if (!Array.isArray(list)) return false;

    // Simple filter
    const json = JSON.stringify(item);
    const newList = list.filter(x => JSON.stringify(x) !== json);

    return this.set(key, newList);
  }

  add(key, n) {
    const val = this.get(key) || 0;
    return this.set(key, val + n);
  }

  subtract(key, n) {
    return this.add(key, -n);
  }

  // Backup utils
  async backup(dest) {
    // TODO: Implement proper backup to external path
    console.warn('Backup not fully implemented yet');
  }
}

module.exports = SehawqDB;