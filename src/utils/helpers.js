/**
 * Helper Functions - The Swiss Army knife of utilities 🔧
 * 
 * Random useful stuff that makes life easier
 * Collected from years of "oh, I need that again" moments
 */

class Helpers {
  /**
   * Deep clone an object
   */
  static deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => Helpers.deepClone(item));
    
    const cloned = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = Helpers.deepClone(obj[key]);
      }
    }
    return cloned;
  }

  /**
   * Deep merge objects
   */
  static deepMerge(target, ...sources) {
    if (!sources.length) return target;
    const source = sources.shift();

    if (Helpers.isObject(target) && Helpers.isObject(source)) {
      for (const key in source) {
        if (Helpers.isObject(source[key])) {
          if (!target[key]) Object.assign(target, { [key]: {} });
          Helpers.deepMerge(target[key], source[key]);
        } else {
          Object.assign(target, { [key]: source[key] });
        }
      }
    }

    return Helpers.deepMerge(target, ...sources);
  }

  /**
   * Check if value is an object
   */
  static isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  /**
   * Generate random ID
   */
  static generateId(length = 16) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Sleep/delay function
   */
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Debounce function
   */
  static debounce(func, wait, immediate = false) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        timeout = null;
        if (!immediate) func(...args);
      };
      const callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) func(...args);
    };
  }

  /**
   * Throttle function
   */
  static throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /**
   * Check if value is empty
   */
  static isEmpty(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    if (Helpers.isObject(value)) return Object.keys(value).length === 0;
    return false;
  }

  /**
   * Get object size (bytes estimation)
   */
  static getObjectSize(obj) {
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
   * Format bytes to human readable
   */
  static formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Safe JSON parse
   */
  static safeJsonParse(str, defaultValue = null) {
    try {
      return JSON.parse(str);
    } catch (error) {
      return defaultValue;
    }
  }

  /**
   * Safe JSON stringify
   */
  static safeJsonStringify(obj, defaultValue = '{}') {
    try {
      return JSON.stringify(obj);
    } catch (error) {
      return defaultValue;
    }
  }

  /**
   * Filter object properties
   */
  static filterObject(obj, predicate) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (predicate(value, key)) {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Map object properties
   */
  static mapObject(obj, mapper) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = mapper(value, key);
    }
    return result;
  }

  /**
   * Retry function with exponential backoff
   */
  static async retry(fn, retries = 3, delay = 1000) {
    try {
      return await fn();
    } catch (error) {
      if (retries === 0) throw error;
      await Helpers.sleep(delay);
      return Helpers.retry(fn, retries - 1, delay * 2);
    }
  }

  /**
   * Generate timestamp
   */
  static timestamp() {
    return Date.now();
  }

  /**
   * Generate UUID v4
   */
  static uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Check if running in Node.js
   */
  static isNode() {
    return typeof process !== 'undefined' && 
           process.versions != null && 
           process.versions.node != null;
  }

  /**
   * Check if running in browser
   */
  static isBrowser() {
    return typeof window !== 'undefined' && 
           typeof window.document !== 'undefined';
  }
}

module.exports = Helpers;