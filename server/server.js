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
app.use(express.json({ limit: '15mb' }));

app.use('/api', authRoutes);
app.use('/api/player', playerRoutes);
app.use('/api/world', worldRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/chat', chatRoutes);

// Panel admin web retirado: el admin del juego es el botón 🛠️ en tcodm.com (cuenta Randy/SoyCaos).
app.get('/admin', (req, res) => {
  res.redirect(302, 'https://tcodm.com');
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
  const { assertProductionSecrets, warnProductionConfig } = require('./auth');
  assertProductionSecrets();
  warnProductionConfig();

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
    const { iniciarRespaldoThrottle } = require('./respaldoThrottle');
    iniciarRespaldoThrottle();
    console.log('   Respaldo GitHub: throttle 10 min activo');
  } catch (e) {
    console.warn('   respaldoThrottle:', e.message);
  }

  try {
    const { restaurarMundoAlArranque, recuperarJugadoresPerdidos, leerMundoJson } = require('./importSnapshot');
    const { countUsers, reconciliarCuentasEnSnapshot, purgarCuentasFueraDeSnapshot } = require('./syncCuentas');
    await restaurarMundoAlArranque();
    await recuperarJugadoresPerdidos(io);
    const archivo = leerMundoJson();
    if (archivo?.soloAdmin && process.env.ALLOW_SOLO_ADMIN_PURGE === '1') {
      const { dejarSoloAdminEnSnapshot } = require('./syncCuentas');
      const { getWorldSnapshot } = require('./db');
      const { pushMundoToGitHub } = require('./githubMundo');
      const { respaldarJugadoresEnGitHub } = require('./jugadoresBackup');
      const purge = await dejarSoloAdminEnSnapshot({ io });
      console.log('[mundo] soloAdmin al arranque:', purge.eliminados?.join(', ') || 'ok');
      const snap = getWorldSnapshot();
      if (snap) {
        delete snap.soloAdmin;
        await pushMundoToGitHub(snap, { mensaje: 'solo admin tras purge' }).catch(() => {});
        await respaldarJugadoresEnGitHub(snap).catch(() => {});
      }
    } else if (archivo?.soloAdmin) {
      console.warn('[mundo] soloAdmin en mundo.json ignorado (falta ALLOW_SOLO_ADMIN_PURGE=1)');
    }
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

    try {
      const snapNow = getWorldSnapshot();
      const { migrarWorldContentSiVacio, validarDobleLecturaMundo } = require('./worldContent');
      const mig = migrarWorldContentSiVacio(snapNow);
      if (mig.migrated) {
        console.log('   world_content: migración OK —', mig.count, 'filas');
      }
      const val = validarDobleLecturaMundo(snapNow);
      if (val.ok) {
        console.log('   world_content: doble lectura OK (diff mapa vacío)');
      } else if (val.reason) {
        console.warn('   world_content: doble lectura omitida —', val.reason);
      } else {
        console.warn('   world_content: doble lectura —', val.diffCount, 'diff(s):', val.resumen);
      }
    } catch (e) {
      console.warn('   world_content Fase 3:', e.message);
    }

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
    console.log('   API:    http://localhost:' + PORT + '/api');
    console.log('   CORS:   ' + CORS_ORIGINS.join(', '));
    console.log('');
  });
}

arrancar().catch((e) => {
  console.error('Error al arrancar:', e);
  process.exit(1);
});
