/**
 * Data Validator - Keeps your data clean and proper 🧼
 * 
 * Because garbage in, garbage out is a real thing
 * Validates everything from emails to custom business rules
 */

class Validator {
  constructor() {
    this.rules = new Map();
    this.customValidators = new Map();
    
    this._setupBuiltinRules();
  }

  /**
   * Setup built-in validation rules
   */
  _setupBuiltinRules() {
    // Type validators
    this.rules.set('string', value => typeof value === 'string');
    this.rules.set('number', value => typeof value === 'number' && !isNaN(value));
    this.rules.set('boolean', value => typeof value === 'boolean');
    this.rules.set('array', value => Array.isArray(value));
    this.rules.set('object', value => value && typeof value === 'object' && !Array.isArray(value));
    this.rules.set('function', value => typeof value === 'function');
    this.rules.set('null', value => value === null);
    this.rules.set('undefined', value => value === undefined);

    // Common format validators
    this.rules.set('email', value => 
      typeof value === 'string' && 
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    );

    this.rules.set('url', value => {
      if (typeof value !== 'string') return false;
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    });

    this.rules.set('uuid', value =>
      typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    );

    this.rules.set('date', value => 
      value instanceof Date && !isNaN(value.getTime())
    );

    this.rules.set('hexColor', value =>
      typeof value === 'string' &&
      /^#?([0-9A-F]{3}|[0-9A-F]{6})$/i.test(value)
    );

    // Comparison validators
    this.rules.set('min', (value, min) => {
      if (typeof value === 'number') return value >= min;
      if (typeof value === 'string' || Array.isArray(value)) return value.length >= min;
      return false;
    });

    this.rules.set('max', (value, max) => {
      if (typeof value === 'number') return value <= max;
      if (typeof value === 'string' || Array.isArray(value)) return value.length <= max;
      return false;
    });

    this.rules.set('range', (value, [min, max]) => {
      if (typeof value !== 'number') return false;
      return value >= min && value <= max;
    });

    this.rules.set('minLength', (value, min) => 
      (typeof value === 'string' || Array.isArray(value)) && value.length >= min
    );

    this.rules.set('maxLength', (value, max) => 
      (typeof value === 'string' || Array.isArray(value)) && value.length <= max
    );

    this.rules.set('length', (value, length) => 
      (typeof value === 'string' || Array.isArray(value)) && value.length === length
    );

    // Pattern validators
    this.rules.set('pattern', (value, pattern) => 
      typeof value === 'string' && pattern.test(value)
    );

    this.rules.set('alphanumeric', value => 
      typeof value === 'string' && /^[a-zA-Z0-9]+$/.test(value)
    );

    this.rules.set('numeric', value => 
      typeof value === 'string' && /^\d+$/.test(value)
    );

    // Collection validators
    this.rules.set('in', (value, allowed) => 
      Array.isArray(allowed) && allowed.includes(value)
    );

    this.rules.set('notIn', (value, disallowed) => 
      Array.isArray(disallowed) && !disallowed.includes(value)
    );

    // Special validators
    this.rules.set('required', value => 
      value !== null && value !== undefined && value !== ''
    );

    this.rules.set('optional', () => true);
  }

  /**
   * Add custom validator
   */
  addRule(name, validatorFn) {
    if (this.rules.has(name) || this.customValidators.has(name)) {
      throw new Error(`Validator '${name}' already exists`);
    }
    
    this.customValidators.set(name, validatorFn);
    return this;
  }

  /**
   * Remove validator
   */
  removeRule(name) {
    this.rules.delete(name);
    this.customValidators.delete(name);
    return this;
  }

  /**
   * Validate single value against rules
   */
  validateValue(value, rules) {
    const errors = [];

    for (const rule of rules) {
      const [ruleName, ...ruleArgs] = Array.isArray(rule) ? rule : [rule];
      
      let isValid = false;
      
      // Check built-in rules first
      if (this.rules.has(ruleName)) {
        const validator = this.rules.get(ruleName);
        isValid = validator(value, ...ruleArgs);
      }
      // Check custom rules
      else if (this.customValidators.has(ruleName)) {
        const validator = this.customValidators.get(ruleName);
        isValid = validator(value, ...ruleArgs);
      }
      else {
        errors.push(`Unknown validation rule: ${ruleName}`);
        continue;
      }

      if (!isValid) {
        errors.push(this._formatError(ruleName, ruleArgs, value));
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      value
    };
  }

  /**
   * Validate object against schema
   */
  validateObject(obj, schema) {
    const errors = {};
    let isValid = true;

    for (const [field, fieldRules] of Object.entries(schema)) {
      const value = obj[field];
      const result = this.validateValue(value, fieldRules);
      
      if (!result.isValid) {
        errors[field] = result.errors;
        isValid = false;
      }
    }

    return {
      isValid,
      errors,
      data: obj
    };
  }

  /**
   * Create schema validator
   */
  schema(schemaDef) {
    return (data) => this.validateObject(data, schemaDef);
  }

  /**
   * Format validation error
   */
  _formatError(rule, args, value) {
    const valueStr = typeof value === 'string' ? `"${value}"` : JSON.stringify(value);
    
    switch (rule) {
      case 'required':
        return 'Field is required';
      case 'min':
        return `Value must be at least ${args[0]}`;
      case 'max':
        return `Value must be at most ${args[0]}`;
      case 'minLength':
        return `Length must be at least ${args[0]} characters`;
      case 'maxLength':
        return `Length must be at most ${args[0]} characters`;
      case 'length':
        return `Length must be exactly ${args[0]} characters`;
      case 'range':
        return `Value must be between ${args[0][0]} and ${args[0][1]}`;
      case 'email':
        return 'Must be a valid email address';
      case 'url':
        return 'Must be a valid URL';
      case 'uuid':
        return 'Must be a valid UUID';
      case 'pattern':
        return 'Value does not match required pattern';
      case 'in':
        return `Value must be one of: ${args[0].join(', ')}`;
      case 'notIn':
        return `Value must not be one of: ${args[0].join(', ')}`;
      default:
        return `Failed validation: ${rule}`;
    }
  }

  /**
   * Quick validators (static methods)
   */
  static isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  static isURL(value) {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }

  static isDate(value) {
    return value instanceof Date && !isNaN(value.getTime());
  }

  static isNumber(value) {
    return typeof value === 'number' && !isNaN(value);
  }

  static isString(value) {
    return typeof value === 'string';
  }

  static isArray(value) {
    return Array.isArray(value);
  }

  static isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }

  static isEmpty(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
  }

  /**
   * Sanitize functions
   */
  static trim(value) {
    return typeof value === 'string' ? value.trim() : value;
  }

  static toLowerCase(value) {
    return typeof value === 'string' ? value.toLowerCase() : value;
  }

  static toUpperCase(value) {
    return typeof value === 'string' ? value.toUpperCase() : value;
  }

  static toNumber(value) {
    if (typeof value === 'number') return value;
    const num = parseFloat(value);
    return isNaN(num) ? value : num;
  }

  static toBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true' || value === '1';
    }
    return !!value;
  }
}

// Export singleton instance
const validator = new Validator();
module.exports = validator;
module.exports.Validator = Validator;