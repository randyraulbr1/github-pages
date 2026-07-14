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

/** Admin (editor): lista de jugadores REALES registrados, con sus datos de partida. */
router.get('/admin-jugadores', authMiddleware, gameAdminMiddleware, (req, res) => {
  const snap = getWorldSnapshot() || {};
  const jugadores = Array.isArray(snap.jugadores) ? snap.jugadores : [];
  const partidas = (snap.partidas && typeof snap.partidas === 'object') ? snap.partidas : {};
  const posiciones = (snap.posiciones && typeof snap.posiciones === 'object') ? snap.posiciones : {};
  let esAdminNombre = () => false;
  try { esAdminNombre = require('../adminCuenta').esNombreAdmin; } catch (e) { /* */ }
  let online = new Map();
  try { online = require('../worldBroadcast').getOnlinePlayers(); } catch (e) { /* */ }

  const contarInventario = (p) => {
    if (Array.isArray(p?.mochila)) {
      return p.mochila.reduce((s, sl) => s + (sl && sl.cantidad ? sl.cantidad : 0), 0);
    }
    return 0;
  };

  res.json({
    ok: true,
    jugadores: jugadores.map((j) => {
      const p = partidas[j.id] || {};
      const pos = posiciones[j.id];
      return {
        id: j.id,
        nombre: j.nombre,
        telefono: j.telefono || '',
        esAdmin: !!esAdminNombre(j.nombre),
        creado: j.creado || null,
        // Datos de partida (lo que antes mostraba el admin dentro del juego):
        dinero: Number(p.dinero) || 0,
        nivel: Number(p.nivel) || 1,
        experiencia: Number(p.experiencia) || 0,
        vida: p.vida != null ? Number(p.vida) : null,
        hambre: p.hambre != null ? Number(p.hambre) : null,
        muerto: !!p.muerto,
        baneado: !!j.baneado,
        objetos: contarInventario(p),
        posicion: Array.isArray(pos) ? pos : (Array.isArray(p.posicionJugador) ? p.posicionJugador : null),
        conectado: online.has(j.id)
      };
    })
  });
});

// ===== Edición de jugadores reales desde el editor (panel adm) =====

function esAdminNombreSafe(nombre) {
  try { return require('../adminCuenta').esNombreAdmin(nombre); } catch (e) { return false; }
}

/** Busca el jugador en el snapshot por id. */
function jugadorEnSnap(snap, id) {
  const lista = Array.isArray(snap?.jugadores) ? snap.jugadores : [];
  return lista.find((j) => j.id === id) || null;
}

/** Admin: editar datos de partida de un jugador (dinero, nivel, xp, vida, hambre, posición). */
router.post('/admin-jugador-editar', authMiddleware, gameAdminMiddleware, (req, res) => {
  const { db, saveWorldSnapshot } = require('../db');
  const { id, dinero, nivel, experiencia, vida, hambre, posicion } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'id requerido' });
  const snap = getWorldSnapshot();
  if (!snap) return res.status(500).json({ ok: false, error: 'No hay mundo cargado' });
  const jugador = jugadorEnSnap(snap, id);
  if (!jugador) return res.status(404).json({ ok: false, error: 'Jugador no encontrado' });

  if (!snap.partidas) snap.partidas = {};
  const p = snap.partidas[id] || {};
  const setNum = (val, min, max) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return undefined;
    return Math.max(min, max != null ? Math.min(max, n) : n);
  };
  if (dinero !== undefined) { const v = setNum(dinero, 0); if (v !== undefined) p.dinero = Math.round(v); }
  if (nivel !== undefined) { const v = setNum(nivel, 1, 999); if (v !== undefined) p.nivel = Math.round(v); }
  if (experiencia !== undefined) { const v = setNum(experiencia, 0); if (v !== undefined) p.experiencia = Math.round(v); }
  if (vida !== undefined) { const v = setNum(vida, 0); if (v !== undefined) { p.vida = Math.round(v); if (p.vida > 0) p.muerto = false; } }
  if (hambre !== undefined) { const v = setNum(hambre, 0); if (v !== undefined) p.hambre = Math.round(v); }
  p.t = Date.now();
  snap.partidas[id] = p;

  if (Array.isArray(posicion) && posicion.length === 2) {
    const lat = Number(posicion[0]); const lng = Number(posicion[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      if (!snap.posiciones) snap.posiciones = {};
      snap.posiciones[id] = [lat, lng];
      p.posicionJugador = [lat, lng];
    }
  }

  snap.actualizadoEn = Date.now();
  saveWorldSnapshot(snap);
  try { require('../respaldoThrottle').respaldoInmediato().catch(() => {}); } catch (e) { /* */ }
  registrar('admin_editar_jugador', `Editado ${jugador.nombre}`);

  // Avisar al jugador si está conectado para que refresque sus stats.
  const io = req.app.get('io');
  if (io) io.emit('player:adminUpdate', { playerId: id, partida: snap.partidas[id] });

  res.json({ ok: true, id });
});

