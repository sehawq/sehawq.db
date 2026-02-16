// SehawqDB Universal Client
// Works in browser (script tag) and Node (require)

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('socket.io-client'), require('axios'));
    } else {
        root.Sehawq = factory(root.io, null);
    }
}(typeof self !== 'undefined' ? self : this, function (io, axios) {

    class Sehawq {
        constructor(url = 'http://localhost:3000', opts = {}) {
            this.url = url.replace(/\/$/, '');
            this.opts = opts;
            this.token = opts.token || null;
            this.socket = null;
            this._subs = new Map();
        }

        setToken(t) {
            this.token = t;
            if (this.socket) {
                this.socket.disconnect();
                this.socket = null;
                this.connect(); // reconnect with new creds
            }
        }

        async login(username, password) {
            const endpoint = `${this.url}/api/login`;
            let res;

            if (typeof fetch !== 'undefined') {
                const r = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                res = await r.json();
            } else {
                // node.js path
                const r = await axios.post(endpoint, { username, password });
                res = r.data;
            }

            if (res.token) this.setToken(res.token);
            return res;
        }

        // opens a websocket connection for realtime updates
        connect() {
            if (this.socket) return;

            const socketIo = io || window.io;
            if (!socketIo) throw new Error('socket.io-client not found');

            this.socket = socketIo(this.url, {
                auth: { token: this.token }
            });

            this.socket.on('connect', () => {
                console.log('Sehawq: WebSocket Connected ✅');
            });

            this.socket.on('disconnect', () => {
                console.log('Sehawq: WebSocket Disconnected ❌');
            });

            this.socket.on('update', (evt) => {
                if (this.opts.debug) console.log('update:', evt);
                this._notify(evt.key, evt.value);
            });
        }

        async get(key) {
            if (typeof fetch !== 'undefined') {
                const headers = {};
                if (this.token) headers['Authorization'] = 'Bearer ' + this.token;

                const res = await fetch(`${this.url}/api/data/${key}`, { headers });
                if (res.status === 404) return undefined;
                return (await res.json()).value;
            } else {
                try {
                    const headers = {};
                    if (this.token) headers['Authorization'] = 'Bearer ' + this.token;
                    const res = await axios.get(`${this.url}/api/data/${key}`, { headers });
                    return res.data.value;
                } catch (e) {
                    if (e.response && e.response.status === 404) return undefined;
                    throw e;
                }
            }
        }

        async set(key, value) {
            if (typeof fetch !== 'undefined') {
                const headers = { 'Content-Type': 'application/json' };
                if (this.token) headers['Authorization'] = 'Bearer ' + this.token;

                await fetch(`${this.url}/api/data`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ key, value })
                });
            } else {
                const headers = {};
                if (this.token) headers['Authorization'] = 'Bearer ' + this.token;
                await axios.post(`${this.url}/api/data`, { key, value }, { headers });
            }
        }

        // subscribe to changes on a key
        on(key, cb) {
            if (!this.socket) this.connect();

            if (!this._subs.has(key)) {
                this._subs.set(key, new Set());
                this.socket.emit('subscribe', key);
            }
            this._subs.get(key).add(cb);
        }

        off(key, cb) {
            if (!this._subs.has(key)) return;
            this._subs.get(key).delete(cb);
            if (this._subs.get(key).size === 0) this._subs.delete(key);
        }

        _notify(key, val) {
            if (this._subs.has(key)) {
                this._subs.get(key).forEach(cb => cb(val));
            }
        }
    }

    return Sehawq;
}));
