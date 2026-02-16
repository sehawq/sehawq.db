// Version info
// reads from package.json so we dont have to update it in two places

const pkg = require('../package.json');

module.exports = {
  version: pkg.version,
  name: pkg.name,
  description: pkg.description,
  author: pkg.author,
  license: pkg.license,

  getVersion() { return this.version; },

  getInfo() {
    return {
      name: this.name,
      version: this.version,
      description: this.description,
      author: this.author
    };
  },

  // check if a version is compatible with current
  // major must match, minor can be same or higher
  isCompatibleWith(ver) {
    const cur = this.version.split('.').map(Number);
    const target = ver.split('.').map(Number);
    return cur[0] === target[0] && cur[1] >= target[1];
  }
};