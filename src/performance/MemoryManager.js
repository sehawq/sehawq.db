/**
 * MemoryManager - Keeps your memory usage in check like a financial advisor 💰
 * 
 * Monitors, optimizes, and prevents memory leaks
 * Because crashing from out-of-memory is so 1990s 😅
 */

const { performance } = require('perf_hooks');

class MemoryManager {
  constructor(options = {}) {
    this.options = {
      maxMemoryMB: 100, // 100MB default limit
      checkInterval: 30000, // Check every 30 seconds
      gcAggressiveness: 'medium', // low, medium, high
      leakDetection: true,
      ...options
    };

    this.components = new Map(); // Track memory by component
    this.snapshots = []; // Memory usage history
    this.alerts = []; // Memory alerts
    
    this.stats = {
      totalChecks: 0,
      optimizations: 0,
      leaksDetected: 0,
      gcCalls: 0,
      memorySaved: 0
    };

    this._startMonitoring();
  }

  /**
   * Register a component for memory tracking
   */
  registerComponent(name, component) {
    this.components.set(name, {
      instance: component,
      baselineMemory: this._getComponentMemory(component),
      lastCheck: Date.now(),
      leaks: 0
    });

    if (this.options.debug) {
      console.log(`📝 Registered component for memory tracking: ${name}`);
    }
  }

  /**
   * Start memory monitoring
   */
  _startMonitoring() {
    setInterval(() => {
      this._performMemoryCheck();
    }, this.options.checkInterval);

    if (this.options.debug) {
      console.log('🔍 Memory monitoring started');
    }
  }

  /**
   * Perform comprehensive memory check
   */
  _performMemoryCheck() {
    this.stats.totalChecks++;

    const memoryUsage = process.memoryUsage();
    const currentMemoryMB = memoryUsage.heapUsed / 1024 / 1024;
    
    // Take snapshot for trend analysis
    this._takeMemorySnapshot(memoryUsage);

    // Check for memory leaks
    if (this.options.leakDetection) {
      this._checkForLeaks();
    }

    // Check if we're approaching memory limit
    if (currentMemoryMB > this.options.maxMemoryMB * 0.8) {
      this._handleHighMemoryUsage(currentMemoryMB);
    }

    // Aggressive GC if configured
    if (this.options.gcAggressiveness === 'high') {
      this._forceGarbageCollection();
    }

    if (this.options.debug) {
      console.log(`🧠 Memory: ${currentMemoryMB.toFixed(2)}MB / ${this.options.maxMemoryMB}MB`);
    }
  }

  /**
   * Take memory snapshot for trend analysis
   */
  _takeMemorySnapshot(memoryUsage) {
    const snapshot = {
      timestamp: Date.now(),
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      external: memoryUsage.external,
      rss: memoryUsage.rss,
      components: {}
    };

    // Track memory by component
    for (const [name, component] of this.components) {
      snapshot.components[name] = this._getComponentMemory(component.instance);
    }

    this.snapshots.push(snapshot);

    // Keep only last 100 snapshots
    if (this.snapshots.length > 100) {
      this.snapshots.shift();
    }
  }

