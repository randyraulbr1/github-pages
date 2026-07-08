/**
 * Socket.IO — multijugador en vivo. El servidor decide; todos ven lo mismo.
 */
const {
  findPlayerById,
  findPlayerByName,
  updatePlayer,
  getAllWorldObjects,
  getActiveMissions,
  findWorldObject,
  updateWorldObject,
  deleteWorldObject,
  findMission,
  upsertPlayerMission,
  getPlayerMissions,
  getSocialData,
  getWorldSnapshot,
  getWorldSnapshotPublic,
  formatPlayer,
  formatWorldObject,
  formatMission,
  insertChatMessage,
  getChatHistory,
  markChatRead,
  canChatBetween
} = require('./db');
const { verifyToken, isGameAdminPlayer, canEditPartida } = require('./auth');
const { validarStatsJugador } = require('./playerStats');
const { auditarSiAdminEditaAjeno } = require('./auditLog');
const { startEnemyAI } = require('./enemyAI');
const { registrarRecogidaObjeto, registrarRecogidaTesoro, registrarCuerpoMuerto, quitarCuerpoMuerto, getCuerpoMuerto, sincronizarCuerposExpirados, sincronizarBolsasExpiradas, sincronizarBotinesExpirados, actualizarInventarioCuerpo, registrarLootMuerto, actualizarPartidaEnSnapshot, revivirPartidaEnSnapshot, buscarPerfilIdPorNombre, limpiarBolsasExpiradas, crearBolsaDrop, recogerBolsaDrop, registrarAtaqueEnemigo, reclamarBotinEnemigo, emitirDeltaMapaPorOrigenId, emitirRemoveMapaPorOrigenId } = require('./syncMundo');
const {
  adminUpsertContent,
  adminDeleteContent,
  adminConfigContent,
  refreshMundoPublicadoDesdeBD
} = require('./worldContent');
const {
  snapshotCercanos,
  emitirACercanos,
  debeOmitirBroadcastMovimiento,
  marcarBroadcastMovimiento,
  limpiarJugador
} = require('./interest');
const {
  limiteChat,
  limiteAmigos,
  limiteMovimiento,
  limiteAdminMapa,
  errorRateLimitSocket
} = require('./rateLimit');

/** Vida al revivir: valor enviado o 40 % de hpMax. */
function vidaReviveDesdeMax(hpMax, reviveHp) {
  const max = Math.max(1, Math.round(hpMax || 100));
  const cura = reviveHp != null && reviveHp > 0
    ? Math.round(reviveHp)
    : Math.max(1, Math.round(max * 0.4));
  return Math.max(1, Math.min(max, cura));
}

const onlinePlayers = new Map();
/** socketId -> playerId */
const socketToPlayer = new Map();

const MAX_MOVE_DELTA = 0.00035;
const MAX_GPS_DELTA = 0.004;
const INTERACT_DISTANCE = 0.0005;
const REVIVE_DISTANCE_METERS = 55;
const SYNC_INTERVAL_MS = Math.max(8000, parseInt(process.env.SYNC_INTERVAL_MS || '12000', 10) || 12000);

let enemyAIStarted = false;

function distance(aX, aY, bX, bY) {
  const dx = aX - bX;
  const dy = aY - bY;
  return Math.sqrt(dx * dx + dy * dy);
}

