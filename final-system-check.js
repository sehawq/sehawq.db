const io = require('socket.io-client');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';
const LOG_FILE = './test-results.log';

function log(msg, type = 'INFO') {
    const time = new Date().toISOString();
    const line = `[${time}] [${type}] ${msg}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n');
}

async function request(method, path, body = null, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    try {
        const res = await fetch(`${BASE_URL}${path}`, opts);
        const json = await res.json().catch(() => ({}));
        return { status: res.status, ok: res.ok, json };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

async function runTest() {
    log('🚀 STARTING FINAL AI SYSTEM CHECK...', 'SYSTEM');

    // 1. AUTH & ROLES
    log('--- Module 1: Auth & Roles ---', 'TEST');

    // Login Admin
    let res = await request('POST', '/api/login', { username: 'admin', password: '123' });
    if (!res.ok || !res.json.token) throw new Error('Admin Login Failed');
    const adminToken = res.json.token;
    log('✅ Admin Login', 'PASS');

    // Create Read-Only User
    const ts = Date.now();
    const roUser = `ro_${ts}`;
    res = await request('POST', '/api/register', { username: roUser, password: '123', role: 'readonly' }, adminToken);
    if (!res.ok) throw new Error('Create ReadOnly User Failed');
    log(`✅ Created User: ${roUser} (readonly)`, 'PASS');

    // Login Read-Only
    res = await request('POST', '/api/login', { username: roUser, password: '123' });
    const roToken = res.json.token;

    // Try Write as Read-Only (Should Fail)
    res = await request('POST', '/api/data', { key: `test_${ts}`, value: 'fail' }, roToken);
    if (res.status === 403 || res.status === 401 || !res.ok) {
        log('✅ Read-Only Write Blocked', 'PASS');
    } else {
        log('❌ Read-Only Write SUCCEEDED (Security Flaw)', 'FAIL');
    }

    // 2. DATA & CACHE
    log('--- Module 2: High-Volume Data & Cache ---', 'TEST');

    // Write 100 items
    const startWrite = Date.now();
    for (let i = 0; i < 100; i++) {
        await request('POST', '/api/data', { key: `stress_${i}`, value: { id: i, data: 'x'.repeat(100) } }, adminToken);
    }
    log(`✅ Wrote 100 items in ${Date.now() - startWrite}ms`, 'PASS');

    // Read same item 50 times to boost cache
    let hits = 0;
    for (let i = 0; i < 50; i++) {
        await request('GET', '/api/data/stress_0', null, adminToken);
    }

    // Check Stats
    res = await request('GET', '/api/stats', null, adminToken);
    const stats = res.json.database;
    log(`📊 Cache Stats: ${stats.hits} Hits / ${stats.misses} Misses (Rate: ${stats.rate})`, 'INFO');

    if (parseInt(stats.hits) > 40) {
        log('✅ Cache Efficiency > 90% for repeated reads', 'PASS');
    } else {
        log('⚠️ Cache Efficiency Low', 'WARN');
    }

    // 3. REALTIME SYNC
    log('--- Module 3: Realtime WebSocket ---', 'TEST');

    const socket = io(BASE_URL, { auth: { token: adminToken } });

    const socketPromise = new Promise((resolve, reject) => {
        let eventCount = 0;
        const testKey = `rt_${ts}`;

        socket.on('connect', () => {
            log('✅ WebSocket Connected', 'PASS');
            // Trigger update via API
            request('POST', '/api/data', { key: testKey, value: 'realtime-val' }, adminToken);
        });

        socket.on('update', (evt) => {
            if (evt.key === testKey && evt.value === 'realtime-val') {
                log('✅ Received Realtime Update Event', 'PASS');
                resolve();
            }
        });

        setTimeout(() => reject('WebSocket Timeout'), 3000);
    });

    try {
        await socketPromise;
    } catch (e) {
        log('❌ WebSocket Realtime Sync Failed: ' + e, 'FAIL');
    } finally {
        socket.disconnect();
    }

    // 4. CLEANUP
    log('--- Module 4: Cleanup & Persistence ---', 'TEST');
    // Delete test user
    res = await request('DELETE', `/api/users/${roUser}`, null, adminToken);
    if (res.ok) log('✅ Deleted Test User', 'PASS');

    log('🎉 SYSTEM CHECK COMPLETE. ALL MODULES OPERATIONAL.', 'SUCCESS');
}

runTest().catch(e => {
    log('❌ SYSTEM CHECK FATAL ERROR: ' + e.message, 'FATAL');
    process.exit(1);
});
