// SehawqDB Universal Client
// Works in browser (script tag) and Node (require)

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('socket.io-client'), require('axios'));
    } else {
        root.Sehawq = factory(root.io, null);
    }
}(typeof self !== 'undefined' ? self : this, function (io, axios) {

    const hasFetch = typeof fetch !== 'undefined';

    class Sehawq {

        constructor(url = 'http://localhost:3000', opts = {}) {
            this.url = url.replace(/\/$/, '');
            this.opts = opts;
            this.token = opts.token || null;

            this.socket = null;
            this._subs = new Map();
        }

        setToken(token) {
            this.token = token;

            if (this.socket) {
                this.socket.disconnect();
                this.socket = null;
                this.connect();
            }
        }

        async _request(method, path, body = null) {
            const url = `${this.url}${path}`;

            const headers = {};
            if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
            if (body) headers['Content-Type'] = 'application/json';

            if (hasFetch) {
                const res = await fetch(url, {
                    method,
                    headers,
                    body: body ? JSON.stringify(body) : undefined
                });

                if (res.status === 404) return undefined;

                const json = await res.json().catch(() => ({}));
                return json;
            }

            const res = await axios({
                method,
                url,
                headers,
                data: body
            });

            return res.data;
        }

        async login(username, password) {
            const res = await this._request('POST', '/api/login', { username, password });

            if (res && res.token) this.setToken(res.token);

            return res;
        }

        connect() {
            if (this.socket) return;

            const socketIo = io || (typeof window !== 'undefined' ? window.io : null);
            if (!socketIo) throw new Error('socket.io-client not found');

            this.socket = socketIo(this.url, {
                auth: { token: this.token }
            });

            this.socket.on('connect', () => {
                if (this.opts.debug) console.log('Sehawq: WebSocket Connected ✅');
            });

            this.socket.on('disconnect', () => {
                if (this.opts.debug) console.log('Sehawq: WebSocket Disconnected ❌');
            });

            this.socket.on('update', evt => {
                if (this.opts.debug) console.log('update:', evt);
                this._notify(evt.key, evt.value);
            });
        }

        async get(key) {
            const res = await this._request('GET', `/api/data/${key}`);
            return res ? res.value : undefined;
        }

        async set(key, value) {
            await this._request('POST', '/api/data', { key, value });
        }

        on(key, cb) {
            if (!this.socket) this.connect();

            if (!this._subs.has(key)) {
                this._subs.set(key, new Set());
                this.socket.emit('subscribe', key);
            }

            this._subs.get(key).add(cb);
        }

        off(key, cb) {
            const set = this._subs.get(key);
            if (!set) return;

            set.delete(cb);

            if (set.size === 0) {
                this._subs.delete(key);
                if (this.socket) this.socket.emit('unsubscribe', key);
            }
        }

        _notify(key, val) {
            const subs = this._subs.get(key);
            if (!subs) return;

            for (const cb of subs) {
                try {
                    cb(val);
                } catch (err) {
                    console.error('Sehawq callback error:', err);
                }
            }
        }
    }

    return Sehawq;
}));
