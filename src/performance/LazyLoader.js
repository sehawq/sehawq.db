/**
 * LazyLoader - Loads data only when needed, saves memory like a boss 💾
 * 
 * Why load everything when you only need some things?
 * This made our memory usage drop faster than my grades in college 😅
 */

class LazyLoader {
  constructor(storage, options = {}) {
    this.storage = storage;
    this.options = {
      chunkSize: 100, // Items per chunk
      prefetch: true, // Load next chunk in background
      maxLoadedChunks: 5, // Keep this many chunks in memory
      autoUnload: true, // Unload old chunks automatically
      ...options
    };

    // Chunk management
    this.chunks = new Map(); // chunkIndex -> data
    this.chunkIndex = new Map(); // key -> chunkIndex
    this.accessHistory = []; // LRU for chunks
    this.loadedChunksCount = 0;

    // Performance tracking
    this.stats = {
      chunksLoaded: 0,
      chunksUnloaded: 0,
      keysLoaded: 0,
      memorySaved: 0,
      cacheHits: 0,
      cacheMisses: 0,
      prefetchHits: 0
    };

    this._initialized = false;
  }

  /**
   * Initialize the lazy loader - build chunk index
   */
  async initialize(allKeys) {
    if (this._initialized) return;

    // Build chunk index from all keys
    let chunkIndex = 0;
    let currentChunkSize = 0;

    for (const key of allKeys) {
      this.chunkIndex.set(key, chunkIndex);
      currentChunkSize++;

      if (currentChunkSize >= this.options.chunkSize) {
        chunkIndex++;
        currentChunkSize = 0;
      }
    }

    this.totalChunks = chunkIndex + 1;
    this._initialized = true;

    if (this.options.debug) {
      console.log(`📊 LazyLoader: ${allKeys.length} keys in ${this.totalChunks} chunks`);
    }
  }

  /**
   * Get value by key - loads chunk if needed
   */
  async get(key) {
    if (!this._initialized) {
      throw new Error('LazyLoader not initialized. Call initialize() first.');
    }

    const chunkIndex = this.chunkIndex.get(key);
    
    if (chunkIndex === undefined) {
      this.stats.cacheMisses++;
      return undefined; // Key not found
    }

    // Check if chunk is already loaded
    if (this.chunks.has(chunkIndex)) {
      this.stats.cacheHits++;
      this._updateAccessHistory(chunkIndex);
      return this.chunks.get(chunkIndex).get(key);
    }

    this.stats.cacheMisses++;

    // Load the chunk
    await this._loadChunk(chunkIndex);
    
    // Prefetch adjacent chunks in background
    if (this.options.prefetch) {
      this._prefetchAdjacentChunks(chunkIndex);
    }

    const chunk = this.chunks.get(chunkIndex);
    return chunk ? chunk.get(key) : undefined;
  }

  /**
   * Set value - updates chunk if loaded, or defers to storage
   */
  async set(key, value) {
    const chunkIndex = this.chunkIndex.get(key);
    
    if (chunkIndex !== undefined && this.chunks.has(chunkIndex)) {
      // Update in loaded chunk
      this.chunks.get(chunkIndex).set(key, value);
      this._updateAccessHistory(chunkIndex);
    }
    
    // Always update in storage
    await this.storage.set(key, value);
  }

  /**
   * Check if key exists (without loading chunk)
   */
  has(key) {
    return this.chunkIndex.has(key);
  }

  /**
   * Get all keys (without loading data)
   */
  getAllKeys() {
    return Array.from(this.chunkIndex.keys());
  }

  /**
   * Load a specific chunk into memory
   */
  async _loadChunk(chunkIndex) {
    // Unload least recently used chunks if we're at the limit
    if (this.loadedChunksCount >= this.options.maxLoadedChunks) {
      await this._unloadLRUChunk();
    }

    // Get all keys in this chunk
    const chunkKeys = [];
    for (const [key, index] of this.chunkIndex) {
      if (index === chunkIndex) {
        chunkKeys.push(key);
      }
    }

    // Load data for these keys
    const chunkData = new Map();
    for (const key of chunkKeys) {
      const value = await this.storage.get(key);
      if (value !== undefined) {
        chunkData.set(key, value);
      }
    }

    // Store the chunk
    this.chunks.set(chunkIndex, chunkData);
    this._updateAccessHistory(chunkIndex);
    this.loadedChunksCount++;
    this.stats.chunksLoaded++;
    this.stats.keysLoaded += chunkData.size;

    if (this.options.debug) {
      console.log(`📁 Loaded chunk ${chunkIndex} with ${chunkData.size} items`);
    }

    return chunkData;
  }

  /**
   * Unload least recently used chunk
   */
  async _unloadLRUChunk() {
    if (this.accessHistory.length === 0) return;

    const lruChunkIndex = this.accessHistory[0];
    await this._unloadChunk(lruChunkIndex);
  }