/** Admin: revivir a un jugador y dejarlo con vida/hambre al máximo. */
router.post('/admin-jugador-revivir', authMiddleware, gameAdminMiddleware, (req, res) => {
  const { saveWorldSnapshot } = require('../db');
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'id requerido' });
  const snap = getWorldSnapshot();
  const jugador = jugadorEnSnap(snap, id);
  if (!jugador) return res.status(404).json({ ok: false, error: 'Jugador no encontrado' });
  if (!snap.partidas) snap.partidas = {};
  const p = snap.partidas[id] || {};
  const nivel = Math.max(1, Number(p.nivel) || 1);
  const vidaMax = 100 + (nivel - 1) * 4; // CONFIG.vidaMaxima + (n-1)*vidaExtraPorNivel
  p.vida = vidaMax;
  p.hambre = 100;
  p.muerto = false;
  p.t = Date.now();
  snap.partidas[id] = p;
  snap.actualizadoEn = Date.now();
  saveWorldSnapshot(snap);
  try { require('../respaldoThrottle').respaldoInmediato().catch(() => {}); } catch (e) { /* */ }
  const io = req.app.get('io');
  if (io) io.emit('player:adminUpdate', { playerId: id, partida: snap.partidas[id] });
  registrar('admin_revivir', `Revivido ${jugador.nombre}`);
  res.json({ ok: true, id, vida: vidaMax });
});

/** Admin: dar o quitar un objeto del inventario de un jugador. */
router.post('/admin-jugador-item', authMiddleware, gameAdminMiddleware, (req, res) => {
  const { saveWorldSnapshot } = require('../db');
  const { id, itemId, cantidad } = req.body || {};
  const qty = Math.round(Number(cantidad) || 0);
  if (!id || !itemId || !qty) return res.status(400).json({ ok: false, error: 'id, itemId y cantidad requeridos' });
  const snap = getWorldSnapshot();
  const jugador = jugadorEnSnap(snap, id);
  if (!jugador) return res.status(404).json({ ok: false, error: 'Jugador no encontrado' });
  if (!snap.partidas) snap.partidas = {};
  const p = snap.partidas[id] || {};
  const mochila = Array.isArray(p.mochila) ? p.mochila.slice() : [];
  // Sumar/restar cantidad en el primer slot con ese id (o crear uno nuevo al dar).
  let restante = qty;
  for (let i = 0; i < mochila.length && restante !== 0; i++) {
    const sl = mochila[i];
    if (sl && sl.id === itemId) {
      const nueva = (Number(sl.cantidad) || 0) + restante;
      if (nueva <= 0) { mochila[i] = null; } else { mochila[i] = { id: itemId, cantidad: nueva }; }
      restante = 0;
    }
  }
  if (restante > 0) {
    // Dar: buscar un hueco libre.
    const libre = mochila.findIndex((s) => !s);
    if (libre >= 0) mochila[libre] = { id: itemId, cantidad: restante };
    else mochila.push({ id: itemId, cantidad: restante });
  }
  p.mochila = mochila;
  p.t = Date.now();
  snap.partidas[id] = p;
  snap.actualizadoEn = Date.now();
  saveWorldSnapshot(snap);
  try { require('../respaldoThrottle').respaldoInmediato().catch(() => {}); } catch (e) { /* */ }
  const io = req.app.get('io');
  if (io) io.emit('player:adminUpdate', { playerId: id, partida: snap.partidas[id] });
  registrar('admin_item', `${qty > 0 ? 'Dado' : 'Quitado'} ${Math.abs(qty)}x ${itemId} a ${jugador.nombre}`);
  res.json({ ok: true, id });
});

