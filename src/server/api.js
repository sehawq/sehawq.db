/**
 * API Server - Turns your database into a full REST API 🚀
 * 
 * From zero to API in 5 seconds flat
 * Because setting up Express routes should be easy, not exhausting 😴
 */

const express = require('express');
const cors = require('cors');
const { performance } = require('perf_hooks');

class APIServer {
  constructor(database, options = {}) {
    this.db = database;
    this.options = {
      port: 3000,
      enableCors: true,
      apiKey: null, // Optional API key protection
      rateLimit: 1000, // Requests per minute per IP
      enableLogging: true,
      ...options
    };

    this.app = express();
    this.server = null;
    this.clients = new Map(); // For connection tracking

    // Middleware and routes
    this._setupMiddleware();
    this._setupRoutes();
    this._setupErrorHandling();

    this.stats = {
      requests: 0,
      errors: 0,
      activeConnections: 0,
      totalConnections: 0,
      routes: {}
    };
  }

  /**
   * Setup middleware - the boring but important stuff
   */
  _setupMiddleware() {
    // CORS for cross-origin requests
    if (this.options.enableCors) {
      this.app.use(cors());
    }

    // JSON body parsing
    this.app.use(express.json({ limit: '10mb' }));

    // Request logging
    if (this.options.enableLogging) {
      this.app.use(this._requestLogger.bind(this));
    }

    // API key authentication (optional)
    if (this.options.apiKey) {
      this.app.use(this._apiKeyAuth.bind(this));
    }

    // Rate limiting
    this.app.use(this._rateLimiter.bind(this));
  }

  /**
   * Request logger middleware
   */
  _requestLogger(req, res, next) {
    const startTime = performance.now();
    const clientIp = req.ip || req.connection.remoteAddress;

    // Track connection
    this.stats.activeConnections++;
    this.stats.totalConnections++;

    // Log when response finishes
    res.on('finish', () => {
      const duration = performance.now() - startTime;
      const logMessage = `${new Date().toISOString()} - ${clientIp} - ${req.method} ${req.path} - ${res.statusCode} - ${duration.toFixed(2)}ms`;

      console.log(logMessage);

      // Update stats
      this.stats.activeConnections--;
      this.stats.requests++;

      // Track route statistics
      const routeKey = `${req.method} ${req.path}`;
      this.stats.routes[routeKey] = this.stats.routes[routeKey] || { count: 0, totalTime: 0 };
      this.stats.routes[routeKey].count++;
      this.stats.routes[routeKey].totalTime += duration;
    });

    next();
  }

  /**
   * API key authentication middleware
   */
  _apiKeyAuth(req, res, next) {
    // Skip auth for health check
    if (req.path === '/api/health') return next();

    const apiKey = req.headers['x-api-key'] || req.query.apiKey;

    if (!apiKey) {
      return res.status(401).json({
        error: 'API key required',
        message: 'Provide API key via X-API-Key header or apiKey query parameter'
      });
    }

    if (apiKey !== this.options.apiKey) {
      return res.status(403).json({
        error: 'Invalid API key',
        message: 'The provided API key is not valid'
      });
    }

    next();
  }

