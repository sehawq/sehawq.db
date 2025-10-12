/**
 * Dot Notation Parser - For nested object access 🔍
 * 
 * Turns user.profile.name into actual value
 * Because brackets are so 2010 😄
 */

class DotNotation {
  /**
   * Get value using dot notation
   */
  static get(obj, path, defaultValue = undefined) {
    if (!this.isObject(obj) || typeof path !== 'string') {
      return defaultValue;
    }

    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current === null || current === undefined) {
        return defaultValue;
      }

      // Handle array indices
      if (Array.isArray(current) && !isNaN(key)) {
        current = current[parseInt(key)];
      } else if (this.isObject(current)) {
        current = current[key];
      } else {
        return defaultValue;
      }
    }

    return current !== undefined ? current : defaultValue;
  }

  /**
   * Set value using dot notation
   */
  static set(obj, path, value) {
    if (!this.isObject(obj) || typeof path !== 'string') {
      return false;
    }

    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      const nextKey = keys[i + 1];

      // Create nested objects if they don't exist
      if (current[key] === undefined || current[key] === null) {
        // Check if next key is numeric (array)
        current[key] = !isNaN(nextKey) ? [] : {};
      }

      current = current[key];
    }

    const lastKey = keys[keys.length - 1];
    
    // Handle array indices
    if (Array.isArray(current) && !isNaN(lastKey)) {
      const index = parseInt(lastKey);
      current[index] = value;
    } else {
      current[lastKey] = value;
    }

    return true;
  }

  /**
   * Check if path exists
   */
  static has(obj, path) {
    if (!this.isObject(obj) || typeof path !== 'string') {
      return false;
    }

    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current === null || current === undefined) {
        return false;
      }

      if (Array.isArray(current) && !isNaN(key)) {
        const index = parseInt(key);
        if (index < 0 || index >= current.length) {
          return false;
        }
        current = current[index];
      } else if (this.isObject(current)) {
        if (!current.hasOwnProperty(key)) {
          return false;
        }
        current = current[key];
      } else {
        return false;
      }
    }

    return true;
  }

  /**
   * Delete value using dot notation
   */
  static delete(obj, path) {
    if (!this.isObject(obj) || typeof path !== 'string') {
      return false;
    }

    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      
      if (current[key] === undefined || current[key] === null) {
        return false;
      }

      current = current[key];
    }

    const lastKey = keys[keys.length - 1];
    
    if (Array.isArray(current) && !isNaN(lastKey)) {
      const index = parseInt(lastKey);
      if (index >= 0 && index < current.length) {
        current.splice(index, 1);
        return true;
      }
    } else if (this.isObject(current)) {
      if (current.hasOwnProperty(lastKey)) {
        delete current[lastKey];
        return true;
      }
    }

    return false;
  }

  /**
   * Get all paths in an object
   */
  static getAllPaths(obj, prefix = '') {
    if (!this.isObject(obj)) return [];

    const paths = [];

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const currentPath = prefix ? `${prefix}.${key}` : key;
        const value = obj[key];

        if (this.isObject(value) && !Array.isArray(value)) {
          // Recursively get paths for nested objects
          paths.push(...this.getAllPaths(value, currentPath));
        } else if (Array.isArray(value)) {
          // Handle arrays - include index paths
          paths.push(currentPath);
          for (let i = 0; i < value.length; i++) {
            const arrayPath = `${currentPath}.${i}`;
            if (this.isObject(value[i])) {
              paths.push(...this.getAllPaths(value[i], arrayPath));
            } else {
              paths.push(arrayPath);
            }
          }
        } else {
          paths.push(currentPath);
        }
      }
    }

    return paths;
  }

  /**
   * Flatten object using dot notation
   */
  static flatten(obj) {
    const result = {};

    function flattenHelper(current, path) {
      if (DotNotation.isObject(current) && !Array.isArray(current)) {
        for (const key in current) {
          if (current.hasOwnProperty(key)) {
            const newPath = path ? `${path}.${key}` : key;
            flattenHelper(current[key], newPath);
          }
        }
      } else if (Array.isArray(current)) {
        for (let i = 0; i < current.length; i++) {
          const newPath = `${path}.${i}`;
          flattenHelper(current[i], newPath);
        }
      } else {
        result[path] = current;
      }
    }

    flattenHelper(obj, '');
    return result;
  }

  /**
   * Unflatten object (reverse of flatten)
   */
  static unflatten(flatObj) {
    const result = {};

    for (const path in flatObj) {
      if (flatObj.hasOwnProperty(path)) {
        this.set(result, path, flatObj[path]);
      }
    }

    return result;
  }

  /**
   * Check if value is an object
   */
  static isObject(value) {
    return value !== null && typeof value === 'object';
  }

  /**
   * Parse path into keys array
   */
  static parsePath(path) {
    if (typeof path !== 'string') return [];
    
    // Handle array indices and nested objects
    return path.split('.').map(key => {
      return !isNaN(key) ? parseInt(key) : key;
    });
  }
}

module.exports = DotNotation;