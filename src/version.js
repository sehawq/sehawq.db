/**
 * SehawqDB Version Information
 * 
 * Because knowing your version is kinda important 😅
 */

const packageJson = require('../package.json');

module.exports = {
  version: packageJson.version,
  name: packageJson.name,
  description: packageJson.description,
  author: packageJson.author,
  license: packageJson.license,
  
  getVersion() {
    return this.version;
  },
  
  getInfo() {
    return {
      name: this.name,
      version: this.version,
      description: this.description,
      author: this.author,
      license: this.license
    };
  },
  
  // Compatibility check
  isCompatibleWith(version) {
    const current = this.version.split('.').map(Number);
    const target = version.split('.').map(Number);
    
    // Major version must match, minor can be equal or higher
    return current[0] === target[0] && current[1] >= target[1];
  }
};