  /**
   * Check for memory leaks in components
   */
  _checkForLeaks() {
    for (const [name, component] of this.components) {
      const currentMemory = this._getComponentMemory(component.instance);
      const memoryIncrease = currentMemory - component.baselineMemory;
      
      // If memory increased by more than 50% since baseline, potential leak
      if (memoryIncrease > component.baselineMemory * 0.5) {
        component.leaks++;
        this.stats.leaksDetected++;
        
        this._alert('leak', `Potential memory leak in ${name}: +${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
        
        if (this.options.debug) {
          console.log(`🚨 Potential memory leak in ${name}`);
        }
      }

      component.lastCheck = Date.now();
    }
  }

  /**
   * Handle high memory usage situations
   */
  _handleHighMemoryUsage(currentMemoryMB) {
    const severity = currentMemoryMB > this.options.maxMemoryMB * 0.9 ? 'critical' : 'warning';
    
    this._alert(severity, 
      `High memory usage: ${currentMemoryMB.toFixed(2)}MB / ${this.options.maxMemoryMB}MB`
    );

    // Trigger memory optimization
    this.optimizeMemory(severity);
  }

  /**
   * Optimize memory usage based on severity
   */
  optimizeMemory(severity = 'medium') {
    this.stats.optimizations++;

    const strategies = {
      low: ['clearCaches', 'mildGC'],
      medium: ['clearCaches', 'aggressiveGC', 'unloadChunks'],
      high: ['clearCaches', 'forceGC', 'unloadAllChunks', 'compressData'],
      critical: ['emergencyMeasures']
    };

    const strategy = strategies[severity] || strategies.medium;

    if (this.options.debug) {
      console.log(`🔄 Memory optimization (${severity}): ${strategy.join(', ')}`);
    }

    for (const action of strategy) {
      this._executeOptimization(action);
    }

    this._alert('info', `Memory optimization completed (${severity})`);
  }

  /**
   * Execute specific optimization action
   */
  _executeOptimization(action) {
    switch (action) {
      case 'clearCaches':
        this._clearAllCaches();
        break;
      case 'mildGC':
        this._suggestGarbageCollection();
        break;
      case 'aggressiveGC':
        this._forceGarbageCollection();
        break;
      case 'unloadChunks':
        this._unloadNonCriticalChunks();
        break;
      case 'unloadAllChunks':
        this._unloadAllChunks();
        break;
      case 'compressData':
        this._compressMemoryData();
        break;
      case 'emergencyMeasures':
        this._emergencyMemoryReduction();
        break;
    }
  }

  /**
   * Clear all registered caches
   */
  _clearAllCaches() {
    for (const [name, component] of this.components) {
      if (component.instance.clearCache) {
        const before = this._getComponentMemory(component.instance);
        component.instance.clearCache();
        const after = this._getComponentMemory(component.instance);
        
        this.stats.memorySaved += (before - after);
        
        if (this.options.debug) {
          console.log(`🧹 Cleared cache for ${name}: saved ${((before - after) / 1024 / 1024).toFixed(2)}MB`);
        }
      }
    }
  }

  /**
   * Suggest garbage collection (if available)
   */
  _suggestGarbageCollection() {
    if (global.gc) {
      const before = process.memoryUsage().heapUsed;
      global.gc();
      const after = process.memoryUsage().heapUsed;
      
      this.stats.gcCalls++;
      this.stats.memorySaved += (before - after);
      
      if (this.options.debug) {
        console.log(`♻️  GC freed ${((before - after) / 1024 / 1024).toFixed(2)}MB`);
      }
    }
  }

  /**
   * Force garbage collection more aggressively
   */
  _forceGarbageCollection() {
    if (global.gc) {
      // Call multiple times for more aggressive collection
      for (let i = 0; i < 3; i++) {
        global.gc();
      }
      this.stats.gcCalls += 3;
    }
  }

  /**
   * Unload non-critical data chunks
   */
  _unloadNonCriticalChunks() {
    for (const [name, component] of this.components) {
      if (component.instance.unloadChunks) {
        component.instance.unloadChunks();
        
        if (this.options.debug) {
          console.log(`📦 Unloaded chunks for ${name}`);
        }
      }
    }
  }

  /**
   * Unload all possible chunks
   */
  _unloadAllChunks() {
    for (const [name, component] of this.components) {
      if (component.instance.clear) {
        component.instance.clear();
        
        if (this.options.debug) {
          console.log(`🗑️  Cleared all data for ${name}`);
        }
      }
    }
  }

  /**
   * Compress in-memory data
   */
  _compressMemoryData() {
    // This would implement actual compression logic
    // For now, it's a placeholder for future implementation
    if (this.options.debug) {
      console.log('🗜️  Memory compression would run here');
    }
  }

  /**
   * Emergency measures for critical memory situations
   */
  _emergencyMemoryReduction() {
    this._clearAllCaches();
    this._unloadAllChunks();
    this._forceGarbageCollection();
    
    // Reset component baselines
    for (const [name, component] of this.components) {
      component.baselineMemory = this._getComponentMemory(component.instance);
    }

    this._alert('critical', 'Emergency memory reduction completed');
  }

  /**
   * Get memory usage for a component
   */
  _getComponentMemory(component) {
    // Try to get memory stats from component
    if (component.getStats && component.getStats().memoryUsage) {
      return component.getStats().memoryUsage;
    }
    
    // Fallback: estimate from internal state
    return this._estimateObjectSize(component);
  }

  /**
   * Estimate memory size of an object
   */
  _estimateObjectSize(obj) {
    const seen = new WeakSet();
    
    function sizeOf(obj) {
      if (obj === null || obj === undefined) return 0;
      if (seen.has(obj)) return 0;
      
      seen.add(obj);
      
      switch (typeof obj) {
        case 'number':
          return 8;
        case 'string':
          return obj.length * 2;
        case 'boolean':
          return 4;
        case 'object':
          if (Array.isArray(obj)) {
            return obj.reduce((size, item) => size + sizeOf(item), 0);
          } else if (obj instanceof Map) {
            let size = 0;
            for (const [key, value] of obj) {
              size += sizeOf(key) + sizeOf(value);
            }
            return size;
          } else if (obj instanceof Set) {
            let size = 0;
            for (const value of obj) {
              size += sizeOf(value);
            }
            return size;
          } else {
            let size = 0;
            for (const key in obj) {
              if (obj.hasOwnProperty(key)) {
                size += sizeOf(key) + sizeOf(obj[key]);
              }
            }
            return size;
          }
        default:
          return 0;
      }
    }
    
    return sizeOf(obj);
  }

  /**
   * Create memory alert
   */
  _alert(level, message) {
    const alert = {
      level,
      message,
      timestamp: Date.now(),
      memoryUsage: process.memoryUsage().heapUsed
    };
    
    this.alerts.push(alert);
    
    // Keep only last 50 alerts
    if (this.alerts.length > 50) {
      this.alerts.shift();
    }
    
    // Emit alert event if available
    if (this.emit) {
      this.emit('alert', alert);
    }
  }

  /**
   * Get memory usage trends
   */
  getMemoryTrend() {
    if (this.snapshots.length < 2) {
      return 'insufficient_data';
    }
    
    const recent = this.snapshots.slice(-5);
    const oldest = recent[0].heapUsed;
    const newest = recent[recent.length - 1].heapUsed;
    
    const change = newest - oldest;
    const percentageChange = (change / oldest) * 100;
    
    if (percentageChange > 10) return 'increasing';
    if (percentageChange < -10) return 'decreasing';
    return 'stable';
  }

  /**
   * Get comprehensive memory report
   */
  getReport() {
    const currentMemory = process.memoryUsage();
    const trend = this.getMemoryTrend();
    
    return {
      current: {
        heapUsed: `${(currentMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        heapTotal: `${(currentMemory.heapTotal / 1024 / 1024).toFixed(2)}MB`,
        external: `${(currentMemory.external / 1024 / 1024).toFixed(2)}MB`,
        rss: `${(currentMemory.rss / 1024 / 1024).toFixed(2)}MB`
      },
      limits: {
        maxMemory: `${this.options.maxMemoryMB}MB`,
        usagePercentage: `${((currentMemory.heapUsed / 1024 / 1024) / this.options.maxMemoryMB * 100).toFixed(1)}%`
      },
      trends: {
        direction: trend,
        snapshots: this.snapshots.length
      },
      components: Array.from(this.components.entries()).map(([name, component]) => ({
        name,
        memory: `${(this._getComponentMemory(component.instance) / 1024 / 1024).toFixed(2)}MB`,
        leaks: component.leaks
      })),
      stats: this.stats,
      recentAlerts: this.alerts.slice(-5)
    };
  }

  /**
   * Set new memory limit
   */
  setMemoryLimit(mb) {
    this.options.maxMemoryMB = mb;
    
    if (this.options.debug) {
      console.log(`📏 Memory limit set to ${mb}MB`);
    }
  }

  /**
   * Get optimization suggestions
   */
  getOptimizationSuggestions() {
    const suggestions = [];
    const currentMB = process.memoryUsage().heapUsed / 1024 / 1024;
    
    if (currentMB > this.options.maxMemoryMB * 0.8) {
      suggestions.push('Consider increasing maxMemoryMB or optimizing data structures');
    }
    
    if (this.stats.leaksDetected > 0) {
      suggestions.push('Investigate potential memory leaks in registered components');
    }
    
    if (this.getMemoryTrend() === 'increasing') {
      suggestions.push('Memory usage is trending upward - consider proactive optimization');
    }
    
    return suggestions;
  }
}

module.exports = MemoryManager;