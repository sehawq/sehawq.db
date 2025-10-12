// index-test-v2.js
const SehawqDB = require('../index');

async function test() {
  console.log('⚡ Indexing System Test v2...\n');
  
  const db = new SehawqDB();
  await db.start();

  // Test data
  console.log('📝 Creating test data...');
  db.set('user:1', { name: 'Ali', age: 25, email: 'ali@example.com', active: true });
  db.set('user:2', { name: 'Ayse', age: 30, email: 'ayse@example.com', active: false });
  db.set('user:3', { name: 'Mehmet', age: 35, email: 'mehmet@example.com', active: true });

  // 1. Create index
  console.log('1️⃣ Creating index:');
  await db.createIndex('age', 'range');
  await db.createIndex('email', 'hash');
  console.log('✅ Indexes created');

  // 2. Index info
  console.log('2️⃣ Index Info:');
  const indexes = db.getIndexes();
  console.log('✅ Indexes:', Object.keys(indexes));

  // 3. Indexed queries
  console.log('3️⃣ Indexed Queries:');
  const adults = db.where('age', '>=', 18);
  console.log('✅ Age >= 18:', adults.count(), 'users');

  // 4. Statistics
  console.log('4️⃣ Statistics:');
  console.log('✅ Stats:', db.getStats().indexes);

  console.log('\n🎉 INDEXING SYSTEM WORKS!');
  await db.stop();
}

test().catch(console.error);
