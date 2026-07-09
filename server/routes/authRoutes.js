/**
 * Rutas de registro y login de jugadores.
 * Fuente única de cuentas: SQLite (users + players + snapshot jugadores).
 */
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { limiteRegistro, ipCliente } = require('../rateLimit');
const {
  findUserByUsername,
  createUser,
  createPlayer,
  findPlayerByUserId,
  findPlayerByName,
  updateLastLogin,
  formatPlayer,
  getWorldSnapshot,
  getWorldSnapshotPublic,
  saveWorldSnapshot
} = require('../db');
const { hashPassword, comparePassword, signPlayerToken } = require('../auth');
const { mergeJugadoresPartidas } = require('../syncMundo');
const { forzarImportJugadores, leerMundoJson } = require('../importSnapshot');
const { getJugadoresPublicos, respaldarCuentasEnGitHub, respaldarCuentasEnGitHubInmediato, buscarJugadorPublico } = require('../syncCuentas');
const { leerAdminDesdeArchivo, esNombreAdmin } = require('../adminCuenta');
const { intentarRecuperarPorLogin, buscarEnEliminadosRecuperables } = require('../recoveryCuentas');
const { registrar } = require('../eventLog');
const { hashContenido } = require('../utils/githubPush');
const { getSyncStatus } = require('../syncStatus');

const router = express.Router();

function telefonoEnUso(telefono, excluirId) {
  const limpio = String(telefono || '').replace(/[\s-]/g, '');
  if (!limpio) return false;
  const snap = getWorldSnapshot();
  return (snap?.jugadores || []).some(j =>
    j?.id !== excluirId &&
    j?.telefono &&
    String(j.telefono).replace(/[\s-]/g, '') === limpio
  );
}

function sha256Pin(clave) {
  return crypto.createHash('sha256').update('pin-perfil|' + clave).digest('hex');
}

const ADMIN_LOGIN_NAMES = new Set(
  ['randy', 'soycaos', String(process.env.ADMIN_NOMBRE || 'SoyCaos').toLowerCase()]
    .concat(String(process.env.ADMIN_ALIASES || 'randy').split(','))
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
);

function buscarEnListaJugadores(jugadores, usuario) {
  if (!Array.isArray(jugadores) || !jugadores.length) return null;
  const u = usuario.trim().toLowerCase();
  const limpio = usuario.trim().replace(/[\s-]/g, '');
  return jugadores.find(j =>
    (j?.nombre && j.nombre.toLowerCase() === u) ||
    (j?.telefono && String(j.telefono).replace(/[\s-]/g, '') === limpio)
  ) || null;
}

function buscarJugadorSnapshot(usuario) {
  const hit = buscarJugadorPublico(usuario);
  if (hit) return hit;
  const snap = getWorldSnapshot();
  let found = buscarEnListaJugadores(snap?.jugadores, usuario);
  if (found) return found;
  try {
    const archivo = leerMundoJson();
    found = buscarEnListaJugadores(archivo?.jugadores, usuario);
    if (found) return found;
    const admin = leerAdminDesdeArchivo();
    if (admin && buscarEnListaJugadores([admin], usuario)) return admin;
  } catch (e) { /* */ }
  return null;
}

/** ¿Sigue en la lista publicada del admin? (cuentas eliminadas → false) */
function estaEnListaPublicada(usuario) {
  const snap = getWorldSnapshot();
  const u = usuario.trim().toLowerCase();
  const limpio = usuario.trim().replace(/[\s-]/g, '');
  if (!Array.isArray(snap?.jugadores) || !snap.jugadores.length) {
    if (ADMIN_LOGIN_NAMES.has(u)) return null;
    return null;
  }
  const enLista = snap.jugadores.some(j =>
    (j?.nombre && j.nombre.toLowerCase() === u) ||
    (j?.telefono && String(j.telefono).replace(/[\s-]/g, '') === limpio)
  );
  if (enLista) return true;
  if (ADMIN_LOGIN_NAMES.has(u)) return null;
  if (buscarJugadorSnapshot(usuario)) return null;
  return false;
}

function resolverNombreLogin(usuario, legacy) {
  if (legacy?.nombre) return String(legacy.nombre).trim();
  return usuario.trim();
}

