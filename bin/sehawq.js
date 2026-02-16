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
  init              Yeni proje oluştur (start.js + config)
  start             Sunucuyu başlat
  dashboard         Dashboard'u tarayıcıda aç
  export [--csv]    Veriyi JSON/CSV olarak dışa aktar
  import <dosya>    JSON dosyasından veri yükle
  migrate           Bekleyen migration'ları çalıştır
  status            DB istatistiklerini göster

${c.b}Örnekler:${c.r}
  ${c.d}$ sehawq init${c.r}
  ${c.d}$ sehawq start${c.r}
  ${c.d}$ sehawq export > backup.json${c.r}
  ${c.d}$ sehawq import data.json${c.r}
`);
}

function cmdInit() {
    // starter dosyaları oluştur
    const startFile = `const SehawqDB = require('sehawq.db');

const db = new SehawqDB({
  path: './data/sehawq.json',
  enableServer: true,
  enableRealtime: true,
  serverPort: 3000,
  debug: true
});

// auth plugin (opsiyonel)
const auth = require('sehawq.db/src/plugins/auth');
db.use(auth, {
  secret: 'change-this-secret',
  superUser: { user: 'admin', pass: 'admin123' }
});

db.start().then(() => {
  console.log('SehawqDB hazır!');
  console.log('Dashboard: http://localhost:3000/dashboard');
});
`;

    if (fs.existsSync('start.js')) {
        warn('start.js zaten var, üstüne yazmıyorum');
    } else {
        fs.writeFileSync('start.js', startFile);
        ok('start.js oluşturuldu');
    }

    // data klasörü
    if (!fs.existsSync('data')) {
        fs.mkdirSync('data', { recursive: true });
        ok('data/ klasörü oluşturuldu');
    }

    info('Başlamak için: node start.js');
}

function cmdStart() {
    // start.js varsa onu çalıştır
    const entry = fs.existsSync('start.js') ? 'start.js' : null;
    if (!entry) {
        warn('start.js bulunamadı. Önce "sehawq init" çalıştır.');
        process.exit(1);
    }

    info('Sunucu başlatılıyor...');
    try {
        // inherit stdio so user sees the output
        require('child_process').spawn('node', [entry], { stdio: 'inherit' });
    } catch (e) {
        warn('başlatma hatası: ' + e.message);
    }
}

function cmdDashboard() {
    const port = args[1] || 3000;
    const url = `http://localhost:${port}/dashboard`;

    info(`Dashboard açılıyor: ${url}`);

    // platform-specific open command
    const plat = process.platform;
    try {
        if (plat === 'win32') execSync(`start ${url}`);
        else if (plat === 'darwin') execSync(`open ${url}`);
        else execSync(`xdg-open ${url}`);
    } catch {
        warn(`Tarayıcı açılamadı, elle aç: ${url}`);
    }
}

function cmdExport() {
    const port = args.includes('--port') ? args[args.indexOf('--port') + 1] : 3000;
    const asCSV = args.includes('--csv');

    // fetch data from running server
    httpGet(`http://localhost:${port}/api/data`, (err, body) => {
        if (err) {
            warn('sunucuya bağlanılamadı. Sunucu çalışıyor mu?');
            process.exit(1);
        }

        try {
            const resp = JSON.parse(body);
            const data = resp.data || {};

            if (asCSV) {
                // basit csv dönüşümü
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
            warn('parse hatası: ' + e.message);
        }
    });
}

function cmdImport() {
    const file = args[1];
    if (!file) {
        warn('dosya belirt: sehawq import data.json');
        process.exit(1);
    }

    if (!fs.existsSync(file)) {
        warn(`dosya bulunamadı: ${file}`);
        process.exit(1);
    }

    const raw = fs.readFileSync(file, 'utf8');
    let data;
    try {
        data = JSON.parse(raw);
    } catch {
        warn('geçersiz JSON dosyası');
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
                if (r.success) ok(`${r.imported} kayıt yüklendi`);
                else warn('import hatası: ' + (r.error || 'bilinmeyen'));
            } catch {
                warn('beklenmeyen yanıt');
            }
        });
    });

    req.on('error', () => warn('sunucuya bağlanılamadı'));
    req.write(body);
    req.end();
}

function cmdMigrate() {
    const entry = fs.existsSync('start.js') ? 'start.js' : null;
    if (!entry) {
        warn('start.js bulunamadı');
        process.exit(1);
    }

    info('Migration çalıştırılıyor...');
    // we need to load the db and run migrations
    // kinda hacky but it works
    try {
        const SehawqDB = require(path.resolve('node_modules/sehawq.db'));
        const db = new SehawqDB({ path: './data/sehawq.json' });
        db.start().then(() => {
            const status = db.migrationStatus();
            if (status.pending === 0) {
                ok('bekleyen migration yok');
            } else {
                info(`${status.pending} migration bekliyor...`);
                db.runMigrations().then(n => {
                    ok(`${n} migration uygulandı`);
                    db.stop();
                });
            }
        });
    } catch (e) {
        warn('migration hatası: ' + e.message);
        // try via API if server running
        info('sunucu üzerinden deneniyor...');
    }
}

function cmdStatus() {
    const port = args.includes('--port') ? args[args.indexOf('--port') + 1] : 3000;

    httpGet(`http://localhost:${port}/api/stats`, (err, body) => {
        if (err) {
            warn('sunucuya bağlanılamadı');
            process.exit(1);
        }

        try {
            const stats = JSON.parse(body);
            log('');
            log(`${c.bold}SehawqDB Durumu${c.r}`);
            log(`${c.d}─────────────────────${c.r}`);

            if (stats.database) {
                const db = stats.database;
                log(`  Kayıt sayısı:  ${c.g}${db.size}${c.r}`);
                log(`  Okuma:         ${db.reads}`);
                log(`  Yazma:         ${db.writes}`);
                log(`  Cache hit:     ${db.rate}`);
                log(`  TTL anahtarı:  ${db.ttlKeys}`);
            }

            if (stats.server) {
                const s = stats.server;
                const uptime = Math.floor(s.uptime);
                const mins = Math.floor(uptime / 60);
                const secs = uptime % 60;
                log(`  Uptime:        ${mins}dk ${secs}sn`);
            }

            log('');
        } catch {
            warn('yanıt parse edilemedi');
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
        warn(`bilinmeyen komut: ${cmd}`);
        showHelp();
}
