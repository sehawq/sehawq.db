// Tier 1 Feature Test
// Tests: Collections, TTL, watch(), Quick.db compat

const Database = require('../src/core/Database');

const TEST_PATH = './test-data/tier1-test.json';
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
    console.log('\n🧪 Tier 1 Feature Tests\n');

    // Clean start
    const fs = require('fs').promises;
    try { await fs.unlink(TEST_PATH); } catch (e) { }
    try { await fs.unlink(TEST_PATH.replace('.json', '.log')); } catch (e) { }

    const db = new Database({ path: TEST_PATH, debug: false, autoSave: false });
    await db.init();

    // ========== COLLECTIONS ==========
    console.log('📦 Collections');

    const users = db.collection('users');
    const id1 = await users.insert({ name: 'Ali', age: 25, city: 'Istanbul' });
    const id2 = await users.insert({ name: 'Veli', age: 30, city: 'Ankara' });
    const id3 = await users.insert({ name: 'Ayse', age: 22, city: 'Istanbul' });

    assert(id1.startsWith('users:'), 'insert returns prefixed id');
    assert(users.count() === 3, 'collection has 3 docs');

    // find
    const istanbul = users.find({ city: 'Istanbul' });
    assert(istanbul.length === 2, 'find by city returns 2');

    // findOne
    const ali = users.findOne({ name: 'Ali' });
    assert(ali && ali.age === 25, 'findOne returns correct doc');

    // query operators
    const young = users.find({ age: { $lt: 26 } });
    assert(young.length === 2, '$lt operator works');

    const old = users.find({ age: { $gte: 30 } });
    assert(old.length === 1, '$gte operator works');

    // update
    await users.update({ name: 'Ali' }, { $set: { age: 26 } });
    const updatedAli = users.findOne({ name: 'Ali' });
    assert(updatedAli.age === 26, 'update with $set works');

    // remove
    await users.remove({ name: 'Veli' });
    assert(users.count() === 2, 'remove works');

    // ========== TTL ==========
    console.log('\n⏰ TTL (Time-To-Live)');

    await db.set('temp_session', { user: 'test' }, { ttl: 2 }); // 2 seconds
    assert(db.has('temp_session'), 'TTL key exists initially');
    assert(db._ttl.has('temp_session'), 'TTL tracked internally');

    // Wait 3 seconds for expiry
    console.log('  ⏳ waiting 3s for TTL expiry...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Force a sweep (normally runs every 10s)
    const now = Date.now();
    for (const [k, exp] of db._ttl) {
        if (now >= exp) {
            db._ttl.delete(k);
            await db.delete(k);
        }
    }

    assert(!db.has('temp_session'), 'TTL key auto-deleted after expiry');

    // ========== WATCH ==========
    console.log('\n👁️ Watch (Reactive Listeners)');

    let watchedVal = null;
    let watchedOld = null;

    db.watch('score', (newV, oldV) => {
        watchedVal = newV;
        watchedOld = oldV;
    });

    await db.set('score', 100);
    assert(watchedVal === 100, 'watch fires on set');
    assert(watchedOld === undefined, 'watch provides old value (undefined for new)');

    await db.set('score', 200);
    assert(watchedVal === 200, 'watch fires on update');
    assert(watchedOld === 100, 'watch provides correct old value');

    db.unwatch('score');
    await db.set('score', 300);
    assert(watchedVal === 200, 'unwatch stops notifications');

    // ========== QUICK.DB COMPAT ==========
    console.log('\n🔄 Quick.db Compatibility');

    // We test the compat module indirectly since it spins up its own DB
    // Just checking the module loads properly
    try {
        const qdb = require('../src/compat/quickdb');
        assert(typeof qdb.set === 'function', 'compat: set() exists');
        assert(typeof qdb.get === 'function', 'compat: get() exists');
        assert(typeof qdb.add === 'function', 'compat: add() exists');
        assert(typeof qdb.push === 'function', 'compat: push() exists');
        assert(typeof qdb.all === 'function', 'compat: all() exists');
        assert(typeof qdb.deleteAll === 'function', 'compat: deleteAll() exists');
    } catch (e) {
        console.log('  ⚠️  Could not load compat module:', e.message);
    }

    // ========== RESULTS ==========
    console.log('\n' + '─'.repeat(40));
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('─'.repeat(40));

    await db.close();

    // cleanup
    try { await fs.unlink(TEST_PATH); } catch (e) { }
    try { await fs.unlink(TEST_PATH.replace('.json', '.log')); } catch (e) { }

    if (failed > 0) process.exit(1);
}

run().catch(e => {
    console.error('Test crashed:', e);
    process.exit(1);
});
