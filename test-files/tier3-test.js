// Tier 3 Feature Tests 🧪
// Tests for replication, CLI, and runtime compat

const path = require('path');
const fs = require('fs');
const { execSync, spawn } = require('child_process');

const passed = [];
const failed = [];

function test(name, fn) {
    try {
        fn();
        passed.push(name);
        console.log(`  ✅ ${name}`);
    } catch (e) {
        failed.push(name);
        console.log(`  ❌ ${name}: ${e.message}`);
    }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

// clean up test data
const testDir = path.join(__dirname, '..', 'test-data');

console.log('\n🧪 Tier 3 Feature Tests\n');

// ---- REPLICATION ----
console.log('🔄 Replication');

const Database = require('../src/core/Database');
const Replication = require('../src/core/Replication');

// test with in-memory db (no server needed for unit tests)
const db1 = new Database({ path: path.join(testDir, 'repl-test.json'), autoSave: false });

test('replication class exists', () => {
    const repl = new Replication(db1, { role: 'primary', nodes: [] });
    assert(repl !== null);
});

test('primary role assigned', () => {
    const repl = new Replication(db1, { role: 'primary', nodes: ['http://localhost:4444'] });
    assert(repl.role === 'primary');
});

test('replica role assigned', () => {
    const repl = new Replication(db1, { role: 'replica' });
    assert(repl.role === 'replica');
});

test('node health tracking initialized', () => {
    const repl = new Replication(db1, {
        role: 'primary',
        nodes: ['http://node1:3000', 'http://node2:3000']
    });
    assert(repl._nodeHealth.size === 2);
});

test('status returns correct structure', () => {
    const repl = new Replication(db1, {
        role: 'primary',
        nodes: ['http://node1:3000']
    });
    const status = repl.status();
    assert(status.role === 'primary');
    assert(status.nodeCount === 1);
    assert(typeof status.nodes === 'object');
    assert(status.buffered === 0);
});

test('replica rejects ops in primary mode', async () => {
    const repl = new Replication(db1, { role: 'primary' });
    let threw = false;
    try {
        await repl.applyOp({ op: 'set', key: 'test', value: 'x' });
    } catch {
        threw = true;
    }
    assert(threw, 'should throw on primary');
});

test('stop clears heartbeat timer', () => {
    const repl = new Replication(db1, { role: 'primary', nodes: ['http://x:3000'] });
    repl._heartbeatTimer = setInterval(() => { }, 99999);
    repl.stop();
    assert(repl._heartbeatTimer === null);
});

// ---- CLI ----
console.log('\n🛠️  CLI Tool');

const cliPath = path.join(__dirname, '..', 'bin', 'sehawq.js');

test('cli file exists', () => {
    assert(fs.existsSync(cliPath), 'bin/sehawq.js not found');
});

test('cli has shebang', () => {
    const content = fs.readFileSync(cliPath, 'utf8');
    assert(content.startsWith('#!/usr/bin/env node'), 'missing shebang');
});

test('cli --help works', () => {
    const output = execSync(`node "${cliPath}" --help`, { encoding: 'utf8' });
    assert(output.includes('SehawqDB CLI'), 'help text missing');
    assert(output.includes('init'), 'init command missing');
    assert(output.includes('export'), 'export command missing');
    assert(output.includes('status'), 'status command missing');
});

test('cli unknown command warns', () => {
    const output = execSync(`node "${cliPath}" foobar`, { encoding: 'utf8' });
    assert(output.includes('bilinmeyen komut'), 'should warn about unknown cmd');
});

// ---- COMPAT ----
console.log('\n🌐 Runtime Compat');

test('deno adapter exports correctly', () => {
    const deno = require('../src/compat/deno');
    assert(typeof deno.isDeno === 'boolean');
    assert(typeof deno.fs === 'object');
    assert(typeof deno.path === 'object');
});

test('deno adapter isDeno false on node', () => {
    const deno = require('../src/compat/deno');
    assert(deno.isDeno === false, 'should be false on node');
});

test('deno adapter fs has required methods', () => {
    const deno = require('../src/compat/deno');
    // on node it falls back to real fs.promises
    assert(typeof deno.fs.readFile === 'function');
    assert(typeof deno.fs.writeFile === 'function');
    assert(typeof deno.fs.mkdir === 'function');
});

test('bun adapter exports correctly', () => {
    const bun = require('../src/compat/bun');
    assert(typeof bun.isBun === 'boolean');
    assert(typeof bun.patchFS === 'function');
    assert(typeof bun.getBunFile === 'function');
});

test('bun adapter isBun false on node', () => {
    const bun = require('../src/compat/bun');
    assert(bun.isBun === false);
});

// --- INTEGRATION: replication in index.js ---
console.log('\n🔗 Integration');

const SehawqDB = require('../src/index');

test('SehawqDB accepts replication config', () => {
    const db = new SehawqDB({
        path: path.join(testDir, 'repl-integ.json'),
        autoSave: false,
        replication: { role: 'primary', nodes: [] }
    });
    assert(db.repl !== null, 'repl should exist');
});

test('replicationStatus works', () => {
    const db = new SehawqDB({
        path: path.join(testDir, 'repl-integ2.json'),
        autoSave: false,
        replication: { role: 'replica' }
    });
    const status = db.replicationStatus();
    assert(status !== null);
    assert(status.role === 'replica');
});

test('replicationStatus returns null without config', () => {
    const db = new SehawqDB({
        path: path.join(testDir, 'repl-integ3.json'),
        autoSave: false
    });
    assert(db.replicationStatus() === null);
});

// ---- RESULTS ----
console.log(`\n${'─'.repeat(40)}`);
console.log(`Results: ${passed.length} passed, ${failed.length} failed`);
console.log(`${'─'.repeat(40)}\n`);

// cleanup test files
try {
    const files = fs.readdirSync(testDir);
    for (const f of files) {
        if (f.startsWith('repl-')) {
            try { fs.unlinkSync(path.join(testDir, f)); } catch { }
        }
    }
} catch { }

if (failed.length > 0) process.exit(1);
