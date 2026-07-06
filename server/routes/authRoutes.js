/**
 * Rutas de registro y login de jugadores.
 * Fuente única de cuentas: SQLite (users + players + snapshot jugadores).
 */
const express = require('express');
const crypto = require('crypto');
const {
  findUserByUsername,
  createUser,
  createPlayer,
  findPlayerByUserId,
  findPlayerByName,
  updateLastLogin,
  formatPlayer,
  getWorldSnapshot,
  saveWorldSnapshot
} = require('../db');
const { hashPassword, comparePassword, signPlayerToken } = require('../auth');
const { mergeJugadoresPartidas } = require('../syncMundo');
const { forzarImportJugadores } = require('../importSnapshot');
const { getJugadoresPublicos, respaldarCuentasEnGitHub, buscarJugadorPublico } = require('../syncCuentas');

const router = express.Router();

function sha256Pin(clave) {
  return crypto.createHash('sha256').update('pin-perfil|' + clave).digest('hex');
}

function buscarJugadorSnapshot(usuario) {
  const hit = buscarJugadorPublico(usuario);
  if (hit) return hit;
  const snap = getWorldSnapshot();
  if (!snap?.jugadores?.length) return null;
  const u = usuario.trim().toLowerCase();
  const limpio = usuario.trim().replace(/[\s-]/g, '');
  return snap.jugadores.find(j =>
    (j.nombre && j.nombre.toLowerCase() === u) ||
    (j.telefono && j.telefono === limpio)
  ) || null;
}

/** Mundo público (solo lectura) — fuente principal para el cliente */
router.get('/public/mundo', (req, res) => {
  const snap = getWorldSnapshot();
  res.json({
    ok: true,
    mundo: snap || {
      misiones: [], tesoros: [], objetos: [], enemigos: [],
      posiciones: {}, eliminados: [], jugadores: [], partidas: {}
    },
    actualizadoEn: snap?.actualizadoEn || 0
  });
});

/** Cuentas del juego para login (desde snapshot SQLite + tabla users) */
router.get('/public/cuentas', (req, res) => {
  const jugadores = getJugadoresPublicos();
  const snap = getWorldSnapshot();
  res.json({
    ok: true,
    jugadores,
    actualizadoEn: snap?.actualizadoEn || 0
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

  let user = findUserByUsername(usuario);
  if (user && comparePassword(clave, user.password_hash)) {
    const player = findPlayerByUserId(user.id);
    if (!player) return res.status(500).json({ ok: false, error: 'Jugador no encontrado' });
    updateLastLogin(user.id);
    const legacy = buscarJugadorSnapshot(usuario);
    return res.json({
      ok: true,
      token: signPlayerToken(user, player),
      user: { id: user.id, username: user.username },
      player: formatPlayer(player),
      perfil: legacy || {
        id: 'srv_' + player.id,
        nombre: player.name,
        telefono: '',
        pinHash: sha256Pin(clave),
        creado: Date.now()
      }
    });
  }

  const legacy = buscarJugadorSnapshot(usuario);
  if (!legacy) {
    return res.status(401).json({ ok: false, error: 'No existe esa cuenta' });
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
  const token = signPlayerToken(user, player);

  const snap = getWorldSnapshot() || { jugadores: [], partidas: {} };
  mergeJugadoresPartidas(snap, [{ jugadores: [legacy] }]);
  snap.actualizadoEn = Date.now();
  saveWorldSnapshot(snap);
  respaldarCuentasEnGitHub().catch(() => {});

  return res.json({
    ok: true,
    token,
    migrated: true,
    user: { id: user.id, username: user.username },
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

  if (findUserByUsername(username)) {
    return res.status(409).json({ ok: false, error: 'Ese usuario ya existe' });
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

    respaldarCuentasEnGitHub().catch((e) => {
      console.warn('[register] Respaldo GitHub:', e.message);
    });

    const token = signPlayerToken(user, player);

    return res.status(201).json({
      ok: true,
      message: 'Usuario registrado',
      token,
      user: { id: user.id, username: user.username },
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

  const user = findUserByUsername(username);
  if (!user || !comparePassword(password, user.password_hash)) {
    return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
  }

  const player = findPlayerByUserId(user.id);
  if (!player) {
    return res.status(500).json({ ok: false, error: 'Jugador no encontrado' });
  }

  updateLastLogin(user.id);
  const token = signPlayerToken(user, player);
  const legacy = buscarJugadorSnapshot(username);
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
    user: { id: user.id, username: user.username, lastLogin: user.last_login },
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
