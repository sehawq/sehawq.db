// No require needed for Node 18+
async function test() {
    const BASE = 'http://localhost:3000';

    console.log('1. Logging in as admin...');
    try {
        const loginRes = await fetch(`${BASE}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', password: '123' })
        });

        const loginJson = await loginRes.json();
        console.log('Login Response:', JSON.stringify(loginJson, null, 2));

        if (!loginJson.success) {
            console.error('Login failed');
            return;
        }

        const token = loginJson.token;

        console.log('2. Fetching Users...');
        const usersRes = await fetch(`${BASE}/api/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const text = await usersRes.text();
        console.log('Raw Users Response:', text);

        try {
            const usersJson = JSON.parse(text);
            console.log('Users Object Keys:', usersJson.users ? usersJson.users.length : 'No users field');
        } catch (e) {
            console.error('Failed to parse JSON');
        }

    } catch (e) {
        console.error('Fetch error:', e);
    }
}

test();
