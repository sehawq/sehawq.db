#!/usr/bin/env node

// SehawqDB CLI 🛠️
// npx sehawq <command>
// quick shortcuts so you dont have to write a script for everything

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const http = require('http');

const args = process.argv.slice(2);
const cmd = args[0];

// colors (ansi, no deps needed)
const c = {
    r: '\x1b[0m',    // reset
    g: '\x1b[32m',   // green
    y: '\x1b[33m',   // yellow
    b: '\x1b[36m',   // cyan
    d: '\x1b[90m',   // dim
    bold: '\x1b[1m'
};

function log(msg) { console.log(msg); }
function ok(msg) { log(`${c.g}✓${c.r} ${msg}`); }
function warn(msg) { log(`${c.y}⚠${c.r} ${msg}`); }
function info(msg) { log(`${c.b}ℹ${c.r} ${msg}`); }

// ---- COMMANDS ----

function showHelp() {
    log(`
${c.bold}SehawqDB CLI${c.r} ${c.d}v5.0${c.r}

${c.b}Usage:${c.r}  sehawq <command> [options]

${c.b}Commands:${c.r}
  init              Create new project (start.js + config)
  start             Start server
  dashboard         Open Dashboard in browser
  export [--csv]    Export data as JSON/CSV
  import <file>     Import data from JSON file
  migrate           Run pending migrations
  status            Show DB stats

${c.b}Examples:${c.r}
  ${c.d}$ sehawq init${c.r}
  ${c.d}$ sehawq start${c.r}
  ${c.d}$ sehawq export > backup.json${c.r}
  ${c.d}$ sehawq import data.json${c.r}
`);
}

function cmdInit() {
    // create starter files
    const startFile = `const SehawqDB = require('sehawq.db');

const db = new SehawqDB({
  path: './data/sehawq.json',
  enableServer: true,
  enableRealtime: true,
  serverPort: 3000,
  debug: true
});

// auth plugin (optional)
const auth = require('sehawq.db/src/plugins/auth');
db.use(auth, {
  secret: 'change-this-secret',
  superUser: { user: 'admin', pass: 'admin123' }
});

db.start().then(() => {
  console.log('SehawqDB Ready!');
  console.log('Dashboard: http://localhost:3000/dashboard');
});
`;

    if (fs.existsSync('start.js')) {
        warn('start.js already exists, skipping overwrite');
    } else {
        fs.writeFileSync('start.js', startFile);
        ok('start.js created');
    }

    // data folder
    if (!fs.existsSync('data')) {
        fs.mkdirSync('data', { recursive: true });
        ok('data/ folder created');
    }

    info('To start: node start.js');
}

function cmdStart() {
    // execute start.js if exists
    const entry = fs.existsSync('start.js') ? 'start.js' : null;
    if (!entry) {
        warn('start.js not found. Run "sehawq init" first.');
        process.exit(1);
    }

    info('Starting server...');
    try {
        // inherit stdio so user sees the output
        require('child_process').spawn('node', [entry], { stdio: 'inherit' });
    } catch (e) {
        warn('startup error: ' + e.message);
    }
}

function cmdDashboard() {
    const port = args[1] || 3000;
    const url = `http://localhost:${port}/dashboard`;

    info(`Opening Dashboard: ${url}`);

    // platform-specific open command
    const plat = process.platform;
    try {
        if (plat === 'win32') execSync(`start ${url}`);
        else if (plat === 'darwin') execSync(`open ${url}`);
        else execSync(`xdg-open ${url}`);
    } catch {
        warn(`Could not open browser, open manually: ${url}`);
    }
}

function cmdExport() {
    const port = args.includes('--port') ? args[args.indexOf('--port') + 1] : 3000;
    const asCSV = args.includes('--csv');

    // fetch data from running server
    httpGet(`http://localhost:${port}/api/data`, (err, body) => {
        if (err) {
            warn('Could not connect to server. Is it running?');
            process.exit(1);
        }

        try {
            const resp = JSON.parse(body);
            const data = resp.data || {};

            if (asCSV) {
                // simple csv conversion
                const keys = Object.keys(data);
                log('key,value');
                for (const k of keys) {
                    const v = typeof data[k] === 'object' ? JSON.stringify(data[k]) : data[k];
                    log(`"${k}","${String(v).replace(/"/g, '""')}"`);
                }
            } else {
                log(JSON.stringify(data, null, 2));
            }
        } catch (e) {
            warn('parse error: ' + e.message);
        }
    });
}

