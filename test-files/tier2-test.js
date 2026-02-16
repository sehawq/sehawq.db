// Tier 2 Feature Test
// Tests: Encryption, Migration, Schema Validation

const Database = require('../src/core/Database');
const Migration = require('../src/core/Migration');

const TEST_PATH = './test-data/tier2-test.json';
let passed = 0;
let failed = 0;

function assert(condition, msg) {
    if (condition) {
        passed++;
        console.log('  ✅', msg);
    } else {
        failed++;
        console.log('  ❌', msg);
    }
}

async function run() {
    console.log('\n🧪 Tier 2 Feature Tests\n');

    const fs = require('fs').promises;
    try { await fs.unlink(TEST_PATH); } catch (e) { }
    try { await fs.unlink(TEST_PATH.replace('.json', '.log')); } catch (e) { }

    const db = new Database({ path: TEST_PATH, debug: false, autoSave: false });
    await db.init();

    // ========== ENCRYPTION ==========
    console.log('🔐 Encryption');

    const encPlugin = require('../src/plugins/encryption');

    // Create a separate DB for encryption testing
    const ENC_PATH = './test-data/tier2-enc.json';
    try { await fs.unlink(ENC_PATH); } catch (e) { }
    try { await fs.unlink(ENC_PATH.replace('.json', '.log')); } catch (e) { }

    const encDb = new Database({ path: ENC_PATH, debug: false, autoSave: false });
    await encDb.init();

    // Apply encryption plugin
    encPlugin(encDb, { key: 'my-secret-key-123' });

    assert(encDb._encrypted === true, 'encryption marked as active');

    await encDb.set('greeting', 'hello world');
    const rawVal = encDb._store.get('greeting');
    assert(typeof rawVal === 'string' && rawVal.startsWith('enc:'), 'value is encrypted on disk');

    const decrypted = encDb.get('greeting');
    assert(decrypted === 'hello world', 'value decrypts correctly');

    // Object encryption
    await encDb.set('user', { name: 'Ali', age: 25 });
    const userRaw = encDb._store.get('user');
    assert(typeof userRaw === 'string' && userRaw.startsWith('enc:'), 'object is encrypted');

    const userDec = encDb.get('user');
    assert(userDec.name === 'Ali' && userDec.age === 25, 'object decrypts correctly');

    // Internal keys should NOT be encrypted
    await encDb.set('_internal', { secret: true });
    const internalRaw = encDb._store.get('_internal');
    assert(typeof internalRaw === 'object', 'internal keys bypass encryption');

    await encDb.close();

    // ========== MIGRATION ==========
    console.log('\n🔄 Migration');

    const mig = new Migration(db);

    mig.add(1, 'add-default-settings', async (db) => {
        await db.set('settings', { theme: 'dark', lang: 'en' });
    });

    mig.add(2, 'add-version-key', async (db) => {
        await db.set('app_version', '1.0.0');
    });

    const status1 = mig.status();
    assert(status1.current === 0, 'starts at version 0');
    assert(status1.pending === 2, '2 migrations pending');

    const ran = await mig.run();
    assert(ran === 2, 'ran 2 migrations');

    assert(db.get('settings')?.theme === 'dark', 'migration 1 applied correctly');
    assert(db.get('app_version') === '1.0.0', 'migration 2 applied correctly');

    const status2 = mig.status();
    assert(status2.current === 2, 'now at version 2');
    assert(status2.pending === 0, 'no pending migrations');

    // Re-running should skip already applied
    const ran2 = await mig.run();
    assert(ran2 === 0, 're-running skips already applied');

    // ========== SCHEMA VALIDATION ==========
    console.log('\n📋 Schema Validation');

    const users = db.collection('validated_users');
    users.schema({
        name: { type: 'string', required: true, min: 2 },
        age: { type: 'number', min: 0, max: 150 },
        role: { type: 'string', enum: ['admin', 'user', 'mod'] },
        email: { type: 'string', pattern: /@/ }
    });

    // Valid insert
    const id1 = await users.insert({ name: 'Ali', age: 25, role: 'admin', email: 'ali@test.com' });
    assert(id1 !== null, 'valid document inserts ok');

    // Required field missing
    let caught = false;
    try {
        await users.insert({ age: 30 }); // missing 'name'
    } catch (e) {
        caught = true;
        assert(e.message.includes('required'), 'required field throws error');
    }
    if (!caught) { failed++; console.log('  ❌ should have thrown for missing required'); }

    // Type mismatch
    caught = false;
    try {
        await users.insert({ name: 'Test', age: 'not a number' });
    } catch (e) {
        caught = true;
        assert(e.message.includes('number'), 'type mismatch throws error');
    }
    if (!caught) { failed++; console.log('  ❌ should have thrown for type mismatch'); }

    // Enum violation
    caught = false;
    try {
        await users.insert({ name: 'Test', role: 'superadmin' });
    } catch (e) {
        caught = true;
        assert(e.message.includes('one of'), 'enum violation throws error');
    }
    if (!caught) { failed++; console.log('  ❌ should have thrown for enum violation'); }

    // Min length violation
    caught = false;
    try {
        await users.insert({ name: 'A' }); // min 2 chars
    } catch (e) {
        caught = true;
        assert(e.message.includes('>='), 'min length throws error');
    }
    if (!caught) { failed++; console.log('  ❌ should have thrown for min length'); }

    // Pattern violation
    caught = false;
    try {
        await users.insert({ name: 'Test', email: 'not-an-email' });
    } catch (e) {
        caught = true;
        assert(e.message.includes('pattern'), 'pattern violation throws error');
    }
    if (!caught) { failed++; console.log('  ❌ should have thrown for pattern'); }

    // ========== RESULTS ==========
    console.log('\n' + '─'.repeat(40));
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('─'.repeat(40));

    await db.close();

    // cleanup
    try { await fs.unlink(TEST_PATH); } catch (e) { }
    try { await fs.unlink(TEST_PATH.replace('.json', '.log')); } catch (e) { }
    try { await fs.unlink(ENC_PATH); } catch (e) { }
    try { await fs.unlink(ENC_PATH.replace('.json', '.log')); } catch (e) { }

    if (failed > 0) process.exit(1);
}

run().catch(e => {
    console.error('Test crashed:', e);
    process.exit(1);
});
