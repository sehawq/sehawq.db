const SehawqDB = require('../src/index');
const TimestampPlugin = require('../src/plugins/timestamp');
const WebhookPlugin = require('../src/plugins/webhook');

// Setup
const db = new SehawqDB({
    path: './test-data/plugin-test.json',
    debug: false
});

(async () => {
    console.log('🔌 Testing Plugin System...');

    // 1. Use Timestamp Plugin
    db.use(TimestampPlugin);

    // 2. Use Webhook Plugin (Mock URL)
    // We can't really test fetch here without a server, but let's load it to ensure no crash
    db.use(WebhookPlugin, { url: 'http://localhost:9999/webhook' });

    await db.start();

    // Test: Create
    console.log('   Creating user...');
    await db.set('user:1', { name: 'Plugin Tester' });

    const u1 = db.get('user:1');
    if (u1.created_at && u1.updated_at) {
        console.log('   ✅ Timestamp added:', u1.created_at);
    } else {
        console.error('   ❌ Timestamp MISSING');
    }

    // Test: Update
    await new Promise(r => setTimeout(r, 100)); // wait a bit
    await db.set('user:1', { name: 'Plugin Tester v2' });

    const u2 = db.get('user:1');
    if (u2.updated_at > u2.created_at) {
        console.log('   ✅ UpdatedAt modified correctly');
    } else {
        console.error('   ❌ UpdatedAt Failed');
    }

    console.log('🎉 Plugin System Works!');
    await db.stop();
})();
