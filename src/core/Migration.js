// Migration System 🔄
// Version-based migrations for schema changes.
// State is stored in _migrations key so it persists.

class Migration {
    constructor(db) {
        this.db = db;
        this._pending = [];
    }

    // register a migration step
    add(version, name, fn) {
        this._pending.push({ version, name, fn });
        this._pending.sort((a, b) => a.version - b.version);
    }

    _getState() {
        return this.db.get('_migrations') || { version: 0, history: [] };
    }

    async _saveState(state) {
        await this.db.set('_migrations', state);
    }

    // runs all pending migrations in order
    async run() {
        const state = this._getState();
        let ran = 0;

        for (const m of this._pending) {
            if (m.version <= state.version) continue;

            console.log(`⬆️  Running migration v${m.version}: ${m.name}`);

            try {
                await m.fn(this.db);
                state.version = m.version;
                state.history.push({
                    version: m.version,
                    name: m.name,
                    applied_at: Date.now()
                });
                ran++;
            } catch (e) {
                // dont skip broken migrations, just stop
                console.error(`Migration v${m.version} failed:`, e.message);
                break;
            }
        }

        if (ran > 0) {
            await this._saveState(state);
            console.log(`✅ ${ran} migration(s) applied. Now at v${state.version}`);
        }

        return ran;
    }

    // just check whats pending without applying
    status() {
        const state = this._getState();
        const pending = this._pending.filter(m => m.version > state.version);
        return {
            current: state.version,
            pending: pending.length,
            history: state.history || []
        };
    }
}

module.exports = Migration;
