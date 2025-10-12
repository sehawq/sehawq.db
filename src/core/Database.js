/**
 * SehawqDB - The main database class
 * 
 * Started as a simple JSON store, now with performance optimizations
 * Because waiting for databases to load is boring 😴
 */

const EventEmitter = require('events');
const path = require('path');
const fs = require('fs').promises;

class SehawqDB extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Config with some sensible defaults
    this.config = {
      path: './sehawq-data.json',
      autoSave: true,
      saveInterval: 5000,
      cacheEnabled: true,
      cacheSize: 1000,
      ...options
    };

    // Performance optimizations
    this.data = new Map(); // Using Map for better performance
    this.cache = new Map(); // Hot data cache
    this.indexes = new Map(); // Query indexes
    
    // Runtime stats (for debugging)
    this.stats = {
      reads: 0,
      writes: 0,
      cacheHits: 0,
      cacheMisses: 0
    };

    this._initialized = false;
    this._saveTimeout = null;

    // Initialize - but don't block the constructor
    this._init().catch(error => {
      console.error('🚨 SehawqDB init failed:', error);
    });
  }

  /**
   * Async initialization
   * Because sometimes we need to wait for things...
   */
  async _init() {
    if (this._initialized) return;

    try {
      // Try to load existing data
      await this._loadFromDisk();
      
      // Start auto-save if enabled
      if (this.config.autoSave) {
        this._startAutoSave();
      }

      this._initialized = true;
      this.emit('ready');
      
      if (this.config.debug) {
        console.log('✅ SehawqDB ready - Performance mode: ON');
      }
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Set a value - the bread and butter
   */
  set(key, value) {
    if (!this._initialized) {
      throw new Error('Database not initialized. Wait for ready event.');
    }

    const oldValue = this.data.get(key);
    this.data.set(key, value);
    
    // Cache the hot data
    if (this.config.cacheEnabled) {
      this._updateCache(key, value);
    }

    // Update indexes if any
    this._updateIndexes(key, value, oldValue);

    this.stats.writes++;
    this.emit('set', { key, value, oldValue });

    // Immediate save for important data, otherwise batch it
    if (this.config.autoSave) {
      this._queueSave();
    }

    return this;
  }

  /**
   * Get a value - faster than your morning coffee
   */
  get(key) {
    if (!this._initialized) {
      throw new Error('Database not initialized.');
    }

    this.stats.reads++;

    // Check cache first (hot path)
    if (this.config.cacheEnabled && this.cache.has(key)) {
      this.stats.cacheHits++;
      return this.cache.get(key);
    }

    this.stats.cacheMisses++;
    const value = this.data.get(key);

    // Cache it for next time
    if (this.config.cacheEnabled && value !== undefined) {
      this._updateCache(key, value);
    }

    return value;
  }

  /**
   * Delete a key - poof! gone.
   */
  delete(key) {
    if (!this.data.has(key)) return false;

    const oldValue = this.data.get(key);
    this.data.delete(key);
    this.cache.delete(key);
    this._removeFromIndexes(key, oldValue);

    this.emit('delete', { key, oldValue });
    this._queueSave();

    return true;
  }

  /**
   * Check if key exists - no guessing games
   */
  has(key) {
    return this.data.has(key);
  }

  /**
   * Get all data - use carefully!
   */
  all() {
    return Object.fromEntries(this.data);
  }

  /**
   * Clear everything - the nuclear option
   */
  clear() {
    const size = this.data.size;
    this.data.clear();
    this.cache.clear();
    this.indexes.clear();

    this.emit('clear', { size });
    this._queueSave();

    return this;
  }

  /**
   * Smart cache management
   */
  _updateCache(key, value) {
    // Simple LRU-like cache eviction
    if (this.cache.size >= this.config.cacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, value);
  }

  /**
   * Index management for faster queries
   */
  _updateIndexes(key, newValue, oldValue) {
    // TODO: Implement in IndexManager.js
    // This will make queries lightning fast ⚡
  }

  _removeFromIndexes(key, oldValue) {
    // TODO: Remove from indexes
  }

  /**
   * File operations with error handling
   */
  async _loadFromDisk() {
    try {
      const data = await fs.readFile(this.config.path, 'utf8');
      const parsed = JSON.parse(data);
      
      // Convert object to Map for better performance
      for (const [key, value] of Object.entries(parsed)) {
        this.data.set(key, value);
      }

      if (this.config.debug) {
        console.log(`📁 Loaded ${this.data.size} records from disk`);
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet - that's fine
        if (this.config.debug) {
          console.log('📁 No existing data file - starting fresh');
        }
      } else {
        throw error;
      }
    }
  }

  async _saveToDisk() {
    try {
      const data = JSON.stringify(Object.fromEntries(this.data), null, 2);
      
      // Atomic write - prevent corruption
      const tempPath = this.config.path + '.tmp';
      await fs.writeFile(tempPath, data);
      await fs.rename(tempPath, this.config.path);

      if (this.config.debug) {
        console.log(`💾 Saved ${this.data.size} records to disk`);
      }

      this.emit('save', { recordCount: this.data.size });
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * Batch save operations for performance
   */
  _queueSave() {
    if (this._saveTimeout) clearTimeout(this._saveTimeout);
    
    this._saveTimeout = setTimeout(() => {
      this._saveToDisk();
    }, 100); // Batch saves within 100ms window
  }

  _startAutoSave() {
    setInterval(() => {
      if (this._initialized) {
        this._saveToDisk();
      }
    }, this.config.saveInterval);
  }

  /**
   * Performance monitoring
   */
  getStats() {
    return {
      ...this.stats,
      cacheHitRate: this.stats.reads > 0 
        ? (this.stats.cacheHits / this.stats.reads * 100).toFixed(2) + '%'
        : '0%',
      totalRecords: this.data.size,
      cacheSize: this.cache.size
    };
  }

  /**
   * Clean shutdown - be nice to your data
   */
  async close() {
    if (this._saveTimeout) clearTimeout(this._saveTimeout);
    await this._saveToDisk();
    this._initialized = false;
    this.emit('close');
  }
}

module.exports = SehawqDB;