  /**
   * Simple rate limiter middleware
   */
  _rateLimiter(req, res, next) {
    const clientIp = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowMs = 60000; // 1 minute

    // Initialize client data if not exists
    if (!this.clients.has(clientIp)) {
      this.clients.set(clientIp, {
        requests: 0,
        firstRequest: now,
        lastRequest: now
      });
    }

    const clientData = this.clients.get(clientIp);

    // Reset counter if window has passed
    if (now - clientData.firstRequest > windowMs) {
      clientData.requests = 0;
      clientData.firstRequest = now;
    }

    // Check rate limit
    if (clientData.requests >= this.options.rateLimit) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Maximum ${this.options.rateLimit} requests per minute allowed`,
        retryAfter: Math.ceil((clientData.firstRequest + windowMs - now) / 1000)
      });
    }

    // Increment counter
    clientData.requests++;
    clientData.lastRequest = now;

    // Clean up old clients (prevent memory leaks)
    this._cleanupOldClients();

    next();
  }

  /**
   * Clean up old client data
   */
  _cleanupOldClients() {
    const now = Date.now();
    const maxAge = 300000; // 5 minutes

    for (const [ip, data] of this.clients.entries()) {
      if (now - data.lastRequest > maxAge) {
        this.clients.delete(ip);
      }
    }
  }

  /**
   * Setup all API routes
   */
  _setupRoutes() {
    // Health check
    this.app.get('/api/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        database: {
          records: this.db.data.size,
          connected: true
        }
      });
    });

    // Get all data
    this.app.get('/api/data', (req, res) => {
      try {
        const data = this.db.all();
        res.json({
          success: true,
          data: data,
          count: Object.keys(data).length
        });
      } catch (error) {
        this._handleError(res, error, 'Failed to retrieve all data');
      }
    });

    // Get specific key
    this.app.get('/api/data/:key', (req, res) => {
      try {
        const value = this.db.get(req.params.key);
        
        if (value === undefined) {
          return res.status(404).json({
            error: 'Key not found',
            message: `Key '${req.params.key}' does not exist`
          });
        }

        res.json({
          success: true,
          data: value
        });
      } catch (error) {
        this._handleError(res, error, 'Failed to retrieve data');
      }
    });

    // Set/update key
    this.app.post('/api/data/:key', (req, res) => {
      try {
        const { value } = req.body;

        if (value === undefined) {
          return res.status(400).json({
            error: 'Missing value',
            message: 'Request body must contain a "value" field'
          });
        }

        this.db.set(req.params.key, value);

        res.json({
          success: true,
          message: 'Data set successfully',
          key: req.params.key
        });
      } catch (error) {
        this._handleError(res, error, 'Failed to set data');
      }
    });

    // Update key (alias for POST)
    this.app.put('/api/data/:key', (req, res) => {
      try {
        const { value } = req.body;

        if (value === undefined) {
          return res.status(400).json({
            error: 'Missing value',
            message: 'Request body must contain a "value" field'
          });
        }

        this.db.set(req.params.key, value);

        res.json({
          success: true,
          message: 'Data updated successfully',
          key: req.params.key
        });
      } catch (error) {
        this._handleError(res, error, 'Failed to update data');
      }
    });

    // Delete key
    this.app.delete('/api/data/:key', (req, res) => {
      try {
        const deleted = this.db.delete(req.params.key);

        if (!deleted) {
          return res.status(404).json({
            error: 'Key not found',
            message: `Key '${req.params.key}' does not exist`
          });
        }

        res.json({
          success: true,
          message: 'Data deleted successfully',
          key: req.params.key
        });
      } catch (error) {
        this._handleError(res, error, 'Failed to delete data');
      }
    });

    // Query data
    this.app.post('/api/query', (req, res) => {
      try {
        const { filter, options } = req.body;

        if (!filter) {
          return res.status(400).json({
            error: 'Missing filter',
            message: 'Request body must contain a "filter" field'
          });
        }

        // Convert string filter to function
        let filterFn;
        if (typeof filter === 'string') {
          // Simple field-based filtering
          const [field, operator, value] = filter.split(' ');
          filterFn = this.db.queryEngine._compileWhereClause(field, operator, JSON.parse(value));
        } else if (typeof filter === 'object') {
          // MongoDB-style query
          filterFn = (item) => {
            for (const [field, condition] of Object.entries(filter)) {
              if (item[field] !== condition) return false;
            }
            return true;
          };
        } else {
          return res.status(400).json({
            error: 'Invalid filter',
            message: 'Filter must be a string or object'
          });
        }

        const results = this.db.queryEngine.find(filterFn, options).toArray();

        res.json({
          success: true,
          data: results,
          count: results.length
        });
      } catch (error) {
        this._handleError(res, error, 'Query failed');
      }
    });

    // Aggregation endpoints
    this.app.get('/api/aggregate/:operation', (req, res) => {
      try {
        const { operation } = req.params;
        const { field, filter } = req.query;

        if (!field) {
          return res.status(400).json({
            error: 'Missing field',
            message: 'Query parameter "field" is required'
          });
        }

        let result;
        const filterFn = filter ? this._parseFilter(filter) : null;

        switch (operation) {
          case 'count':
            result = this.db.queryEngine.count(filterFn);
            break;
          case 'sum':
            result = this.db.queryEngine.sum(field, filterFn);
            break;
          case 'avg':
            result = this.db.queryEngine.avg(field, filterFn);
            break;
          case 'min':
            result = this.db.queryEngine.min(field, filterFn);
            break;
          case 'max':
            result = this.db.queryEngine.max(field, filterFn);
            break;
          default:
            return res.status(400).json({
              error: 'Invalid operation',
              message: `Operation '${operation}' not supported. Use: count, sum, avg, min, max`
            });
        }

        res.json({
          success: true,
          operation,
          field,
          result
        });
      } catch (error) {
        this._handleError(res, error, 'Aggregation failed');
      }
    });

    // Array operations
    this.app.post('/api/array/:key/push', (req, res) => {
      try {
        const { value } = req.body;

        if (value === undefined) {
          return res.status(400).json({
            error: 'Missing value',
            message: 'Request body must contain a "value" field'
          });
        }

        const current = this.db.get(req.params.key) || [];
        
        if (!Array.isArray(current)) {
          return res.status(400).json({
            error: 'Not an array',
            message: `Key '${req.params.key}' does not contain an array`
          });
        }

        current.push(value);
        this.db.set(req.params.key, current);

        res.json({
          success: true,
          message: 'Item pushed to array',
          key: req.params.key,
          newLength: current.length
        });
      } catch (error) {
        this._handleError(res, error, 'Push operation failed');
      }
    });

    this.app.post('/api/array/:key/pull', (req, res) => {
      try {
        const { value } = req.body;

        if (value === undefined) {
          return res.status(400).json({
            error: 'Missing value',
            message: 'Request body must contain a "value" field'
          });
        }

        const current = this.db.get(req.params.key) || [];
        
        if (!Array.isArray(current)) {
          return res.status(400).json({
            error: 'Not an array',
            message: `Key '${req.params.key}' does not contain an array`
          });
        }

        const index = current.indexOf(value);
        if (index > -1) {
          current.splice(index, 1);
          this.db.set(req.params.key, current);
        }

        res.json({
          success: true,
          message: 'Item pulled from array',
          key: req.params.key,
          removed: index > -1,
          newLength: current.length
        });
      } catch (error) {
        this._handleError(res, error, 'Pull operation failed');
      }
    });

    // Math operations
    this.app.post('/api/math/:key/add', (req, res) => {
      try {
        const { value } = req.body;

        if (value === undefined || typeof value !== 'number') {
          return res.status(400).json({
            error: 'Invalid value',
            message: 'Request body must contain a numeric "value" field'
          });
        }

        const current = this.db.get(req.params.key) || 0;
        
        if (typeof current !== 'number') {
          return res.status(400).json({
            error: 'Not a number',
            message: `Key '${req.params.key}' does not contain a number`
          });
        }

        const newValue = current + value;
        this.db.set(req.params.key, newValue);

        res.json({
          success: true,
          message: 'Value added',
          key: req.params.key,
          oldValue: current,
          newValue: newValue
        });
      } catch (error) {
        this._handleError(res, error, 'Add operation failed');
      }
    });

    this.app.post('/api/math/:key/subtract', (req, res) => {
      try {
        const { value } = req.body;

        if (value === undefined || typeof value !== 'number') {
          return res.status(400).json({
            error: 'Invalid value',
            message: 'Request body must contain a numeric "value" field'
          });
        }

        const current = this.db.get(req.params.key) || 0;
        
        if (typeof current !== 'number') {
          return res.status(400).json({
            error: 'Not a number',
            message: `Key '${req.params.key}' does not contain a number`
          });
        }

        const newValue = current - value;
        this.db.set(req.params.key, newValue);

        res.json({
          success: true,
          message: 'Value subtracted',
          key: req.params.key,
          oldValue: current,
          newValue: newValue
        });
      } catch (error) {
        this._handleError(res, error, 'Subtract operation failed');
      }
    });

    // Get server statistics
    this.app.get('/api/stats', (req, res) => {
      try {
        const dbStats = this.db.getStats ? this.db.getStats() : {};
        
        res.json({
          success: true,
          server: this.stats,
          database: dbStats,
          memory: process.memoryUsage()
        });
      } catch (error) {
        this._handleError(res, error, 'Failed to get statistics');
      }
    });
  }

  /**
   * Parse filter string into function
   */
  _parseFilter(filterStr) {
    // Simple parser for query string filters
    // Format: "field operator value"
    const [field, operator, value] = filterStr.split(' ');
    return this.db.queryEngine._compileWhereClause(field, operator, JSON.parse(value));
  }

  /**
   * Setup error handling middleware
   */
  _setupErrorHandling() {
    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        message: `Route ${req.method} ${req.originalUrl} does not exist`,
        availableEndpoints: this._getAvailableEndpoints()
      });
    });

    // Global error handler
    this.app.use((error, req, res, next) => {
      this.stats.errors++;
      
      console.error('🚨 API Error:', error);

      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      });
    });
  }

  /**
   * Handle API errors consistently
   */
  _handleError(res, error, defaultMessage) {
    this.stats.errors++;

    console.error('🚨 API Operation Failed:', error);

    res.status(500).json({
      error: 'Operation failed',
      message: defaultMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }

  /**
   * Get list of available endpoints
   */
  _getAvailableEndpoints() {
    return [
      'GET    /api/health',
      'GET    /api/data',
      'GET    /api/data/:key', 
      'POST   /api/data/:key',
      'PUT    /api/data/:key',
      'DELETE /api/data/:key',
      'POST   /api/query',
      'GET    /api/aggregate/:operation',
      'POST   /api/array/:key/push',
      'POST   /api/array/:key/pull',
      'POST   /api/math/:key/add',
      'POST   /api/math/:key/subtract',
      'GET    /api/stats'
    ];
  }

  /**
   * Start the API server
   */
  async start() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.options.port, (error) => {
        if (error) {
          reject(error);
          return;
        }

        console.log(`🚀 SehawqDB API server running on port ${this.options.port}`);
        console.log(`📚 API Documentation: http://localhost:${this.options.port}/api/health`);
        
        if (this.options.apiKey) {
          console.log(`🔐 API Key protection: ENABLED`);
        }

        resolve();
      });
    });
  }

  /**
   * Stop the API server
   */
  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('🛑 API server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get server statistics
   */
  getStats() {
    return {
      ...this.stats,
      uptime: process.uptime(),
      port: this.options.port,
      apiKeyEnabled: !!this.options.apiKey,
      activeClients: this.clients.size
    };
  }
}

module.exports = APIServer;