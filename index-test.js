// index-test.js
const SehawqDB = require('./index');

async function test() {
  console.log('⚡ Indexing System Test starting...\n');
  
  const db = new SehawqDB();
  await db.start();

  // Test verisi
  console.log('📝 Creating test data...');
  db.set('user:1', { name: 'Ali', age: 25, email: 'ali@example.com', active: true });
  db.set('user:2', { name: 'Ayse', age: 30, email: 'ayse@example.com', active: false });
  db.set('user:3', { name: 'Mehmet', age: 35, email: 'mehmet@example.com', active: true });

  // 1. Create index
  console.log('1️⃣ Creating index:');
  db.createIndex('age', 'range');
  db.createIndex('email', 'hash');
  console.log('✅ Indexler:', Object.keys(db.getIndexes()));

  // 2. Indexli sorgular
  console.log('2️⃣ Indexli Sorgular:');
  const adults = db.where('age', '>=', 18);
  console.log('✅ Age >= 18:', adults.count(), 'users');

  const specificEmail = db.where('email', '=', 'ali@example.com');
  console.log('✅ Email query:', specificEmail.count(), 'results');

  // 3. Index performance
  console.log('3️⃣ Index statistics:');
  console.log(db.indexManager.getStats());

  console.log('\n🎉 INDEXING SYSTEM WORKS!');
  await db.stop();
}

test().catch(console.error);    