function cmdImport() {
    const file = args[1];
    if (!file) {
        warn('specify file: sehawq import data.json');
        process.exit(1);
    }

    if (!fs.existsSync(file)) {
        warn(`file not found: ${file}`);
        process.exit(1);
    }

    const raw = fs.readFileSync(file, 'utf8');
    let data;
    try {
        data = JSON.parse(raw);
    } catch {
        warn('invalid JSON file');
        process.exit(1);
    }

    const port = args.includes('--port') ? args[args.indexOf('--port') + 1] : 3000;
    const body = JSON.stringify(data);

    const opts = {
        hostname: 'localhost',
        port,
        path: '/api/import',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
        }
    };

    const req = http.request(opts, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
            try {
                const r = JSON.parse(d);
                if (r.success) ok(`${r.imported} records imported`);
                else warn('import error: ' + (r.error || 'unknown'));
            } catch {
                warn('unexpected response');
            }
        });
    });

    req.on('error', () => warn('could not connect to server'));
    req.write(body);
    req.end();
}

function cmdMigrate() {
    const entry = fs.existsSync('start.js') ? 'start.js' : null;
    if (!entry) {
        warn('start.js not found');
        process.exit(1);
    }

    info('Running migrations...');
    // we need to load the db and run migrations
    // kinda hacky but it works
    try {
        const SehawqDB = require(path.resolve('node_modules/sehawq.db'));
        const db = new SehawqDB({ path: './data/sehawq.json' });
        db.start().then(() => {
            const status = db.migrationStatus();
            if (status.pending === 0) {
                ok('no pending migrations');
            } else {
                info(`${status.pending} migrations pending...`);
                db.runMigrations().then(n => {
                    ok(`${n} migrations applied`);
                    db.stop();
                });
            }
        });
    } catch (e) {
        warn('migration error: ' + e.message);
        // try via API if server running
        info('trying via API...');
    }
}

function cmdStatus() {
    const port = args.includes('--port') ? args[args.indexOf('--port') + 1] : 3000;

    httpGet(`http://localhost:${port}/api/stats`, (err, body) => {
        if (err) {
            warn('could not connect to server');
            process.exit(1);
        }

        try {
            const stats = JSON.parse(body);
            log('');
            log(`${c.bold}SehawqDB Status${c.r}`);
            log(`${c.d}─────────────────────${c.r}`);

            if (stats.database) {
                const db = stats.database;
                log(`  Records:       ${c.g}${db.size}${c.r}`);
                log(`  Reads:         ${db.reads}`);
                log(`  Writes:        ${db.writes}`);
                log(`  Cache hit:     ${db.rate}`);
                log(`  TTL keys:      ${db.ttlKeys}`);
            }

            if (stats.server) {
                const s = stats.server;
                const uptime = Math.floor(s.uptime);
                const mins = Math.floor(uptime / 60);
                const secs = uptime % 60;
                log(`  Uptime:        ${mins}m ${secs}s`);
            }

            log('');
        } catch {
            warn('could not parse response');
        }
    });
}

// simple http get helper, no deps
function httpGet(url, cb) {
    http.get(url, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => cb(null, data));
    }).on('error', (e) => cb(e));
}

// ---- ROUTER ----

switch (cmd) {
    case 'init': cmdInit(); break;
    case 'start': cmdStart(); break;
    case 'dashboard': cmdDashboard(); break;
    case 'export': cmdExport(); break;
    case 'import': cmdImport(); break;
    case 'migrate': cmdMigrate(); break;
    case 'status': cmdStatus(); break;
    case '--help': case '-h': case undefined:
        showHelp(); break;
    default:
        warn(`unknown command: ${cmd}`);
        showHelp();
}
