// Official Webhook Plugin 🪝
// Pings a URL when data changes

module.exports = function (db, opts = {}) {
    if (!opts.url) {
        console.warn('Webhook Plugin: No URL provided!');
        return;
    }

    db.on('set', async (evt) => {
        try {
            // Don't wait for it
            fetch(opts.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    event: 'set',
                    key: evt.key,
                    value: evt.value,
                    time: Date.now()
                })
            }).catch(err => console.error('Webhook Failed:', err.message));

        } catch (e) {
            // Ignore
        }
    });
};