/** Vuelve a poner la cuenta en la lista publicada tras login válido. */
function reinsertarJugadorEnSnapshot(perfil) {
  if (!perfil?.id || !perfil?.nombre) return;
  const snap = getWorldSnapshot() || { jugadores: [], partidas: {} };
  mergeJugadoresPartidas(snap, [{
    jugadores: [{
      id: perfil.id,
      nombre: perfil.nombre,
      telefono: perfil.telefono || '',
      pinHash: perfil.pinHash || '',
      creado: perfil.creado || Date.now()
    }]
  }]);
  snap.actualizadoEn = Date.now();
  saveWorldSnapshot(snap);
}

function perfilDesdeSqlite(user, player, clave) {
  const legacy = buscarJugadorSnapshot(user.username);
  if (legacy) return legacy;
  const snap = getWorldSnapshot();
  const j = (snap?.jugadores || []).find(x =>
    x?.nombre && x.nombre.toLowerCase() === String(player.name).toLowerCase()
  );
  if (j) return j;
  return {
    id: 'srv_' + player.id,
    nombre: player.name,
    telefono: '',
    pinHash: sha256Pin(clave),
    creado: Date.now()
  };
}

/** Versión del cliente (mismo dato que version.json en GitHub Pages). */
router.get('/public/version', (req, res) => {
  try {
    const p = path.join(__dirname, '..', '..', 'version.json');
    const raw = fs.readFileSync(p, 'utf8');
    const j = JSON.parse(raw);
    res.set('Cache-Control', 'no-store');
    return res.json({ ok: true, version: String(j.version || ''), actualizadoEn: j.actualizadoEn || 0 });
  } catch (e) {
    return res.json({ ok: true, version: process.env.APP_VERSION || '299', actualizadoEn: 0 });
  }
});

/** Mundo público (solo lectura) — fuente principal para el cliente */
router.get('/public/mundo', (req, res) => {
  try {
    const io = req.app.get('io');
    const { repararSnapshotMundo } = require('../syncCuentas');
    repararSnapshotMundo(io);
    const snap = getWorldSnapshotPublic();
    res.json({
      ok: true,
      mundo: snap || {
        misiones: [], tesoros: [], objetos: [], enemigos: [],
        posiciones: {}, eliminados: [], jugadores: [], partidas: {}
      },
      actualizadoEn: snap?.actualizadoEn || 0
    });
  } catch (e) {
    console.error('[public/mundo]', e.message);
    res.status(500).json({ ok: false, error: 'Error leyendo el mundo' });
  }
});

/** Cuentas del juego para login (desde snapshot SQLite + tabla users) */
router.get('/public/cuentas', (req, res) => {
  const io = req.app.get('io');
  const jugadores = getJugadoresPublicos(io);
  const snap = getWorldSnapshot();
  res.json({
    ok: true,
    jugadores,
    actualizadoEn: snap?.actualizadoEn || 0
  });
});

/** Diagnóstico ligero del mundo en servidor (hash para comparar con GitHub). */
router.get('/debug/world', (req, res) => {
  const snap = getWorldSnapshot();
  if (!snap) return res.json({ ok: false, error: 'sin snapshot' });
  res.json({
    ok: true,
    jugadores: (snap.jugadores || []).length,
    objetos: (snap.objetos || []).length,
    enemigos: (snap.enemigos || []).length,
    misiones: (snap.misiones || []).length,
    tesoros: (snap.tesoros || []).length,
    ultimaActualizacion: snap.actualizadoEn || 0,
    hash: hashContenido(snap)
  });
});

/** Solo versión del mundo (para polling ligero sin descargar todo el JSON). */
router.get('/public/mundo/version', (req, res) => {
  const snap = getWorldSnapshot();
  res.json({
    ok: true,
    actualizadoEn: snap?.actualizadoEn || 0,
    jugadores: (snap?.jugadores || []).length
  });
});

/** Buscar cuenta por nombre/teléfono (panel admin y amigos). */
router.get('/public/buscar-cuenta', (req, res) => {
  const q = (req.query.q || req.query.nombre || '').trim();
  if (!q) return res.status(400).json({ ok: false, error: 'Nombre requerido' });
  const hit = buscarJugadorPublico(q);
  if (!hit) return res.json({ ok: false, error: 'No se encontró esa cuenta' });
  res.json({ ok: true, jugador: hit });
});

/** Importar jugadores desde mundo.json hacia SQLite (una vez tras deploy) */
router.post('/public/import-jugadores', (req, res) => {
  const secret = process.env.IMPORT_SECRET || process.env.JWT_SECRET;
  const key = req.headers['x-import-key'] || req.body?.key;
  if (!secret || key !== secret) {
    return res.status(403).json({ ok: false, error: 'Clave de importación inválida' });
  }
  const result = forzarImportJugadores();
  res.json(result);
});

