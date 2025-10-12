/**
 * Smart Cache System - Makes everything faster with magic 🪄
 * 
 * Implements LRU cache with TTL and memory management
 * Because waiting is not an option in 2024 ⚡
 */

class Cache {
  constructor(options = {}) {
    this.options = {
      maxSize: 1000,
      ttl: 5 * 60 * 1000, // 5 minutes default
      cleanupInterval: 60 * 1000, // Clean every minute
      ...options
    };

    // Double-linked list for LRU + HashMap for O(1) access
    this.cache = new Map();
    this.head = { key: null, value: null, next: null, prev: null, expires: 0 };
    this.tail = { key: null, value: null, next: null, prev: this.head, expires: 0 };
    this.head.next = this.tail;
    
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      sets: 0,
      gets: 0,
      memoryUsage: 0
    };

    this._startCleanupInterval();
  }

  /**
   * Get value from cache - moves item to front (most recently used)
   */
  get(key) {
    this.stats.gets++;

    const node = this.cache.get(key);
    
    // Check if exists and not expired
    if (!node || this._isExpired(node)) {
      this.stats.misses++;
      
      if (node) {
        // Remove expired node
        this._removeNode(node);
        this.cache.delete(key);
        this.stats.evictions++;
      }
      
      return undefined;
    }

    // Move to front (most recently used)
    this._moveToFront(node);
    this.stats.hits++;

    return node.value;
  }

  /**
   * Set value in cache - handles LRU eviction if needed
   */
  set(key, value, ttl = this.options.ttl) {
    this.stats.sets++;

    let node = this.cache.get(key);
    const expires = Date.now() + ttl;

    if (node) {
      // Update existing node
      node.value = value;
      node.expires = expires;
      this._moveToFront(node);
    } else {
      // Create new node
      node = {
        key,
        value,
        expires,
        prev: this.head,
        next: this.head.next
      };

      // Add to cache and linked list
      this.cache.set(key, node);
      this.head.next.prev = node;
      this.head.next = node;

      // Evict if over capacity
      if (this.cache.size > this.options.maxSize) {
        this._evictLRU();
      }
    }

    // Update memory usage stats
    this._updateMemoryStats();

    return true;
  }

  /**
   * Check if key exists in cache (without updating LRU)
   */
  has(key) {
    const node = this.cache.get(key);
    return !!(node && !this._isExpired(node));
  }

  /**
   * Delete key from cache
   */
  delete(key) {
    const node = this.cache.get(key);
    if (node) {
      this._removeNode(node);
      this.cache.delete(key);
      return true;
    }
    return false;
  }

  /**
   * Clear entire cache
   */
  clear() {
    this.cache.clear();
    this.head.next = this.tail;
    this.tail.prev = this.head;
    this.stats.memoryUsage = 0;
  }

  /**
   * Get cache size (number of items)
   */
  size() {
    return this.cache.size;
  }

  /**
   * Get all keys in cache (for debugging)
   */
  keys() {
    const keys = [];
    let node = this.head.next;
    
    while (node !== this.tail) {
      if (!this._isExpired(node)) {
        keys.push(node.key);
      }
      node = node.next;
    }
    
    return keys;
  }

  /**
   * Get all values in cache (for debugging)
   */
  values() {
    const values = [];
    let node = this.head.next;
    
    while (node !== this.tail) {
      if (!this._isExpired(node)) {
        values.push(node.value);
      }
      node = node.next;
    }
    
    return values;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0 
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
      : 0;

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      size: this.cache.size,
      maxSize: this.options.maxSize,
      utilization: `${((this.cache.size / this.options.maxSize) * 100).toFixed(1)}%`
    };
  }

  /**
   * Move node to front of LRU list
   */
  _moveToFront(node) {
    // Remove from current position
    this._removeNode(node);
    
    // Insert after head
    node.prev = this.head;
    node.next = this.head.next;
    this.head.next.prev = node;
    this.head.next = node;
  }

  /**
   * Remove node from linked list
   */
  _removeNode(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
  }

  /**
   * Evict least recently used item
   */
  _evictLRU() {
    const lruNode = this.tail.prev;
    
    if (lruNode !== this.head) {
      this._removeNode(lruNode);
      this.cache.delete(lruNode.key);
      this.stats.evictions++;
      this._updateMemoryStats();
    }
  }

  /**
   * Check if node has expired
   */
  _isExpired(node) {
    return Date.now() > node.expires;
  }

  /**
   * Start periodic cleanup of expired items
   */
  _startCleanupInterval() {
    setInterval(() => {
      this._cleanupExpired();
    }, this.options.cleanupInterval);
  }

  /**
   * Remove all expired items from cache
   */
  _cleanupExpired() {
    const now = Date.now();
    let node = this.head.next;
    let expiredCount = 0;

    while (node !== this.tail) {
      const nextNode = node.next;
      
      if (now > node.expires) {
        this._removeNode(node);
        this.cache.delete(node.key);
        expiredCount++;
      }
      
      node = nextNode;
    }

    if (expiredCount > 0 && this.options.debug) {
      console.log(`🧹 Cache cleanup: removed ${expiredCount} expired items`);
    }

    this._updateMemoryStats();
  }

  /**
   * Estimate memory usage (rough calculation)
   */
  _updateMemoryStats() {
    let totalSize = 0;
    
    for (const [key, node] of this.cache) {
      // Rough estimation: key size + value size (stringify for simplicity)
      totalSize += Buffer.byteLength(key, 'utf8');
      totalSize += Buffer.byteLength(JSON.stringify(node.value), 'utf8');
    }
    
    this.stats.memoryUsage = totalSize;
  }

  /**
   * Pre-warm cache with data
   */
  async warmup(dataMap, ttl = this.options.ttl) {
    for (const [key, value] of Object.entries(dataMap)) {
      this.set(key, value, ttl);
    }
    
    if (this.options.debug) {
      console.log(`🔥 Cache warmup complete: ${Object.keys(dataMap).length} items`);
    }
  }

  /**
   * Get cache snapshot for debugging
   */
  getSnapshot() {
    const snapshot = {};
    let node = this.head.next;
    
    while (node !== this.tail) {
      if (!this._isExpired(node)) {
        snapshot[node.key] = {
          value: node.value,
          expiresIn: node.expires - Date.now(),
          ttl: this.options.ttl
        };
      }
      node = node.next;
    }
    
    return snapshot;
  }

  /**
   * Resize cache (useful for dynamic memory management)
   */
  resize(newSize) {
    this.options.maxSize = newSize;
    
    // Evict excess items if needed
    while (this.cache.size > newSize) {
      this._evictLRU();
    }
    
    if (this.options.debug) {
      console.log(`📏 Cache resized: ${newSize} items`);
    }
  }
}

module.exports = Cache;