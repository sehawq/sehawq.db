// Replication 🔄
// Multi-node sync for SehawqDB. Primary broadcasts writes
// to replicas over HTTP. Not the most sophisticated approach
// but it works for our scale.
//
// Usage:
//   new SehawqDB({ replication: { role: 'primary', nodes: ['http://localhost:4000'] } })
//   new SehawqDB({ replication: { role: 'replica' } })

const http = require('http');
const https = require('https');

class Replication {
    constructor(db, opts = {}) {
        this.db = db;
        this.role = opts.role || 'primary';
        this.nodes = opts.nodes || [];
        this.syncInterval = opts.syncInterval || 10000;
        this.nodeId = opts.nodeId || ('node_' + Math.random().toString(36).slice(2, 8));
        this.onConflict = opts.onConflict || null; // custom merge fn
        this._heartbeatTimer = null;
        this._opLog = [];
        this._nodeHealth = new Map();
        this._conflicts = []; // conflict history

        // init health tracking
        for (const n of this.nodes) {
            this._nodeHealth.set(n, { alive: false, lastPing: 0, fails: 0 });
        }
    }

    // called after db is fully init'd
    start() {
        if (this.role === 'primary' && this.nodes.length > 0) {
            this._hookWriteEvents();
            this._startHeartbeat();
            console.log(`🔄 Replication: primary mode, ${this.nodes.length} replica(s)`);
        } else if (this.role === 'replica') {
            console.log('🔄 Replication: replica mode (waiting for primary)');
        }
    }

    // intercept db writes and forward to replicas
    _hookWriteEvents() {
        this.db.on('set', (evt) => {
            if (evt.key.startsWith('_')) return;
            this._broadcast({
                op: 'set', key: evt.key, value: evt.value,
                ts: Date.now(), nodeId: this.nodeId
            });
        });

        this.db.on('delete', (evt) => {
            if (evt.key.startsWith('_')) return;
            this._broadcast({
                op: 'del', key: evt.key,
                ts: Date.now(), nodeId: this.nodeId
            });
        });
    }

    // send an op to all replicas
    async _broadcast(op) {
        const payload = JSON.stringify(op);

        for (const node of this.nodes) {
            try {
                await this._post(node + '/api/replicate', payload);
                // mark as alive if it was down
                const health = this._nodeHealth.get(node);
                if (health) {
                    health.alive = true;
                    health.fails = 0;
                }
            } catch (e) {
                // replica is down, buffer the op for later maybe
                // TODO: implement op buffering and replay when replica comes back
                const health = this._nodeHealth.get(node);
                if (health) {
                    health.alive = false;
                    health.fails++;
                }
                if (this.db.conf?.debug) {
                    console.warn(`replica ${node} unreachable:`, e.message);
                }
            }
        }
    }

    // simple http post, no deps needed
    _post(url, body) {
        return new Promise((resolve, reject) => {
            const parsed = new URL(url);
            const mod = parsed.protocol === 'https:' ? https : http;

            const req = mod.request({
                hostname: parsed.hostname,
                port: parsed.port,
                path: parsed.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                    'X-Replication': 'true' // so replicas know this is a sync op
                },
                timeout: 5000
            }, (res) => {
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => resolve(data));
            });

            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
            req.write(body);
            req.end();
        });
    }

    // apply an incoming op from primary (used by replica)
    async applyOp(op) {
        if (this.role !== 'replica') {
            throw new Error('only replicas accept replication ops');
        }

        // conflict detection — check if local data was modified after op was sent
        if (op.op === 'set') {
            const local = this.db.get(op.key);
            const hasConflict = local !== undefined && op.ts && this._lastWrite(op.key) > op.ts;

            if (hasConflict) {
                // try custom merge first
                if (this.onConflict) {
                    const merged = this.onConflict(local, op.value, op);
                    await this.db.set(op.key, merged);
                    this._logConflict(op.key, local, op.value, 'custom_merge');
                } else {
                    // LWW — last write wins (remote wins since primary is source of truth)
                    await this.db.set(op.key, op.value);
                    this._logConflict(op.key, local, op.value, 'lww_remote');
                }
            } else {
                await this.db.set(op.key, op.value);
            }
        } else if (op.op === 'del') {
            await this.db.delete(op.key);
        }

        // track when this key was last written
        this._trackWrite(op.key);
    }

    _logConflict(key, localVal, remoteVal, strategy) {
        const entry = {
            key, strategy,
            localVal, remoteVal,
            resolvedAt: Date.now()
        };
        this._conflicts.push(entry);

        // also persist to db so it survives restarts
        const stored = this.db.get('_conflicts') || [];
        stored.push(entry);
        // dont keep more than 100
        if (stored.length > 100) stored.splice(0, stored.length - 100);
        this.db.set('_conflicts', stored);
    }

    // ghetto write tracking — just a map of key -> last write ts
    _trackWrite(key) {
        if (!this._writeTimes) this._writeTimes = new Map();
        this._writeTimes.set(key, Date.now());
    }

    _lastWrite(key) {
        if (!this._writeTimes) return 0;
        return this._writeTimes.get(key) || 0;
    }

    // heartbeat — ping replicas to check if theyre alive
    _startHeartbeat() {
        this._heartbeatTimer = setInterval(async () => {
            for (const node of this.nodes) {
                try {
                    const t0 = Date.now();
                    await this._post(node + '/api/replication/ping', JSON.stringify({ ts: t0 }));
                    const health = this._nodeHealth.get(node);
                    if (health) {
                        health.alive = true;
                        health.lastPing = Date.now();
                        health.lag = Date.now() - t0;
                        health.fails = 0;
                    }
                } catch {
                    const health = this._nodeHealth.get(node);
                    if (health) {
                        health.alive = false;
                        health.fails++;
                    }
                }
            }
        }, this.syncInterval);
    }

    status() {
        const nodes = {};
        for (const [url, h] of this._nodeHealth) {
            nodes[url] = { ...h };
        }
        return {
            role: this.role,
            nodeId: this.nodeId,
            nodeCount: this.nodes.length,
            nodes,
            buffered: this._opLog.length,
            conflicts: this._conflicts.length
        };
    }

    stop() {
        if (this._heartbeatTimer) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
        }
    }
}

module.exports = Replication;
