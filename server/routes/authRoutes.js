/**
 * Rutas de registro y login de jugadores.
 */
const express = require('express');
const {
  findUserByUsername,
  createUser,
  createPlayer,
  findPlayerByUserId,
  updateLastLogin,
  formatPlayer
} = require('../db');
const { hashPassword, comparePassword, signPlayerToken } = require('../auth');
const { getWorldSnapshot } = require('../db');

const router = express.Router();

/** Cuentas del juego para login (mismo modelo que datos/mundo.json) */
router.get('/public/cuentas', (req, res) => {
  const snap = getWorldSnapshot();
  res.json({
    ok: true,
    jugadores: snap?.jugadores || [],
    actualizadoEn: snap?.actualizadoEn || 0
  });
});

router.post('/register', (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';

  if (username.length < 2) {
    return res.status(400).json({ ok: false, error: 'Usuario mínimo 2 caracteres' });
  }
  if (password.length < 4) {
    return res.status(400).json({ ok: false, error: 'Contraseña mínimo 4 caracteres' });
  }

  if (findUserByUsername(username)) {
    return res.status(409).json({ ok: false, error: 'Ese usuario ya existe' });
  }

  try {
    const user = createUser(username, hashPassword(password));
    const player = createPlayer(user.id, username);
    updateLastLogin(user.id);

    const token = signPlayerToken(user, player);

    return res.status(201).json({
      ok: true,
      message: 'Usuario registrado',
      token,
      user: { id: user.id, username: user.username },
      player: formatPlayer(player)
    });
  } catch (e) {
    console.error('Register error:', e);
    return res.status(500).json({ ok: false, error: 'Error al registrar' });
  }
});

router.post('/login', (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';

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

  return res.json({
    ok: true,
    token,
    user: { id: user.id, username: user.username, lastLogin: user.last_login },
    player: formatPlayer(player)
  });
});

module.exports = router;
