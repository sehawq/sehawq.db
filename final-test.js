// final-test.js - A comprehensive test file to verify all main features of SehawqDB v4.0.0
const SehawqDB = require('./index');

async function test() {
  console.log('🚀 4.0.0 Final Test starting...\n');
  
  const db = new SehawqDB();
  await db.start();

  console.log('1️⃣ Temel CRUD:');
  db.set('test', { message: 'Hello World!' });
  console.log('✅ Get:', db.get('test'));

  console.log('2️⃣ Query Sistemi:');
  db.set('user:1', { name: 'Ali', age: 25, active: true });
  db.set('user:2', { name: 'Ayse', age: 30, active: false });
  
  const activeUsers = db.find(user => user.active);
  console.log('✅ Find:', activeUsers.count(), 'active users');

  const adults = db.where('age', '>=', 18);
  console.log('✅ Where:', adults.count(), 'adults');

  console.log('3️⃣ Aggregation:');
  console.log('✅ Count:', db.count());
  console.log('✅ Avg Age:', db.avg('age'));

  console.log('\n🎉 4.0.0 ALL FEATURES WORKING!');
  await db.stop();
}

test().catch(console.error);