/**
 * Login unificado del juego:
 * 1) bcrypt en users
 * 2) migración legacy pinHash desde snapshot
 */
router.post('/login-game', (req, res) => {
  const usuario = (req.body.usuario || req.body.username || '').trim();
  const clave = req.body.password || req.body.clave || '';

  if (!usuario) {
    return res.status(400).json({ ok: false, error: 'Usuario requerido' });
  }
  if (!clave || clave.length < 4) {
    return res.status(400).json({ ok: false, error: 'Contraseña mínimo 4 caracteres' });
  }

  const snap = getWorldSnapshot();
  const eliminada = buscarEnEliminadosRecuperables(snap, usuario);
  if (eliminada) {
    return res.status(401).json({
      ok: false,
      error: 'Tu cuenta fue eliminada. Contacta al admin para restaurarla.',
      codigo: 'cuenta_eliminada'
    });
  }

  let legacy = buscarJugadorSnapshot(usuario);
  const nombreLogin = resolverNombreLogin(usuario, legacy);

  let user = findUserByUsername(nombreLogin);
  if (!user && nombreLogin !== usuario) user = findUserByUsername(usuario);
  if (user && comparePassword(clave, user.password_hash)) {
    const player = findPlayerByUserId(user.id);
    if (!player) return res.status(500).json({ ok: false, error: 'Jugador no encontrado' });
    const perfil = perfilDesdeSqlite(user, player, clave);
    reinsertarJugadorEnSnapshot(perfil);
    updateLastLogin(user.id);
    return res.json({
      ok: true,
      token: signPlayerToken(user, player),
      user: { id: user.id, username: user.username, role: user.role || 'jugador' },
      player: formatPlayer(player),
      perfil
    });
  }

  const rec = intentarRecuperarPorLogin(usuario);
  if (rec.accion === 'recuperada') {
    registrar('login_recovery', `Auto-recuperación en login: ${rec.jugador?.nombre}`);
    legacy = rec.jugador || legacy;
  } else if (rec.accion === 'ok') {
    legacy = rec.jugador || legacy;
  }

  const enLista = estaEnListaPublicada(usuario);
  if (enLista === false && !legacy && !user) {
    return res.status(401).json({
      ok: false,
      error: 'No estás registrado. Crea una cuenta nueva o pide al admin que te restaure.',
      codigo: 'no_registrado'
    });
  }

  legacy = legacy || buscarJugadorSnapshot(usuario) || rec.jugador || null;

  if (!legacy) {
    if (user) {
      return res.status(401).json({ ok: false, error: 'Contraseña incorrecta' });
    }
    if (enLista === true) {
      return res.status(401).json({ ok: false, error: 'Contraseña incorrecta' });
    }
    return res.status(401).json({ ok: false, error: 'No estás registrado', codigo: 'no_registrado' });
  }
  if (!legacy.pinHash) {
    return res.status(401).json({ ok: false, error: 'Cuenta sin contraseña. Pide al admin que la configure.' });
  }
  if (sha256Pin(clave) !== legacy.pinHash) {
    return res.status(401).json({ ok: false, error: 'Contraseña incorrecta' });
  }

  user = findUserByUsername(legacy.nombre);
  if (!user) {
    try {
      user = createUser(legacy.nombre, hashPassword(clave));
      createPlayer(user.id, legacy.nombre);
    } catch (e) {
      user = findUserByUsername(legacy.nombre);
      if (!user) {
        return res.status(500).json({ ok: false, error: 'No se pudo migrar la cuenta' });
      }
    }
  } else if (!comparePassword(clave, user.password_hash)) {
    return res.status(401).json({ ok: false, error: 'Contraseña incorrecta' });
  }

  const player = findPlayerByUserId(user.id) || findPlayerByName(legacy.nombre);
  if (!player) {
    return res.status(500).json({ ok: false, error: 'Jugador no encontrado tras migración' });
  }

  updateLastLogin(user.id);
  reinsertarJugadorEnSnapshot(legacy);
  const token = signPlayerToken(user, player);
  respaldarCuentasEnGitHubInmediato().catch(() => {});

  return res.json({
    ok: true,
    token,
    migrated: true,
    user: { id: user.id, username: user.username, role: user.role || 'jugador' },
    player: formatPlayer(player),
    perfil: {
      id: legacy.id,
      nombre: legacy.nombre,
      telefono: legacy.telefono || '',
      pinHash: legacy.pinHash,
      creado: legacy.creado || Date.now()
    }
  });
});

