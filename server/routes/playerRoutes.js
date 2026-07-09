/**
 * Rutas REST del jugador (lectura de perfil).
 */
const express = require('express');
const {
  findPlayerById,
  getPlayerMissions,
  formatPlayer,
  getWorldSnapshot,
  findUserByUsername,
  createUser,
  createPlayer,
  findPlayerByUserId
} = require('../db');
const { authMiddleware, gameAdminMiddleware, hashPassword, partidaAuthMiddleware } = require('../auth');
const { syncMundoFromJson, actualizarPartidaEnSnapshot, registrarCuentaEnSnapshot, emitirDeltaMapaPorOrigenId, emitirRemoveMapaPorOrigenId } = require('../syncMundo');
const {
  adminUpsertContent,
  adminDeleteContent,
  adminConfigContent,
  refreshMundoPublicadoDesdeBD
} = require('../worldContent');
const { auditarSiAdminEditaAjeno } = require('../auditLog');
const { respaldarCuentasEnGitHub, respaldarCuentasEnGitHubInmediato, dejarSoloAdminEnSnapshot } = require('../syncCuentas');
const { restaurarJugadorSiExiste } = require('../recoveryCuentas');
const { forcePushMundoActual } = require('../githubMundo');
const { getSyncStatus } = require('../syncStatus');
const { getEventos } = require('../eventLog');
const { registrar } = require('../eventLog');
const { limiteAdminMapa, limitePublicarMundo, responderRateLimitHttp } = require('../rateLimit');
const { getAdminHistorial, restaurarEntradaHistorial } = require('../adminHistorial');

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
  if (!limitePublicarMundo('pub:' + req.auth.playerId)) {
    return responderRateLimitHttp(res, 'publicar');
  }
  const mundo = req.body;
  if (!mundo || typeof mundo !== 'object') {
    return res.status(400).json({ ok: false, error: 'JSON del mundo requerido' });
  }
  const nJug = (mundo.jugadores || []).length;
  const nObj = (mundo.objetos || []).length;
  console.log('[sync-mundo] PUBLICANDO MUNDO — admin:', req.auth.username || req.auth.playerId,
    '| jugadores:', nJug, '| objetos:', nObj);
  const io = req.app.get('io');
  const result = syncMundoFromJson(mundo, io);
  if (!result.ok) {
    console.warn('[sync-mundo] RESPUESTA SYNC-MUNDO fallo:', result.error || result);
    return res.status(400).json(result);
  }
  console.log('[sync-mundo] RESPUESTA SYNC-MUNDO OK — actualizadoEn:', result.actualizadoEn);
  try {
    const { registrarAdminHistorial } = require('../adminHistorial');
    registrarAdminHistorial({
      quien: 'admin:' + req.auth.playerId,
      accion: 'publicar_mundo',
      detalle: 'sync-mundo',
      despues: {
        objetos: (mundo.objetos || []).length,
        enemigos: (mundo.enemigos || []).length,
        misiones: (mundo.misiones || []).length
      }
    });
  } catch (e) { /* */ }
  try {
    const { respaldoInmediato } = require('../respaldoThrottle');
    respaldoInmediato().catch(() => {});
  } catch (e) { /* */ }
  res.json(result);
});

/** Admin: upsert de un objeto del mapa (Fase 3.3) */
router.post('/world/upsert', authMiddleware, gameAdminMiddleware, (req, res) => {
  if (!limiteAdminMapa('adminMapa:' + req.auth.playerId)) {
    return responderRateLimitHttp(res, 'adminMapa');
  }
  const { id, type, x, y, data } = req.body || {};
  const r = adminUpsertContent({
    id,
    type,
    x,
    y,
    data,
    updatedBy: 'admin:' + req.auth.playerId
  });
  if (!r.ok) return res.status(400).json(r);
  const io = req.app.get('io');
  const pub = refreshMundoPublicadoDesdeBD(io);
  emitirDeltaMapaPorOrigenId(r.id, io);
  res.json({ ok: true, id: r.id, type: r.type, actualizadoEn: pub.actualizadoEn });
});

