// comprehensive-test-v2.js
const SehawqDB = require('../index');

async function comprehensiveTest() {
  console.log('🚀 SEHAWQDB 4.0.0 - ALL FEATURES TEST v2');
  console.log('============================================\n');
  
  const db = new SehawqDB({
    enableServer: true,
    serverPort: 3001,
    enableRealtime: true,
    debug: true
  });
  
  await db.start();
  
  console.log('📊 Initial Statistics:', db.getStats());
  
  // 🎯 TEST 1: Basic CRUD Operations
  console.log('\n1️⃣ BASIC CRUD OPERATIONS');
  console.log('─'.repeat(50));
  
  db.set('test:basic', { message: 'Hello World!', number: 42 });
  console.log('✅ set(): Data saved');
  
  const basicData = db.get('test:basic');
  console.log('✅ get():', basicData);
  
  console.log('✅ has():', db.has('test:basic'));
  console.log('✅ all():', Object.keys(db.all()).length, 'records');
  
  db.delete('test:basic');
  console.log('✅ delete(): Deleted -', !db.has('test:basic'));
  
  // 🎯 TEST 2: Dot Notation
  console.log('\n2️⃣ DOT NOTATION');
  console.log('─'.repeat(50));
  
  db.set('user.profile.name', 'Ali');
  db.set('user.profile.age', 25);
  db.set('user.profile.address.city', 'Istanbul');
  console.log('✅ Dot notation set:', db.get('user.profile.name'));
  console.log('✅ Nested dot notation:', db.get('user.profile.address.city'));
  
  // 🎯 TEST 3: Array Operations
  console.log('\n3️⃣ ARRAY OPERATIONS');
  console.log('─'.repeat(50));
  
  db.push('todos', { id: 1, text: 'Learn SehawqDB', done: true });
  db.push('todos', { id: 2, text: 'Do project', done: false });
  db.push('todos', { id: 3, text: 'Change the world', done: false });
  console.log('✅ push():', db.get('todos').length, 'todos');
  
  db.pull('todos', { id: 1, text: 'Learn SehawqDB', done: true });
  console.log('✅ pull():', db.get('todos').length, 'todos remaining');
  
  // 🎯 TEST 4: Math Operations
  console.log('\n4️⃣ MATH OPERATIONS');
  console.log('─'.repeat(50));
  
  db.set('counter', 100);
  db.add('counter', 50);
  console.log('✅ add():', db.get('counter'));
  
  db.subtract('counter', 25);
  console.log('✅ subtract():', db.get('counter'));
  
  // 🎯 TEST 5: Query System
  console.log('\n5️⃣ QUERY SYSTEM');
  console.log('─'.repeat(50));
  
  // Create test data
  const users = [
  { id: 1, name: 'Ali', age: 25, city: 'Istanbul', active: true, score: 85 },
  { id: 2, name: 'Ayse', age: 30, city: 'Ankara', active: false, score: 92 },
  { id: 3, name: 'Mehmet', age: 35, city: 'Istanbul', active: true, score: 78 },
  { id: 4, name: 'Zeynep', age: 28, city: 'Izmir', active: true, score: 88 },
  { id: 5, name: 'Can', age: 22, city: 'Istanbul', active: false, score: 95 }
  ];
  
  users.forEach(user => db.set(`user:${user.id}`, user));
  
  // find() test
  const activeUsers = db.find(user => user.active);
  console.log('✅ find():', activeUsers.count(), 'active users');
  
  // where() test
  const istanbulUsers = db.where('city', '=', 'Istanbul');
  console.log('✅ where():', istanbulUsers.count(), 'Istanbul users');
  
  const youngUsers = db.where('age', '<', 30);
  console.log('✅ where() range:', youngUsers.count(), 'young users');
  
  // 🎯 TEST 6: Aggregation
  console.log('\n6️⃣ AGGREGATION');
  console.log('─'.repeat(50));
  
  console.log('✅ count():', db.count(), 'total users');
  console.log('✅ sum(age):', db.sum('age'), 'sum of ages');
  console.log('✅ avg(age):', db.avg('age'), 'average age');
  console.log('✅ min(age):', db.min('age'), 'minimum age');
  console.log('✅ max(age):', db.max('age'), 'maximum age');
  console.log('✅ avg(score):', db.avg('score'), 'average score');
  
  // 🎯 TEST 7: Method Chaining
  console.log('\n7️⃣ METHOD CHAINING');
  console.log('─'.repeat(50));
  
  const chainedResults = db.find(user => user.active)
    .sort('score', 'desc')
    .limit(2)
    .values();
  
  console.log('✅ Method chaining:', chainedResults.length, 'results');
  chainedResults.forEach(user => console.log(`   - ${user.name}: ${user.score}`));
  
  // 🎯 TEST 8: Indexing System
  console.log('\n8️⃣ INDEXING SYSTEM');
  console.log('─'.repeat(50));
  
  await db.createIndex('age', 'range');
  await db.createIndex('city', 'hash');
  await db.createIndex('score', 'range');
  
  console.log('✅ Indexes created:', Object.keys(db.getIndexes()));
  
  // Index performance test
  console.time('Indexed query');
  const indexedResults = db.where('age', '>', 25);
  console.timeEnd('Indexed query');
  
  console.log('✅ Indexed result:', indexedResults.count(), 'users');
  
  // 🎯 TEST 9: Event System
  console.log('\n9️⃣ EVENT SYSTEM');
  console.log('─'.repeat(50));
  
  let eventCount = 0;
  db.database.on('set', ({ key }) => {
    eventCount++;
  console.log(`🎯 Event #${eventCount}: ${key} changed`);
  });
  
  db.set('event:test', { triggered: true });
  db.set('event:test2', { triggered: false });
  
  // 🎯 TEST 10: Performance Features
  console.log('\n🔟 PERFORMANCE FEATURES');
  console.log('─'.repeat(50));
  
  // Cache test
  console.time('First read');
  db.get('user:1');
  console.timeEnd('First read');
  
  console.time('Cached read');
  db.get('user:1');
  console.timeEnd('Cached read');
  
  // 🎯 TEST 11: Server Features
  console.log('\n1️⃣1️⃣ SERVER FEATURES');
  console.log('─'.repeat(50));
  
  console.log('✅ REST API: http://localhost:3001');
  console.log('✅ WebSocket: Real-time sync active');
  
  // API test data
  db.set('api:test', { 
    message: 'REST API test data',
    timestamp: Date.now()
  });
  
  console.log('📊 Test commands:');
  console.log('   curl http://localhost:3001/api/data/api:test');
  console.log('   curl http://localhost:3001/api/health');
  
  // 🎯 TEST 12: Backup System (NOW WORKING)
  console.log('\n1️⃣2️⃣ BACKUP SYSTEM');
  console.log('─'.repeat(50));
  
  const backupPath = await db.backup('./comprehensive-backup.json');
  console.log('✅ Backup created:', backupPath);
  
  // 🎯 FINAL STATISTICS
  console.log('\n📊 FINAL STATISTICS');
  console.log('─'.repeat(50));
  
  const finalStats = db.getStats();
  console.log('📈 Database Stats:', finalStats.database);
  console.log('🔍 Query Stats:', finalStats.query);
  console.log('⚡ Index Stats:', finalStats.indexes);
  
  console.log('\n🎉 ALL TESTS COMPLETED!');
  console.log('✨ 4.0.0 ALL FEATURES RUN SUCCESSFULLY!');
  
  // keep running 10 more seconds so the API can be tested
  console.log('\n⏰ 10 seconds until shutdown...');
  
  setTimeout(async () => {
    await db.stop();
    console.log('🛑 Database stopped');
    process.exit(0);
  }, 10000);
}

comprehensiveTest().catch(error => {
  console.error('❌ TEST ERROR:', error);
  process.exit(1);
});