router.post('/register', (req, res) => {
  if (!limiteRegistro('reg:' + ipCliente(req))) {
    return res.status(429).json({ ok: false, error: 'Demasiados registros — intenta más tarde' });
  }
  const username = (req.body.username || req.body.usuario || '').trim();
  const password = req.body.password || req.body.clave || '';
  const telefono = (req.body.telefono || '').trim().replace(/[\s-]/g, '');
  const perfilId = req.body.perfilId || ('p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7));

  if (username.length < 2) {
    return res.status(400).json({ ok: false, error: 'Usuario mínimo 2 caracteres' });
  }
  if (password.length < 4) {
    return res.status(400).json({ ok: false, error: 'Contraseña mínimo 4 caracteres' });
  }

  if (esNombreAdmin(username)) {
    return res.status(403).json({ ok: false, error: 'Ese nombre está reservado para el administrador' });
  }

  if (findUserByUsername(username)) {
    return res.status(409).json({ ok: false, error: 'Ese usuario ya existe' });
  }
  if (telefono && telefonoEnUso(telefono)) {
    return res.status(409).json({ ok: false, error: 'Ese teléfono ya está registrado en otra cuenta' });
  }

  const legacy = buscarJugadorSnapshot(username);
  if (legacy && legacy.nombre.toLowerCase() !== username.toLowerCase()) {
    return res.status(409).json({ ok: false, error: 'Ese nombre ya está en uso' });
  }

  try {
    const user = createUser(username, hashPassword(password));
    const player = createPlayer(user.id, username);
    updateLastLogin(user.id);

    const snap = getWorldSnapshot() || {
      actualizadoEn: Date.now(),
      jugadores: [],
      partidas: {},
      misiones: [],
      tesoros: [],
      objetos: [],
      enemigos: [],
      posiciones: {}
    };
    const nuevo = {
      id: perfilId,
      nombre: username,
      telefono: telefono || '',
      pinHash: sha256Pin(password),
      creado: Date.now()
    };
    mergeJugadoresPartidas(snap, [{ jugadores: [nuevo] }]);
    snap.actualizadoEn = Date.now();
    saveWorldSnapshot(snap);

    respaldarCuentasEnGitHubInmediato().catch((e) => {
      console.warn('[register] Respaldo GitHub:', e.message);
    });

    const token = signPlayerToken(user, player);

    return res.status(201).json({
      ok: true,
      message: 'Usuario registrado',
      token,
      user: { id: user.id, username: user.username, role: user.role || 'jugador' },
      player: formatPlayer(player),
      perfil: nuevo
    });
  } catch (e) {
    console.error('Register error:', e);
    return res.status(500).json({ ok: false, error: 'Error al registrar' });
  }
});

router.post('/login', (req, res) => {
  const username = (req.body.username || req.body.usuario || '').trim();
  const password = req.body.password || req.body.clave || '';

  const enLista = estaEnListaPublicada(username);
  if (enLista === false) {
    return res.status(401).json({ ok: false, error: 'No estás registrado' });
  }

  const legacy = buscarJugadorSnapshot(username);
  const nombreLogin = resolverNombreLogin(username, legacy);

  let user = findUserByUsername(nombreLogin);
  if (!user && nombreLogin !== username) user = findUserByUsername(username);
  if (!user || !comparePassword(password, user.password_hash)) {
    if (enLista === true || legacy) {
      return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
    }
    return res.status(401).json({ ok: false, error: 'No estás registrado' });
  }

  const player = findPlayerByUserId(user.id);
  if (!player) {
    return res.status(500).json({ ok: false, error: 'Jugador no encontrado' });
  }

  updateLastLogin(user.id);
  const token = signPlayerToken(user, player);
  if (legacy) {
    const snap = getWorldSnapshot() || { jugadores: [], partidas: {} };
    mergeJugadoresPartidas(snap, [{ jugadores: [legacy] }]);
    snap.actualizadoEn = Date.now();
    saveWorldSnapshot(snap);
    respaldarCuentasEnGitHub().catch(() => {});
  }

  return res.json({
    ok: true,
    token,
    user: { id: user.id, username: user.username, role: user.role || 'jugador', lastLogin: user.last_login },
    player: formatPlayer(player),
    perfil: legacy || {
      id: 'srv_' + player.id,
      nombre: player.name,
      telefono: '',
      pinHash: sha256Pin(password),
      creado: Date.now()
    }
  });
});

module.exports = router;
