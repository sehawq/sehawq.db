// Encryption Plugin 🔐
// At-rest encryption using AES-256-GCM
// Each value gets its own IV so same data = different ciphertext

const crypto = require('crypto');

module.exports = function (db, opts = {}) {
    const key = opts.key || opts.secret;

    if (!key) {
        console.warn('⚠️ Encryption: no key provided, skipping');
        return;
    }

    // derive 32-byte key from user input
    const derived = crypto.createHash('sha256').update(key).digest();
    const ALGO = 'aes-256-gcm';

    function encrypt(data) {
        const text = JSON.stringify(data);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(ALGO, derived, iv);

        let enc = cipher.update(text, 'utf8', 'hex');
        enc += cipher.final('hex');
        const tag = cipher.getAuthTag().toString('hex');

        // pack everything together — ugly format but easy to unpack
        return `enc:${iv.toString('hex')}:${tag}:${enc}`;
    }

    function decrypt(str) {
        if (typeof str !== 'string' || !str.startsWith('enc:')) return str;

        const parts = str.split(':');
        if (parts.length !== 4) return str; // not our format

        try {
            const iv = Buffer.from(parts[1], 'hex');
            const tag = Buffer.from(parts[2], 'hex');
            const decipher = crypto.createDecipheriv(ALGO, derived, iv);
            decipher.setAuthTag(tag);

            let dec = decipher.update(parts[3], 'hex', 'utf8');
            dec += decipher.final('utf8');
            return JSON.parse(dec);
        } catch (e) {
            // wrong key probably, dont crash everything
            console.warn('decrypt failed for a value, returning raw');
            return str;
        }
    }

    // monkey-patch set/get
    const _origSet = db.set.bind(db);
    const _origGet = db.get.bind(db);

    db.set = async function (k, v, setOpts) {
        if (k.startsWith('_')) return _origSet(k, v, setOpts); // skip internal
        return _origSet(k, encrypt(v), setOpts);
    };

    db.get = function (k) {
        const raw = _origGet(k);
        if (k.startsWith('_')) return raw;
        return decrypt(raw);
    };

    db._encrypted = true;

    if (db.conf?.debug) console.log('🔐 Encryption active');
};
