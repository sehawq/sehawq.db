// Bun Compatibility Adapter
// Bun is mostly node-compatible so this is pretty thin.
// We just handle a few edge cases where Bun.file differs from fs.

const isBun = typeof Bun !== 'undefined';

// bun supports most node apis natively, but some stuff
// behaves slightly different. This adapter smooths things out.

function patchFS() {
    if (!isBun) return; // nothing to do on node

    const fs = require('fs');
    const origReadFile = fs.promises.readFile;

    // bun's readFile can sometimes return a Blob instead of string
    // in older versions - this wrapper ensures utf8 string output
    fs.promises.readFile = async function (path, encoding) {
        const result = await origReadFile(path, encoding);
        if (typeof result !== 'string' && encoding === 'utf8') {
            return result.toString();
        }
        return result;
    };
}

// bun has its own file API thats actually faster
// but for compatibility we stick with node fs
function getBunFile(path) {
    if (!isBun) return null;
    return Bun.file(path);
}

// bun supports workers differently
function getWorkerCompat() {
    if (!isBun) return null;
    // placeholder for future worker-based features
    return {
        available: true,
        // TODO: implement worker pool for heavy queries
    };
}

module.exports = {
    isBun,
    patchFS,
    getBunFile,
    getWorkerCompat
};
