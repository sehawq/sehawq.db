const fs = require("fs").promises;
const path = require("path");
const EventEmitter = require("events");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const cors = require("cors");

class SehawqDB extends EventEmitter {
  /**
   * Create a new SehawqDB instance.
   * @param {Object} options
   * @param {string} [options.path="sehawq.json"] File path for storage.
   * @param {number} [options.autoSaveInterval=0] Autosave interval in ms (0 disables autosave).
   * @param {boolean} [options.enableServer=false] Enable REST API server
   * @param {number} [options.serverPort=3000] Server port
   * @param {boolean} [options.enableRealtime=true] Enable real-time sync via WebSocket
   * @param {string} [options.apiKey] Optional API key for authentication
   */
  constructor(options = {}) {
    super();
    this.filePath = path.resolve(options.path || "sehawq.json");
    this.autoSaveInterval = options.autoSaveInterval || 0;
    this.data = {};
    
    // Server options
    this.enableServer = options.enableServer || false;
    this.serverPort = options.serverPort || 3000;
    this.enableRealtime = options.enableRealtime !== false;
    this.apiKey = options.apiKey || null;
    
    // Server instances
    this.app = null;
    this.server = null;
    this.io = null;
    this.isServerRunning = false;

    this._init();

    if (this.autoSaveInterval > 0) {
      this._interval = setInterval(() => this.save(), this.autoSaveInterval);
    }
    
    if (this.enableServer) {
      this.startServer(this.serverPort);
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
    
    // Real-time broadcast
    if (this.io) {
      this.io.emit("data:changed", { 
        action: "set", 
        key, 
        value,
        timestamp: Date.now()
      });
    }
    
    this.save();
    return value;
  }

  get(key) {
    return this._getByPath(key);
  }

  delete(key) {
    this._deleteByPath(key);
    this.emit("delete", { key });
    
    // Real-time broadcast
    if (this.io) {
      this.io.emit("data:changed", { 
        action: "delete", 
        key,
        timestamp: Date.now()
      });
    }
    
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
    
    // Real-time broadcast
    if (this.io) {
      this.io.emit("data:changed", { 
        action: "clear",
        timestamp: Date.now()
      });
    }
    
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
    
    // Real-time broadcast
    if (this.io) {
      this.io.emit("data:changed", { 
        action: "push", 
        key, 
        value,
        timestamp: Date.now()
      });
    }
    
    this.save();
    return arr;
  }

  pull(key, value) {
    let arr = this._getByPath(key);
    if (!Array.isArray(arr)) return [];
    arr = arr.filter(v => v !== value);
    this._setByPath(key, arr);
    this.emit("pull", { key, value });
    
    // Real-time broadcast
    if (this.io) {
      this.io.emit("data:changed", { 
        action: "pull", 
        key, 
        value,
        timestamp: Date.now()
      });
    }
    
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
    
    // Real-time broadcast
    if (this.io) {
      this.io.emit("data:changed", { 
        action: "add", 
        key, 
        number,
        newValue: val,
        timestamp: Date.now()
      });
    }
    
    this.save();
    return val;
  }

  subtract(key, number) {
    return this.add(key, -number);
  }

  // ---------------- Query System ----------------
  
  find(filter) {
    const results = [];
    
    if (typeof filter === 'function') {
      for (const [key, value] of Object.entries(this.data)) {
        if (filter(value, key)) {
          results.push({ key, value });
        }
      }
    } else {
      for (const [key, value] of Object.entries(this.data)) {
        results.push({ key, value });
      }
    }
    
    return new QueryResult(results);
  }

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

  // ---------------- Aggregation System ----------------
  
  count(filter) {
    if (filter) {
      return this.find(filter).count();
    }
    return Object.keys(this.data).length;
  }

  sum(field, filter) {
    const items = filter ? this.find(filter).toArray() : this.find().toArray();
    return items.reduce((sum, item) => {
      const val = this._getValueByPath(item.value, field);
      return sum + (typeof val === 'number' ? val : 0);
    }, 0);
  }

  avg(field, filter) {
    const items = filter ? this.find(filter).toArray() : this.find().toArray();
    if (items.length === 0) return 0;
    
    const sum = items.reduce((total, item) => {
      const val = this._getValueByPath(item.value, field);
      return total + (typeof val === 'number' ? val : 0);
    }, 0);
    
    return sum / items.length;
  }

  min(field, filter) {
    const items = filter ? this.find(filter).toArray() : this.find().toArray();
    if (items.length === 0) return undefined;
    
    return Math.min(...items.map(item => {
      const val = this._getValueByPath(item.value, field);
      return typeof val === 'number' ? val : Infinity;
    }).filter(val => val !== Infinity));
  }

  max(field, filter) {
    const items = filter ? this.find(filter).toArray() : this.find().toArray();
    if (items.length === 0) return undefined;
    
    return Math.max(...items.map(item => {
      const val = this._getValueByPath(item.value, field);
      return typeof val === 'number' ? val : -Infinity;
    }).filter(val => val !== -Infinity));
  }

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

  // ---------------- REST API Server ----------------
  
  /**
   * Start REST API server with real-time sync
   * @param {number} port - Server port
   * @returns {Promise<void>}
   */
  async startServer(port = 3000) {
    if (this.isServerRunning) {
      console.log(`⚠️  Server is already running on port ${this.serverPort}`);
      return;
    }

    this.app = express();
    this.server = http.createServer(this.app);
    
    // Enable real-time if requested
    if (this.enableRealtime) {
      this.io = new Server(this.server, {
        cors: {
          origin: "*",
          methods: ["GET", "POST", "PUT", "DELETE"]
        }
      });
      
      this._setupWebSocket();
    }

    // Middleware
    this.app.use(cors());
    this.app.use(express.json());
    
    // API Key middleware
    if (this.apiKey) {
      this.app.use((req, res, next) => {
        const key = req.headers['x-api-key'];
        if (key !== this.apiKey) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        next();
      });
    }

    this._setupRoutes();

    return new Promise((resolve, reject) => {
      this.server.listen(port, () => {
        this.isServerRunning = true;
        this.serverPort = port;
        console.log(`🚀 SehawqDB Server running on http://localhost:${port}`);
        console.log(`📡 Real-time sync: ${this.enableRealtime ? 'ENABLED' : 'DISABLED'}`);
        console.log(`🔒 API Key: ${this.apiKey ? 'ENABLED' : 'DISABLED'}`);
        this.emit('server:started', { port });
        resolve();
      }).on('error', reject);
    });
  }

  /**
   * Stop the REST API server
   */
  stopServer() {
    if (!this.isServerRunning) return;
    
    if (this.io) this.io.close();
    if (this.server) this.server.close();
    
    this.isServerRunning = false;
    console.log('🛑 SehawqDB Server stopped');
    this.emit('server:stopped');
  }

  _setupRoutes() {
    const router = express.Router();

    // Health check
    router.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        uptime: process.uptime(),
        realtime: this.enableRealtime,
        dataSize: Object.keys(this.data).length
      });
    });

    // Get all data
    router.get('/data', (req, res) => {
      res.json({ success: true, data: this.data });
    });

    // Get by key
    router.get('/data/:key', (req, res) => {
      const { key } = req.params;
      const value = this.get(key);
      
      if (value === undefined) {
        return res.status(404).json({ success: false, error: 'Key not found' });
      }
      
      res.json({ success: true, key, value });
    });

    // Set data
    router.post('/data/:key', (req, res) => {
      const { key } = req.params;
      const { value } = req.body;
      
      if (value === undefined) {
        return res.status(400).json({ success: false, error: 'Value is required' });
      }
      
      const result = this.set(key, value);
      res.json({ success: true, key, value: result });
    });

    // Update data (alias for set)
    router.put('/data/:key', (req, res) => {
      const { key } = req.params;
      const { value } = req.body;
      
      if (value === undefined) {
        return res.status(400).json({ success: false, error: 'Value is required' });
      }
      
      const result = this.set(key, value);
      res.json({ success: true, key, value: result });
    });

    // Delete data
    router.delete('/data/:key', (req, res) => {
      const { key } = req.params;
      
      if (!this.has(key)) {
        return res.status(404).json({ success: false, error: 'Key not found' });
      }
      
      this.delete(key);
      res.json({ success: true, key });
    });

    // Query with find
    router.post('/query', (req, res) => {
      try {
        const { filter, sort, limit, skip } = req.body;
        
        let query = this.find();
        
        // Apply sorting
        if (sort && sort.field) {
          query = query.sort(sort.field, sort.direction || 'asc');
        }
        
        // Apply pagination
        if (skip) query = query.skip(skip);
        if (limit) query = query.limit(limit);
        
        const results = query.toArray();
        
        res.json({ 
          success: true, 
          results,
          count: results.length
        });
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
    });

    // Aggregation
    router.get('/aggregate/:operation', (req, res) => {
      try {
        const { operation } = req.params;
        const { field } = req.query;
        
        let result;
        
        switch (operation) {
          case 'count':
            result = this.count();
            break;
          case 'sum':
            if (!field) return res.status(400).json({ error: 'Field is required' });
            result = this.sum(field);
            break;
          case 'avg':
            if (!field) return res.status(400).json({ error: 'Field is required' });
            result = this.avg(field);
            break;
          case 'min':
            if (!field) return res.status(400).json({ error: 'Field is required' });
            result = this.min(field);
            break;
          case 'max':
            if (!field) return res.status(400).json({ error: 'Field is required' });
            result = this.max(field);
            break;
          default:
            return res.status(400).json({ error: 'Invalid operation' });
        }
        
        res.json({ success: true, operation, field, result });
      } catch (error) {
        res.status(400).json({ success: false, error: error.message });
      }
    });

    // Array operations
    router.post('/array/:key/push', (req, res) => {
      const { key } = req.params;
      const { value } = req.body;
      
      const result = this.push(key, value);
      res.json({ success: true, key, value: result });
    });

    router.post('/array/:key/pull', (req, res) => {
      const { key } = req.params;
      const { value } = req.body;
      
      const result = this.pull(key, value);
      res.json({ success: true, key, value: result });
    });

    // Math operations
    router.post('/math/:key/add', (req, res) => {
      const { key } = req.params;
      const { number } = req.body;
      
      if (typeof number !== 'number') {
        return res.status(400).json({ error: 'Number is required' });
      }
      
      const result = this.add(key, number);
      res.json({ success: true, key, value: result });
    });

    router.post('/math/:key/subtract', (req, res) => {
      const { key } = req.params;
      const { number } = req.body;
      
      if (typeof number !== 'number') {
        return res.status(400).json({ error: 'Number is required' });
      }
      
      const result = this.subtract(key, number);
      res.json({ success: true, key, value: result });
    });

    this.app.use('/api', router);
  }

  _setupWebSocket() {
    this.io.on('connection', (socket) => {
      console.log(`✅ Client connected: ${socket.id}`);
      this.emit('client:connected', { socketId: socket.id });

      // Send current data on connection
      socket.emit('data:init', this.data);

      // Handle client operations
      socket.on('data:set', ({ key, value }) => {
        this.set(key, value);
      });

      socket.on('data:delete', ({ key }) => {
        this.delete(key);
      });

      socket.on('data:get', ({ key }, callback) => {
        const value = this.get(key);
        callback({ success: true, value });
      });

      socket.on('disconnect', () => {
        console.log(`❌ Client disconnected: ${socket.id}`);
        this.emit('client:disconnected', { socketId: socket.id });
      });
    });
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

// ---------------- QueryResult Class ----------------
class QueryResult {
  constructor(results) {
    this.results = results || [];
  }

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

  limit(count) {
    this.results = this.results.slice(0, count);
    return this;
  }

  skip(count) {
    this.results = this.results.slice(count);
    return this;
  }

  count() {
    return this.results.length;
  }

  first() {
    return this.results[0];
  }

  last() {
    return this.results[this.results.length - 1];
  }

  toArray() {
    return this.results;
  }

  values() {
    return this.results.map(item => item.value);
  }

  keys() {
    return this.results.map(item => item.key);
  }

  filter(filter) {
    this.results = this.results.filter(item => filter(item.value, item.key));
    return this;
  }

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