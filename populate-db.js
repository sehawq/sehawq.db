// Using native fetch
async function populate() {
    const BASE = 'http://localhost:3000';
    console.log('🚀 Starting Data Flood (Writes + Reads)...');

    // 1. Auth as Admin
    const loginRes = await fetch(`${BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: '123' })
    });
    const { token } = await loginRes.json();
    if (!token) {
        console.error('❌ Login failed');
        process.exit(1);
    }

    // 2. Flood Writes
    const RECORDS = 100;
    const ids = [];

    console.log(`Phase 1: Writing ${RECORDS} records...`);
    for (let i = 0; i < RECORDS; i++) {
        const id = `stress_test_${i}`;
        ids.push(id);
        await fetch(`${BASE}/api/data`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ key: id, value: { val: Math.random(), ts: Date.now() } })
        });
    }

    // 3. Flood Reads (to trigger cache hits)
    console.log('Phase 2: Reading back records (Cache Warmup)...');

    // Read randomly 500 times
    for (let i = 0; i < 500; i++) {
        const randomId = ids[Math.floor(Math.random() * ids.length)];
        await fetch(`${BASE}/api/data/${randomId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
    }

    console.log('🏁 Stress Test Complete! Cache Rate should now be visible.');
}

populate().catch(console.error);
