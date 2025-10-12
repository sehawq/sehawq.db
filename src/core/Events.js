/**
 * Event System - Makes everything reactive ⚡
 * 
 * Listen to database changes, system events, anything!
 * Because sometimes you need to know when stuff happens
 */

class Events {
  constructor() {
    this.events = new Map();
    this.maxListeners = 100;
    this.stats = {
      eventsEmitted: 0,
      listenersCalled: 0,
      errors: 0
    };
  }

  /**
   * Add event listener
   */
  on(event, listener, options = {}) {
    if (typeof listener !== 'function') {
      throw new Error('Listener must be a function');
    }

    if (!this.events.has(event)) {
      this.events.set(event, []);
    }

    const listeners = this.events.get(event);
    
    // Check max listeners
    if (listeners.length >= this.maxListeners) {
      console.warn(`⚠️  Event '${event}' has ${listeners.length} listeners, possible memory leak`);
    }

    // Add listener with options
    listeners.push({
      fn: listener,
      once: options.once || false,
      async: options.async || false,
      id: options.id || this._generateId()
    });

    return this;
  }

  /**
   * Add one-time event listener
   */
  once(event, listener, options = {}) {
    return this.on(event, listener, { ...options, once: true });
  }

  /**
   * Remove event listener
   */
  off(event, listener) {
    if (!this.events.has(event)) {
      return this;
    }

    const listeners = this.events.get(event);
    
    if (listener) {
      // Remove specific listener
      const index = listeners.findIndex(l => l.fn === listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    } else {
      // Remove all listeners for event
      this.events.delete(event);
    }

    return this;
  }

  /**
   * Emit event
   */
  emit(event, ...args) {
    this.stats.eventsEmitted++;

    if (!this.events.has(event)) {
      return false;
    }

    const listeners = this.events.get(event).slice(); // Copy array
    let hasListeners = false;

    for (const listener of listeners) {
      hasListeners = true;

      // Remove one-time listeners
      if (listener.once) {
        this.off(event, listener.fn);
      }

      // Call listener
      this._callListener(listener, event, args);
    }

    return hasListeners;
  }

  /**
   * Call listener with error handling
   */
  _callListener(listener, event, args) {
    const callListener = () => {
      try {
        listener.fn.apply(this, args);
        this.stats.listenersCalled++;
      } catch (error) {
        this.stats.errors++;
        console.error(`🚨 Event listener error for '${event}':`, error);
        
        // Emit error event
        if (this.events.has('error')) {
          this.emit('error', error, event, listener);
        }
      }
    };

    if (listener.async) {
      setImmediate(callListener);
    } else {
      callListener();
    }
  }

  /**
   * Get all event names
   */
  eventNames() {
    return Array.from(this.events.keys());
  }

  /**
   * Get listeners for event
   */
  listeners(event) {
    return this.events.has(event) 
      ? this.events.get(event).map(l => l.fn)
      : [];
  }

  /**
   * Get listener count for event
   */
  listenerCount(event) {
    return this.events.has(event) ? this.events.get(event).length : 0;
  }

  /**
   * Remove all listeners
   */
  removeAllListeners(event = null) {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
    return this;
  }

  /**
   * Set max listeners
   */
  setMaxListeners(n) {
    this.maxListeners = n;
    return this;
  }

  /**
   * Get max listeners
   */
  getMaxListeners() {
    return this.maxListeners;
  }

  /**
   * Generate unique ID for listener
   */
  _generateId() {
    return `listener_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Wait for event (Promise-based)
   */
  waitFor(event, timeout = 0) {
    return new Promise((resolve, reject) => {
      let timeoutId;

      const listener = (...args) => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve(args);
      };

      this.once(event, listener);

      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          this.off(event, listener);
          reject(new Error(`Event '${event}' timeout after ${timeout}ms`));
        }, timeout);
      }
    });
  }

  /**
   * Pipe events to another emitter
   */
  pipe(event, targetEmitter, targetEvent = null) {
    const targetEventName = targetEvent || event;
    
    return this.on(event, (...args) => {
      targetEmitter.emit(targetEventName, ...args);
    });
  }

  /**
   * Create namespaced event emitter
   */
  namespace(namespace) {
    const namespaced = new Events();
    
    // Pipe all events with namespace prefix
    this.on('*', (event, ...args) => {
      namespaced.emit(event, ...args);
    });

    // Pipe namespaced events back to parent
    namespaced.on('*', (event, ...args) => {
      this.emit(`${namespace}.${event}`, ...args);
    });

    return namespaced;
  }

  /**
   * Get event statistics
   */
  getStats() {
    const events = {};
    
    for (const [event, listeners] of this.events) {
      events[event] = {
        listeners: listeners.length,
        once: listeners.filter(l => l.once).length,
        async: listeners.filter(l => l.async).length
      };
    }

    return {
      ...this.stats,
      totalEvents: this.events.size,
      totalListeners: Array.from(this.events.values()).reduce((sum, listeners) => sum + listeners.length, 0),
      events
    };
  }

  /**
   * Debug: log all events
   */
  debug(enable = true) {
    if (enable) {
      this.on('*', (event, ...args) => {
        console.log(`🎯 Event: ${event}`, args);
      });
    } else {
      this.off('*');
    }
    return this;
  }
}

// Wildcard event support
Events.prototype.on('*', function(event, ...args) {
  // This will be called for every event
});

module.exports = Events;