function distanciaMetros(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function posicionJugadorOnline(playerId, payload, onlineMap) {
  const rx = Number(payload?.reviverX ?? payload?.x);
  const ry = Number(payload?.reviverY ?? payload?.y);
  if (Number.isFinite(rx) && Number.isFinite(ry)) return { x: rx, y: ry };
  const online = onlineMap.get(playerId);
  if (online && Number.isFinite(online.x) && Number.isFinite(online.y)) {
    return { x: online.x, y: online.y };
  }
  const db = findPlayerById(playerId);
  if (db && Number.isFinite(db.x) && Number.isFinite(db.y)) {
    return { x: db.x, y: db.y };
  }
  return null;
}

function cercaDeCuerpo(actorPos, deathX, deathY) {
  if (!actorPos || deathX == null || deathY == null) return false;
  return distanciaMetros(actorPos.x, actorPos.y, deathX, deathY) <= REVIVE_DISTANCE_METERS;
}

function playerSnapshot(p) {
  return {
    playerId: p.playerId,
    name: p.name,
    x: p.x,
    y: p.y,
    hp: p.hp,
    hpMax: p.hpMax || 100,
    level: p.level,
    dead: !!p.dead || (p.hp != null && p.hp <= 0),
    deathX: p.deathX != null ? p.deathX : null,
    deathY: p.deathY != null ? p.deathY : null,
    deadInventory: p.deadInventory || [],
    deadLevel: p.deadLevel || p.level || 1
  };
}

function snapshotOnline(excludeId, viewerId) {
  return snapshotCercanos(excludeId, viewerId, onlinePlayers).map(playerSnapshot);
}

function broadcastMove(io, playerId, online, opts) {
  if (!opts?.forzar && debeOmitirBroadcastMovimiento(playerId, online)) {
    return;
  }
  marcarBroadcastMovimiento(playerId, online);
  emitirACercanos(io, onlinePlayers, playerId, 'player:move', {
    playerId,
    x: online.x,
    y: online.y,
    name: online.name,
    hp: online.hp,
    hpMax: online.hpMax || 100,
    level: online.level,
    dead: !!online.dead || online.hp <= 0,
    deathX: online.deathX,
    deathY: online.deathY,
    t: Date.now()
  });
}

function setupSockets(io) {
  if (!enemyAIStarted) {
    startEnemyAI(io, onlinePlayers);
    enemyAIStarted = true;
  }

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Token requerido'));
    const payload = verifyToken(token);
    if (!payload || (payload.role !== 'player' && payload.role !== 'admin')) {
      return next(new Error('Token inválido'));
    }
    socket.playerId = payload.playerId;
    socket.userId = payload.sub;
    socket.username = payload.username;
    socket.role = payload.role || 'player';
    next();
  });

  setInterval(() => {
    if (!onlinePlayers.size) return;
    for (const [, viewer] of onlinePlayers) {
      io.to(viewer.socketId).emit('players:sync', {
        players: snapshotOnline(viewer.playerId, viewer.playerId),
        t: Date.now()
      });
    }
  }, SYNC_INTERVAL_MS);

  setInterval(() => sincronizarCuerposExpirados(io), 120000);
  setInterval(() => sincronizarBolsasExpiradas(io), 60000);
  setInterval(() => sincronizarBotinesExpirados(io), 60000);

  io.on('connection', (socket) => {
    const player = findPlayerById(socket.playerId);
    if (!player) {
      socket.disconnect(true);
      return;
    }

    socket.join('player:' + socket.playerId);

    const prev = onlinePlayers.get(socket.playerId);
    if (prev && prev.socketId && prev.socketId !== socket.id) {
      const old = io.sockets.sockets.get(prev.socketId);
      if (old) old.disconnect(true);
    }

    const formatted = formatPlayer(player);
    const hpMax = 100;
    onlinePlayers.set(socket.playerId, {
      socketId: socket.id,
      playerId: socket.playerId,
      name: formatted.name,
      x: formatted.x,
      y: formatted.y,
      hp: formatted.hp,
      hpMax,
      level: formatted.level,
      dead: formatted.hp <= 0,
      deathX: formatted.hp <= 0 ? formatted.x : null,
      deathY: formatted.hp <= 0 ? formatted.y : null
    });
    socketToPlayer.set(socket.id, socket.playerId);

    const onlineIds = [...onlinePlayers.keys()];
    const social = getSocialData(socket.playerId, onlineIds);
    const mundoSnapshot = getWorldSnapshotPublic();

    socket.emit('game:init', {
      player: formatted,
      onlinePlayers: snapshotOnline(socket.playerId, socket.playerId),
      worldObjects: getAllWorldObjects().map(formatWorldObject),
      missions: getActiveMissions().map(formatMission),
      playerMissions: getPlayerMissions(socket.playerId),
      social,
      mundoSnapshot,
      mundoActualizadoEn: mundoSnapshot?.actualizadoEn || 0,
      cuerposMuertos: mundoSnapshot?.cuerposMuertos || {}
    });

    emitirACercanos(
      io,
      onlinePlayers,
      socket.playerId,
      'player:online',
      playerSnapshot(onlinePlayers.get(socket.playerId))
    );

    function applyMove(targetX, targetY, maxDelta, forzar) {
      const current = findPlayerById(socket.playerId);
      if (!current) return { ok: false, error: 'Jugador no encontrado' };

      if (!forzar) {
        const dist = distance(current.x, current.y, targetX, targetY);
        if (dist > maxDelta) {
          return { ok: false, error: 'Movimiento demasiado lejos', x: current.x, y: current.y };
        }
      }

      const updated = updatePlayer(socket.playerId, { x: targetX, y: targetY });
      const data = formatPlayer(updated);
      const online = onlinePlayers.get(socket.playerId);
      if (online) {
        online.x = data.x;
        online.y = data.y;
      }

      broadcastMove(io, socket.playerId, online, { forzar });
      return { ok: true, x: data.x, y: data.y };
    }

    socket.on('player:move', (payload, ack) => {
      if (!payload?.force && !limiteMovimiento('move:' + socket.playerId)) {
        return ack?.(errorRateLimitSocket('movimiento'));
      }
      const targetX = Number(payload?.x);
      const targetY = Number(payload?.y);
      if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) {
        return ack?.({ ok: false, error: 'Coordenadas inválidas' });
      }
      const max = payload?.force ? MAX_GPS_DELTA : (payload?.gps ? MAX_GPS_DELTA : MAX_MOVE_DELTA);
      const res = applyMove(targetX, targetY, max, !!payload?.force);
      ack?.(res);
    });

    socket.on('player:updateStats', (payload, ack) => {
      const { fields, hpMax: hpMaxCalc } = validarStatsJugador({
        hp: payload?.hp,
        hunger: payload?.hunger,
        xp: payload?.xp,
        level: payload?.level
      });

      const updated = updatePlayer(socket.playerId, fields);
      const data = formatPlayer(updated);
      const online = onlinePlayers.get(socket.playerId);
      const hpMax = Math.min(
        hpMaxCalc,
        payload?.hpMax != null ? Math.max(1, Math.round(payload.hpMax)) : hpMaxCalc
      );
      if (online) {
        online.hp = data.hp;
        online.level = data.level;
        if (payload?.invisibleUntil !== undefined) {
          online.invisibleUntil = payload.invisibleUntil > 0 ? payload.invisibleUntil : 0;
        }
        online.hpMax = hpMax;
        const dead = data.hp <= 0;
        online.dead = dead;
        if (dead && payload?.deathX != null && payload?.deathY != null) {
          online.deathX = Number(payload.deathX);
          online.deathY = Number(payload.deathY);
          online.deadInventory = Array.isArray(payload.deadInventory) ? payload.deadInventory : [];
          online.deadLevel = payload.deadLevel || online.level;
        } else if (!dead) {
          online.deathX = null;
          online.deathY = null;
          online.deadInventory = [];
          online.deadLevel = null;
        } else if (dead && online.deathX == null) {
          online.deathX = data.x;
          online.deathY = data.y;
          if (Array.isArray(payload.deadInventory)) {
            online.deadInventory = payload.deadInventory;
            online.deadLevel = payload.deadLevel || online.level;
          }
        }
      }

      io.emit('player:updateStats', {
        playerId: socket.playerId,
        hp: data.hp,
        hpMax: online?.hpMax || 100,
        hunger: data.hunger,
        xp: data.xp,
        level: data.level,
        dead: online?.dead || data.hp <= 0,
        deathX: online?.deathX,
        deathY: online?.deathY,
        deadInventory: online?.deadInventory || [],
        deadLevel: online?.deadLevel || data.level
      });

      if (online?.dead || data.hp <= 0) {
        registrarCuerpoMuerto(socket.playerId, {
          name: online?.name || data.name,
          deathX: online?.deathX,
          deathY: online?.deathY,
          deadLevel: online?.deadLevel || data.level,
          deadInventory: online?.deadInventory || [],
          level: data.level
        }, io);
      } else {
        quitarCuerpoMuerto(socket.playerId, io);
      }

      if (payload?.perfilId && payload?.partida) {
        if (!canEditPartida({ playerId: socket.playerId, role: socket.role }, payload.perfilId)) {
          return ack?.({ ok: false, error: 'No puedes modificar la partida de otro jugador' });
        }
        auditarSiAdminEditaAjeno(socket.playerId, payload.perfilId, 'socket partida');
        actualizarPartidaEnSnapshot(payload.perfilId, payload.partida, io);
      } else if (payload?.perfilId && payload?.partidaMin) {
        if (!canEditPartida({ playerId: socket.playerId, role: socket.role }, payload.perfilId)) {
          return ack?.({ ok: false, error: 'No puedes modificar la partida de otro jugador' });
        }
        const snap = getWorldSnapshot();
        const prevDatos = snap?.partidas?.[payload.perfilId]?.datos || {};
        const { validarPartidaMin } = require('./playerStats');
        const statsT = payload.statsT || Date.now();
        actualizarPartidaEnSnapshot(payload.perfilId, {
          datos: Object.assign({}, prevDatos, validarPartidaMin(payload.partidaMin)),
          t: statsT,
          statsT
        }, io);
      }

      ack?.({ ok: true, player: data });
    });

    socket.on('admin:revivePlayer', (payload, ack) => {
      if (!isGameAdminPlayer(socket.playerId)) {
        return ack?.({ ok: false, error: 'Solo el administrador del juego' });
      }

      let targetId = parseInt(payload?.targetPlayerId, 10);
      if (!Number.isFinite(targetId) || targetId <= 0) {
        const perfilId = payload?.perfilId;
        if (perfilId && String(perfilId).startsWith('srv_')) {
          targetId = parseInt(String(perfilId).slice(4), 10);
        }
        if (!Number.isFinite(targetId) || targetId <= 0) {
          const snapshot = getWorldSnapshot();
          const jug = snapshot?.jugadores?.find(j => j && j.id === perfilId);
          if (jug?.nombre) {
            const p = findPlayerByName(jug.nombre);
            if (p) targetId = p.id;
          }
        }
      }
      if (!Number.isFinite(targetId) || targetId <= 0) {
        return ack?.({ ok: false, error: 'Jugador no encontrado' });
      }

      const targetOnline = onlinePlayers.get(targetId);
      const targetDb = findPlayerById(targetId);
      const cuerpo = getCuerpoMuerto(targetId, io);
      if (!targetDb) return ack?.({ ok: false, error: 'Jugador no encontrado' });

      const isDead = targetOnline?.dead || targetDb.hp <= 0 || !!cuerpo;
      if (!isDead) return ack?.({ ok: false, error: 'Ese jugador no está muerto' });

      const hpMax = Math.max(1, Math.round(payload?.hpMax || targetOnline?.hpMax || 100));
      const cura = vidaReviveDesdeMax(hpMax, payload?.reviveHp);
      const invRestante = (targetOnline?.deadInventory || cuerpo?.deadInventory || []).map(x => ({ ...x }));
      updatePlayer(targetId, { hp: cura });
      if (targetOnline) {
        targetOnline.hp = cura;
        targetOnline.dead = false;
        targetOnline.deathX = null;
        targetOnline.deathY = null;
        targetOnline.deadInventory = [];
        targetOnline.deadLevel = null;
      }
      quitarCuerpoMuerto(targetId, io);

      const perfilId = payload?.perfilId || buscarPerfilIdPorNombre(targetDb.name, targetId);
      if (perfilId) revivirPartidaEnSnapshot(perfilId, cura, io, invRestante);

      io.emit('player:revived', {
        playerId: targetId,
        hp: cura,
        hpMax,
        reviverId: socket.playerId,
        reviverName: adminPl.name,
        fromAdmin: true,
        deadInventory: invRestante
      });
      io.emit('player:updateStats', {
        playerId: targetId,
        hp: cura,
        hpMax,
        level: targetDb.level,
        dead: false,
        deathX: null,
        deathY: null
      });
      ack?.({ ok: true, hp: cura });
    });

    socket.on('admin:updatePlayerPartida', (payload, ack) => {
      if (!isGameAdminPlayer(socket.playerId)) {
        return ack?.({ ok: false, error: 'Solo el administrador del juego' });
      }

      const targetId = parseInt(payload?.targetPlayerId, 10);
      const targetOnline = onlinePlayers.get(targetId);
      const targetDb = findPlayerById(targetId);
      if (!targetDb) return ack?.({ ok: false, error: 'Jugador no encontrado' });

      const level = Math.max(1, Math.min(100, Math.round(payload?.level ?? targetDb.level ?? 1)));
      const hpMax = Math.max(1, Math.round(payload?.hpMax || targetOnline?.hpMax || 100));
      const hp = Math.max(0, Math.min(hpMax, Math.round(payload?.hp ?? hpMax)));
      const dead = payload?.dead === true || hp <= 0;
      const xp = payload?.xp != null ? Math.max(0, Math.round(payload.xp)) : targetDb.xp;

      updatePlayer(targetId, { hp, level, xp });
      if (targetOnline) {
        targetOnline.hp = hp;
        targetOnline.hpMax = hpMax;
        targetOnline.level = level;
        targetOnline.dead = dead;
        if (!dead) {
          targetOnline.deathX = null;
          targetOnline.deathY = null;
          targetOnline.deadInventory = [];
          targetOnline.deadLevel = null;
        }
      }

      const perfilId = payload?.perfilId || buscarPerfilIdPorNombre(targetDb.name, targetId);
      if (perfilId && payload?.partidaSnap) {
        auditarSiAdminEditaAjeno(socket.playerId, perfilId, 'socket admin:updatePlayerPartida');
        actualizarPartidaEnSnapshot(perfilId, payload.partidaSnap, io);
      }

      if (!dead && hp > 0) {
        quitarCuerpoMuerto(targetId, io);
      }

      io.emit('player:updateStats', {
        playerId: targetId,
        hp,
        hpMax,
        level,
        xp,
        dead,
        deathX: dead ? (targetOnline?.deathX ?? null) : null,
        deathY: dead ? (targetOnline?.deathY ?? null) : null
      });
      ack?.({ ok: true });
    });

    socket.on('admin:movePlayerPin', (payload, ack) => {
      if (!isGameAdminPlayer(socket.playerId)) {
        return ack?.({ ok: false, error: 'Solo el administrador del juego' });
      }

      const targetId = parseInt(payload?.targetPlayerId, 10);
      const targetX = Number(payload?.x);
      const targetY = Number(payload?.y);
      if (!targetId || !Number.isFinite(targetX) || !Number.isFinite(targetY)) {
        return ack?.({ ok: false, error: 'Datos inválidos' });
      }

      const targetDb = findPlayerById(targetId);
      if (!targetDb) return ack?.({ ok: false, error: 'Jugador no encontrado' });

      const updated = updatePlayer(targetId, { x: targetX, y: targetY });
      const data = formatPlayer(updated);
      const online = onlinePlayers.get(targetId);
      if (online) {
        online.x = data.x;
        online.y = data.y;
        broadcastMove(io, targetId, online);
      }

      io.to('player:' + targetId).emit('player:adminMove', { x: targetX, y: targetY });

      const perfilId = payload?.perfilId || buscarPerfilIdPorNombre(targetDb.name, targetId);
      if (perfilId) {
        const snap = getWorldSnapshot();
        const prev = snap?.partidas?.[perfilId];
        const datos = prev?.datos ? Object.assign({}, prev.datos) : {};
        datos.posicionJugador = [targetX, targetY];
        actualizarPartidaEnSnapshot(perfilId, { datos, t: Date.now() }, io);
      }

      ack?.({ ok: true, x: targetX, y: targetY });
    });

    socket.on('world:adminUpsert', (payload, ack) => {
      if (!isGameAdminPlayer(socket.playerId)) {
        return ack?.({ ok: false, error: 'Solo el administrador del juego' });
      }
      if (!limiteAdminMapa('adminMapa:' + socket.playerId)) {
        return ack?.(errorRateLimitSocket('adminMapa'));
      }
      const { id, type, x, y, data } = payload || {};
      const r = adminUpsertContent({
        id,
        type,
        x,
        y,
        data,
        updatedBy: 'admin:' + socket.playerId
      });
      if (!r.ok) return ack?.(r);
      const pub = refreshMundoPublicadoDesdeBD(io);
      emitirDeltaMapaPorOrigenId(r.id, io);
      try {
        const { registrar } = require('./eventLog');
        registrar('world_admin_upsert', `${type}:${id}`);
      } catch (e) { /* */ }
      ack?.({ ok: true, id: r.id, type: r.type, actualizadoEn: pub.actualizadoEn });
    });

    socket.on('world:adminDelete', (payload, ack) => {
      if (!isGameAdminPlayer(socket.playerId)) {
        return ack?.({ ok: false, error: 'Solo el administrador del juego' });
      }
      if (!limiteAdminMapa('adminMapa:' + socket.playerId)) {
        return ack?.(errorRateLimitSocket('adminMapa'));
      }
      const id = payload?.id;
      const r = adminDeleteContent(id, 'admin:' + socket.playerId);
      if (!r.ok) return ack?.(r);
      const pub = refreshMundoPublicadoDesdeBD(io);
      emitirRemoveMapaPorOrigenId(r.id, io);
      try {
        const { registrar } = require('./eventLog');
        registrar('world_admin_delete', String(id));
      } catch (e) { /* */ }
      ack?.({ ok: true, id: r.id, tombstone: true, actualizadoEn: pub.actualizadoEn });
    });

    socket.on('world:adminConfig', (payload, ack) => {
      if (!isGameAdminPlayer(socket.playerId)) {
        return ack?.({ ok: false, error: 'Solo el administrador del juego' });
      }
      if (!limiteAdminMapa('adminMapa:' + socket.playerId)) {
        return ack?.(errorRateLimitSocket('adminMapa'));
      }
      const { key, value } = payload || {};
      const r = adminConfigContent(key, value, 'admin:' + socket.playerId);
      if (!r.ok) return ack?.(r);
      const pub = refreshMundoPublicadoDesdeBD(io);
      try {
        const { registrar } = require('./eventLog');
        registrar('world_admin_config', String(r.key));
      } catch (e) { /* */ }
      ack?.({ ok: true, key: r.key, actualizadoEn: pub.actualizadoEn });
    });

    socket.on('player:revive', (payload, ack) => {
      const targetId = parseInt(payload?.targetPlayerId, 10);
      const targetOnline = onlinePlayers.get(targetId);
      const targetDb = findPlayerById(targetId);
      const reviver = findPlayerById(socket.playerId);
      const cuerpo = getCuerpoMuerto(targetId, io);
      if (!targetDb || !reviver) return ack?.({ ok: false, error: 'Jugador no encontrado' });

      const isDead = targetOnline?.dead || targetDb.hp <= 0 || !!cuerpo;
      if (!isDead) return ack?.({ ok: false, error: 'Ese jugador no está muerto' });

      const tx = targetOnline?.deathX ?? cuerpo?.deathX ?? targetDb.x;
      const ty = targetOnline?.deathY ?? cuerpo?.deathY ?? targetDb.y;
      const actorPos = posicionJugadorOnline(socket.playerId, payload, onlinePlayers);
      if (!cercaDeCuerpo(actorPos, tx, ty)) {
        return ack?.({ ok: false, error: 'Demasiado lejos (máx. 50 m)' });
      }

      const hpMax = Math.max(1, Math.round(payload?.hpMax || targetOnline?.hpMax || 100));
      const cura = vidaReviveDesdeMax(hpMax, payload?.reviveHp);
      const invRestante = (targetOnline?.deadInventory || cuerpo?.deadInventory || []).map(x => ({ ...x }));
      updatePlayer(targetId, { hp: cura });
      if (targetOnline) {
        targetOnline.hp = cura;
        targetOnline.dead = false;
        targetOnline.deathX = null;
        targetOnline.deathY = null;
        targetOnline.deadInventory = [];
        targetOnline.deadLevel = null;
      }
      quitarCuerpoMuerto(targetId, io);

      const perfilId = buscarPerfilIdPorNombre(targetDb.name, targetId);
      if (perfilId) revivirPartidaEnSnapshot(perfilId, cura, io, invRestante);

      io.emit('player:revived', {
        playerId: targetId,
        hp: cura,
        hpMax,
        reviverId: socket.playerId,
        reviverName: reviver.name,
        deadInventory: invRestante
      });
      io.emit('player:updateStats', {
        playerId: targetId,
        hp: cura,
        hpMax,
        level: targetDb.level,
        dead: false,
        deathX: null,
        deathY: null
      });
      ack?.({ ok: true, hp: cura });
    });

    socket.on('player:updateInventory', (payload, ack) => {
      return ack?.({
        ok: false,
        error: 'Inventario solo lo actualiza el servidor (acción no permitida desde el cliente)'
      });
    });

    socket.on('world:cutTree', (payload, ack) => {
      const objectId = parseInt(payload?.objectId, 10);
      const obj = findWorldObject(objectId);
      if (!obj || obj.type !== 'tree') return ack?.({ ok: false, error: 'Árbol no encontrado' });

      const pl = findPlayerById(socket.playerId);
      if (distance(pl.x, pl.y, obj.x, obj.y) > INTERACT_DISTANCE) {
        return ack?.({ ok: false, error: 'Demasiado lejos del árbol' });
      }

      const data = JSON.parse(obj.data_json || '{}');
      data.hp = (data.hp || 3) - 1;

      if (data.hp <= 0) {
        deleteWorldObject(objectId);
        io.emit('world:removeObject', { id: objectId });
        return ack?.({ ok: true, removed: true });
      }

      const updated = updateWorldObject(objectId, { data_json: JSON.stringify(data) });
      io.emit('world:updateObject', formatWorldObject(updated));
      ack?.({ ok: true, object: formatWorldObject(updated) });
    });

    socket.on('world:pickupShared', (payload, ack) => {
      const origenId = (payload?.origenId || '').trim();
      if (!origenId) return ack?.({ ok: false, error: 'origenId requerido' });
      const result = registrarRecogidaObjeto(origenId, socket.playerId, io, {
        lat: payload?.lat ?? payload?.pos?.[0],
        lng: payload?.lng ?? payload?.pos?.[1]
      });
      ack?.(result);
    });

    socket.on('world:dropBag', (payload, ack) => {
      const pl = findPlayerById(socket.playerId);
      if (!pl) return ack?.({ ok: false, error: 'Jugador no encontrado' });
      const x = Number(payload?.x ?? payload?.pos?.[0]);
      const y = Number(payload?.y ?? payload?.pos?.[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return ack?.({ ok: false, error: 'Posición inválida' });
      }
      if (distanciaMetros(pl.x, pl.y, x, y) > REVIVE_DISTANCE_METERS) {
        return ack?.({ ok: false, error: 'Demasiado lejos para soltar' });
      }
      const result = crearBolsaDrop(socket.playerId, x, y, payload?.items, io, {
        ocultoHasta: payload?.ocultoHasta || 0,
        ocultoParaPlayerId: payload?.ocultoParaPlayerId || null,
        recogibleDesde: payload?.recogibleDesde || 0,
        soloDropper: !!payload?.soloDropper
      });
      ack?.(result);
    });

    socket.on('world:attackEnemy', (payload, ack) => {
      const enemyId = (payload?.enemyId || '').trim();
      if (!enemyId) return ack?.({ ok: false, error: 'enemyId requerido' });
      const pl = findPlayerById(socket.playerId);
      if (!pl) return ack?.({ ok: false, error: 'Jugador no encontrado' });
      const px = Number(payload?.x ?? payload?.pos?.[0] ?? pl.x);
      const py = Number(payload?.y ?? payload?.pos?.[1] ?? pl.y);
      if (!Number.isFinite(px) || !Number.isFinite(py)) {
        return ack?.({ ok: false, error: 'Posición inválida' });
      }
      const result = registrarAtaqueEnemigo(
        enemyId,
        socket.playerId,
        px,
        py,
        pl.level || 1,
        io
      );
      ack?.(result);
    });

    socket.on('world:claimEnemyLoot', (payload, ack) => {
      const botinId = (payload?.botinId || '').trim();
      if (!botinId) return ack?.({ ok: false, error: 'botinId requerido' });
      const pl = findPlayerById(socket.playerId);
      if (!pl) return ack?.({ ok: false, error: 'Jugador no encontrado' });
      const bx = Number(payload?.x ?? payload?.pos?.[0]);
      const by = Number(payload?.y ?? payload?.pos?.[1]);
      if (Number.isFinite(bx) && Number.isFinite(by) &&
          distanciaMetros(pl.x, pl.y, bx, by) > REVIVE_DISTANCE_METERS) {
        return ack?.({ ok: false, error: 'Demasiado lejos del botín' });
      }
      const result = reclamarBotinEnemigo(botinId, socket.playerId, io);
      ack?.(result);
    });

    socket.on('world:pickupBag', (payload, ack) => {
      const bolsaId = (payload?.bolsaId || '').trim();
      if (!bolsaId) return ack?.({ ok: false, error: 'bolsaId requerido' });
      const pl = findPlayerById(socket.playerId);
      if (!pl) return ack?.({ ok: false, error: 'Jugador no encontrado' });
      const bx = Number(payload?.x ?? payload?.pos?.[0]);
      const by = Number(payload?.y ?? payload?.pos?.[1]);
      if (Number.isFinite(bx) && Number.isFinite(by) &&
          distanciaMetros(pl.x, pl.y, bx, by) > REVIVE_DISTANCE_METERS) {
        return ack?.({ ok: false, error: 'Demasiado lejos' });
      }
      const result = recogerBolsaDrop(bolsaId, socket.playerId, payload?.recogidos, io, {
        autoritativo: true
      });
      ack?.(result);
    });

    socket.on('world:tesoroRecogido', (payload, ack) => {
      const tesoroId = (payload?.tesoroId || '').trim();
      if (!tesoroId) return ack?.({ ok: false, error: 'tesoroId requerido' });
      const result = registrarRecogidaTesoro(tesoroId, socket.playerId, io, {
        lat: payload?.lat ?? payload?.pos?.[0],
        lng: payload?.lng ?? payload?.pos?.[1]
      });
      ack?.(result);
    });

    socket.on('player:shopBuy', (payload, ack) => {
      const tiendaId = (payload?.tiendaId || '').trim();
      const itemId = (payload?.itemId || '').trim();
      if (!tiendaId || !itemId) return ack?.({ ok: false, error: 'tiendaId e itemId requeridos' });
      const { comprarEnTienda } = require('../playerEconomy');
      const result = comprarEnTienda(
        socket.playerId,
        tiendaId,
        itemId,
        Number(payload?.lat ?? payload?.pos?.[0]),
        Number(payload?.lng ?? payload?.pos?.[1]),
        io
      );
      ack?.(result);
    });

    socket.on('player:useItem', (payload, ack) => {
      const itemId = (payload?.itemId || '').trim();
      if (!itemId) return ack?.({ ok: false, error: 'itemId requerido' });
      const { usarConsumible } = require('../playerEconomy');
      const result = usarConsumible(
        socket.playerId,
        itemId,
        payload?.cantidad || 1,
        io
      );
      ack?.(result);
    });

    socket.on('player:cookItem', (payload, ack) => {
      const itemId = (payload?.itemId || '').trim();
      if (!itemId) return ack?.({ ok: false, error: 'itemId requerido' });
      const { cocinarItem } = require('../playerEconomy');
      const result = cocinarItem(
        socket.playerId,
        itemId,
        payload?.cantidad || 1,
        io
      );
      ack?.(result);
    });

    socket.on('player:lootBody', (payload, ack) => {
      const targetId = parseInt(payload?.targetPlayerId, 10);
      const itemId = (payload?.itemId || '').trim();
      const cantidad = Math.max(1, parseInt(payload?.cantidad, 10) || 1);
      const targetOnline = onlinePlayers.get(targetId);
      const cuerpo = getCuerpoMuerto(targetId, io);
      const reviver = findPlayerById(socket.playerId);
      if (!reviver) return ack?.({ ok: false, error: 'Jugador no encontrado' });

      let inv, tx, ty;
      if (targetOnline && (targetOnline.dead || targetOnline.hp <= 0)) {
        inv = targetOnline.deadInventory || [];
        tx = targetOnline.deathX ?? targetOnline.x;
        ty = targetOnline.deathY ?? targetOnline.y;
      } else if (cuerpo) {
        inv = cuerpo.deadInventory || [];
        tx = cuerpo.deathX;
        ty = cuerpo.deathY;
      } else {
        return ack?.({ ok: false, error: 'No está muerto' });
      }

      const actorPos = posicionJugadorOnline(socket.playerId, payload, onlinePlayers);
      if (!cercaDeCuerpo(actorPos, tx, ty)) {
        return ack?.({ ok: false, error: 'Demasiado lejos (máx. 50 m)' });
      }
      const idx = inv.findIndex(x => x.id === itemId);
      if (idx < 0) return ack?.({ ok: false, error: 'Objeto no encontrado' });
      const tomar = Math.min(cantidad, inv[idx].cantidad || 1);
      inv[idx].cantidad -= tomar;
      if (inv[idx].cantidad <= 0) inv.splice(idx, 1);
      if (targetOnline) targetOnline.deadInventory = inv;
      const targetDbPl = findPlayerById(targetId);
      const perfilId = targetDbPl ? buscarPerfilIdPorNombre(targetDbPl.name, targetId) : null;
      registrarLootMuerto(targetId, perfilId, inv, io);
      ack?.({ ok: true, item: { id: itemId, cantidad: tomar }, deadInventory: inv });
    });

    socket.on('world:pickup', (payload, ack) => {
      const objectId = parseInt(payload?.objectId, 10);
      const obj = findWorldObject(objectId);
      if (!obj || obj.state !== 'active') return ack?.({ ok: false, error: 'Objeto no disponible' });

      const pl = findPlayerById(socket.playerId);
      if (distance(pl.x, pl.y, obj.x, obj.y) > INTERACT_DISTANCE) {
        return ack?.({ ok: false, error: 'Demasiado lejos' });
      }

      const itemData = JSON.parse(obj.data_json || '{}');
      const inventory = JSON.parse(pl.inventory_json || '[]');
      inventory.push({
        itemId: itemData.itemId || obj.type,
        cantidad: itemData.cantidad || 1,
        icon: itemData.icon || '📦'
      });

      updatePlayer(socket.playerId, { inventory_json: JSON.stringify(inventory) });
      deleteWorldObject(objectId);
      io.emit('world:removeObject', { id: objectId });
      socket.emit('player:updateInventory', { inventory });
      ack?.({ ok: true, inventory });
    });

    socket.on('mission:complete', (payload, ack) => {
      const missionId = parseInt(payload?.missionId, 10);
      const mission = findMission(missionId);
      if (!mission || !mission.is_active) return ack?.({ ok: false, error: 'Misión no activa' });

      const pm = upsertPlayerMission(socket.playerId, missionId, 'completed', payload?.progress || {});
      const reward = JSON.parse(mission.reward_json || '{}');
      const pl = findPlayerById(socket.playerId);
      const updates = {};
      if (reward.xp) updates.xp = pl.xp + reward.xp;
      if (reward.hp) updates.hp = Math.min(100, pl.hp + reward.hp);
      if (reward.items && Array.isArray(reward.items)) {
        const inv = JSON.parse(pl.inventory_json || '[]');
        for (const it of reward.items) inv.push(it);
        updates.inventory_json = JSON.stringify(inv);
      }
      if (Object.keys(updates).length) updatePlayer(socket.playerId, updates);

      io.emit('mission:complete', { playerId: socket.playerId, missionId, playerMission: pm });
      ack?.({ ok: true, reward });
    });

    socket.on('friends:refresh', (ack) => {
      if (!limiteAmigos('friends:' + socket.playerId)) {
        return ack?.({ ok: false, error: 'Demasiadas solicitudes — espera un momento' });
      }
      const onlineIds = [...onlinePlayers.keys()];
      const social = getSocialData(socket.playerId, onlineIds);
      socket.emit('friends:data', social);
      ack?.({ ok: true });
    });

    socket.on('chat:history', (payload, ack) => {
      const otherId = parseInt(payload?.playerId, 10);
      if (!Number.isFinite(otherId) || otherId === socket.playerId) {
        return ack?.({ ok: false, error: 'Jugador inválido' });
      }
      if (!canChatBetween(socket.playerId, otherId)) {
        return ack?.({ ok: false, error: 'Chat bloqueado' });
      }
      const messages = getChatHistory(socket.playerId, otherId);
      ack?.({ ok: true, messages });
    });

    socket.on('chat:send', (payload, ack) => {
      if (!limiteChat('chat:' + socket.playerId)) {
        return ack?.({ ok: false, error: 'Demasiados mensajes — espera un momento' });
      }
      const toId = parseInt(payload?.toPlayerId, 10);
      const type = String(payload?.type || 'text');
      const text = String(payload?.text || '').trim().slice(0, 500);
      if (!Number.isFinite(toId) || toId === socket.playerId) {
        return ack?.({ ok: false, error: 'Destinatario inválido' });
      }
      if (!canChatBetween(socket.playerId, toId)) {
        return ack?.({ ok: false, error: 'No puedes enviar mensajes' });
      }
      let lat = null;
      let lng = null;
      if (type === 'location') {
        lat = Number(payload?.lat);
        lng = Number(payload?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return ack?.({ ok: false, error: 'Ubicación inválida' });
        }
      } else if (!text) {
        return ack?.({ ok: false, error: 'Mensaje vacío' });
      }
      const msg = insertChatMessage(socket.playerId, toId, type, text, lat, lng);
      io.to('player:' + toId).emit('chat:message', msg);
      io.to('player:' + socket.playerId).emit('chat:message', msg);
      ack?.({ ok: true, message: msg });
    });

    socket.on('chat:markRead', (payload, ack) => {
      const otherId = parseInt(payload?.playerId, 10);
      const messageId = parseInt(payload?.messageId, 10);
      if (!Number.isFinite(otherId) || otherId === socket.playerId) {
        return ack?.({ ok: false, error: 'Jugador inválido' });
      }
      if (!canChatBetween(socket.playerId, otherId)) {
        return ack?.({ ok: false, error: 'Chat bloqueado' });
      }
      const result = markChatRead(socket.playerId, otherId, messageId);
      if (!result) return ack?.({ ok: false, error: 'Mensaje inválido' });
      io.to('player:' + otherId).emit('chat:read', {
        fromPlayerId: socket.playerId,
        lastReadMessageId: result.lastReadMessageId
      });
      ack?.({ ok: true, lastReadMessageId: result.lastReadMessageId });
    });

    socket.on('disconnect', () => {
      socketToPlayer.delete(socket.id);
      const cur = onlinePlayers.get(socket.playerId);
      if (cur && cur.socketId === socket.id) {
        emitirACercanos(io, onlinePlayers, socket.playerId, 'player:offline', {
          playerId: socket.playerId
        });
        limpiarJugador(socket.playerId);
        onlinePlayers.delete(socket.playerId);
      }
    });
  });
}

/** Expulsa jugadores cuya cuenta fue eliminada por el admin. */
function expulsarCuentasEliminadas(io, cuentas) {
  if (!io || !Array.isArray(cuentas) || !cuentas.length) return;
  const t = Date.now();
  for (const c of cuentas) {
    const playerId = c.playerId;
    const perfilId = c.perfilId || (playerId ? 'srv_' + playerId : null);
    const payload = {
      perfilId,
      nombre: c.nombre || '',
      motivo: 'eliminada',
      t
    };
    if (perfilId) {
      io.emit('partida:sync', { perfilId, eliminado: true, actualizadoEn: t });
    }
    if (playerId) {
      io.to('player:' + playerId).emit('account:deleted', payload);
      const online = onlinePlayers.get(playerId);
      if (online?.socketId) {
        const sock = io.sockets.sockets.get(online.socketId);
        if (sock) sock.disconnect(true);
      }
    }
  }
}

module.exports = { setupSockets, onlinePlayers, expulsarCuentasEliminadas };
