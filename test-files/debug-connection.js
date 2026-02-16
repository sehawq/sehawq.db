const io = require('socket.io-client');
const axios = require('axios');

async function debug() {
    console.log('🔍 Debugging SehawqDB Connection...');

    // 1. Login to get Token
    console.log('1. Attempting Login...');
    try {
        const res = await axios.post('http://localhost:3000/api/login', {
            username: 'admin',
            password: 'admin123'
        });

        if (!res.data.success) {
            console.error('❌ Login Failed:', res.data);
            return;
        }

        const token = res.data.token;
        console.log('✅ Login Success! Token:', token.substring(0, 15) + '...');

        // 2. Try WebSocket Connection
        console.log('2. Connecting to WebSocket...');
        const socket = io('http://localhost:3000', {
            auth: { token: token },
            transports: ['websocket', 'polling'] // Force websocket to test
        });

        socket.on('connect', () => {
            console.log('✅ WebSocket Connected via ' + socket.io.engine.transport.name);
            console.log('🎉 EVERYTHING LOOKS GOOD HERE!');
            socket.disconnect();
        });

        socket.on('connect_error', (err) => {
            console.error('❌ WebSocket Connection Error:', err.message);
            // Print details if any
            if (err.data) console.error('Error Data:', err.data);
            socket.close();
        });

        socket.on('disconnect', (reason) => {
            console.log('⚠️ Disconnected:', reason);
        });

    } catch (e) {
        console.error('❌ HTTP Error:', e.message);
        if (e.cause) console.error('Cause:', e.cause);
        if (e.code) console.error('Code:', e.code);
        if (e.response) {
            console.error('Status:', e.response.status);
            console.error('Data:', e.response.data);
        }
    }
}

debug();
