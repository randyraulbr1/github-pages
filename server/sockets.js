/**
 * Socket.IO — el servidor decide el estado final del mundo.
 * El cliente solo envía intenciones (mover, cortar árbol, etc.).
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
  formatPlayer,
  formatWorldObject,
  formatMission
} = require('./db');
const { verifyToken } = require('./auth');

/** Jugadores conectados: playerId -> { socketId, playerId, name, x, y } */
const onlinePlayers = new Map();

/** Distancia máxima permitida por tick (grados ~ metros en Mariel) */
const MAX_MOVE_DELTA = 0.0008;
/** Distancia para interactuar con objetos (grados) */
const INTERACT_DISTANCE = 0.0005;

function distance(aX, aY, bX, bY) {
  const dx = aX - bX;
  const dy = aY - bY;
  return Math.sqrt(dx * dx + dy * dy);
}

function setupSockets(io) {
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

  io.on('connection', (socket) => {
    const player = findPlayerById(socket.playerId);
    if (!player) {
      socket.disconnect(true);
      return;
    }

    const formatted = formatPlayer(player);
    onlinePlayers.set(socket.playerId, {
      socketId: socket.id,
      playerId: socket.playerId,
      name: formatted.name,
      x: formatted.x,
      y: formatted.y
    });

    // Estado inicial al conectar
    socket.emit('game:init', {
      player: formatted,
      onlinePlayers: [...onlinePlayers.values()],
      worldObjects: getAllWorldObjects().map(formatWorldObject),
      missions: getActiveMissions().map(formatMission),
      playerMissions: getPlayerMissions(socket.playerId)
    });

    io.emit('player:online', {
      playerId: socket.playerId,
      name: formatted.name,
      x: formatted.x,
      y: formatted.y
    });

    // --- Movimiento: cliente pide, servidor valida y guarda ---
    socket.on('player:move', (payload, ack) => {
      const targetX = Number(payload?.x);
      const targetY = Number(payload?.y);
      if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) {
        return ack?.({ ok: false, error: 'Coordenadas inválidas' });
      }

      const current = findPlayerById(socket.playerId);
      if (!current) return ack?.({ ok: false, error: 'Jugador no encontrado' });

      const dist = distance(current.x, current.y, targetX, targetY);
      if (dist > MAX_MOVE_DELTA) {
        return ack?.({ ok: false, error: 'Movimiento demasiado lejos', x: current.x, y: current.y });
      }

      const updated = updatePlayer(socket.playerId, { x: targetX, y: targetY });
      const data = formatPlayer(updated);

      const online = onlinePlayers.get(socket.playerId);
      if (online) {
        online.x = data.x;
        online.y = data.y;
      }

      io.emit('player:move', {
        playerId: socket.playerId,
        x: data.x,
        y: data.y
      });

      ack?.({ ok: true, x: data.x, y: data.y });
    });

    // --- Stats: servidor valida rangos ---
    socket.on('player:updateStats', (payload, ack) => {
      const fields = {};
      if (payload?.hp !== undefined) fields.hp = Math.max(0, Math.min(100, Math.round(payload.hp)));
      if (payload?.hunger !== undefined) fields.hunger = Math.max(0, Math.min(100, Math.round(payload.hunger)));
      if (payload?.xp !== undefined) fields.xp = Math.max(0, Math.round(payload.xp));
      if (payload?.level !== undefined) fields.level = Math.max(1, Math.min(100, Math.round(payload.level)));

      const updated = updatePlayer(socket.playerId, fields);
      const data = formatPlayer(updated);

      io.emit('player:updateStats', {
        playerId: socket.playerId,
        hp: data.hp,
        hunger: data.hunger,
        xp: data.xp,
        level: data.level
      });

      ack?.({ ok: true, player: data });
    });

    // --- Inventario: servidor guarda el JSON final ---
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

    // --- Acción: cortar árbol (ejemplo servidor-autoritativo) ---
    socket.on('world:cutTree', (payload, ack) => {
      const objectId = parseInt(payload?.objectId, 10);
      const obj = findWorldObject(objectId);
      if (!obj || obj.type !== 'tree') {
        return ack?.({ ok: false, error: 'Árbol no encontrado' });
      }

      const player = findPlayerById(socket.playerId);
      const dist = distance(player.x, player.y, obj.x, obj.y);
      if (dist > INTERACT_DISTANCE) {
        return ack?.({ ok: false, error: 'Demasiado lejos del árbol' });
      }

      const data = JSON.parse(obj.data_json || '{}');
      data.hp = (data.hp || 3) - 1;

      let updated;
      if (data.hp <= 0) {
        deleteWorldObject(objectId);
        io.emit('world:removeObject', { id: objectId });
        ack?.({ ok: true, removed: true });
        return;
      }

      updated = updateWorldObject(objectId, {
        data_json: JSON.stringify(data)
      });

      const formatted = formatWorldObject(updated);
      io.emit('world:updateObject', formatted);
      ack?.({ ok: true, object: formatted });
    });

    // --- Recoger objeto del mapa ---
    socket.on('world:pickup', (payload, ack) => {
      const objectId = parseInt(payload?.objectId, 10);
      const obj = findWorldObject(objectId);
      if (!obj || obj.state !== 'active') {
        return ack?.({ ok: false, error: 'Objeto no disponible' });
      }

      const player = findPlayerById(socket.playerId);
      const dist = distance(player.x, player.y, obj.x, obj.y);
      if (dist > INTERACT_DISTANCE) {
        return ack?.({ ok: false, error: 'Demasiado lejos' });
      }

      const itemData = JSON.parse(obj.data_json || '{}');
      const inventory = JSON.parse(player.inventory_json || '[]');
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

    // --- Misión completada ---
    socket.on('mission:complete', (payload, ack) => {
      const missionId = parseInt(payload?.missionId, 10);
      const mission = findMission(missionId);
      if (!mission || !mission.is_active) {
        return ack?.({ ok: false, error: 'Misión no activa' });
      }

      const pm = upsertPlayerMission(socket.playerId, missionId, 'completed', payload?.progress || {});
      const reward = JSON.parse(mission.reward_json || '{}');

      const player = findPlayerById(socket.playerId);
      const updates = {};
      if (reward.xp) updates.xp = player.xp + reward.xp;
      if (reward.hp) updates.hp = Math.min(100, player.hp + reward.hp);
      if (reward.items && Array.isArray(reward.items)) {
        const inv = JSON.parse(player.inventory_json || '[]');
        for (const it of reward.items) inv.push(it);
        updates.inventory_json = JSON.stringify(inv);
      }
      if (Object.keys(updates).length) updatePlayer(socket.playerId, updates);

      io.emit('mission:complete', {
        playerId: socket.playerId,
        missionId,
        playerMission: pm
      });

      ack?.({ ok: true, reward });
    });

    socket.on('disconnect', () => {
      onlinePlayers.delete(socket.playerId);
      io.emit('player:offline', { playerId: socket.playerId });
    });
  });
}

module.exports = { setupSockets, onlinePlayers };
