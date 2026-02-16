const Sehawq = require('./src/index');
const TimestampPlugin = require('./src/plugins/timestamp');
const WebhookPlugin = require('./src/plugins/webhook');
const AuthPlugin = require('./src/plugins/auth');

// Config
const PORT = process.env.PORT || 3000;

// Initialize
const db = new Sehawq({
    path: './sehawq-data.json', // Main data file
    enableServer: true,
    serverPort: PORT,
    enableRealtime: true,
    debug: true
});

// Load Plugins (Ecosystem 🌟)
db.use(TimestampPlugin);
db.use(AuthPlugin, {
    secret: 'super-secret-key-123',
    superUser: { user: 'admin', pass: '123' }
});

// Start
db.start().then(() => {
    console.log(`
  🦅 SehawqDB v5.0 Started!
  
  - 🌍 API:        http://localhost:${PORT}
  - ⚡ Realtime:   ws://localhost:${PORT}
  - 📊 Dashboard:  http://localhost:${PORT}/dashboard
  `);
}).catch(err => {
    console.error('Fatal Error:', err);
});
