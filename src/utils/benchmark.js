// Path utility functions for nested object access

function getByPath(obj, pathStr) {
  if (!pathStr) return obj;
  
  const keys = pathStr.split(".");
  let result = obj;
  
  for (const k of keys) {
    if (result && Object.prototype.hasOwnProperty.call(result, k)) {
      result = result[k];
    } else {
      return undefined;
    }
  }
  
  return result;
}

function setByPath(obj, pathStr, value) {
  const keys = pathStr.split(".");
  let current = obj;
  
  while (keys.length > 1) {
    const k = keys.shift();
    if (!current[k] || typeof current[k] !== "object") {
      current[k] = {};
    }
    current = current[k];
  }
  
  current[keys[0]] = value;
}

function deleteByPath(obj, pathStr) {
  const keys = pathStr.split(".");
  let current = obj;
  
  while (keys.length > 1) {
    const k = keys.shift();
    if (!current[k]) return;
    current = current[k];
  }
  
  delete current[keys[0]];
}

module.exports = {
  getByPath,
  setByPath,
  deleteByPath
};