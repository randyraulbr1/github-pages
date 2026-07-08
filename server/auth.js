/**
 * Autenticación con JWT propio (sin Firebase ni servicios externos).
 */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_DEV_DEFAULT = 'mariel-dev-secret-cambiar-en-produccion';
const JWT_SECRET = process.env.JWT_SECRET || JWT_DEV_DEFAULT;
const JWT_EXPIRES = '7d';

function isProductionEnv() {
  return process.env.NODE_ENV === 'production' || !!process.env.RENDER;
}

function assertProductionSecrets() {
  if (!isProductionEnv()) return;
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === JWT_DEV_DEFAULT) {
    throw new Error(
      'JWT_SECRET debe configurarse en Render (no usar el valor de desarrollo)'
    );
  }
}

function warnProductionConfig() {
  if (!isProductionEnv()) return;
  if (!process.env.GITHUB_TOKEN) {
    console.warn('⚠️ GITHUB_TOKEN no configurado — respaldo a GitHub limitado');
  }
}

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

function comparePassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

function signPlayerToken(user, player) {
  const role = user.role === 'admin' ? 'admin' : 'player';
  return jwt.sign(
    { sub: user.id, playerId: player.id, role, username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'Token requerido' });

  const payload = verifyToken(token);
  if (!payload || (payload.role !== 'player' && payload.role !== 'admin')) {
    return res.status(401).json({ ok: false, error: 'Token inválido' });
  }

  req.auth = payload;
  next();
}

function getGameAdminNames() {
  const names = [
    process.env.GAME_ADMIN_NAME || 'SoyCaos',
    'randy',
    ...(process.env.GAME_ADMIN_ALIASES || '').split(',')
  ];
  return new Set(names.map(s => s.trim().toLowerCase()).filter(Boolean));
}

function isGameAdminName(name) {
  if (!name) return false;
  return getGameAdminNames().has(String(name).trim().toLowerCase());
}

function isGameAdminPlayer(playerId) {
  if (!playerId) return false;
  const { findPlayerById, findUserById } = require('./db');
  const player = findPlayerById(playerId);
  if (!player) return false;
  const user = findUserById(player.user_id);
  if (user?.role === 'admin') return true;
  return isGameAdminName(player.name);
}

function isGameAdminAuth(auth) {
  if (!auth) return false;
  if (auth.role === 'admin') return true;
  if (auth.playerId) return isGameAdminPlayer(auth.playerId);
  return false;
}

function gameAdminMiddleware(req, res, next) {
  if (!req.auth || (req.auth.role !== 'player' && req.auth.role !== 'admin')) {
    return res.status(401).json({ ok: false, error: 'Token de jugador requerido' });
  }
  if (!isGameAdminAuth(req.auth)) {
    return res.status(403).json({ ok: false, error: 'Solo el administrador del juego puede publicar el mundo' });
  }
  next();
}

/** Jugador solo puede editar su propia partida PWA; admin del juego cualquiera. */
function isOwnPerfil(playerId, perfilId) {
  if (!playerId || !perfilId) return false;
  const { findPlayerById, getWorldSnapshot } = require('./db');
  const player = findPlayerById(playerId);
  if (!player) return false;

  const pid = String(perfilId);
  if (pid === 'srv_' + player.id) return true;

  const snap = getWorldSnapshot();
  const nombre = String(player.name || '').trim().toLowerCase();
  if (!nombre) return false;
  const jug = (snap?.jugadores || []).find(j =>
    j?.id === pid && String(j.nombre || '').trim().toLowerCase() === nombre
  );
  return !!jug;
}

/** Jugador solo puede editar su propia partida PWA; admin del juego cualquiera. */
function canEditPartida(auth, perfilId) {
  if (!auth?.playerId || !perfilId) return false;
  if (isGameAdminAuth(auth)) return true;
  return isOwnPerfil(auth.playerId, perfilId);
}

function partidaAuthMiddleware(req, res, next) {
  const perfilId = req.body?.perfilId;
  if (!perfilId) {
    return res.status(400).json({ ok: false, error: 'perfilId requerido' });
  }
  if (!canEditPartida(req.auth, perfilId)) {
    return res.status(403).json({ ok: false, error: 'No puedes modificar la partida de otro jugador' });
  }
  next();
}

module.exports = {
  hashPassword,
  comparePassword,
  signPlayerToken,
  verifyToken,
  authMiddleware,
  gameAdminMiddleware,
  partidaAuthMiddleware,
  canEditPartida,
  isGameAdminName,
  isGameAdminAuth,
  isGameAdminPlayer,
  isOwnPerfil,
  getGameAdminNames,
  assertProductionSecrets,
  warnProductionConfig,
  isProductionEnv
};
