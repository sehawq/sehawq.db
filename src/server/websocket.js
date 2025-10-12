/**
 * WebSocket Server - Real-time magic for your database ✨
 * 
 * Watch data change in real-time across multiple clients
 * Because polling is so last decade 😎
 */

const { Server } = require('socket.io');
const { performance } = require('perf_hooks');

class WebSocketServer {
  constructor(server, database, options = {}) {
    this.db = database;
    this.options = {
      corsOrigin: '*',
      enableStats: true,
      maxClients: 100,
      heartbeatInterval: 30000,
      ...options
    };

    // Initialize Socket.IO
    this.io = new Server(server, {
      cors: {
        origin: this.options.corsOrigin,
        methods: ['GET', 'POST']
      }
    });

    this.clients = new Map(); // socket.id -> client info
    this.rooms = new Map(); // room -> Set of socket ids

    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      messagesSent: 0,
      messagesReceived: 0,
      errors: 0,
      rooms: 0
    };

    this._setupEventHandlers();
    this._startHeartbeat();

    console.log('🔌 WebSocket server initialized - Real-time sync ready');
  }

  /**
   * Setup Socket.IO event handlers
   */
  _setupEventHandlers() {
    this.io.on('connection', (socket) => {
      this._handleConnection(socket);
    });

    // Listen to database events for real-time updates
    this._setupDatabaseEventListeners();
  }

  /**
   * Handle new client connection
   */
  _handleConnection(socket) {
    const clientInfo = {
      id: socket.id,
      ip: socket.handshake.address,
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      rooms: new Set()
    };

    this.clients.set(socket.id, clientInfo);
    this.stats.totalConnections++;
    this.stats.activeConnections++;

    console.log(`🔗 Client connected: ${socket.id} from ${clientInfo.ip}`);

    // Send initial data snapshot
    this._sendInitialData(socket);

    // Setup client event handlers
    this._setupClientHandlers(socket);

    // Emit connection event
    this.db.emit('client:connected', { socketId: socket.id, ip: clientInfo.ip });
  }

  /**
   * Send initial data to newly connected client
   */
  _sendInitialData(socket) {
    try {
      const data = this.db.all();
      socket.emit('data:init', {
        type: 'init',
        data: data,
        timestamp: Date.now()
      });

      if (this.options.debug) {
        console.log(`📤 Sent initial data to ${socket.id} (${Object.keys(data).length} records)`);
      }
    } catch (error) {
      console.error('🚨 Failed to send initial data:', error);
      socket.emit('error', {
        type: 'init_failed',
        message: 'Failed to load initial data'
      });
    }
  }

  /**
   * Setup event handlers for a client socket
   */
  _setupClientHandlers(socket) {
    // Join room
    socket.on('join:room', (room) => {
      this._handleJoinRoom(socket, room);
    });

    // Leave room
    socket.on('leave:room', (room) => {
      this._handleLeaveRoom(socket, room);
    });

    // Subscribe to key changes
    socket.on('subscribe:key', (key) => {
      this._handleSubscribeKey(socket, key);
    });

    // Unsubscribe from key
    socket.on('unsubscribe:key', (key) => {
      this._handleUnsubscribeKey(socket, key);
    });

    // Custom message
    socket.on('message', (data) => {
      this._handleCustomMessage(socket, data);
    });

    // Ping from client
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Disconnect
    socket.on('disconnect', (reason) => {
      this._handleDisconnect(socket, reason);
    });

    // Error handling
    socket.on('error', (error) => {
      this._handleClientError(socket, error);
    });
  }

  /**
   * Setup database event listeners for real-time updates
   */
  _setupDatabaseEventListeners() {
    // Database set operation
    this.db.on('set', ({ key, value, oldValue }) => {
      this._broadcastDataChange('set', key, value, oldValue);
    });

    // Database delete operation
    this.db.on('delete', ({ key, oldValue }) => {
      this._broadcastDataChange('delete', key, null, oldValue);
    });

    // Database clear operation
    this.db.on('clear', ({ size }) => {
      this._broadcastToAll('data:changed', {
        action: 'clear',
        timestamp: Date.now(),
        affectedRecords: size
      });
    });

    // Array push operation
    this.db.on('push', ({ key, value }) => {
      this._broadcastDataChange('push', key, value);
    });

    // Array pull operation
    this.db.on('pull', ({ key, value }) => {
      this._broadcastDataChange('pull', key, value);
    });

    // Math operations
    this.db.on('add', ({ key, number }) => {
      this._broadcastDataChange('add', key, number);
    });

    // Backup events
    this.db.on('backup', ({ backupPath }) => {
      this._broadcastToAll('system:backup', {
        action: 'backup',
        path: backupPath,
        timestamp: Date.now()
      });
    });
  }

  /**
   * Broadcast data change to all interested clients
   */
  _broadcastDataChange(action, key, value, oldValue = null) {
    const changeEvent = {
      action,
      key,
      value,
      oldValue,
      timestamp: Date.now()
    };

    // Broadcast to all clients in the key-specific room
    this._broadcastToRoom(`key:${key}`, 'data:changed', changeEvent);

    // Also broadcast to general data room
    this._broadcastToRoom('data', 'data:changed', changeEvent);

    // Update stats
    this.stats.messagesSent += this._getRoomSize(`key:${key}`) + this._getRoomSize('data');

    if (this.options.debug) {
      console.log(`📢 Broadcast ${action} on ${key} to ${this._getRoomSize(`key:${key}`)} clients`);
    }
  }

  /**
   * Handle client joining a room
   */
  _handleJoinRoom(socket, room) {
    if (!room || typeof room !== 'string') {
      socket.emit('error', { message: 'Invalid room name' });
      return;
    }

    socket.join(room);
    
    const client = this.clients.get(socket.id);
    if (client) {
      client.rooms.add(room);
      client.lastActivity = Date.now();
    }

    // Initialize room tracking
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
      this.stats.rooms++;
    }
    this.rooms.get(room).add(socket.id);

    socket.emit('room:joined', { room });
    
    if (this.options.debug) {
      console.log(`🚪 Client ${socket.id} joined room: ${room}`);
    }
  }

  /**
   * Handle client leaving a room
   */
  _handleLeaveRoom(socket, room) {
    socket.leave(room);
    
    const client = this.clients.get(socket.id);
    if (client) {
      client.rooms.delete(room);
      client.lastActivity = Date.now();
    }

    // Update room tracking
    if (this.rooms.has(room)) {
      this.rooms.get(room).delete(socket.id);
      
      // Clean up empty rooms
      if (this.rooms.get(room).size === 0) {
        this.rooms.delete(room);
        this.stats.rooms--;
      }
    }

    socket.emit('room:left', { room });
    
    if (this.options.debug) {
      console.log(`🚪 Client ${socket.id} left room: ${room}`);
    }
  }

  /**
   * Handle client subscribing to a key
   */
  _handleSubscribeKey(socket, key) {
    if (!key || typeof key !== 'string') {
      socket.emit('error', { message: 'Invalid key for subscription' });
      return;
    }

    const room = `key:${key}`;
    this._handleJoinRoom(socket, room);

    // Send current value immediately
    const currentValue = this.db.get(key);
    socket.emit('subscription:update', {
      key,
      value: currentValue,
      timestamp: Date.now()
    });

    if (this.options.debug) {
      console.log(`📡 Client ${socket.id} subscribed to key: ${key}`);
    }
  }

  /**
   * Handle client unsubscribing from a key
   */
  _handleUnsubscribeKey(socket, key) {
    const room = `key:${key}`;
    this._handleLeaveRoom(socket, room);

    if (this.options.debug) {
      console.log(`📡 Client ${socket.id} unsubscribed from key: ${key}`);
    }
  }

  /**
   * Handle custom messages from clients
   */
  _handleCustomMessage(socket, data) {
    this.stats.messagesReceived++;

    const client = this.clients.get(socket.id);
    if (client) {
      client.lastActivity = Date.now();
    }

    // Echo back for testing
    if (data.echo) {
      socket.emit('message', {
        ...data,
        echoed: true,
        timestamp: Date.now()
      });
    }

    // Broadcast to room if specified
    if (data.room && data.message) {
      this._broadcastToRoom(data.room, 'message', {
        from: socket.id,
        message: data.message,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle client disconnect
   */
  _handleDisconnect(socket, reason) {
    const client = this.clients.get(socket.id);
    
    if (client) {
      // Leave all rooms
      for (const room of client.rooms) {
        this._handleLeaveRoom(socket, room);
      }

      this.clients.delete(socket.id);
      this.stats.activeConnections--;

      console.log(`🔌 Client disconnected: ${socket.id} (${reason})`);

      // Emit disconnect event
      this.db.emit('client:disconnected', { 
        socketId: socket.id, 
        reason: reason,
        duration: Date.now() - client.connectedAt
      });
    }
  }

  /**
   * Handle client errors
   */
  _handleClientError(socket, error) {
    this.stats.errors++;
    
    console.error(`🚨 WebSocket client error (${socket.id}):`, error);

    socket.emit('error', {
      type: 'client_error',
      message: 'An error occurred'
    });
  }

  /**
   * Broadcast to all clients in a room
   */
  _broadcastToRoom(room, event, data) {
    this.io.to(room).emit(event, data);
  }

  /**
   * Broadcast to all connected clients
   */
  _broadcastToAll(event, data) {
    this.io.emit(event, data);
  }

  /**
   * Get number of clients in a room
   */
  _getRoomSize(room) {
    const roomSockets = this.io.sockets.adapter.rooms.get(room);
    return roomSockets ? roomSockets.size : 0;
  }

  /**
   * Start heartbeat to detect dead connections
   */
  _startHeartbeat() {
    setInterval(() => {
      this._checkHeartbeats();
    }, this.options.heartbeatInterval);
  }

  /**
   * Check client heartbeats and clean up dead connections
   */
  _checkHeartbeats() {
    const now = Date.now();
    const maxInactiveTime = this.options.heartbeatInterval * 3; // 3x interval

    for (const [socketId, client] of this.clients.entries()) {
      if (now - client.lastActivity > maxInactiveTime) {
        console.log(`💀 Disconnecting inactive client: ${socketId}`);
        
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.disconnect(true);
        }
      }
    }
  }

  /**
   * Get WebSocket server statistics
   */
  getStats() {
    const now = Date.now();
    const activeClients = Array.from(this.clients.values()).map(client => ({
      id: client.id,
      ip: client.ip,
      connectedAt: client.connectedAt,
      lastActivity: client.lastActivity,
      uptime: now - client.connectedAt,
      inactiveTime: now - client.lastActivity,
      rooms: Array.from(client.rooms)
    }));

    return {
      ...this.stats,
      activeClients: activeClients,
      rooms: Array.from(this.rooms.entries()).map(([room, clients]) => ({
        room,
        clientCount: clients.size,
        clients: Array.from(clients)
      })),
      uptime: process.uptime()
    };
  }

  /**
   * Send message to specific client
   */
  sendToClient(socketId, event, data) {
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit(event, data);
      return true;
    }
    return false;
  }

  /**
   * Disconnect specific client
   */
  disconnectClient(socketId, reason = 'admin_disconnect') {
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.disconnect(true);
      console.log(`🔌 Admin disconnected client: ${socketId} (${reason})`);
      return true;
    }
    return false;
  }

  /**
   * Get client information
   */
  getClientInfo(socketId) {
    return this.clients.get(socketId);
  }

  /**
   * Close WebSocket server
   */
  close() {
    // Disconnect all clients gracefully
    this._broadcastToAll('system:shutdown', {
      message: 'Server is shutting down',
      timestamp: Date.now()
    });

    // Disconnect all clients after short delay
    setTimeout(() => {
      this.io.disconnectSockets(true);
      this.io.close();
    }, 1000);

    console.log('🛑 WebSocket server closed');
  }
}

module.exports = WebSocketServer;