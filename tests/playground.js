const SehawqDB = require('../src/index');
const SehawqClient = require('../src/client');

// Start Server locally
const db = new SehawqDB({
    path: './test-data/playground.json',
    enableServer: true,
    serverPort: 3001, // Use different port for testing
    debug: false
});

(async () => {
    console.log('--- Client SDK Test ---');
    await db.start();

    // Init Client
    const client = new SehawqClient('http://localhost:3001', { debug: true });

    // Test Set
    console.log('Client: Setting value...');
    await client.set('sdk_test', { works: true, time: Date.now() });

    // Test Get
    console.log('Client: Getting value...');
    const val = await client.get('sdk_test');
    console.log('Client: Value received:', val);

    if (val && val.works) console.log('✅ SDK Works!');
    else console.error('❌ SDK Failed');

    // Test Realtime
    console.log('Client: Testing Realtime...');
    const realtimePromise = new Promise(resolve => {
        client.on('sdk_realtime', (data) => {
            console.log('Client: Realtime update received:', data);
            resolve();
        });
    });

    // Trigger update from DB side
    setTimeout(async () => {
        console.log('DB: Triggering update...');
        await db.set('sdk_realtime', 'Hello Realtime');
    }, 500);

    await realtimePromise;
    console.log('✅ Realtime Works!');

    await db.stop();
    console.log('--- Test Complete ---');
    process.exit(0);
})();
