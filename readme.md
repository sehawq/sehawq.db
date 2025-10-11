# sehawq.db 🚀

[![npm version](https://img.shields.io/npm/v/sehawq.db.svg)](https://www.npmjs.com/package/sehawq.db)  
[![npm downloads](https://img.shields.io/npm/dt/sehawq.db.svg)](https://www.npmjs.com/package/sehawq.db)  
[![license](https://img.shields.io/github/license/sehawq/sehawq.db.svg)](LICENSE)  

**The most powerful JSON-based database for Node.js**  
Local database + REST API + Real-time Sync = **Firebase Alternative in One Package!**

Perfect for: APIs, Real-time apps, Chat apps, Collaborative tools, Prototypes, and Production!

---

## 🎯 Why SehawqDB?

❌ **Firebase**: Expensive, vendor lock-in, complex pricing  
❌ **MongoDB**: Heavy, requires separate server setup  
❌ **Redis**: In-memory only, no persistence by default  

✅ **SehawqDB**: Lightweight, local-first, REST API built-in, real-time sync, **ZERO configuration!**

---

## 🔥 Features

### 💾 Core Database
- **JSON-based storage** — Simple, readable, git-friendly
- **Query System** — MongoDB-like queries with `find()`, `where()`, filtering
- **Aggregations** — `sum()`, `avg()`, `min()`, `max()`, `groupBy()`
- **Method Chaining** — Fluent API for complex queries
- **Dot notation** — Access nested data easily

### 🌐 Built-in REST API (NEW!)
- **Zero configuration** — Call `.startServer()` and you're live!
- **Full CRUD** — GET, POST, PUT, DELETE endpoints
- **Query API** — Filter, sort, paginate via HTTP
- **Authentication** — Optional API key protection

### ⚡ Real-time Sync (NEW!)
- **WebSocket integration** — Powered by Socket.io
- **Live updates** — All clients sync instantly
- **Event-driven** — Listen to data changes in real-time
- **Cross-platform** — Works with React, Vue, Angular, mobile apps

### 🔧 Developer Experience
- **TypeScript ready** — Full type definitions
- **Events** — Hook into all database operations
- **Backup & Restore** — Easy data management
- **Auto-save** — Configurable intervals
- **Array & Math helpers** — Built-in utilities

---

## 📦 Installation

```bash
npm install sehawq.db express socket.io socket.io-client cors
```

---

## ⚡ Quick Start (Local Database)

```javascript
const SehawqDB = require('sehawq.db');
const db = new SehawqDB();

// Basic operations
db.set('user', { name: 'John', age: 25 });
console.log(db.get('user')); // { name: 'John', age: 25 }

// Query system
db.set('user1', { name: 'Alice', score: 95 });
db.set('user2', { name: 'Bob', score: 87 });

const topUsers = db.find()
  .sort('score', 'desc')
  .limit(2)
  .values();
```

---

## 🌐 REST API Server

### Start Server

```javascript
const SehawqDB = require('sehawq.db');

const db = new SehawqDB({
  path: './database.json',
  enableServer: true,  // Enable REST API
  serverPort: 3000,
  enableRealtime: true, // Enable WebSocket
  apiKey: 'your-secret-key' // Optional authentication
});

// Or start manually:
// await db.startServer(3000);

// 🚀 Server is now running on http://localhost:3000
```

### API Endpoints

#### Health Check
```bash
GET /api/health
```

#### Get All Data
```bash
GET /api/data
```

#### Get by Key
```bash
GET /api/data/:key
```

#### Set Data
```bash
POST /api/data/:key
Content-Type: application/json

{
  "value": { "name": "John", "age": 25 }
}
```

#### Update Data
```bash
PUT /api/data/:key
Content-Type: application/json

{
  "value": { "name": "John", "age": 26 }
}
```

#### Delete Data
```bash
DELETE /api/data/:key
```

#### Query with Filters
```bash
POST /api/query
Content-Type: application/json

{
  "filter": {},
  "sort": { "field": "age", "direction": "desc" },
  "limit": 10,
  "skip": 0
}
```

#### Aggregations
```bash
GET /api/aggregate/count
GET /api/aggregate/sum?field=score
GET /api/aggregate/avg?field=age
GET /api/aggregate/min?field=price
GET /api/aggregate/max?field=rating
```

#### Array Operations
```bash
POST /api/array/:key/push
POST /api/array/:key/pull
```

#### Math Operations
```bash
POST /api/math/:key/add
POST /api/math/:key/subtract
```

### API Authentication

```javascript
// Server side
const db = new SehawqDB({
  apiKey: 'my-secret-key-123'
});

// Client side
fetch('http://localhost:3000/api/data', {
  headers: {
    'X-API-Key': 'my-secret-key-123'
  }
});
```

---

## ⚡ Real-time Sync

### Server Setup

```javascript
const db = new SehawqDB({
  enableServer: true,
  enableRealtime: true,
  serverPort: 3000
});

// Listen to client events
db.on('client:connected', ({ socketId }) => {
  console.log('Client connected:', socketId);
});

db.on('client:disconnected', ({ socketId }) => {
  console.log('Client disconnected:', socketId);
});
```

### Frontend (React Example)

```javascript
import { io } from 'socket.io-client';
import { useEffect, useState } from 'react';

function App() {
  const [data, setData] = useState({});
  const socket = io('http://localhost:3000');

  useEffect(() => {
    // Receive initial data
    socket.on('data:init', (initialData) => {
      setData(initialData);
    });

    // Listen to real-time changes
    socket.on('data:changed', ({ action, key, value }) => {
      console.log(`Data ${action}:`, key, value);
      
      if (action === 'set') {
        setData(prev => ({ ...prev, [key]: