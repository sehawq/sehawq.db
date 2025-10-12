/**
 * IndexManager - Makes queries lightning fast ⚡
 * 
 * From O(n) to O(1) with the magic of indexing
 * Because scanning millions of records should be illegal 😅
 */

class IndexManager {
  constructor(database, options = {}) {
    this.db = database;
    this.options = {
      autoIndex: true,
      backgroundIndexing: true,
      maxIndexes: 10,
      indexUpdateBatchSize: 1000,
      ...options
    };

    // Index storage
    this.indexes = new Map(); // indexName -> Index instance
    this.fieldIndexes = new Map(); // fieldName -> Set of indexNames
    
    // Performance tracking
    this.stats = {
      indexesCreated: 0,
      indexesDropped: 0,
      queriesWithIndex: 0,
      queriesWithoutIndex: 0,
      indexUpdates: 0,
      backgroundJobs: 0
    };

    // Background indexing queue
    this.indexQueue = [];
    this.isProcessingQueue = false;

    console.log('📊 IndexManager initialized - Ready to speed things up!');
  }

  /**
   * Create a new index on a field
   */
  async createIndex(fieldName, indexType = 'hash', options = {}) {
    if (this.indexes.size >= this.options.maxIndexes) {
      throw new Error(`Maximum index limit (${this.options.maxIndexes}) reached`);
    }

    const indexName = this._getIndexName(fieldName, indexType);
    
    if (this.indexes.has(indexName)) {
      throw new Error(`Index '${indexName}' already exists`);
    }

    console.log(`🔄 Creating ${indexType} index on field: ${fieldName}`);

    let index;
    switch (indexType) {
      case 'hash':
        index = new HashIndex(fieldName, options);
        break;
      case 'range':
        index = new RangeIndex(fieldName, options);
        break;
      case 'text':
        index = new TextIndex(fieldName, options);
        break;
      default:
        throw new Error(`Unsupported index type: ${indexType}`);
    }

    // Build the index
    await this._buildIndex(index, fieldName);

    // Store the index
    this.indexes.set(indexName, index);
    
    // Track field indexes
    if (!this.fieldIndexes.has(fieldName)) {
      this.fieldIndexes.set(fieldName, new Set());
    }
    this.fieldIndexes.get(fieldName).add(indexName);

    this.stats.indexesCreated++;

    console.log(`✅ Index created: ${indexName} (${index.getStats().entries} entries)`);

    return indexName;
  }

