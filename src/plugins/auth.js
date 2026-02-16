// SehawqDB Auth Plugin 🛡️
// Simple, persistent, token-based authentication.

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

module.exports = function (db, opts = {}) {
    const SECRET = opts.secret || 'change-me-please';
    const COLLECTION = '_users';

    // Helper: Hash password
    function hash(pwd) {
        return crypto.createHmac('sha256', SECRET).update(pwd).digest('hex');
    }

    // 1. EXTEND DB: Add Management Methods
    db.register = function (username, password, role = 'user') {
        if (db.datebase_locked) throw new Error('Database locked'); // Just in case

        // Check existing
        const users = db.get(COLLECTION) || {};
        if (users[username]) throw new Error('User already exists');

        users[username] = {
            username,
            password: hash(password),
            role, // 'admin' or 'user'
            created_at: Date.now()
        };

        db.set(COLLECTION, users);
        return { username, role };
    };

    db.unregister = function (username) {
        if (db.datebase_locked) throw new Error('Database locked');
        const users = db.get(COLLECTION) || {};

        if (!users[username]) return false;

        delete users[username];
        db.set(COLLECTION, users);
        return true;
    };

    db.updateUserRole = function (username, newRole) {
        if (db.datebase_locked) throw new Error('Database locked');
        if (!['admin', 'user', 'readonly'].includes(newRole)) throw new Error('Invalid role');

        const users = db.get(COLLECTION) || {};
        if (!users[username]) throw new Error('User not found');

        users[username].role = newRole;
        db.set(COLLECTION, users);
        return true;
    };

    db.login = function (username, password) {
        const users = db.get(COLLECTION) || {};
        const user = users[username];

        if (!user || user.password !== hash(password)) {
            throw new Error('Invalid credentials');
        }

        // Generate Token
        const token = jwt.sign({
            user: user.username,
            role: user.role
        }, SECRET, { expiresIn: '24h' });

        return { token, user: { username: user.username, role: user.role } };
    };

    db.verifyToken = function (token) {
        try {
            return jwt.verify(token, SECRET);
        } catch (e) {
            return null;
        }
    };

    // 2. MIDDLEWARE for Express
    // We attach this to the db instance so the API server can find it
    db.authMiddleware = function (req, res, next) {
        // Allow public routes (like login)
        if (req.path === '/api/login' || req.path === '/api/register') return next();
        if (req.path === '/dashboard') return next(); // Dashboard HTML is public, data is protected

        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) return res.status(401).json({ error: 'Access Denied' });

        try {
            const verified = jwt.verify(token, SECRET);
            req.user = verified;

            // Enforce Read-Only Access
            if (req.user.role === 'readonly' && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
                return res.status(403).json({ error: 'Read-Only Access' });
            }

            next();
        } catch (err) {
            res.status(400).json({ error: 'Invalid Token' });
        }
    };

    // 3. INIT: Create Admin if missing (Wait for DB ready)
    function initSuperUser() {
        if (opts.superUser) {
            try {
                const users = db.get(COLLECTION);
                if (!users || !users[opts.superUser.user]) {
                    console.log('🛡️ Creating Super User:', opts.superUser.user);
                    db.register(opts.superUser.user, opts.superUser.pass, 'admin');
                }
            } catch (e) {
                console.error('Auth Init Error:', e.message);
            }
        }
    }

    if (db.ready) {
        initSuperUser();
    } else {
        db.once('ready', initSuperUser);
    }

    // 4. ROW-LEVEL SECURITY (RLS)
    // users can only see their own stuff unless theyre admin

    db.setOwnership = function (key, userId) {
        const owners = db.get('_ownership') || {};
        owners[key] = userId;
        db.set('_ownership', owners);
    };

    db.getOwnership = function (key) {
        const owners = db.get('_ownership') || {};
        return owners[key] || null;
    };

    // policy per collection: 'private' (owner only) or 'public' (anyone can read)
    db.setPolicy = function (collection, policy) {
        const policies = db.get('_policies') || {};
        policies[collection] = policy; // 'private', 'public', 'owner-read'
        db.set('_policies', policies);
    };

    db.getPolicy = function (collection) {
        const policies = db.get('_policies') || {};
        return policies[collection] || 'public'; // default public
    };

    // check if a user can access a key
    db.canAccess = function (key, user) {
        if (!user) return false;
        if (user.role === 'admin') return true; // admins bypass everything

        const owner = db.getOwnership(key);
        if (!owner) return true; // no owner = public

        // extract collection name from key if its a collection doc
        const parts = key.split('::');
        if (parts.length > 1) {
            const policy = db.getPolicy(parts[0]);
            if (policy === 'public') return true;
            if (policy === 'owner-read' && owner === user.user) return true;
            if (policy === 'private' && owner === user.user) return true;
            return false;
        }

        // non-collection key — only owner or admin
        return owner === user.user;
    };

    // enhanced middleware that checks RLS
    const origMiddleware = db.authMiddleware;
    db.authMiddleware = function (req, res, next) {
        // run normal auth first
        origMiddleware(req, res, () => {
            // for GET requests on specific keys, check ownership
            if (req.method === 'GET' && req.params.key && req.user) {
                if (!db.canAccess(req.params.key, req.user)) {
                    return res.status(403).json({ error: 'access denied' });
                }
            }
            next();
        });
    };
};
