/**
 * Servidor principal — Express + Socket.IO + SQLite
 * Sin Firebase. Estado autoritativo en el servidor.
 */
require('dotenv').config();

const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const { initDb } = require('./db');
const { setupSockets } = require('./sockets');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const playerRoutes = require('./routes/playerRoutes');
const worldRoutes = require('./routes/worldRoutes');

const PORT = process.env.PORT || 3000;
const CORS_ORIGINS = (process.env.CORS_ORIGINS ||
  'http://localhost:3000,http://127.0.0.1:3000,https://randyraulbr1.github.io')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

initDb();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  }
});

app.set('io', io);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || CORS_ORIGINS.includes(origin) || CORS_ORIGINS.includes('*')) {
      return cb(null, true);
    }
    cb(new Error('CORS bloqueado: ' + origin));
  },
  credentials: true
}));
app.use(express.json());

// API REST
app.use('/api', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/player', playerRoutes);
app.use('/api/world', worldRoutes);

// Panel admin
app.use('/admin', express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Cliente del juego
app.use(express.static(path.join(__dirname, '..', 'client')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'mariel-online-server', time: new Date().toISOString() });
});

setupSockets(io);

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🌍 Mariel Online Server');
  console.log('   Juego:  http://localhost:' + PORT + '/');
  console.log('   Admin:  http://localhost:' + PORT + '/admin');
  console.log('   API:    http://localhost:' + PORT + '/api');
  console.log('   CORS:   ' + CORS_ORIGINS.join(', '));
  console.log('');
});