  /**
   * Build index from existing data
   */
  async _buildIndex(index, fieldName) {
    const startTime = Date.now();
    let entries = 0;

    // Process in batches for large datasets
    const batchSize = this.options.indexUpdateBatchSize;
    const keys = Array.from(this.db.data.keys());
    
    for (let i = 0; i < keys.length; i += batchSize) {
      const batchKeys = keys.slice(i, i + batchSize);
      
      for (const key of batchKeys) {
        const value = this.db.data.get(key);
        const fieldValue = this._getFieldValue(value, fieldName);
        
        if (fieldValue !== undefined) {
          index.add(fieldValue, key);
          entries++;
        }
      }

      // Yield to event loop for large datasets
      if (this.options.backgroundIndexing) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    const buildTime = Date.now() - startTime;
    console.log(`🔨 Built index in ${buildTime}ms: ${entries} entries`);

    return entries;
  }

  /**
   * Drop an index
   */
  dropIndex(indexName) {
    if (!this.indexes.has(indexName)) {
      throw new Error(`Index '${indexName}' does not exist`);
    }

    const index = this.indexes.get(indexName);
    const fieldName = index.fieldName;

    // Remove from indexes
    this.indexes.delete(indexName);
    
    // Remove from field indexes tracking
    if (this.fieldIndexes.has(fieldName)) {
      this.fieldIndexes.get(fieldName).delete(indexName);
      if (this.fieldIndexes.get(fieldName).size === 0) {
        this.fieldIndexes.delete(fieldName);
      }
    }

    this.stats.indexesDropped++;

    console.log(`🗑️  Dropped index: ${indexName}`);
  }

  /**
   * Get all indexes
   */
  getIndexes() {
    const result = {};
    
    for (const [name, index] of this.indexes) {
      result[name] = index.getStats();
    }
    
    return result;
  }

  /**
   * Check if a field has indexes
   */
  hasIndex(fieldName) {
    return this.fieldIndexes.has(fieldName) && this.fieldIndexes.get(fieldName).size > 0;
  }

  /**
   * Find records using indexes
   */
  find(fieldName, operator, value) {
    const indexes = this.fieldIndexes.get(fieldName);
    
    if (!indexes || indexes.size === 0) {
      this.stats.queriesWithoutIndex++;
      return null; // No index available
    }

    // Try to use the most appropriate index
    for (const indexName of indexes) {
      const index = this.indexes.get(indexName);
      
      if (index.supportsOperator(operator)) {
        const results = index.find(operator, value);
        
        if (results !== null) {
          this.stats.queriesWithIndex++;
          
          if (this.options.debug) {
            console.log(`⚡ Used index ${indexName} for ${fieldName} ${operator} ${value}`);
          }
          
          return results;
        }
      }
    }

    this.stats.queriesWithoutIndex++;
    return null;
  }

  /**
   * Update index when data changes
   */
  updateIndex(key, newValue, oldValue = null) {
    this.stats.indexUpdates++;

    // Queue the update for background processing
    this.indexQueue.push({ key, newValue, oldValue });
    
    if (!this.isProcessingQueue && this.options.backgroundIndexing) {
      this._processIndexQueue();
    }
  }

  /**
   * Process index update queue in background
   */
  async _processIndexQueue() {
    if (this.isProcessingQueue || this.indexQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    this.stats.backgroundJobs++;

    while (this.indexQueue.length > 0) {
      const update = this.indexQueue.shift();
      
      try {
        await this._processSingleUpdate(update);
      } catch (error) {
        console.error('🚨 Index update failed:', error);
      }

      // Yield to event loop every 100 updates
      if (this.indexQueue.length % 100 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Process single index update
   */
  async _processSingleUpdate(update) {
    const { key, newValue, oldValue } = update;

    for (const [indexName, index] of this.indexes) {
      const fieldName = index.fieldName;
      
      const oldFieldValue = oldValue ? this._getFieldValue(oldValue, fieldName) : undefined;
      const newFieldValue = newValue ? this._getFieldValue(newValue, fieldName) : undefined;

      // Remove old value from index
      if (oldFieldValue !== undefined) {
        index.remove(oldFieldValue, key);
      }

      // Add new value to index
      if (newFieldValue !== undefined) {
        index.add(newFieldValue, key);
      }
    }
  }

  /**
   * Get nested field value using dot notation
   */
  _getFieldValue(obj, fieldPath) {
    if (!fieldPath.includes('.')) {
      return obj[fieldPath];
    }

    const parts = fieldPath.split('.');
    let value = obj;
    
    for (const part of parts) {
      value = value?.[part];
      if (value === undefined) break;
    }
    
    return value;
  }

  /**
   * Generate index name from field and type
   */
  _getIndexName(fieldName, indexType) {
    return `${fieldName}_${indexType}_index`;
  }

  /**
   * Get performance statistics
   */
  getStats() {
    const totalQueries = this.stats.queriesWithIndex + this.stats.queriesWithoutIndex;
    const indexUsage = totalQueries > 0 
      ? (this.stats.queriesWithIndex / totalQueries * 100).toFixed(2)
      : 0;

    return {
      ...this.stats,
      totalIndexes: this.indexes.size,
      indexUsage: `${indexUsage}%`,
      queuedUpdates: this.indexQueue.length,
      isProcessing: this.isProcessingQueue,
      fieldsWithIndexes: Array.from(this.fieldIndexes.keys())
    };
  }

  /**
   * Optimize indexes (reclaim memory, rebuild fragmented indexes)
   */
  async optimize() {
    console.log('🔧 Optimizing indexes...');
    
    for (const [name, index] of this.indexes) {
      await index.optimize();
    }
    
    console.log('✅ Index optimization complete');
  }

  /**
   * Clear all indexes
   */
  clear() {
    this.indexes.clear();
    this.fieldIndexes.clear();
    this.indexQueue = [];
    
    console.log('🧹 Cleared all indexes');
  }
}

/**
 * Base Index class
 */
class Index {
  constructor(fieldName, options = {}) {
    this.fieldName = fieldName;
    this.options = options;
    this.entries = 0;
  }

  add(value, key) {
    throw new Error('Method not implemented');
  }

  remove(value, key) {
    throw new Error('Method not implemented');
  }

  find(operator, value) {
    throw new Error('Method not implemented');
  }

  supportsOperator(operator) {
    throw new Error('Method not implemented');
  }

  optimize() {
    // Default implementation - override if needed
    return Promise.resolve();
  }

  getStats() {
    return {
      fieldName: this.fieldName,
      entries: this.entries,
      type: this.constructor.name
    };
  }
}

/**
 * Hash Index - for equality queries (=, !=)
 */
class HashIndex extends Index {
  constructor(fieldName, options = {}) {
    super(fieldName, options);
    this.index = new Map(); // value -> Set of keys
    this.nullKeys = new Set();
    this.undefinedKeys = new Set();
  }

  add(value, key) {
    if (value === null) {
      this.nullKeys.add(key);
    } else if (value === undefined) {
      this.undefinedKeys.add(key);
    } else {
      if (!this.index.has(value)) {
        this.index.set(value, new Set());
      }
      this.index.get(value).add(key);
    }
    this.entries++;
  }

  remove(value, key) {
    if (value === null) {
      this.nullKeys.delete(key);
    } else if (value === undefined) {
      this.undefinedKeys.delete(key);
    } else {
      const keys = this.index.get(value);
      if (keys) {
        keys.delete(key);
        if (keys.size === 0) {
          this.index.delete(value);
        }
      }
    }
    this.entries--;
  }

  find(operator, value) {
    switch (operator) {
      case '=':
        return this._findEquals(value);
      case '!=':
        return this._findNotEquals(value);
      case 'in':
        return this._findIn(value);
      default:
        return null;
    }
  }

  supportsOperator(operator) {
    return ['=', '!=', 'in'].includes(operator);
  }

  _findEquals(value) {
    if (value === null) {
      return Array.from(this.nullKeys);
    }
    
    const keys = this.index.get(value);
    return keys ? Array.from(keys) : [];
  }

  _findNotEquals(value) {
    const allKeys = new Set();
    
    // Add all keys from other values
    for (const [val, keys] of this.index) {
      if (val !== value) {
        for (const key of keys) {
          allKeys.add(key);
        }
      }
    }
    
    // Add null/undefined keys if not searching for them
    if (value !== null) {
      for (const key of this.nullKeys) {
        allKeys.add(key);
      }
    }
    if (value !== undefined) {
      for (const key of this.undefinedKeys) {
        allKeys.add(key);
      }
    }
    
    return Array.from(allKeys);
  }

  _findIn(values) {
    if (!Array.isArray(values)) {
      return null;
    }
    
    const result = new Set();
    
    for (const value of values) {
      const keys = this._findEquals(value);
      for (const key of keys) {
        result.add(key);
      }
    }
    
    return Array.from(result);
  }

  getStats() {
    return {
      ...super.getStats(),
      uniqueValues: this.index.size,
      nullEntries: this.nullKeys.size,
      undefinedEntries: this.undefinedKeys.size
    };
  }
}

/**
 * Range Index - for comparison queries (>, <, >=, <=)
 */
class RangeIndex extends Index {
  constructor(fieldName, options = {}) {
    super(fieldName, options);
    this.sortedValues = []; // Array of {value, key} sorted by value
    this.valueMap = new Map(); // value -> Array of keys
  }

  add(value, key) {
    if (typeof value !== 'number' && typeof value !== 'string') {
      return; // Only support numbers and strings for range queries
    }

    if (!this.valueMap.has(value)) {
      this.valueMap.set(value, []);
      
      // Insert into sorted array (maintain sorted order)
      const index = this._findInsertionIndex(value);
      this.sortedValues.splice(index, 0, { value, key });
    }
    
    this.valueMap.get(value).push(key);
    this.entries++;
  }

  remove(value, key) {
    const keys = this.valueMap.get(value);
    if (keys) {
      const keyIndex = keys.indexOf(key);
      if (keyIndex > -1) {
        keys.splice(keyIndex, 1);
        
        if (keys.length === 0) {
          this.valueMap.delete(value);
          
          // Remove from sorted array
          const index = this._findValueIndex(value);
          if (index > -1) {
            this.sortedValues.splice(index, 1);
          }
        }
      }
    }
    this.entries--;
  }

  find(operator, value) {
    switch (operator) {
      case '>':
        return this._findGreaterThan(value, false);
      case '>=':
        return this._findGreaterThan(value, true);
      case '<':
        return this._findLessThan(value, false);
      case '<=':
        return this._findLessThan(value, true);
      default:
        return null;
    }
  }

  supportsOperator(operator) {
    return ['>', '>=', '<', '<='].includes(operator);
  }

  _findGreaterThan(value, inclusive) {
    const startIndex = this._findFirstIndexGreaterThan(value, inclusive);
    if (startIndex === -1) return [];

    const result = [];
    for (let i = startIndex; i < this.sortedValues.length; i++) {
      const { value: val, key } = this.sortedValues[i];
      const keys = this.valueMap.get(val);
      result.push(...keys);
    }
    
    return result;
  }

  _findLessThan(value, inclusive) {
    const endIndex = this._findLastIndexLessThan(value, inclusive);
    if (endIndex === -1) return [];

    const result = [];
    for (let i = 0; i <= endIndex; i++) {
      const { value: val, key } = this.sortedValues[i];
      const keys = this.valueMap.get(val);
      result.push(...keys);
    }
    
    return result;
  }

  _findFirstIndexGreaterThan(value, inclusive) {
    let low = 0;
    let high = this.sortedValues.length - 1;
    let result = -1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const midValue = this.sortedValues[mid].value;

      if (inclusive ? midValue >= value : midValue > value) {
        result = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    return result;
  }

  _findLastIndexLessThan(value, inclusive) {
    let low = 0;
    let high = this.sortedValues.length - 1;
    let result = -1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const midValue = this.sortedValues[mid].value;

      if (inclusive ? midValue <= value : midValue < value) {
        result = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return result;
  }

  _findInsertionIndex(value) {
    let low = 0;
    let high = this.sortedValues.length;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (this.sortedValues[mid].value < value) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    return low;
  }

  _findValueIndex(value) {
    let low = 0;
    let high = this.sortedValues.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const midValue = this.sortedValues[mid].value;

      if (midValue === value) {
        return mid;
      } else if (midValue < value) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return -1;
  }

  optimize() {
    // Re-sort the array (should already be sorted, but just in case)
    this.sortedValues.sort((a, b) => {
      if (a.value < b.value) return -1;
      if (a.value > b.value) return 1;
      return 0;
    });
  }

  getStats() {
    return {
      ...super.getStats(),
      valueRange: this.sortedValues.length > 0 
        ? [this.sortedValues[0].value, this.sortedValues[this.sortedValues.length - 1].value]
        : null
    };
  }
}

/**
 * Text Index - for text search queries (contains, startsWith, endsWith)
 */
class TextIndex extends Index {
  constructor(fieldName, options = {}) {
    super(fieldName, options);
    this.trie = new Map(); // Simple prefix tree implementation
    this.keys = new Set();
  }

  add(value, key) {
    if (typeof value !== 'string') return;

    const words = value.toLowerCase().split(/\W+/).filter(word => word.length > 0);
    
    for (const word of words) {
      if (!this.trie.has(word)) {
        this.trie.set(word, new Set());
      }
      this.trie.get(word).add(key);
    }
    
    this.keys.add(key);
    this.entries++;
  }

  remove(value, key) {
    if (typeof value !== 'string') return;

    const words = value.toLowerCase().split(/\W+/).filter(word => word.length > 0);
    
    for (const word of words) {
      const keys = this.trie.get(word);
      if (keys) {
        keys.delete(key);
        if (keys.size === 0) {
          this.trie.delete(word);
        }
      }
    }
    
    this.keys.delete(key);
    this.entries--;
  }

  find(operator, value) {
    if (typeof value !== 'string') return null;

    switch (operator) {
      case 'contains':
        return this._findContains(value);
      case 'startsWith':
        return this._findStartsWith(value);
      case 'endsWith':
        return this._findEndsWith(value);
      default:
        return null;
    }
  }

  supportsOperator(operator) {
    return ['contains', 'startsWith', 'endsWith'].includes(operator);
  }

  _findContains(searchTerm) {
    const term = searchTerm.toLowerCase();
    const result = new Set();

    for (const [word, keys] of this.trie) {
      if (word.includes(term)) {
        for (const key of keys) {
          result.add(key);
        }
      }
    }

    return Array.from(result);
  }

  _findStartsWith(prefix) {
    const prefixLower = prefix.toLowerCase();
    const result = new Set();

    for (const [word, keys] of this.trie) {
      if (word.startsWith(prefixLower)) {
        for (const key of keys) {
          result.add(key);
        }
      }
    }

    return Array.from(result);
  }

  _findEndsWith(suffix) {
    const suffixLower = suffix.toLowerCase();
    const result = new Set();

    for (const [word, keys] of this.trie) {
      if (word.endsWith(suffixLower)) {
        for (const key of keys) {
          result.add(key);
        }
      }
    }

    return Array.from(result);
  }

  getStats() {
    return {
      ...super.getStats(),
      uniqueWords: this.trie.size,
      indexedKeys: this.keys.size
    };
  }
}

module.exports = IndexManager;