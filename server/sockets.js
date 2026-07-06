/**
 * Socket.IO — multijugador en vivo. El servidor decide; todos ven lo mismo.
 */
const {
  findPlayerById,
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
  getBlockedIds,
  getWorldSnapshot,
  formatPlayer,
  formatWorldObject,
  formatMission
} = require('./db');
const { verifyToken } = require('./auth');
const { startEnemyAI } = require('./enemyAI');
const { registrarRecogidaObjeto } = require('./syncMundo');

/** playerId -> { socketId, playerId, name, x, y, hp, hpMax, level } */
const onlinePlayers = new Map();
/** socketId -> playerId */
const socketToPlayer = new Map();

const MAX_MOVE_DELTA = 0.00035;
const MAX_GPS_DELTA = 0.004;
const INTERACT_DISTANCE = 0.0005;
const SYNC_INTERVAL_MS = 8000;

let enemyAIStarted = false;

function distance(aX, aY, bX, bY) {
  const dx = aX - bX;
  const dy = aY - bY;
  return Math.sqrt(dx * dx + dy * dy);
}

function playerSnapshot(p) {
  return {
    playerId: p.playerId,
    name: p.name,
    x: p.x,
    y: p.y,
    hp: p.hp,
    hpMax: p.hpMax || 100,
    level: p.level
  };
}

function snapshotOnline(excludeId, viewerId) {
  const blocked = viewerId ? new Set(getBlockedIds(viewerId)) : new Set();
  return [...onlinePlayers.values()]
    .filter(p => p.playerId !== excludeId && !blocked.has(p.playerId))
    .map(playerSnapshot);
}

function broadcastMove(io, playerId, online) {
  io.emit('player:move', {
    playerId,
    x: online.x,
    y: online.y,
    name: online.name,
    hp: online.hp,
    hpMax: online.hpMax || 100,
    level: online.level,
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
    if (!payload || payload.role !== 'player') return next(new Error('Token inválido'));
    socket.playerId = payload.playerId;
    socket.userId = payload.sub;
    socket.username = payload.username;
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
      level: formatted.level
    });
    socketToPlayer.set(socket.id, socket.playerId);

    const onlineIds = [...onlinePlayers.keys()];
    const social = getSocialData(socket.playerId, onlineIds);
    const mundoSnapshot = getWorldSnapshot();

    socket.emit('game:init', {
      player: formatted,
      onlinePlayers: snapshotOnline(socket.playerId, socket.playerId),
      worldObjects: getAllWorldObjects().map(formatWorldObject),
      missions: getActiveMissions().map(formatMission),
      playerMissions: getPlayerMissions(socket.playerId),
      social,
      mundoSnapshot,
      mundoActualizadoEn: mundoSnapshot?.actualizadoEn || 0
    });

    socket.broadcast.emit('player:online', playerSnapshot(onlinePlayers.get(socket.playerId)));

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

      broadcastMove(io, socket.playerId, online);
      return { ok: true, x: data.x, y: data.y };
    }

    socket.on('player:move', (payload, ack) => {
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
      const fields = {};
      if (payload?.hp !== undefined) fields.hp = Math.max(0, Math.round(payload.hp));
      if (payload?.hunger !== undefined) fields.hunger = Math.max(0, Math.min(100, Math.round(payload.hunger)));
      if (payload?.xp !== undefined) fields.xp = Math.max(0, Math.round(payload.xp));
      if (payload?.level !== undefined) fields.level = Math.max(1, Math.min(100, Math.round(payload.level)));

      const updated = updatePlayer(socket.playerId, fields);
      const data = formatPlayer(updated);
      const online = onlinePlayers.get(socket.playerId);
      if (online) {
        online.hp = data.hp;
        online.level = data.level;
        if (payload?.hpMax !== undefined) {
          online.hpMax = Math.max(1, Math.round(payload.hpMax));
        }
      }

      io.emit('player:updateStats', {
        playerId: socket.playerId,
        hp: data.hp,
        hpMax: online?.hpMax || 100,
        hunger: data.hunger,
        xp: data.xp,
        level: data.level
      });
      ack?.({ ok: true, player: data });
    });

    socket.on('player:updateInventory', (payload, ack) => {
      if (!Array.isArray(payload?.inventory)) {
        return ack?.({ ok: false, error: 'inventory debe ser un array' });
      }
      const updated = updatePlayer(socket.playerId, {
        inventory_json: JSON.stringify(payload.inventory)
      });
      const data = formatPlayer(updated);
      socket.emit('player:updateInventory', { inventory: data.inventory });
      ack?.({ ok: true, inventory: data.inventory });
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
      const result = registrarRecogidaObjeto(origenId, socket.playerId, io);
      ack?.(result);
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
      const onlineIds = [...onlinePlayers.keys()];
      const social = getSocialData(socket.playerId, onlineIds);
      socket.emit('friends:data', social);
      ack?.({ ok: true });
    });

    socket.on('disconnect', () => {
      socketToPlayer.delete(socket.id);
      const cur = onlinePlayers.get(socket.playerId);
      if (cur && cur.socketId === socket.id) {
        onlinePlayers.delete(socket.playerId);
        io.emit('player:offline', { playerId: socket.playerId });
      }
    });
  });
}

module.exports = { setupSockets, onlinePlayers };
