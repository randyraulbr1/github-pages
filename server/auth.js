/**
 * Autenticación con JWT propio (sin Firebase ni servicios externos).
 */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'mariel-dev-secret-cambiar-en-produccion';
const JWT_EXPIRES = '7d';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

function comparePassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

function signPlayerToken(user, player) {
  return jwt.sign(
    { sub: user.id, playerId: player.id, role: 'player', username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function signAdminToken() {
  return jwt.sign(
    { sub: 'admin', role: 'admin', username: ADMIN_USERNAME },
    JWT_SECRET,
    { expiresIn: '12h' }
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
  if (!payload || payload.role !== 'player') {
    return res.status(401).json({ ok: false, error: 'Token inválido' });
  }

  req.auth = payload;
  next();
}

function adminMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'Token admin requerido' });

  const payload = verifyToken(token);
  if (!payload || payload.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Acceso admin denegado' });
  }

  req.auth = payload;
  next();
}

function validateAdminLogin(username, password) {
  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

module.exports = {
  hashPassword,
  comparePassword,
  signPlayerToken,
  signAdminToken,
  verifyToken,
  authMiddleware,
  adminMiddleware,
  validateAdminLogin,
  ADMIN_USERNAME
};
