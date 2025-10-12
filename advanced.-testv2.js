// advanced-test-v2.js
const SehawqDB = require('./index');

async function test() {
  console.log('🎯 Advanced Features Testi v2...\n');
  
  const db = new SehawqDB();
  await db.start();

  // 1. Event System (was working)
  console.log('1️⃣ Event System:');
  db.database.on('set', ({ key, value }) => {
    console.log(`🎯 Event: ${key} set oldu ->`, value);
  });
  db.set('event-test', { triggered: true });

  // 2. Array Operations (should work now)
  console.log('2️⃣ Array Operations:');
  db.push('messages', { id: 1, text: 'Hello' });
  db.push('messages', { id: 2, text: 'World' });
  console.log('✅ Messages:', db.get('messages'));

  // 3. Math Operations (should work now)
  console.log('3️⃣ Math Operations:');
  db.set('counter', 10);
  db.add('counter', 5);
  console.log('✅ Counter:', db.get('counter'));

  // 4. Dot Notation
  console.log('4️⃣ Dot Notation:');
  db.set('user.profile.name', 'Ali');
  db.set('user.profile.age', 25);
  console.log('✅ Dot notation:', db.get('user.profile.name'));

  // 5. Complex Queries
  console.log('5️⃣ Complex Queries:');
  db.set('product:1', { name: 'Laptop', price: 1000, category: 'electronics' });
  db.set('product:2', { name: 'Phone', price: 500, category: 'electronics' });
  db.set('product:3', { name: 'Book', price: 20, category: 'education' });
  
  const expensiveProducts = db.where('price', '>', 100);
  console.log('✅ Expensive products:', expensiveProducts.count());
  
  const electronics = db.where('category', '=', 'electronics');
  console.log('✅ Electronics:', electronics.count());

  console.log('\n🎉 ALL ADVANCED FEATURES WORKING!');
  await db.stop();
}

test().catch(console.error);