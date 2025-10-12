/**
 * Query Engine - Makes data searching fast and intuitive
 * 
 * Went from simple filters to a mini-query language
 * Because scanning everything is for beginners 😎
 */

const { performance } = require('perf_hooks');

class QueryEngine {
  constructor(database) {
    this.db = database;
    this.stats = {
      queries: 0,
      fullScans: 0,
      indexScans: 0,
      avgQueryTime: 0,
      queryTimes: []
    };

    // Query operators - because who remembers syntax?
    this.operators = {
      '=': (a, b) => a === b,
      '!=': (a, b) => a !== b,
      '>': (a, b) => a > b,
      '<': (a, b) => a < b,
      '>=': (a, b) => a >= b,
      '<=': (a, b) => a <= b,
      'in': (a, b) => Array.isArray(b) && b.includes(a),
      'contains': (a, b) => String(a).includes(String(b)),
      'startsWith': (a, b) => String(a).startsWith(String(b)),
      'endsWith': (a, b) => String(a).endsWith(String(b)),
      'matches': (a, b) => new RegExp(b).test(String(a))
    };

    // Cache for compiled filter functions
    this.filterCache = new Map();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  /**
   * Find records using a filter function
   * The OG method - simple but powerful
   */
  find(filterFn, options = {}) {
    const startTime = performance.now();
    this.stats.queries++;

    const results = [];
    const data = this.db.data;

    // Use index if available and applicable
    if (options.useIndex !== false && this._canUseIndex(filterFn)) {
      results.push(...this._findWithIndex(filterFn));
      this.stats.indexScans++;
    } else {
      // Full table scan - reliable but slower
      for (const [key, value] of data) {
        if (filterFn(value, key)) {
          results.push({ key, value });
        }
      }
      this.stats.fullScans++;
    }

    const queryTime = performance.now() - startTime;
    this._recordQueryTime(queryTime);

    return new QueryResult(results, this, {
      queryTime,
      usedIndex: this.stats.indexScans > 0
    });
  }

  /**
   * MongoDB-style where queries
   * Because sometimes you want to feel professional
   */
  where(field, operator, value) {
    const filterFn = this._compileWhereClause(field, operator, value);
    return this.find(filterFn, { useIndex: true });
  }

  /**
   * Compile where clause into efficient filter function
   * With caching because compiling is expensive
   */
  _compileWhereClause(field, operator, value) {
    const cacheKey = `${field}|${operator}|${JSON.stringify(value)}`;
    
    // Check cache first
    if (this.filterCache.has(cacheKey)) {
      this.cacheHits++;
      return this.filterCache.get(cacheKey);
    }

    this.cacheMisses++;

    // Get the operator function
    const opFunc = this.operators[operator];
    if (!opFunc) {
      throw new Error(`Unknown operator: ${operator}. Available: ${Object.keys(this.operators).join(', ')}`);
    }

    // Compile the filter function
    let filterFn;

    if (field.includes('.')) {
      // Dot notation - user.profile.name
      const fieldParts = field.split('.');
      filterFn = (item) => {
        let fieldValue = item;
        for (const part of fieldParts) {
          fieldValue = fieldValue?.[part];
          if (fieldValue === undefined) break;
        }
        return opFunc(fieldValue, value);
      };
    } else {
      // Simple field access
      filterFn = (item) => opFunc(item[field], value);
    }

    // Cache the compiled function
    if (this.filterCache.size < 1000) { // Prevent memory leaks
      this.filterCache.set(cacheKey, filterFn);
    }

    return filterFn;
  }

  /**
   * Check if we can use indexes for this query
   */
  _canUseIndex(filterFn) {
    // TODO: Implement index detection logic
    // For now, we'll use full scans until IndexManager is ready
    return false;
  }

  /**
   * Use indexes for faster queries
   */
  _findWithIndex(filterFn) {
    // TODO: Implement index-based search
    // This will make large datasets queryable in milliseconds
    return [];
  }

  /**
   * Aggregation functions - for when you need answers
   */

  count(filterFn = null) {
    if (filterFn) {
      return this.find(filterFn).count();
    }
    
    // Fast path for total count
    return this.db.data.size;
  }

// sum() function optimized to avoid multiple iterations
sum(field, filterFn = null) {
  const results = filterFn ? this.find(filterFn) : this.findAll();
  const resultsArray = results.toArray();
  let total = 0;

  for (const item of resultsArray) {
    const value = this._getFieldValue(item.value, field);
    if (typeof value === 'number') {
      total += value;
    }
  }
  return total;
}

avg(field, filterFn = null) {
  const results = filterFn ? this.find(filterFn) : this.findAll();
  let total = 0;
  let count = 0;

  // results.toArray() used to avoid multiple iterations
  const resultsArray = results.toArray();
  
  for (const item of resultsArray) {
    const value = this._getFieldValue(item.value, field);
    if (typeof value === 'number') {
      total += value;
      count++;
    }
  }

  return count > 0 ? total / count : 0;
}

min(field, filterFn = null) {
  const results = filterFn ? this.find(filterFn) : this.findAll();
  const resultsArray = results.toArray();
  let min = Infinity;

  for (const item of resultsArray) {
    const value = this._getFieldValue(item.value, field);
    if (typeof value === 'number' && value < min) {
      min = value;
    }
  }
  return min !== Infinity ? min : null;
}

max(field, filterFn = null) {
  const results = filterFn ? this.find(filterFn) : this.findAll();
  const resultsArray = results.toArray();
  let max = -Infinity;

  for (const item of resultsArray) {
    const value = this._getFieldValue(item.value, field);
    if (typeof value === 'number' && value > max) {
      max = value;
    }
  }
  return max !== -Infinity ? max : null;
}

  /**
   * Get all records as QueryResult
   */
  findAll() {
    const results = [];
    for (const [key, value] of this.db.data) {
      results.push({ key, value });
    }
    return new QueryResult(results, this);
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
   * Group by field - SQL-like power
   */
  groupBy(field, aggregateFn = null) {
    const groups = new Map();
    
    for (const [key, value] of this.db.data) {
      const groupKey = this._getFieldValue(value, field);
      
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      
      groups.get(groupKey).push({ key, value });
    }

    // Apply aggregation if provided
    if (aggregateFn) {
      const result = {};
      for (const [groupKey, items] of groups) {
        result[groupKey] = aggregateFn(items);
      }
      return result;
    }

    return Object.fromEntries(groups);
  }

  /**
   * Performance tracking
   */
  _recordQueryTime(queryTime) {
    this.stats.queryTimes.push(queryTime);
    
    // Keep only last 100 times
    if (this.stats.queryTimes.length > 100) {
      this.stats.queryTimes.shift();
    }
    
    this.stats.avgQueryTime = this.stats.queryTimes.reduce((a, b) => a + b, 0) / this.stats.queryTimes.length;
  }

  /**
   * Get query statistics
   */
  getStats() {
    return {
      ...this.stats,
      cacheHitRate: this.cacheHits + this.cacheMisses > 0 
        ? ((this.cacheHits / (this.cacheHits + this.cacheMisses)) * 100).toFixed(2) + '%'
        : '0%',
      filterCacheSize: this.filterCache.size
    };
  }

  /**
   * Clear filter cache
   */
  clearCache() {
    this.filterCache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }
}

/**
 * QueryResult - Enables method chaining
 * Because .find().where().sort().limit() looks cool 😎
 */
class QueryResult {
  constructor(results, queryEngine, meta = {}) {
    this.results = results;
    this.queryEngine = queryEngine;
    this.meta = meta;
  }

  /**
   * Sort results by field
   */
  sort(field, direction = 'asc') {
    const sorted = [...this.results].sort((a, b) => {
      const aVal = this.queryEngine._getFieldValue(a.value, field);
      const bVal = this.queryEngine._getFieldValue(b.value, field);
      
      if (aVal === bVal) return 0;
      
      if (direction === 'asc') {
        return aVal < bVal ? -1 : 1;
      } else {
        return aVal > bVal ? -1 : 1;
      }
    });

    return new QueryResult(sorted, this.queryEngine, this.meta);
  }

  /**
   * Limit number of results
   */
  limit(count) {
    const limited = this.results.slice(0, count);
    return new QueryResult(limited, this.queryEngine, this.meta);
  }

  /**
   * Skip number of results
   */
  skip(count) {
    const skipped = this.results.slice(count);
    return new QueryResult(skipped, this.queryEngine, this.meta);
  }

  /**
   * Get first result
   */
  first() {
    return this.results[0] || null;
  }

  /**
   * Get last result
   */
  last() {
    return this.results[this.results.length - 1] || null;
  }

  /**
   * Get result count
   */
  count() {
    return this.results.length;
  }

  /**
   * Get only values
   */
  values() {
    return this.results.map(item => item.value);
  }

  /**
   * Get only keys
   */
  keys() {
    return this.results.map(item => item.key);
  }

  /**
   * Convert to array
   */
  toArray() {
    return this.results;
  }

  /**
   * Get query performance info
   */
  getMeta() {
    return this.meta;
  }

  /**
   * Execute another query on these results
   */
  find(filterFn) {
    const filtered = this.results.filter(item => filterFn(item.value, item.key));
    return new QueryResult(filtered, this.queryEngine, this.meta);
  }

  /**
   * Map over results
   */
  map(fn) {
    return this.results.map((item, index) => fn(item.value, item.key, index));
  }

  /**
   * Filter results
   */
  filter(fn) {
    const filtered = this.results.filter((item, index) => fn(item.value, item.key, index));
    return new QueryResult(filtered, this.queryEngine, this.meta);
  }

  /**
   * ForEach loop
   */
  forEach(fn) {
    this.results.forEach((item, index) => fn(item.value, item.key, index));
  }
}

module.exports = QueryEngine;