// module-test.js
const Database = require('./src/core/Database');
const QueryEngine = require('./src/core/QueryEngine');
const IndexManager = require('./src/core/IndexManager');

async function test() {
  console.log('🔧 Modular Structure Test starting...\n');
  
  // 1. Start the database
  const db = new Database();
  await new Promise(resolve => db.on('ready', resolve));
  
  // 2. Test QueryEngine independently
  console.log('1️⃣ QueryEngine Testi:');
  try {
    const qe = new QueryEngine(db);
  console.log('✅ QueryEngine loaded');
    
    // Test verisi
    db.set('user:1', { name: 'Ali', age: 25, active: true });
  db.set('user:2', { name: 'Ayse', age: 30, active: false });
    
    // Query test
    const results = qe.find(user => user.active);
  console.log(`✅ Find works: ${results.count()} results`);
  } catch (error) {
  console.log('❌ QueryEngine error:', error.message);
  }

  // 3. IndexManager testi
  console.log('2️⃣ IndexManager Testi:');
  try {
    const im = new IndexManager(db);
  console.log('✅ IndexManager loaded');
  } catch (error) {
  console.log('❌ IndexManager error:', error.message);
  }

  console.log('\n🎉 MODULAR TEST COMPLETE!');
  await db.close();
}

test().catch(console.error);