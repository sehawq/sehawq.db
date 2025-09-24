# sehawq.db  

[![npm version](https://img.shields.io/npm/v/sehawq.db.svg)](https://www.npmjs.com/package/sehawq.db)  
[![npm downloads](https://img.shields.io/npm/dt/sehawq.db.svg)](https://www.npmjs.com/package/sehawq.db)  
[![license](https://img.shields.io/github/license/sehawq/sehawq.db.svg)](LICENSE)  

**Lightweight JSON-based key-value database for Node.js**  
Minimal, dependency-free, and easy-to-use. Perfect for small projects, bots, CLIs, and prototyping.  

---

## 🚀 Features  

- **JSON-based lightweight storage** — No extra dependencies, works with pure Node.js.  
- **Key-Value structure** — Simple `set`, `get`, `delete` logic.  
- **Dot-notation namespace** — Access nested data with `user.123.balance`.  
- **Sync & Async API** — Choose blocking or non-blocking file operations.  
- **Auto-save** — Writes changes to disk at regular intervals.  
- **🔥 NEW: Advanced Query System** — Filter, sort, and paginate your data.
- **🔥 NEW: Aggregation Functions** — Calculate sum, average, min, max, and more.
- **🔥 NEW: Method Chaining** — Chain operations for complex queries.

### 🔍 Query System
- `find(filter)` — Find all entries matching a filter function.
- `findOne(filter)` — Find the first entry matching a filter.
- `where(field, operator, value)` — Filter by field with operators (`>`, `<`, `>=`, `<=`, `=`, `!=`, `in`, `contains`, `startsWith`, `endsWith`).

### 📊 Aggregation Functions
- `count(filter)` — Count entries (with optional filter).
- `sum(field)` — Sum numeric values by field.
- `avg(field)` — Calculate average of numeric values.
- `min(field)` / `max(field)` — Find minimum/maximum values.
- `groupBy(field)` — Group entries by field value.

### ⛓️ Method Chaining & Pagination
- `sort(field, direction)` — Sort results by field (`'asc'` or `'desc'`).
- `limit(count)` — Limit number of results.
- `skip(count)` — Skip number of results for pagination.
- `first()` / `last()` — Get first or last result.
- `values()` / `keys()` — Extract values or keys only.

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
```

---

## ⚡ Quick Start (30 seconds)

```javascript
const db = require('sehawq.db')();

// Store data
db.set('user', 'John Doe');
db.set('score', 100);

// Get data
console.log(db.get('user'));  // John Doe
console.log(db.get('score')); // 100

// That's it! 🎉
```

---

## 🔧 Detailed Usage

### Basic Operations

```javascript
const SehawqDB = require('sehawq.db');
const db = new SehawqDB({
  path: './mydata.json',
  autoSaveInterval: 5000 // Auto-save every 5 seconds
});

// Set and get data
db.set('user.123.name', 'John Doe');
db.set('user.123.balance', 1000);
console.log(db.get('user.123')); // { name: 'John Doe', balance: 1000 }

// Check if key exists
if (db.has('user.123')) {
  console.log('User exists!');
}

// Delete data
db.delete('user.123.balance');
```

### Array Operations

```javascript
// Initialize an array
db.set('users', []);

// Add items
db.push('users', { id: 1, name: 'Alice' });
db.push('users', { id: 2, name: 'Bob' });

// Remove items
db.pull('users', { id: 1, name: 'Alice' });

console.log(db.get('users')); // [{ id: 2, name: 'Bob' }]
```

### Math Operations

```javascript
db.set('score', 100);
db.add('score', 50);      // score = 150
db.subtract('score', 20); // score = 130
console.log(db.get('score')); // 130
```

### Advanced Queries

```javascript
// Sample data
db.set('user1', { name: 'Alice', age: 25, active: true, score: 95 });
db.set('user2', { name: 'Bob', age: 30, active: false, score: 87 });
db.set('user3', { name: 'Charlie', age: 22, active: true, score: 92 });

// Find all active users
const activeUsers = db.find(user => user.active).values();
console.log(activeUsers);

// Find users older than 24
const olderUsers = db.where('age', '>', 24).values();

// Complex query with chaining
const topActiveUsers = db
  .find(user => user.active)
  .sort('score', 'desc')
  .limit(2)
  .values();

console.log(topActiveUsers); // Top 2 active users by score
```

### Aggregation

```javascript
// Count total users
const totalUsers = db.count();

// Count active users
const activeCount = db.count(user => user.active);

// Calculate average age
const avgAge = db.avg('age');

// Find highest score
const highestScore = db.max('score');

// Group users by active status
const grouped = db.groupBy('active');
console.log(grouped);
// {
//   'true': [{ name: 'Alice', ... }, { name: 'Charlie', ... }],
//   'false': [{ name: 'Bob', ... }]
// }
```

### Pagination

```javascript
// Get users with pagination (page 2, 10 items per page)
const page2Users = db
  .find()
  .skip(10)
  .limit(10)
  .values();

// Sort and paginate
const sortedPage = db
  .find()
  .sort('name', 'asc')
  .skip(20)
  .limit(5)
  .values();
```

### Event Handling

```javascript
// Listen for database events
db.on('set', (data) => {
  console.log(`Set: ${data.key} = ${data.value}`);
});

db.on('delete', (data) => {
  console.log(`Deleted: ${data.key}`);
});

db.on('backup', (data) => {
  console.log(`Backup created: ${data.backupPath}`);
});
```

### Backup & Restore

```javascript
// Create backup
await db.backup('./backup.json');

// Restore from backup
await db.restore('./backup.json');
```

---

## 📝 Changelog

### Changes in 2.4.2 🔥

- ✨ **Added Query System**
  - `find(filter)` — Filter entries with custom functions
  - `findOne(filter)` — Find first matching entry  
  - `where(field, operator, value)` — Field-based filtering with operators
  - **Operators**: `>`, `<`, `>=`, `<=`, `=`, `!=`, `in`, `contains`, `startsWith`, `endsWith`

- ✨ **Added Aggregation Functions**
  - `count(filter)` — Count entries with optional filtering
  - `sum(field)` — Sum numeric values by field
  - `avg(field)` — Calculate average of numeric values
  - `min(field)` / `max(field)` — Find minimum/maximum values
  - `groupBy(field)` — Group entries by field value

- ✨ **Added Method Chaining Support**
  - New `QueryResult` class enables chaining operations
  - `sort(field, direction)` — Sort results ascending or descending
  - `limit(count)` / `skip(count)` — Pagination support
  - `first()` / `last()` — Get first or last result
  - `values()` / `keys()` — Extract values or keys only
  - `filter()` — Apply additional filtering
  - `map()` — Transform results

- 🔧 **Enhanced Dot Notation**
  - Full support for nested queries and filtering
  - Deep object traversal for all query operations

- 📊 **Advanced Query Examples**
  ```javascript
  // Complex chained queries
  db.find(user => user.active)
    .sort('score', 'desc')
    .limit(10)
    .values();
  
  // Field-based filtering
  db.where('age', '>=', 18)
    .where('status', 'in', ['premium', 'gold'])
    .count();
  ```

### Changes in 2.4.2.x

- ✨ Initial release with core features
- 🔧 Basic CRUD operations (`set`, `get`, `delete`, `has`)
- 🔧 Dot notation support for nested data
- 🔧 Array helpers (`push`, `pull`)
- 🔧 Math helpers (`add`, `subtract`)
- 🔧 Auto-save functionality
- 🔧 Event emitter system
- 🔧 Backup & restore functionality
- 🔧 Atomic file operations with temporary files

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 🐛 Issues

Found a bug? Please report it on [GitHub Issues](https://github.com/sehawq/sehawq.db/issues).