// Data Validator 🧼
// Keeps data clean. Validates before saving so you dont end up
// with garbage in your database.

class Validator {
  constructor() {
    this.rules = new Map();
    this.custom = new Map();
    this._init();
  }

  _init() {
    // basic type checks
    this.rules.set('string', v => typeof v === 'string');
    this.rules.set('number', v => typeof v === 'number' && !isNaN(v));
    this.rules.set('boolean', v => typeof v === 'boolean');
    this.rules.set('array', v => Array.isArray(v));
    this.rules.set('object', v => v && typeof v === 'object' && !Array.isArray(v));
    this.rules.set('null', v => v === null);

    // format validators people actually use
    this.rules.set('email', v =>
      typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
    );

    this.rules.set('url', v => {
      if (typeof v !== 'string') return false;
      try { new URL(v); return true; } catch { return false; }
    });

    // comparison stuff
    this.rules.set('min', (v, min) => {
      if (typeof v === 'number') return v >= min;
      if (typeof v === 'string' || Array.isArray(v)) return v.length >= min;
      return false;
    });

    this.rules.set('max', (v, max) => {
      if (typeof v === 'number') return v <= max;
      if (typeof v === 'string' || Array.isArray(v)) return v.length <= max;
      return false;
    });

    this.rules.set('range', (v, [lo, hi]) => {
      return typeof v === 'number' && v >= lo && v <= hi;
    });

    this.rules.set('pattern', (v, pat) =>
      typeof v === 'string' && pat.test(v)
    );

    this.rules.set('in', (v, list) => Array.isArray(list) && list.includes(v));
    this.rules.set('required', v => v !== null && v !== undefined && v !== '');
    this.rules.set('optional', () => true); // always passes lol
  }

  // register a custom rule
  addRule(name, fn) {
    if (this.rules.has(name)) throw new Error(`'${name}' already exists`);
    this.custom.set(name, fn);
    return this;
  }

  removeRule(name) {
    this.rules.delete(name);
    this.custom.delete(name);
    return this;
  }

  // validate a single value against a list of rules
  validateValue(value, rules) {
    const errors = [];

    for (const rule of rules) {
      const [name, ...args] = Array.isArray(rule) ? rule : [rule];

      let valid = false;
      if (this.rules.has(name)) {
        valid = this.rules.get(name)(value, ...args);
      } else if (this.custom.has(name)) {
        valid = this.custom.get(name)(value, ...args);
      } else {
        errors.push(`unknown rule: ${name}`);
        continue;
      }

      if (!valid) errors.push(this._err(name, args, value));
    }

    return { isValid: errors.length === 0, errors, value };
  }

  // validate an object against a schema definition
  validateObject(obj, schema) {
    const errors = {};
    let ok = true;

    for (const [field, fieldRules] of Object.entries(schema)) {
      const result = this.validateValue(obj[field], fieldRules);
      if (!result.isValid) {
        errors[field] = result.errors;
        ok = false;
      }
    }

    return { isValid: ok, errors, data: obj };
  }

  // shorthand — returns a reusable validator function
  schema(def) {
    return (data) => this.validateObject(data, def);
  }

  _err(rule, args, value) {
    // not the prettiest error messages but they get the job done
    switch (rule) {
      case 'required': return 'field is required';
      case 'min': return `must be at least ${args[0]}`;
      case 'max': return `must be at most ${args[0]}`;
      case 'range': return `must be between ${args[0][0]} and ${args[0][1]}`;
      case 'email': return 'not a valid email';
      case 'url': return 'not a valid url';
      case 'pattern': return 'doesnt match pattern';
      case 'in': return `must be one of: ${args[0].join(', ')}`;
      default: return `failed: ${rule}`;
    }
  }

  // couple quick helpers for inline use
  static isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
  static isEmpty(v) {
    if (v == null) return true;
    if (typeof v === 'string') return !v.trim().length;
    if (Array.isArray(v)) return !v.length;
    if (typeof v === 'object') return !Object.keys(v).length;
    return false;
  }
}

// singleton export, most people just need one instance
const validator = new Validator();
module.exports = validator;
module.exports.Validator = Validator;