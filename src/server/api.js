const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

class APIServer {
  constructor(db, opts = {}) {
    this.db = db;
    this.port = opts.serverPort || 3000;
    this.app = express();

    // Middleware
    this.app.use(cors());
    this.app.use(express.json());

    // Plugin Middleware Hook 🪝
    // If a plugin attached an authMiddleware to the DB, use it!
    this.app.use((req, res, next) => {
      if (this.db.authMiddleware) {
        this.db.authMiddleware(req, res, next);
      } else {
        next();
      }
    });

    // Cookie/Header extraction helper
    this.getToken = (req) => {
      const authHeader = req.headers['authorization'];
      if (authHeader) return authHeader.split(' ')[1];
      return null;
    }

    this.checkAdmin = (req, res) => {
      // Since middleware already sets req.user
      if (!req.user || req.user.role !== 'admin') {
        res.status(403).json({ error: 'Admin access required' });
        return false;
      }
      return true;
    }

    // --- DASHBOARD ---
    // Serve the dashboard HTML file
    this.app.get('/dashboard', (req, res) => {
      const dashPath = path.join(__dirname, 'public', 'dashboard.html');
      res.sendFile(dashPath);
    });

    // Redirect root to dashboard
    this.app.get('/', (req, res) => res.json({ status: 'ok', version: '5.0.6', dashboard: '/dashboard' }));

    // --- AUTH ROUTES ---
    this.app.post('/api/login', (req, res) => {
      try {
        if (!this.db.login) return res.status(501).json({ error: 'Auth plugin not loaded' });
        const result = this.db.login(req.body.username, req.body.password);
        res.json({ success: true, ...result });
      } catch (e) {
        res.status(401).json({ error: e.message });
      }
    });

    this.app.post('/api/register', (req, res) => {
      try {
        if (!this.db.register) return res.status(501).json({ error: 'Auth plugin not loaded' });
        const result = this.db.register(req.body.username, req.body.password, req.body.role);
        res.json({ success: true, ...result });
      } catch (e) {
        res.status(400).json({ error: e.message });
      }
    });

    // --- ADMIN ROUTES ---
    this.app.get('/api/backup', async (req, res) => {
      // Basic Auth Check (Should be admin)
      if (!this.checkAdmin(req, res)) return;

      try {
        await this.db.save(); // Force flush to disk
        res.download(this.db.conf.path, 'sehawq-backup.json');
      } catch (e) {
        res.status(500).json({ error: 'Backup failed' });
      }
    });

    this.app.get('/api/users', (req, res) => {
      if (!this.checkAdmin(req, res)) return;

      const users = this.db.get('_users') || {};
      const list = Object.values(users)
        .filter(u => u && typeof u === 'object' && u.username)
        .map(u => ({
          username: u.username,
          role: u.role,
          created_at: u.created_at
        }));
      res.json({ success: true, users: list });
    });

    this.app.delete('/api/users/:username', (req, res) => {
      if (!this.checkAdmin(req, res)) return;
      if (req.params.username === 'admin') return res.status(403).json({ error: 'Cannot delete super admin' });

      try {
        const success = this.db.unregister(req.params.username);
        res.json({ success });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    this.app.put('/api/users/:username', (req, res) => {
      if (!this.checkAdmin(req, res)) return;
      if (req.params.username === 'admin') return res.status(403).json({ error: 'Cannot modify super admin' });

      try {
        const { role } = req.body;
        const success = this.db.updateUserRole(req.params.username, role);
        res.json({ success });
      } catch (e) {
        res.status(400).json({ error: e.message });
      }
    });

    // --- API ROUTES ---

    // Get all
    this.app.get('/api/data', (req, res) => {
      res.json({ success: true, data: this.db.all() });
    });

    // Get one
    this.app.get('/api/data/:key', (req, res) => {
      const val = this.db.get(req.params.key);
      if (val === undefined || val === null) return res.status(404).json({ error: 'Not found' });
      res.json({ key: req.params.key, value: val });
    });

    // Set
    this.app.post('/api/data', (req, res) => {
      const { key, value } = req.body;
      if (!key || value === undefined) return res.status(400).json({ error: 'Missing key or value' });

      this.db.set(key, value);
      res.json({ success: true });
    });

    // Delete
    this.app.delete('/api/data/:key', (req, res) => {
      const success = this.db.delete(req.params.key);
      res.json({ success });
    });

    // Stats
    this.app.get('/api/stats', (req, res) => {
      res.json({
        server: { uptime: process.uptime(), startTime: Date.now() - (process.uptime() * 1000) },
        database: this.db.getStats()
      });
    });

    // list all collection namespaces
    this.app.get('/api/collections', (req, res) => {
      const all = this.db.all();
      const namespaces = new Set();
      for (const k in all) {
        if (k.includes(':') && !k.startsWith('_')) {
          namespaces.add(k.split(':')[0]);
        }
      }
      res.json({ success: true, collections: Array.from(namespaces) });
    });

    // bulk import from JSON
    this.app.post('/api/import', async (req, res) => {
      if (!this.checkAdmin(req, res)) return;
      try {
        const data = req.body;
        if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Invalid data' });
        let count = 0;
        for (const k in data) {
          await this.db.set(k, data[k]);
          count++;
        }
        res.json({ success: true, imported: count });
      } catch (e) {
        res.status(500).json({ error: 'Import failed: ' + e.message });
      }
    });

    // export everything as json download
    this.app.get('/api/export', (req, res) => {
      if (!this.checkAdmin(req, res)) return;
      const data = this.db.all();
      // filter out internal keys
      const clean = {};
      for (const k in data) {
        if (!k.startsWith('_')) clean[k] = data[k];
      }
      res.setHeader('Content-Disposition', 'attachment; filename=sehawq-export.json');
      res.json(clean);
    });

    // --- replication endpoints ---

    // receive ops from primary (replica only)
    this.app.post('/api/replicate', async (req, res) => {
      if (!this.repl) return res.status(501).json({ error: 'replication not configured' });

      try {
        await this.repl.applyOp(req.body);
        res.json({ ok: true });
      } catch (e) {
        res.status(400).json({ error: e.message });
      }
    });

    // check replication status
    this.app.get('/api/replication/status', (req, res) => {
      if (!this.repl) return res.json({ active: false });
      res.json({ active: true, ...this.repl.status() });
    });

    // heartbeat ping from primary
    this.app.post('/api/replication/ping', (req, res) => {
      res.json({ pong: true, ts: Date.now() });
    });

    // --- audit + compliance endpoints ---

    // audit log query (admin only)
    this.app.get('/api/audit', async (req, res) => {
      if (!this.db.audit) return res.json({ entries: [], msg: 'audit not enabled' });
      if (req.user?.role !== 'admin') return res.status(403).json({ error: 'admin only' });

      const filter = {};
      if (req.query.action) filter.action = req.query.action;
      if (req.query.key) filter.key = req.query.key;
      if (req.query.user) filter.user = req.query.user;
      if (req.query.limit) filter.limit = parseInt(req.query.limit);

      const entries = await this.db.audit.query(filter);
      res.json({ entries, count: entries.length });
    });

    // gdpr: export user data
    this.app.post('/api/gdpr/export/:userId', async (req, res) => {
      if (req.user?.role !== 'admin') return res.status(403).json({ error: 'admin only' });
      if (!this.db.compliance) return res.status(501).json({ error: 'compliance not enabled' });

      const result = await this.db.compliance.exportUserData(req.params.userId);
      res.json(result);
    });

    // gdpr: delete user data (scary one)
    this.app.post('/api/gdpr/delete/:userId', async (req, res) => {
      if (req.user?.role !== 'admin') return res.status(403).json({ error: 'admin only' });
      if (!this.db.compliance) return res.status(501).json({ error: 'compliance not enabled' });

      const result = await this.db.compliance.deleteUserData(req.params.userId);
      res.json(result);
    });

    // gdpr: anonymize user data
    this.app.post('/api/gdpr/anonymize/:userId', async (req, res) => {
      if (req.user?.role !== 'admin') return res.status(403).json({ error: 'admin only' });
      if (!this.db.compliance) return res.status(501).json({ error: 'compliance not enabled' });

      const result = await this.db.compliance.anonymizeUserData(req.params.userId);
      res.json(result);
    });

    // Query (Legacy support)
    this.app.post('/api/query', (req, res) => {
      const { field, op, value } = req.body;
      // ... legacy code ...
      const all = this.db.all();
      const results = [];
      for (const k in all) {
        const row = all[k];
        let match = false;
        if (op === '=') match = row[field] === value;
        else if (op === '>') match = row[field] > value;
        else if (op === '<') match = row[field] < value;
        if (match) results.push(row);
      }
      res.json(results);
    });
  }

  start() {
    return new Promise(resolve => {
      this.httpServer = this.app.listen(this.port, '0.0.0.0', () => {
        console.log(`API running on port ${this.port}`);
        console.log(`Dashboard available at http://localhost:${this.port}/dashboard`);
        resolve();
      });
    });
  }

  stop() {
    if (this.httpServer) this.httpServer.close();
  }
}

module.exports = APIServer;