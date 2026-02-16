const { SehawqDB } = require('../src/index');
const SehawqDirect = require('../src/index');

async function testReadme() {
    console.log('--- Verifying README Snippets ---');

    // 1. Hello World (Destructuring)
    try {
        const db = new SehawqDB({ path: './test-readme-1.json' });
        await db.start(); // Added start()

        await db.set('config', { theme: 'dark', version: '1.0' });
        const val = db.get('config').theme;
        console.log(`1. Hello World (Destructuring): ${val === 'dark' ? '✅ PASS' : '❌ FAIL'}`);

        await db.clear();
        await db.stop();
    } catch (e) {
        console.log('1. Hello World (Destructuring): ❌ FAIL', e.message);
    }

    // 2. Direct Import (Traditional)
    try {
        const db = new SehawqDirect({ path: './test-readme-2.json' });
        await db.start(); // Added start()

        await db.set('foo', 'bar');
        const val = db.get('foo');
        console.log(`2. Direct Import (require('...')): ${val === 'bar' ? '✅ PASS' : '❌ FAIL'}`);
        await db.clear();
        await db.stop();

    } catch (e) {
        console.log('2. Direct Import: ❌ FAIL', e.message);
    }

    // 3. Collections (Async)
    try {
        const db = new SehawqDB({ path: './test-readme-3.json' });
        await db.start(); // Added start()

        const users = db.collection('users');
        await users.insert({ name: 'Ali', role: 'admin' });
        await users.insert({ name: 'Veli', role: 'user' });

        const admins = users.find({ role: 'admin' });
        console.log(`3. Collections: ${admins.length >= 1 && admins[0].name === 'Ali' ? '✅ PASS' : '❌ FAIL'}`);
        await db.clear();
        await db.stop();
    } catch (e) {
        console.log('3. Collections: ❌ FAIL', e.message);
        console.error(e);
    }

    console.log('--- End Verification ---');
}

testReadme();
