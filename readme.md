# SehawqDB v5 🦅

**The "Just Works" Database for Node.js**  
*Built for developers who want to build, not configure.*

![SehawqDB Dashboard](https://raw.githubusercontent.com/sehawq/sehawq.db/master/assets/dashboard-preview.png)

[![NPM Version](https://img.shields.io/npm/v/sehawq.db.svg?style=flat-square)](https://www.npmjs.com/package/sehawq.db)
[![License](https://img.shields.io/npm/l/sehawq.db.svg?style=flat-square)](https://github.com/sehawq/sehawq.db/blob/master/LICENSE)
[![Downloads](https://img.shields.io/npm/dt/sehawq.db.svg?style=flat-square)](https://www.npmjs.com/package/sehawq.db)

---

## What is SehawqDB?

SehawqDB is a zero-configuration, JSON-based database designed for modern Node.js applications. It combines the simplicity of a local JSON file with the power of a real document store.

If you are building a **Discord Bot**, a **CLI Tool**, a **Hackathon Project**, or an **Internal Dashboard**, this is the database you've been looking for.

### Why v5?
Version 5 introduces **Production Readiness** features:
- **Disk-Based Streaming:** Handle millions of records without using RAM.
- **Replication:** Sync data between multiple servers instantly.
- **GDPR Compliance:** Tools to export, delete, and anonymize user data.
- **Audit Logging:** Track every change for security and compliance.

---

## ⚡ Quick Start

Install it in seconds. No Docker, no connection strings.

```bash
npm install sehawq.db
```

### 1. The "Hello World"
```javascript
const { SehawqDB } = require('sehawq.db');
const db = new SehawqDB();

// It's just a key-value store...
db.set('config', { theme: 'dark', version: '1.0' });
console.log(db.get('config').theme); // -> 'dark'

// ...but with superpowers
db.set('session', 'secret-token', { ttl: 3600 }); // Auto-deletes in 1 hour
```

### 2. Using Collections (MongoDB Style)
Need structured data? Use collections. We handle IDs for you.

```javascript
/* 
  Data is stored as:
  users::a1b2c3 -> { name: 'Ali', role: 'admin' }
*/
const users = db.collection('users');

await users.insert({ name: 'Ali', role: 'admin' });
await users.insert({ name: 'Veli', role: 'user' });

// Find capabilities
const admins = users.find({ role: 'admin' });
```

### 3. Realtime Dashboard
Visualize your data instantly. No separate tools required.

```javascript
const db = new SehawqDB({ 
  enableServer: true, 
  serverPort: 3000,
  enableRealtime: true // WebSocket sync enabled
});

await db.start();
// Visit http://localhost:3000/dashboard
```

---

## 🛠️ Power User Features

### 🖥️ CLI Tool
Control your database from the terminal.

```bash
npx sehawq init      # Create a new project structure
npx sehawq dashboard # Launch the dashboard UI
npx sehawq export    # Backup everything to JSON
npx sehawq status    # View health & stats
```

### 🔐 Security & Compliance (New in v5)
We provide enterprise-grade features for small teams.

**Row-Level Security:**
```javascript
// Only 'user_123' can see this data
db.setOwnership('notes:secret', 'user_123');
```

**GDPR Tools:**
```javascript
// Right to be forgotten? One line.
await db.gdprDelete('user_123'); 
// -> Deletes keys, removes PII, creates audit log entry.
```

**Audit Trail:**
Every `SET`, `DELETE`, and `UPDATE` is recorded in an immutable append-only log file (`_audit.log`).

### 🔄 Replication
Need high availability? Sync data between a Primary node and Read Replicas over HTTP.

```javascript
// On Primary Server
new SehawqDB({ replication: { role: 'primary', nodes: ['http://replica-1:3000'] } });

// On Replica
new SehawqDB({ replication: { role: 'replica' } });
```

---

## 💾 Massive Data Support
Previous JSON databases crashed when the file got too big (100MB+). 

**SehawqDB v5** uses **StreamStorage**. We keep hot data in RAM and lazy-load cold data from disk. You can now store **Gigabytes** of data without blowing up your memory usage.

---

## 🤝 Community & Support

- **GitHub:** [sehawq/sehawq.db](https://github.com/sehawq/sehawq.db)
- **Issues:** Found a bug? [Open an issue](https://github.com/sehawq/sehawq.db/issues)
- **License:** MIT © Sehawq

*Built with ❤️ for the Node.js community.*