/** Admin: tombstone de un objeto del mapa */
router.post('/world/delete', authMiddleware, gameAdminMiddleware, (req, res) => {
  if (!limiteAdminMapa('adminMapa:' + req.auth.playerId)) {
    return responderRateLimitHttp(res, 'adminMapa');
  }
  const id = req.body?.id;
  const r = adminDeleteContent(id, 'admin:' + req.auth.playerId);
  if (!r.ok) return res.status(400).json(r);
  const io = req.app.get('io');
  const pub = refreshMundoPublicadoDesdeBD(io);
  emitirRemoveMapaPorOrigenId(r.id, io);
  res.json({ ok: true, id: r.id, tombstone: true, actualizadoEn: pub.actualizadoEn });
});

/** Admin: config global del mundo (precios, combate, etc.) */
router.post('/world/config', authMiddleware, gameAdminMiddleware, (req, res) => {
  if (!limiteAdminMapa('adminMapa:' + req.auth.playerId)) {
    return responderRateLimitHttp(res, 'adminMapa');
  }
  const { key, value } = req.body || {};
  const r = adminConfigContent(key, value, 'admin:' + req.auth.playerId);
  if (!r.ok) return res.status(400).json(r);
  const io = req.app.get('io');
  const pub = refreshMundoPublicadoDesdeBD(io);
  res.json({ ok: true, key: r.key, actualizadoEn: pub.actualizadoEn });
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
router.post('/sync-partida', authMiddleware, partidaAuthMiddleware, (req, res) => {
  const { perfilId, partida } = req.body;
  if (!perfilId || !partida) {
    return res.status(400).json({ ok: false, error: 'perfilId y partida requeridos' });
  }
  const io = req.app.get('io');
  auditarSiAdminEditaAjeno(req.auth.playerId, perfilId, 'REST sync-partida');
  const ok = actualizarPartidaEnSnapshot(perfilId, partida, io);
  if (ok) {
    try {
      const { pedirRespaldo } = require('../respaldoThrottle');
      pedirRespaldo();
    } catch (e) { /* */ }
  }
  res.json({ ok });
});

/** Registra/actualiza cuenta del juego (pinHash + usuario SQLite) en el snapshot del servidor */
router.post('/registrar-cuenta', authMiddleware, (req, res) => {
  const { perfil, partida, clave, password } = req.body;
  if (!perfil?.id || !perfil?.nombre) {
    return res.status(400).json({ ok: false, error: 'perfil con id y nombre requerido' });
  }
  const ok = registrarCuentaEnSnapshot(perfil, partida || null);
  const pass = String(clave || password || '').trim();
  if (pass.length >= 4) {
    try {
      const nombre = String(perfil.nombre).trim();
      let user = findUserByUsername(nombre);
      if (!user) {
        user = createUser(nombre, hashPassword(pass));
        createPlayer(user.id, nombre);
      } else if (!findPlayerByUserId(user.id)) {
        createPlayer(user.id, nombre);
      }
    } catch (e) {
      console.warn('[registrar-cuenta] SQLite:', e.message);
    }
  }
  if (ok) {
    const io = req.app.get('io');
    if (io && perfil.sesionToken) {
      io.emit('sesion:actualizada', {
        perfilId: perfil.id,
        nombre: perfil.nombre,
        sesionToken: perfil.sesionToken,
        sesionT: perfil.sesionT || Date.now()
      });
    }
    respaldarCuentasEnGitHubInmediato().catch((e) => {
      console.warn('[registrar-cuenta] Respaldo GitHub:', e.message);
    });
  }
  res.json({ ok });
});

/** Admin: dejar solo cuenta randy — borra todas las demás */
router.post('/limpiar-cuentas', authMiddleware, gameAdminMiddleware, async (req, res) => {
  const io = req.app.get('io');
  const r = await dejarSoloAdminEnSnapshot({ io });
  const snap = getWorldSnapshot();
  try {
    const { respaldoInmediato } = require('../respaldoThrottle');
    await respaldoInmediato();
  } catch (e) {
    console.warn('[limpiar-cuentas] GitHub:', e.message);
  }
  registrar('admin_purge', 'Cuentas limpiadas — solo admin');
  res.json(r);
});

/** Admin del juego: restaurar cuenta desde backup o papelera */
router.post('/restaurar-cuenta', authMiddleware, gameAdminMiddleware, (req, res) => {
  const id = (req.body.id || req.body.usuario || '').trim();
  if (!id) return res.status(400).json({ ok: false, error: 'id o usuario requerido' });
  const snap = getWorldSnapshot();
  if (snap?.eliminados_recuperables) {
    const idx = snap.eliminados_recuperables.findIndex(e => e?.tipo === 'jugador' && (e.id === id || e.datos?.nombre === id));
    if (idx >= 0) {
      const e = snap.eliminados_recuperables[idx];
      snap.eliminados_recuperables.splice(idx, 1);
      if (!snap.jugadores) snap.jugadores = [];
      if (!snap.jugadores.some(j => j.id === e.id)) {
        snap.jugadores.push(Object.assign({}, e.datos));
      }
      if (e.partida) {
        if (!snap.partidas) snap.partidas = {};
        snap.partidas[e.id] = e.partida;
      }
      snap.actualizadoEn = Date.now();
      const { saveWorldSnapshot } = require('../db');
      saveWorldSnapshot(snap);
      registrar('admin_restore', `Cuenta ${e.datos?.nombre || e.id} restaurada desde papelera`);
      respaldarCuentasEnGitHubInmediato().catch(() => {});
      return res.json({ ok: true, jugador: e.datos, origen: 'papelera' });
    }
  }
  const r = restaurarJugadorSiExiste(id);
  if (!r.ok) return res.status(404).json({ ok: false, error: r.reason || 'No encontrada' });
  respaldarCuentasEnGitHubInmediato().catch(() => {});
  res.json({ ok: true, jugador: r.jugador, origen: 'backup' });
});

/** Admin: forzar volcado SQLite → GitHub */
router.post('/force-git-sync', authMiddleware, gameAdminMiddleware, async (req, res) => {
  const r = await forcePushMundoActual();
  if (r.ok) {
    registrar('force_sync', 'Sync forzada a GitHub OK');
    const snap = getWorldSnapshot();
    const { respaldarJugadoresEnGitHub } = require('../jugadoresBackup');
    await respaldarJugadoresEnGitHub(snap).catch(() => {});
  }
  res.json(r);
});

/** Admin: historial de acciones (Fase 9) */
router.get('/admin-historial', authMiddleware, gameAdminMiddleware, (req, res) => {
  res.json({ ok: true, historial: getAdminHistorial(50) });
});

/** Admin: restaurar entrada del historial */
router.post('/admin-historial/restore', authMiddleware, gameAdminMiddleware, (req, res) => {
  const historialId = req.body?.historialId || req.body?.id;
  if (!historialId) {
    return res.status(400).json({ ok: false, error: 'historialId requerido' });
  }
  const io = req.app.get('io');
  const r = restaurarEntradaHistorial(historialId, 'admin:' + req.auth.playerId, io);
  if (!r.ok) return res.status(400).json(r);
  if (io && r.id) {
    if (r.tombstone) emitirRemoveMapaPorOrigenId(r.id, io);
    else emitirDeltaMapaPorOrigenId(r.id, io);
  }
  res.json(r);
});

/** Admin: estado de sincronización GitHub */
router.get('/sync-status', authMiddleware, gameAdminMiddleware, (req, res) => {
  res.json({ ok: true, status: getSyncStatus(), eventos: getEventos(30) });
});

module.exports = router;
