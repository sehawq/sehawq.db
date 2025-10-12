// performance-test.js
const SehawqDB = require('./index');

async function test() {
  console.log('🚀 Performance Features Testi...\n');
  
  const db = new SehawqDB();
  await db.start();

  // 1. Cache testi
  console.log('1️⃣ Cache Testi:');
  console.time('First read');
  db.set('cache-test', { data: 'cache deneme' });
  db.get('cache-test');
  console.timeEnd('First read');

  console.time('Cacheli okuma');
  db.get('cache-test');
  console.timeEnd('Cacheli okuma');

  // 2. Memory Manager
  console.log('2️⃣ Memory Manager:');
  console.log('✅ Memory Report:', db.memoryManager.getReport().current);

  // 3. Stats
  console.log('3️⃣ Statistics:');
  console.log(db.getStats());

  console.log('\n🎉 PERFORMANCE SYSTEM WORKS!');
  await db.stop();
}

test().catch(console.error);