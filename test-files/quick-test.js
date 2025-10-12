// quick-test.js - Quick test file to quickly check the Database module
const Database = require('../src/core/Database');

async function test() {
  console.log('🔧 Loading database...');
  const db = new Database();
  
  // Ready eventini bekle
  await new Promise((resolve) => {
    db.on('ready', resolve);
    db.on('error', (err) => {
      console.error('❌ Database error:', err);
      resolve(); // Hata durumunda da devam et
    });
  });

  console.log('🎯 Test starting...');
  db.set('test', 'working!');
  console.log('✅ set() completed');

  const result = db.get('test');
  console.log('✅ get() completed:', result);

  const allData = db.all();
  console.log('✅ all() completed:', allData);

  console.log('🎉 TEST SUCCESS!');
  
  // Temiz kapat
  await db.close();
}

test().catch(console.error);