/** Admin: cambiar la contraseña de un jugador. */
router.post('/admin-jugador-password', authMiddleware, gameAdminMiddleware, (req, res) => {
  const { db } = require('../db');
  const { id, password } = req.body || {};
  if (!id || !password || String(password).length < 4) {
    return res.status(400).json({ ok: false, error: 'Contraseña mínimo 4 caracteres' });
  }
  const snap = getWorldSnapshot();
  const jugador = jugadorEnSnap(snap, id);
  if (!jugador) return res.status(404).json({ ok: false, error: 'Jugador no encontrado' });

  const user = findUserByUsername(jugador.nombre);
  if (!user) return res.status(404).json({ ok: false, error: 'La cuenta no tiene login en el servidor' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), user.id);
  registrar('admin_password', `Contraseña cambiada: ${jugador.nombre}`);
  res.json({ ok: true, id });
});

/** Admin: banear / desbanear un jugador. */
router.post('/admin-jugador-ban', authMiddleware, gameAdminMiddleware, (req, res) => {
  const { saveWorldSnapshot } = require('../db');
  const { id, ban } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'id requerido' });
  const snap = getWorldSnapshot();
  const jugador = jugadorEnSnap(snap, id);
  if (!jugador) return res.status(404).json({ ok: false, error: 'Jugador no encontrado' });
  if (esAdminNombreSafe(jugador.nombre)) return res.status(403).json({ ok: false, error: 'No se puede banear al administrador' });

  jugador.baneado = !!ban;
  snap.actualizadoEn = Date.now();
  saveWorldSnapshot(snap);
  try { require('../respaldoThrottle').respaldoInmediato().catch(() => {}); } catch (e) { /* */ }
  registrar('admin_ban', `${ban ? 'Baneado' : 'Desbaneado'}: ${jugador.nombre}`);
  res.json({ ok: true, id, baneado: !!ban });
});

/** Admin: eliminar un jugador (cuenta + partida). */
router.post('/admin-jugador-eliminar', authMiddleware, gameAdminMiddleware, (req, res) => {
  const { db, saveWorldSnapshot } = require('../db');
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'id requerido' });
  const snap = getWorldSnapshot();
  const jugador = jugadorEnSnap(snap, id);
  if (!jugador) return res.status(404).json({ ok: false, error: 'Jugador no encontrado' });
  if (esAdminNombreSafe(jugador.nombre)) return res.status(403).json({ ok: false, error: 'No se puede eliminar al administrador' });

  // Guardar en papelera recuperable antes de borrar.
  if (!Array.isArray(snap.eliminados_recuperables)) snap.eliminados_recuperables = [];
  snap.eliminados_recuperables.push({ tipo: 'jugador', id, datos: jugador, partida: snap.partidas?.[id] || null, t: Date.now() });

  snap.jugadores = (snap.jugadores || []).filter((j) => j.id !== id);
  if (snap.partidas) delete snap.partidas[id];
  if (snap.posiciones) delete snap.posiciones[id];
  snap.actualizadoEn = Date.now();
  saveWorldSnapshot(snap);

  try {
    const user = findUserByUsername(jugador.nombre);
    if (user && !esAdminNombreSafe(user.username)) db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  } catch (e) { /* */ }
  try { require('../respaldoThrottle').respaldoInmediato().catch(() => {}); } catch (e) { /* */ }
  registrar('admin_eliminar_jugador', `Eliminado ${jugador.nombre}`);
  res.json({ ok: true, id });
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
