// Deno Compatibility Adapter
// Wraps Node-specific APIs so SehawqDB core can run on Deno
// 
// usage (deno):
//   import { createDB } from './mod.ts'
//   const db = createDB({ path: './data.json' })
//
// this is experimental, dont expect everything to work perfectly

const isDeno = typeof Deno !== 'undefined';

// polyfill fs.promises for deno
function createFS() {
    if (!isDeno) return require('fs').promises;

    return {
        async readFile(path, encoding) {
            return await Deno.readTextFile(path);
        },

        async writeFile(path, data, encoding) {
            await Deno.writeTextFile(path, data);
        },

        async rename(from, to) {
            await Deno.rename(from, to);
        },

        async unlink(path) {
            await Deno.remove(path);
        },

        async access(path) {
            // deno doesnt have fs.access, use stat instead
            try {
                await Deno.stat(path);
            } catch {
                throw { code: 'ENOENT' };
            }
        },

        async mkdir(path, opts = {}) {
            try {
                await Deno.mkdir(path, opts);
            } catch (e) {
                if (!e.message.includes('exists')) throw e;
            }
        },

        async readdir(path) {
            const entries = [];
            for await (const entry of Deno.readDir(path)) {
                entries.push(entry.name);
            }
            return entries;
        },

        async copyFile(src, dest) {
            await Deno.copyFile(src, dest);
        },

        // file handle polyfill (for WAL append)
        async open(path, flags) {
            // 'a' flag = append
            const file = await Deno.open(path, {
                write: true,
                create: true,
                append: flags === 'a'
            });

            return {
                async write(str) {
                    const enc = new TextEncoder();
                    await file.write(enc.encode(str));
                },
                async close() {
                    file.close();
                }
            };
        }
    };
}

// polyfill path module
function createPath() {
    if (!isDeno) return require('path');

    // basic path utils, good enough for our needs
    return {
        dirname(p) {
            const parts = p.replace(/\\/g, '/').split('/');
            parts.pop();
            return parts.join('/') || '.';
        },
        basename(p) {
            const parts = p.replace(/\\/g, '/').split('/');
            return parts[parts.length - 1];
        },
        join(...parts) {
            return parts.join('/').replace(/\/+/g, '/');
        }
    };
}

// polyfill perf_hooks
function createPerf() {
    if (!isDeno) return require('perf_hooks');
    return { performance: globalThis.performance };
}

module.exports = {
    isDeno,
    fs: createFS(),
    path: createPath(),
    perf: createPerf()
};
