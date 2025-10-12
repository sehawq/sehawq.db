// query-test.js - File that tests Query Engine functions
const Database = require('../src/core/Database');

async function test() {
  console.log('🔍 Query Engine Test starting...\n');
  const db = new Database();
  await new Promise(resolve => db.on('ready', resolve));

  // Create test data
  console.log('📝 Creating test data...');
  db.set('user:1', { name: 'Ali', age: 25, city: 'Istanbul', active: true });
  db.set('user:2', { name: 'Ayse', age: 30, city: 'Ankara', active: false });
  db.set('user:3', { name: 'Mehmet', age: 35, city: 'Istanbul', active: true });

  // 1. find() testi
  console.log('1️⃣ find() test:');
  const activeUsers = db.find(user => user.active);
  console.log(`   Active users: ${activeUsers.length}`);

  // 2. where() test  
  console.log('2️⃣ where() test:');
  const istanbulUsers = db.where('city', '=', 'Istanbul');
  console.log(`   Users living in Istanbul: ${istanbulUsers.count()}`);

  // 3. Aggregation tests
  console.log('3️⃣ Aggregation tests:');
  console.log(`   Total users: ${db.count()}`);
  console.log(`   Average age: ${db.avg('age')}`);
  console.log(`   Sum of ages: ${db.sum('age')}`);

  console.log('\n🎉 QUERY ENGINE TEST SUCCESS!');
  await db.close();
}

test().catch(console.error);
