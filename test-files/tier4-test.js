// Tier 4 Feature Tests 🧪
// Production readiness: streaming, conflicts, audit, compliance, RLS

const path = require('path');
const fs = require('fs');

const passed = [];
const failed = [];

function test(name, fn) {
    try {
        const r = fn();
        // handle async too
        if (r && r.then) {
            r.then(() => {
                passed.push(name);
                console.log(`  ✅ ${name}`);
            }).catch(e => {
                failed.push(name);
                console.log(`  ❌ ${name}: ${e.message}`);
            });
        } else {
            passed.push(name);
            console.log(`  ✅ ${name}`);
        }
    } catch (e) {
        failed.push(name);
        console.log(`  ❌ ${name}: ${e.message}`);
    }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

const testDir = path.join(__dirname, '..', 'test-data');
if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

console.log('\n🧪 Tier 4 Feature Tests\n');

// ---- STREAM STORAGE ----
console.log('💾 Stream Storage');

const StreamStorage = require('../src/core/StreamStorage');

test('StreamStorage basic set/get', async () => {
    const ss = new StreamStorage(path.join(testDir, 'stream-test.json'), { maxMemoryItems: 5 });
    await ss.set('hello', 'world');
    const val = await ss.get('hello');
    assert(val === 'world', `got: ${val}`);
});

test('StreamStorage tracks keys', async () => {
    const ss = new StreamStorage(path.join(testDir, 'stream-keys.json'), { maxMemoryItems: 5 });
    await ss.set('a', 1);
    await ss.set('b', 2);
    await ss.set('c', 3);
    assert(ss.size === 3, `size should be 3, got ${ss.size}`);
    assert(ss.has('b'));
});

test('StreamStorage evicts when over limit', async () => {
    const ss = new StreamStorage(path.join(testDir, 'stream-evict.json'), { maxMemoryItems: 3 });
    await ss.set('a', 1);
    await ss.set('b', 2);
    await ss.set('c', 3);
    await ss.set('d', 4); // should evict 'a'
    assert(ss._hot.size <= 3, `hot cache should be <= 3, got ${ss._hot.size}`);
    assert(ss.size === 4, 'total keys should still be 4');
});

test('StreamStorage pagination works', async () => {
    const ss = new StreamStorage(path.join(testDir, 'stream-page.json'), { maxMemoryItems: 100 });
    for (let i = 0; i < 10; i++) await ss.set(`key${i}`, i);

    const page = await ss.all({ limit: 3, offset: 0 });
    assert(page.total === 10, `total should be 10, got ${page.total}`);
    assert(Object.keys(page.data).length === 3, 'page should have 3 items');
    assert(page.hasMore === true, 'should have more pages');
});

test('StreamStorage getStats works', async () => {
    const ss = new StreamStorage(path.join(testDir, 'stream-stats.json'), { maxMemoryItems: 5 });
    await ss.set('x', 'y');
    const stats = ss.getStats();
    assert(stats.totalKeys === 1);
    assert(stats.hotKeys === 1);
    assert(stats.coldKeys === 0);
});

test('StreamStorage delete works', async () => {
    const ss = new StreamStorage(path.join(testDir, 'stream-del.json'), { maxMemoryItems: 5 });
    await ss.set('gone', 'soon');
    await ss.delete('gone');
    assert(!ss.has('gone'));
    assert(ss.size === 0);
});

// ---- CONFLICT RESOLUTION ----
console.log('\n⚔️  Conflict Resolution');

const Database = require('../src/core/Database');
const Replication = require('../src/core/Replication');

test('replication has nodeId', () => {
    const db = new Database({ path: path.join(testDir, 'cr1.json'), autoSave: false });
    const repl = new Replication(db, { role: 'primary', nodeId: 'test_node' });
    assert(repl.nodeId === 'test_node');
});

test('replication generates nodeId if not provided', () => {
    const db = new Database({ path: path.join(testDir, 'cr2.json'), autoSave: false });
    const repl = new Replication(db, { role: 'replica' });
    assert(repl.nodeId.startsWith('node_'));
});

test('conflict tracking initialized', () => {
    const db = new Database({ path: path.join(testDir, 'cr3.json'), autoSave: false });
    const repl = new Replication(db, { role: 'primary' });
    assert(Array.isArray(repl._conflicts));
    assert(repl._conflicts.length === 0);
});

test('status includes conflict count', () => {
    const db = new Database({ path: path.join(testDir, 'cr4.json'), autoSave: false });
    const repl = new Replication(db, { role: 'primary' });
    const status = repl.status();
    assert(status.conflicts === 0);
    assert(status.nodeId !== undefined);
});

// ---- AUDIT LOG ----
console.log('\n📋 Audit Log');

const AuditLog = require('../src/core/AuditLog');

test('AuditLog creates instance', () => {
    const db = new Database({ path: path.join(testDir, 'audit1.json'), autoSave: false });
    db.on = db.on || (() => { }); // just in case
    const audit = new AuditLog(db, { enabled: false });
    assert(audit !== null);
    assert(audit.enabled === false);
});

test('AuditLog records manual entries', async () => {
    const logFile = path.join(testDir, 'test_audit.log');
    try { fs.unlinkSync(logFile); } catch { }

    const db = new Database({ path: path.join(testDir, 'audit2.json'), autoSave: false });
    const audit = new AuditLog(db, { logFile, enabled: false });

    audit.record('LOGIN', { user: 'testUser', ip: '127.0.0.1' });
    audit.record('SET', { key: 'test', user: 'testUser' });
    await audit._flush();

    const entries = await audit.query();
    assert(entries.length === 2, `expected 2 entries, got ${entries.length}`);
    assert(entries[0].action === 'LOGIN');
    assert(entries[1].action === 'SET');

    audit.stop();
});

test('AuditLog query filters work', async () => {
    const logFile = path.join(testDir, 'test_audit_filter.log');
    try { fs.unlinkSync(logFile); } catch { }

    const db = new Database({ path: path.join(testDir, 'audit3.json'), autoSave: false });
    const audit = new AuditLog(db, { logFile, enabled: false });

    audit.record('SET', { key: 'a', user: 'user1' });
    audit.record('SET', { key: 'b', user: 'user2' });
    audit.record('DELETE', { key: 'c', user: 'user1' });
    await audit._flush();

    const user1 = await audit.query({ user: 'user1' });
    assert(user1.length === 2);

    const deletes = await audit.query({ action: 'DELETE' });
    assert(deletes.length === 1);

    audit.stop();
});

// ---- COMPLIANCE ----
console.log('\n🔐 GDPR Compliance');

const Compliance = require('../src/core/Compliance');

test('Compliance exports user data', async () => {
    const db = new Database({ path: path.join(testDir, 'gdpr1.json'), autoSave: false });
    await db.init();
    db.set('user:1', { name: 'Ali', userId: 'ali123' });
    db.set('user:2', { name: 'Veli', userId: 'veli456' });
    db.set('post:1', { text: 'hello', userId: 'ali123' });

    const comp = new Compliance(db);
    const result = await comp.exportUserData('ali123');
    assert(result.recordCount === 2, `expected 2, got ${result.recordCount}`);
    assert(result.data['user:1'] !== undefined);
    assert(result.data['post:1'] !== undefined);
});

test('Compliance deletes user data', async () => {
    const db = new Database({ path: path.join(testDir, 'gdpr2.json'), autoSave: false });
    await db.init();
    db.set('user:1', { name: 'toDelete', userId: 'del123' });
    db.set('post:1', { text: 'bye', userId: 'del123' });
    db.set('post:2', { text: 'keep', userId: 'other' });

    const comp = new Compliance(db);
    const result = await comp.deleteUserData('del123');
    assert(result.deletedRecords === 2, `expected 2 deleted, got ${result.deletedRecords}`);
    assert(db.get('post:2') !== undefined, 'other user data should remain');
});

test('Compliance anonymizes PII', async () => {
    const db = new Database({ path: path.join(testDir, 'gdpr3.json'), autoSave: false });
    await db.init();
    db.set('u1', { name: 'Secret Name', email: 'secret@test.com', userId: 'anon123', age: 25 });

    const comp = new Compliance(db);
    await comp.anonymizeUserData('anon123');

    const after = db.get('u1');
    assert(after.name !== 'Secret Name', 'name should be anonymized');
    assert(after.email !== 'secret@test.com', 'email should be anonymized');
    assert(after.age === 25, 'non-PII should stay');
});

test('Compliance report works', async () => {
    const db = new Database({ path: path.join(testDir, 'gdpr4.json'), autoSave: false });
    await db.init();
    db.set('a', { userId: 'u1', name: 'x' });
    db.set('b', { userId: 'u2', email: 'y' });
    db.set('c', { noOwner: true });

    const comp = new Compliance(db);
    const report = comp.report();
    assert(report.totalRecords === 3);
    assert(report.recordsWithOwner === 2);
    assert(report.recordsWithoutOwner === 1);
    assert(report.piiFieldsFound.includes('name'));
    assert(report.piiFieldsFound.includes('email'));
});

// ---- RLS ----
console.log('\n🛡️  Row-Level Security');

const SehawqDB = require('../src/index');
const auth = require('../src/plugins/auth');

test('RLS: setOwnership works', async () => {
    const db = new SehawqDB({ path: path.join(testDir, 'rls1.json'), autoSave: false });
    db.use(auth, { secret: 'test-key' });
    await db.start();

    db.db.setOwnership('secret-doc', 'user1');
    const owner = db.db.getOwnership('secret-doc');
    assert(owner === 'user1');

    await db.stop();
});

test('RLS: admin can access anything', async () => {
    const db = new SehawqDB({ path: path.join(testDir, 'rls2.json'), autoSave: false });
    db.use(auth, { secret: 'test-key' });
    await db.start();

    db.db.setOwnership('doc1', 'user1');
    const canAccess = db.db.canAccess('doc1', { user: 'admin', role: 'admin' });
    assert(canAccess === true, 'admin should bypass RLS');

    await db.stop();
});

test('RLS: user cannot access others data', async () => {
    const db = new SehawqDB({ path: path.join(testDir, 'rls3.json'), autoSave: false });
    db.use(auth, { secret: 'test-key' });
    await db.start();

    db.db.setOwnership('doc1', 'user1');
    const canAccess = db.db.canAccess('doc1', { user: 'user2', role: 'user' });
    assert(canAccess === false, 'user2 should not access user1 data');

    await db.stop();
});

test('RLS: owner can access own data', async () => {
    const db = new SehawqDB({ path: path.join(testDir, 'rls4.json'), autoSave: false });
    db.use(auth, { secret: 'test-key' });
    await db.start();

    db.db.setOwnership('mydoc', 'alice');
    const canAccess = db.db.canAccess('mydoc', { user: 'alice', role: 'user' });
    assert(canAccess === true, 'owner should access own data');

    await db.stop();
});

test('RLS: setPolicy works', async () => {
    const db = new SehawqDB({ path: path.join(testDir, 'rls5.json'), autoSave: false });
    db.use(auth, { secret: 'test-key' });
    await db.start();

    db.db.setPolicy('secrets', 'private');
    const policy = db.db.getPolicy('secrets');
    assert(policy === 'private');

    await db.stop();
});

// ---- INTEGRATION ----
console.log('\n🔗 Integration');

test('SehawqDB has audit + compliance', () => {
    const db = new SehawqDB({ path: path.join(testDir, 'integ1.json'), autoSave: false });
    assert(db.audit !== null, 'audit should exist');
    assert(db.compliance !== null, 'compliance should exist');
});

test('auditLog method works', async () => {
    const db = new SehawqDB({ path: path.join(testDir, 'integ2.json'), autoSave: false });
    const logs = await db.auditLog();
    assert(Array.isArray(logs), 'should return array');
});

test('complianceReport returns stats', async () => {
    const db = new SehawqDB({ path: path.join(testDir, 'integ3.json'), autoSave: false });
    await db.start();
    const report = db.complianceReport();
    assert(typeof report.totalRecords === 'number');
    await db.stop();
});

// ---- RESULTS (wait for async) ----
setTimeout(() => {
    console.log(`\n${'─'.repeat(40)}`);
    console.log(`Results: ${passed.length} passed, ${failed.length} failed`);
    console.log(`${'─'.repeat(40)}\n`);

    // cleanup
    try {
        const files = fs.readdirSync(testDir);
        for (const f of files) {
            if (f.startsWith('stream-') || f.startsWith('cr') || f.startsWith('audit') ||
                f.startsWith('gdpr') || f.startsWith('rls') || f.startsWith('integ') ||
                f.startsWith('test_audit')) {
                try { fs.unlinkSync(path.join(testDir, f)); } catch { }
            }
        }
    } catch { }

    if (failed.length > 0) process.exit(1);
}, 3000);
