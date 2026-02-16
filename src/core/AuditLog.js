// Audit Log 📋
// Tracks every data operation for compliance (GDPR, SOC2 etc)
// Writes to a separate append-only file so it cant be tampered with easily

const fs = require('fs').promises;
const path = require('path');

class AuditLog {
    constructor(db, opts = {}) {
        this.db = db;
        this.logFile = opts.logFile || db.conf.path.replace(/\.json$/, '_audit.log');
        this.retention = opts.retention || 90; // days to keep logs
        this.enabled = opts.enabled !== false;
        this._buffer = []; // batch writes for perf
        this._flushInterval = null;

        if (this.enabled) {
            this._hookEvents();
            // flush buffer every 5 seconds
            this._flushInterval = setInterval(() => this._flush(), 5000);
        }
    }

    _hookEvents() {
        // log data changes
        this.db.on('set', (evt) => {
            if (evt.key.startsWith('_')) return; // skip internals
            this._log('SET', evt.key, { after: evt.value });
        });

        this.db.on('delete', (evt) => {
            if (evt.key.startsWith('_')) return;
            this._log('DELETE', evt.key, { before: evt.value });
        });
    }

    // manual log entry (for auth events etc)
    record(action, details = {}) {
        this._log(action, details.key || null, details);
    }

    _log(action, key, extra = {}) {
        const entry = {
            ts: Date.now(),
            action,
            key,
            user: extra.user || null,
            ip: extra.ip || null,
            ...extra
        };

        // remove undefined/null to keep logs clean
        for (const k in entry) {
            if (entry[k] === undefined || entry[k] === null) delete entry[k];
        }

        this._buffer.push(entry);
    }

    async _flush() {
        if (!this._buffer.length) return;

        const lines = this._buffer.map(e => JSON.stringify(e)).join('\n') + '\n';
        this._buffer = [];

        try {
            await fs.appendFile(this.logFile, lines, 'utf8');
        } catch (e) {
            // if we cant write audit logs thats kinda bad but dont crash
            console.error('audit write failed:', e.message);
        }
    }

    // query the audit log
    async query(filter = {}) {
        await this._flush(); // flush pending first

        try {
            const raw = await fs.readFile(this.logFile, 'utf8');
            const lines = raw.trim().split('\n').filter(l => l);

            let entries = lines.map(l => {
                try { return JSON.parse(l); } catch { return null; }
            }).filter(Boolean);

            // apply filters
            if (filter.action) {
                entries = entries.filter(e => e.action === filter.action);
            }
            if (filter.key) {
                entries = entries.filter(e => e.key === filter.key);
            }
            if (filter.user) {
                entries = entries.filter(e => e.user === filter.user);
            }
            if (filter.from) {
                entries = entries.filter(e => e.ts >= filter.from);
            }
            if (filter.to) {
                entries = entries.filter(e => e.ts <= filter.to);
            }

            // limit results
            const limit = filter.limit || 100;
            return entries.slice(-limit); // most recent first
        } catch {
            return []; // no log file yet
        }
    }

    // cleanup old entries
    async prune() {
        await this._flush();

        try {
            const raw = await fs.readFile(this.logFile, 'utf8');
            const lines = raw.trim().split('\n').filter(l => l);
            const cutoff = Date.now() - (this.retention * 24 * 60 * 60 * 1000);

            const kept = lines.filter(l => {
                try {
                    const entry = JSON.parse(l);
                    return entry.ts >= cutoff;
                } catch { return false; }
            });

            await fs.writeFile(this.logFile, kept.join('\n') + '\n', 'utf8');

            const removed = lines.length - kept.length;
            if (removed > 0 && this.db.conf?.debug) {
                console.log(`audit: pruned ${removed} old entries`);
            }

            return removed;
        } catch { return 0; }
    }

    stop() {
        if (this._flushInterval) {
            clearInterval(this._flushInterval);
            this._flushInterval = null;
        }
        // flush remaining
        return this._flush();
    }
}

module.exports = AuditLog;
