/**
 * Rutas REST del jugador (lectura de perfil).
 */
const express = require('express');
const {
  findPlayerById,
  getPlayerMissions,
  formatPlayer
} = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router();

router.get('/me', authMiddleware, (req, res) => {
  const player = findPlayerById(req.auth.playerId);
  if (!player) return res.status(404).json({ ok: false, error: 'Jugador no encontrado' });

  res.json({
    ok: true,
    player: formatPlayer(player),
    missions: getPlayerMissions(player.id)
  });
});

module.exports = router;
