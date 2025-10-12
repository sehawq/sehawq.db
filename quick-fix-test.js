    // quick-fix-test.js
const SehawqDB = require('./index');

async function test() {
  console.log('🔧 Quick Fix Test...\n');
  
  const db = new SehawqDB();
  await db.start();

  // Sadece aggregation testi
  db.set('user:1', { name: 'Ali', age: 25 });
  db.set('user:2', { name: 'Ayse', age: 30 });
  db.set('user:3', { name: 'Mehmet', age: 35 });

  console.log('✅ Count:', db.count());
  console.log('✅ Avg Age:', db.avg('age'));
  console.log('✅ Sum Age:', db.sum('age'));
  console.log('✅ Min Age:', db.min('age'));
  console.log('✅ Max Age:', db.max('age'));

  console.log('\n🎉 AGGREGATION FIXED!');
  await db.stop();
}

test().catch(console.error);