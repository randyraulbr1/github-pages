/**
 * Rutas REST del jugador (lectura de perfil).
 */
const express = require('express');
const {
  findPlayerById,
  getPlayerMissions,
  formatPlayer,
  getWorldSnapshot
} = require('../db');
const { authMiddleware, gameAdminMiddleware } = require('../auth');
const { syncMundoFromJson, actualizarPartidaEnSnapshot, registrarCuentaEnSnapshot } = require('../syncMundo');
const { respaldarCuentasEnGitHub } = require('../syncCuentas');

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

/** Admin del juego (randy) publica mundo desde su panel → todos en vivo */
router.post('/sync-mundo', authMiddleware, gameAdminMiddleware, (req, res) => {
  const mundo = req.body;
  if (!mundo || typeof mundo !== 'object') {
    return res.status(400).json({ ok: false, error: 'JSON del mundo requerido' });
  }
  const io = req.app.get('io');
  const result = syncMundoFromJson(mundo, io);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

/** Mundo con auth (misma fuente que /api/public/mundo) */
router.get('/mundo', authMiddleware, (req, res) => {
  const snapshot = getWorldSnapshot();
  if (!snapshot) return res.json({ ok: true, mundo: null, actualizadoEn: 0 });
  res.json({
    ok: true,
    mundo: snapshot,
    actualizadoEn: snapshot.actualizadoEn || 0
  });
});

/** Sincroniza vida/muerto de la partida del jugador al snapshot del servidor */
router.post('/sync-partida', authMiddleware, (req, res) => {
  const { perfilId, partida } = req.body;
  if (!perfilId || !partida) {
    return res.status(400).json({ ok: false, error: 'perfilId y partida requeridos' });
  }
  const io = req.app.get('io');
  const ok = actualizarPartidaEnSnapshot(perfilId, partida, io);
  res.json({ ok });
});

/** Registra/actualiza cuenta del juego (pinHash) en el snapshot del servidor */
router.post('/registrar-cuenta', authMiddleware, (req, res) => {
  const { perfil, partida } = req.body;
  if (!perfil?.id || !perfil?.nombre) {
    return res.status(400).json({ ok: false, error: 'perfil con id y nombre requerido' });
  }
  const ok = registrarCuentaEnSnapshot(perfil, partida || null);
  if (ok) {
    respaldarCuentasEnGitHub().catch((e) => {
      console.warn('[registrar-cuenta] Respaldo GitHub:', e.message);
    });
  }
  res.json({ ok });
});

module.exports = router;
