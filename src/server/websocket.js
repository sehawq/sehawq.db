const { Server } = require('socket.io');

class WebSocketServer {
  constructor(db, httpServer, opts = {}) {
    this.db = db;
    // If no http server provided, we can't start (or we start standalone, but logic here assumes attached)
    if (!httpServer) return;

    this.io = new Server(httpServer, {
      cors: { origin: '*' }
    });

    // Auth Middleware 🔒
    this.io.use((socket, next) => {
      // If no auth plugin loaded, allow all
      if (!this.db.verifyToken) return next();

      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication Error: Token missing'));

      const user = this.db.verifyToken(token);
      if (!user) return next(new Error('Authentication Error: Invalid Token'));

      socket.user = user;
      next();
    });

    this.io.on('connection', socket => {
      if (opts.debug) console.log('Client connected', socket.id);

      socket.on('get', key => {
        socket.emit('value', { key, value: this.db.get(key) });
      });

      socket.on('set', ({ key, value }) => {
        this.db.set(key, value);
        socket.broadcast.emit('update', { key, value });
      });

      socket.on('subscribe', key => {
        socket.join(key);
      });
    });

    // Listen to internal DB events and broadcast
    this._listeners = {
      set: evt => {
        if (this.io) {
          // Standardize on 'update' event
          this.io.emit('update', evt);
        }
      },
      del: evt => {
        if (this.io) this.io.emit('delete', evt);
      }
    };

    this.db.on('set', this._listeners.set);
    this.db.on('delete', this._listeners.del);
  }

  close() {
    if (this.io) {
      // socket.io close can be tricky if engine not ready
      try {
        this.io.close();
      } catch (e) {
        console.warn('Socket close warning:', e.message);
      }
    }

    // Remove listeners to avoid leaks
    if (this._listeners) {
      this.db.removeListener('set', this._listeners.set);
      this.db.removeListener('delete', this._listeners.del);
    }
  }
}

module.exports = WebSocketServer;