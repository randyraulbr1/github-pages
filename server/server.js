/**
 * Servidor principal — Express + Socket.IO + SQLite
 * Sin Firebase. Estado autoritativo en el servidor.
 * Plan gratis Render: cuentas respaldadas en GitHub (datos/mundo.json).
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
const friendRoutes = require('./routes/friendRoutes');
const chatRoutes = require('./routes/chatRoutes');

const PORT = process.env.PORT || 3000;
const CORS_ORIGINS = (() => {
  const fijos = [
    'https://tcodm.com',
    'https://www.tcodm.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://randyraulbr1.github.io'
  ];
  const env = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(s => s && s !== 'value' && s.startsWith('http'));
  return [...new Set([...fijos, ...env])];
})();

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

app.use('/api', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/player', playerRoutes);
app.use('/api/world', worldRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/chat', chatRoutes);

app.use('/admin', express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use('/client', express.static(path.join(__dirname, '..', 'client')));
app.use('/lib', express.static(path.join(__dirname, '..', 'lib')));
app.use(express.static(path.join(__dirname, '..', 'client')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

app.use('/online', express.static(path.join(__dirname, '..', 'online')));
app.get('/online', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'online', 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'mariel-online-server', time: new Date().toISOString() });
});

setupSockets(io);

async function arrancar() {
  try {
    const { validarGithubToken } = require('./syncStatus');
    const tok = await validarGithubToken();
    if (tok.ok) console.log('   GITHUB_TOKEN: válido');
    else console.warn('   ⚠️ GITHUB_TOKEN:', tok.reason);
  } catch (e) { /* */ }

  try {
    const { programarBackupDiario } = require('./backupDiario');
    programarBackupDiario();
  } catch (e) {
    console.warn('   backupDiario:', e.message);
  }

  try {
    const { restaurarMundoAlArranque, recuperarJugadoresPerdidos } = require('./importSnapshot');
    await restaurarMundoAlArranque();
    await recuperarJugadoresPerdidos();
  } catch (e) {
    console.warn('   restaurarMundoAlArranque:', e.message);
  }

  try {
    const { countUsers, reconciliarCuentasEnSnapshot, purgarCuentasFueraDeSnapshot } = require('./syncCuentas');
    const { getWorldSnapshot } = require('./db');
    const snap = getWorldSnapshot();
    if (snap?.jugadores?.length) {
      const purga = purgarCuentasFueraDeSnapshot(snap);
      if (purga.removed > 0) {
        console.log('   Cuentas SQLite purgadas (no están en snapshot):', purga.removed);
      }
    }
    const n = countUsers();
    const rec = reconciliarCuentasEnSnapshot();
    console.log('   Usuarios en BD:', n, '| Jugadores en snapshot:', rec.total);
    if (!process.env.GITHUB_TOKEN) {
      console.warn('   ⚠️ GITHUB_TOKEN no configurado — nuevas cuentas NO se respaldan en GitHub');
    }
  } catch (e) {
    console.warn('   syncCuentas al arranque:', e.message);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('🌍 Mariel Online Server (plan gratis — cuentas en GitHub)');
    console.log('   Juego:  http://localhost:' + PORT + '/');
    console.log('   Admin:  http://localhost:' + PORT + '/admin');
    console.log('   API:    http://localhost:' + PORT + '/api');
    console.log('   CORS:   ' + CORS_ORIGINS.join(', '));
    console.log('');
  });
}

arrancar().catch((e) => {
  console.error('Error al arrancar:', e);
  process.exit(1);
});
