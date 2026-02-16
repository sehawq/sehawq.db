// GDPR & Compliance Helpers 🔐
// Right to be forgotten, data portability, anonymization.
// Not a lawyer, but this covers the basics.

class Compliance {
    constructor(db) {
        this.db = db;
    }

    // export all data belonging to a user
    // GDPR Article 20 - data portability
    async exportUserData(userId) {
        const allData = this.db.all();
        const userData = {};
        let count = 0;

        for (const [key, val] of Object.entries(allData)) {
            if (key.startsWith('_')) continue; // skip system keys

            // check if this val belongs to the user
            if (this._belongsTo(val, userId)) {
                userData[key] = val;
                count++;
            }
        }

        return {
            userId,
            exportedAt: new Date().toISOString(),
            recordCount: count,
            data: userData
        };
    }

    // delete all user data
    // GDPR Article 17 - right to erasure
    async deleteUserData(userId) {
        const allData = this.db.all();
        let deleted = 0;

        for (const [key, val] of Object.entries(allData)) {
            if (key.startsWith('_')) continue;

            if (this._belongsTo(val, userId)) {
                await this.db.delete(key);
                deleted++;
            }
        }

        // also remove from _users if auth plugin is active
        const users = this.db.get('_users');
        if (users && users[userId]) {
            delete users[userId];
            this.db.set('_users', users);
        }

        // log the deletion for audit trail
        if (this.db.audit) {
            this.db.audit.record('GDPR_DELETE', {
                user: userId,
                deletedRecords: deleted
            });
        }

        return { userId, deletedRecords: deleted, deletedAt: new Date().toISOString() };
    }

    // anonymize user data instead of deleting
    // keeps the record but strips PII
    async anonymizeUserData(userId) {
        const allData = this.db.all();
        const crypto = require('crypto');
        let anonymized = 0;

        // fields we consider PII
        const piiFields = ['name', 'email', 'phone', 'address', 'ip',
            'firstName', 'lastName', 'username', 'displayName'];

        for (const [key, val] of Object.entries(allData)) {
            if (key.startsWith('_')) continue;
            if (!this._belongsTo(val, userId)) continue;
            if (typeof val !== 'object') continue;

            let changed = false;
            for (const field of piiFields) {
                if (val[field] !== undefined) {
                    // hash it so its not recoverable but still unique
                    val[field] = crypto.createHash('sha256')
                        .update(String(val[field]))
                        .digest('hex').slice(0, 12);
                    changed = true;
                }
            }

            // replace userId/owner references
            if (val._owner === userId) val._owner = '[anonymized]';
            if (val.userId === userId) val.userId = '[anonymized]';

            if (changed) {
                this.db.set(key, val);
                anonymized++;
            }
        }

        if (this.db.audit) {
            this.db.audit.record('GDPR_ANONYMIZE', {
                user: userId,
                anonymizedRecords: anonymized
            });
        }

        return { userId, anonymizedRecords: anonymized, anonymizedAt: new Date().toISOString() };
    }

    // check if a value "belongs" to a user
    _belongsTo(val, userId) {
        if (!val || typeof val !== 'object') return false;

        // check common ownership fields
        return val._owner === userId ||
            val.userId === userId ||
            val.user === userId ||
            val.owner === userId ||
            val.createdBy === userId;
    }

    // generate a compliance report
    report() {
        const allData = this.db.all();
        const stats = {
            totalRecords: 0,
            recordsWithOwner: 0,
            recordsWithoutOwner: 0,
            uniqueOwners: new Set(),
            piiFieldsFound: new Set()
        };

        const piiFields = ['name', 'email', 'phone', 'address', 'ip',
            'firstName', 'lastName', 'username'];

        for (const [key, val] of Object.entries(allData)) {
            if (key.startsWith('_')) continue;
            stats.totalRecords++;

            if (val && typeof val === 'object') {
                const owner = val._owner || val.userId || val.user;
                if (owner) {
                    stats.recordsWithOwner++;
                    stats.uniqueOwners.add(owner);
                } else {
                    stats.recordsWithoutOwner++;
                }

                for (const f of piiFields) {
                    if (val[f] !== undefined) stats.piiFieldsFound.add(f);
                }
            }
        }

        return {
            ...stats,
            uniqueOwners: stats.uniqueOwners.size,
            piiFieldsFound: [...stats.piiFieldsFound]
        };
    }
}

module.exports = Compliance;
