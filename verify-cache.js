// Using native fetch
async function test() {
    const BASE = 'http://localhost:3000';
    console.log('🧪 Starting Controlled Cache Test...');

    // 1. Login
    const loginRes = await fetch(`${BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: '123' })
    });
    const { token } = await loginRes.json();
    if (!token) throw new Error('Login failed');

    // 2. Write ONE record
    const key = 'cache_test_key';
    await fetch(`${BASE}/api/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ key, value: 'test' })
    });
    console.log('✅ Wrote 1 record');

    // 3. Read it 100 times
    console.log('🔄 Reading 100 times...');
    for (let i = 0; i < 100; i++) {
        await fetch(`${BASE}/api/data/${key}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
    }

    // 4. Check Stats
    const statsRes = await fetch(`${BASE}/api/stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const stats = await statsRes.json();

    console.log('📊 Final Stats:', JSON.stringify(stats.database, null, 2));

    // Parse percent
    const rate = parseFloat(stats.database.rate.replace('%', ''));
    if (rate > 80) {
        console.log('✅ Cache Test PASSED! Rate is high as expected.');
    } else {
        console.error('❌ Cache Test FAILED! Rate is too low.');
    }
}

test().catch(console.error);
