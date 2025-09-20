# sehawq.db  

[![npm version](https://img.shields.io/npm/v/sehawq.db.svg)](https://www.npmjs.com/package/sehawq.db)  
[![npm downloads](https://img.shields.io/npm/dt/sehawq.db.svg)](https://www.npmjs.com/package/sehawq.db)  
[![license](https://img.shields.io/github/license/USERNAME/sehawq.db.svg)](LICENSE)  

**Lightweight JSON-based key-value database for Node.js**  
Minimal, dependency-free, and easy-to-use. Perfect for small projects, bots, CLIs, and prototyping.  

---

## 🚀 Features  

- **JSON-based lightweight storage** — No extra dependencies, works with pure Node.js.  
- **Key-Value structure** — Simple `set`, `get`, `delete` logic.  
- **Dot-notation namespace** — Access nested data with `user.123.balance`.  
- **Sync & Async API** — Choose blocking or non-blocking file operations.  
- **Auto-save** — Writes changes to disk at regular intervals.  

### 🔧 Array Helpers  
- `push(key, value)` — Add an element to an array.  
- `pull(key, value)` — Remove an element from an array.  

### ➗ Math Helpers  
- `add(key, number)` — Increment a numeric value.  
- `subtract(key, number)` — Decrement a numeric value.  

### 💾 Backup & Restore  
- `backup(filePath)` — Save a backup of the database.  
- `restore(filePath)` — Restore database from a backup.  

### 📡 Event Emitter  
Hooks into database operations:  
- `set` — Triggered when data is added or updated.  
- `delete` — Triggered when a key is removed.  
- `clear` — Triggered when all data is cleared.  
- `push` / `pull` — Triggered on array modification.  
- `add` — Triggered on numeric increment.  
- `backup` / `restore` — Triggered on backup or restore.  

---

## 📦 Installation  

```bash
npm install sehawq.db

## ⚡ Quick Start  

```js
const Database = require("sehawq.db");
const db = new Database("mydb.json");

// Basic operations
db.set("user.123.balance", 100);
console.log(db.get("user.123.balance")); // 100

db.add("user.123.balance", 50);
console.log(db.get("user.123.balance")); // 150

db.push("user.123.items", "sword");
console.log(db.get("user.123.items")); // ["sword"]

// Backup & Restore
db.backup("./backup.json");
db.restore("./backup.json");


---

### 🎯 Use Cases
```markdown
## 🎯 Use Cases  

- 🤖 **Discord Bots** — Store economy, user data, levels, inventories.  
- 🛠 **CLI Tools** — Keep configs and settings persistent.  
- 🌐 **Small Web/Desktop Apps** — Lightweight local storage.  
- ⚡ **Prototyping** — Rapid development without complex databases.  

## 📜 License  

MIT © [Ömer Seha](https://github.com/sehawq)  
