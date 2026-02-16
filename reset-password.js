const crypto = require('crypto');
const fs = require('fs');

const DB_PATH = './sehawq-data.json';
const SECRET = 'super-secret-key-123';

function hash(pwd) {
    return crypto.createHmac('sha256', SECRET).update(pwd).digest('hex');
}

try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const db = JSON.parse(raw);

    // Ensure _users exists
    if (!db._users) db._users = {};

    console.log('Found users:', Object.keys(db._users));

    // Force update admin
    db._users['admin'] = {
        username: 'admin',
        password: hash('123'), // New password
        role: 'admin',
        created_at: Date.now()
    };

    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    console.log('✅ Admin password forcefully rest to "123"');

} catch (e) {
    console.error('Error:', e.message);
}