  /**
   * Unload specific chunk
   */
  async _unloadChunk(chunkIndex) {
    const chunk = this.chunks.get(chunkIndex);
    if (!chunk) return;

    // Calculate memory saved (rough estimate)
    let chunkSize = 0;
    for (const [key, value] of chunk) {
      chunkSize += this._estimateSize(key) + this._estimateSize(value);
    }

    this.chunks.delete(chunkIndex);
    this.accessHistory = this.accessHistory.filter(idx => idx !== chunkIndex);
    this.loadedChunksCount--;
    this.stats.chunksUnloaded++;
    this.stats.memorySaved += chunkSize;

    if (this.options.debug) {
      console.log(`🗑️  Unloaded chunk ${chunkIndex} (saved ~${chunkSize} bytes)`);
    }
  }

  /**
   * Prefetch chunks around the currently loaded one
   */
  _prefetchAdjacentChunks(currentChunkIndex) {
    const prefetchIndices = [
      currentChunkIndex + 1, // Next chunk
      currentChunkIndex - 1  // Previous chunk
    ].filter(index => index >= 0 && index < this.totalChunks && !this.chunks.has(index));

    // Prefetch in background (don't await)
    for (const index of prefetchIndices) {
      this._loadChunk(index).then(() => {
        this.stats.prefetchHits++;
      }).catch(error => {
        console.error(`Prefetch failed for chunk ${index}:`, error);
      });
    }
  }

  /**
   * Update access history for LRU tracking
   */
  _updateAccessHistory(chunkIndex) {
    // Remove existing entry
    this.accessHistory = this.accessHistory.filter(idx => idx !== chunkIndex);
    // Add to end (most recently used)
    this.accessHistory.push(chunkIndex);
  }

  /**
   * Estimate size of an object in bytes
   */
  _estimateSize(obj) {
    if (obj === null || obj === undefined) return 0;
    
    switch (typeof obj) {
      case 'string':
        return obj.length * 2; // 2 bytes per character
      case 'number':
        return 8; // 8 bytes for number
      case 'boolean':
        return 4; // 4 bytes for boolean
      case 'object':
        if (Array.isArray(obj)) {
          return obj.reduce((size, item) => size + this._estimateSize(item), 0);
        } else {
          let size = 0;
          for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
              size += this._estimateSize(key) + this._estimateSize(obj[key]);
            }
          }
          return size;
        }
      default:
        return 0;
    }
  }

  /**
   * Manually load a chunk (for eager loading)
   */
  async loadChunk(chunkIndex) {
    return await this._loadChunk(chunkIndex);
  }

  /**
   * Manually unload a chunk
   */
  async unloadChunk(chunkIndex) {
    return await this._unloadChunk(chunkIndex);
  }

  /**
   * Get currently loaded chunks
   */
  getLoadedChunks() {
    return Array.from(this.chunks.keys());
  }

  /**
   * Get chunk information for a key
   */
  getChunkInfo(key) {
    const chunkIndex = this.chunkIndex.get(key);
    if (chunkIndex === undefined) return null;

    const isLoaded = this.chunks.has(chunkIndex);
    const keysInChunk = Array.from(this.chunkIndex.entries())
      .filter(([k, idx]) => idx === chunkIndex)
      .map(([k]) => k);

    return {
      chunkIndex,
      isLoaded,
      keysInChunk,
      loadedChunks: this.loadedChunksCount,
      totalChunks: this.totalChunks
    };
  }

  /**
   * Get performance statistics
   */
  getStats() {
    const totalAccesses = this.stats.cacheHits + this.stats.cacheMisses;
    const hitRate = totalAccesses > 0 
      ? (this.stats.cacheHits / totalAccesses * 100).toFixed(2)
      : 0;

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      loadedChunks: this.loadedChunksCount,
      totalChunks: this.totalChunks,
      memorySaved: `${(this.stats.memorySaved / 1024 / 1024).toFixed(2)} MB`,
      prefetchEffectiveness: this.stats.prefetchHits > 0 
        ? `${((this.stats.prefetchHits / this.stats.chunksLoaded) * 100).toFixed(1)}%`
        : '0%'
    };
  }

  /**
   * Clear all loaded chunks
   */
  clear() {
    this.chunks.clear();
    this.accessHistory = [];
    this.loadedChunksCount = 0;
    
    if (this.options.debug) {
      console.log('🧹 Cleared all loaded chunks');
    }
  }

  /**
   * Preload specific chunks (for startup optimization)
   */
  async preloadChunks(chunkIndices) {
    const loadPromises = chunkIndices.map(index => this._loadChunk(index));
    await Promise.all(loadPromises);
    
    if (this.options.debug) {
      console.log(`🔥 Preloaded ${chunkIndices.length} chunks`);
    }
  }
}

module.exports = LazyLoader;