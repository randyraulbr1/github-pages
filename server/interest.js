/**
 * Fase 4 — zonas de interés (jugadores cercanos) para reducir tráfico GPS.
 */
const { getBlockedIds, getBlockedByIds } = require('./db');

/** Alineado con CONFIG.distanciaVerEntidades del cliente (500 m). */
const INTEREST_RADIUS_M = 500;

/** No reenviar micro-movimientos si ya hubo broadcast reciente (4.2). */
const MOVE_BROADCAST_COALESCE_MS = 450;
const MOVE_MIN_METERS_BROADCAST = 4;

const lastMoveBroadcast = new Map();

function distanciaMetros(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function distanciaJugadores(a, b) {
  if (!a || !b) return Infinity;
  if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) return Infinity;
  if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) return Infinity;
  return distanciaMetros(a.y, a.x, b.y, b.x);
}

function enRango(a, b, radiusM) {
  return distanciaJugadores(a, b) <= (radiusM || INTEREST_RADIUS_M);
}

function debeOmitirBroadcastMovimiento(playerId, online) {
  const now = Date.now();
  const prev = lastMoveBroadcast.get(playerId);
  if (!prev) return false;
  if (now - prev.t >= MOVE_BROADCAST_COALESCE_MS) return false;
  const d = distanciaMetros(online.y, online.x, prev.y, prev.x);
  return d < MOVE_MIN_METERS_BROADCAST;
}

function marcarBroadcastMovimiento(playerId, online) {
  lastMoveBroadcast.set(playerId, {
    t: Date.now(),
    x: online.x,
    y: online.y
  });
}

function limpiarJugador(playerId) {
  lastMoveBroadcast.delete(playerId);
}

/**
 * Jugadores visibles para un espectador (bloqueos + distancia).
 */
function snapshotCercanos(excludeId, viewerId, onlinePlayers, radiusM) {
  const r = radiusM || INTEREST_RADIUS_M;
  const viewer = onlinePlayers.get(viewerId);
  if (!viewer) return [];

  const blockedByMe = viewerId ? new Set(getBlockedIds(viewerId)) : new Set();
  const blockedMe = viewerId ? new Set(getBlockedByIds(viewerId)) : new Set();

  return [...onlinePlayers.values()].filter(p => {
    const pid = p.playerId;
    if (pid === excludeId) return false;
    if (blockedByMe.has(pid) || blockedMe.has(pid)) return false;
    return enRango(viewer, p, r);
  });
}

/** Emite evento solo a sockets de jugadores en rango del origen (+ el propio origen). */
function emitirACercanos(io, onlinePlayers, origenPlayerId, event, payload, radiusM) {
  const origen = onlinePlayers.get(origenPlayerId);
  if (!origen?.socketId) return;
  const r = radiusM || INTEREST_RADIUS_M;

  io.to(origen.socketId).emit(event, payload);

  for (const [, p] of onlinePlayers) {
    if (p.playerId === origenPlayerId || !p.socketId) continue;
    if (enRango(origen, p, r)) {
      io.to(p.socketId).emit(event, payload);
    }
  }
}

/** Emite a jugadores online dentro del radio de unas coordenadas (p. ej. enemigos). */
function emitirACercanosPorCoordenadas(io, onlinePlayers, x, y, event, payload, radiusM) {
  const r = radiusM || INTEREST_RADIUS_M;
  const ox = Number(x);
  const oy = Number(y);
  if (!Number.isFinite(ox) || !Number.isFinite(oy)) {
    io.emit(event, payload);
    return;
  }
  const origen = { x: ox, y: oy, playerId: -1 };
  for (const [, p] of onlinePlayers) {
    if (!p.socketId) continue;
    if (enRango(origen, p, r)) {
      io.to(p.socketId).emit(event, payload);
    }
  }
}

module.exports = {
  INTEREST_RADIUS_M,
  MOVE_BROADCAST_COALESCE_MS,
  distanciaMetros,
  distanciaJugadores,
  enRango,
  debeOmitirBroadcastMovimiento,
  marcarBroadcastMovimiento,
  limpiarJugador,
  snapshotCercanos,
  emitirACercanos,
  emitirACercanosPorCoordenadas
};
