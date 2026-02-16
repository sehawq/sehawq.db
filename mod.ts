// SehawqDB — Deno Entry Point
// import { createDB } from './mod.ts'
//
// this is the standard deno convention for module entry

// @ts-nocheck
// deno-lint-ignore-file

import './src/compat/deno.js';

// re-export everything from main module
// deno needs explicit file extensions
export { default as SehawqDB } from './src/index.js';

// helper to create a DB instance quickly
export function createDB(opts = {}) {
    const { default: DB } = require('./src/index.js');
    return new DB(opts);
}
