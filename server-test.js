// server-test.js
const SehawqDB = require('./index');

async function test() {
  console.log('🌐 Server Features Testi...\n');
  
  const db = new SehawqDB({
    enableServer: true,
    serverPort: 3000, 
    enableRealtime: true,
    debug: true
  });
  
  await db.start();

  console.log('✅ REST API: http://localhost:3000');
  console.log('✅ WebSocket: Real-time sync aktif');
  
  // Test verisi
  db.set('server-test', { message: 'API testi', timestamp: Date.now() });
  
  console.log('\n🎉 SERVER SYSTEM WORKS!');
  console.log('📊 To test:');
  console.log('   curl http://localhost:3000/api/data');
  console.log('   curl http://localhost:3000/api/data/server-test');
  console.log('\n⏰ 30 saniye sonra kapanacak...');
  
  // run for 30 seconds then close
  setTimeout(async () => {
    await db.stop();
    console.log('🛑 Server durduruldu');
  }, 30000);
}

test().catch(console.error);