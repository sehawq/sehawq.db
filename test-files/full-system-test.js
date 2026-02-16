const SehawqDB = require('../src/index');
const http = require('http');
const fs = require('fs');

// Config
const PORT = 3005;
const DB_PATH = './test-data/system.json';

// Cleanup prev run
if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
if (fs.existsSync(DB_PATH.replace('.json', '.log'))) fs.unlinkSync(DB_PATH.replace('.json', '.log'));

const db = new SehawqDB({
    path: DB_PATH,
    enableServer: true,
    serverPort: PORT,
    enableRealtime: true,
    debug: false
});

async function runTests() {
    console.log('🚀 Starting Full System Verification...\n');

    // 1. DB Start
    console.log('1️⃣  Starting Database...');
    await db.start();
    console.log('   ✅ DB Started');

    // 2. CRUD & WAL
    console.log('\n2️⃣  Testing CRUD & WAL...');
    await db.set('user:1', { name: 'Ali', age: 25 });
    await db.set('user:2', { name: 'Veli', age: 30 });

    const u1 = db.get('user:1');
    if (u1.name === 'Ali') console.log('   ✅ Set/Get working');
    else console.error('   ❌ Set/Get FAILED');

    // 3. Query Engine
    console.log('\n3️⃣  Testing Query Engine...');
    const results = db.find(x => x.age > 20);
    if (results.count() === 2) console.log('   ✅ Find working');
    else console.error('   ❌ Find FAILED');

    // 4. API & Dashboard
    console.log('\n4️⃣  Testing API & Dashboard...');
    const dashboardHtml = await fetchUrl(`http://localhost:${PORT}/dashboard`);
    if (dashboardHtml.includes('<title>SehawqDB Dashboard</title>')) console.log('   ✅ Dashboard serving');
    else console.error('   ❌ Dashboard FAILED');

    const apiData = await fetchUrl(`http://localhost:${PORT}/api/data`);
    if (apiData.includes('Ali')) console.log('   ✅ API serving data');
    else console.error('   ❌ API FAILED');

    // 5. Persistence Check (WAL)
    console.log('\n5️⃣  Verifying WAL Persistence...');
    await db.stop(); // Stop completely

    // Restart
    const db2 = new SehawqDB({
        path: DB_PATH,
        enableServer: false,
        debug: false
    });
    await db2.start();

    if (db2.get('user:1')?.name === 'Ali') console.log('   ✅ Data persisted after restart');
    else console.error('   ❌ Data LOST after restart');

    console.log('\n🎉 Verification Complete!');
    process.exit(0);
}

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
