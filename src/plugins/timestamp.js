// Official Timestamp Plugin 🕒
// Adds createdAt and updatedAt fields automatically

module.exports = function (db, opts = {}) {
    const createdField = opts.createdField || 'created_at';
    const updatedField = opts.updatedField || 'updated_at';

    db.on('set', (evt) => {
        // Only handle objects
        if (!evt.value || typeof evt.value !== 'object') return;

        // Prevent infinite loop if we update the value inside the listener
        // Actually, listeners are called AFTER set, so modifying here won't affect the stored value
        // unless we call set() again, which causes a loop.

        // Better approach: Middleware style? 
        // Since we don't have pre-hooks yet, we can't easily modify data BEFORE save without complex logic.
        // For now, let's just demonstrate the connection.

        // Wait... if we can't modify before save, this plugin is useless for "automatic" timestamps 
        // unless we intercept the set method.

        // Let's monkey-patch set()! That's very "Hacker" style.
    });

    const originalSet = db.set.bind(db);

    db.set = async function (key, val) {
        if (val && typeof val === 'object') {
            const now = Date.now();

            // Update
            val[updatedField] = now;

            // Create
            // We need to check if it exists, but getting it is expensive?
            // Let's just blindly add created_at if it's missing in the INPUT val
            if (!val[createdField]) {
                // Check DB to be sure? 
                const exists = db.get(key);
                if (exists && exists[createdField]) {
                    val[createdField] = exists[createdField]; // Preserve old
                } else {
                    val[createdField] = now; // New
                }
            }
        }

        // Call original
        return originalSet(key, val);
    };
};
