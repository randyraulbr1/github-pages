/**
 * Fase 3b — economía autoritativa: tienda, tesoro, usar consumible.
 */
const { findPlayerById, getWorldSnapshot, saveWorldSnapshot } = require('./db');
const { validarPartidaMin, vidaMaximaPorNivel } = require('./playerStats');
const {
  agregarAMochila,
  quitarDeMochila,
  contarEnMochila,
  normalizarMochila
} = require('./playerInventory');
const {
  itemFromSnapshot,
  defEfecto,
  tipoConsumible,
  aplicarConsumibleEnDatos
} = require('./itemCatalog');

const SHOP_DISTANCE_METERS = 25;
const PICKUP_DISTANCE_METERS = 25;
const HAMBRE_MAX = 100;

function distanciaMetros(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buscarPerfilId(nombre, playerId) {
  const snapshot = getWorldSnapshot();
  if (!snapshot) return null;
  const u = (nombre || '').trim().toLowerCase();
  if (u && snapshot.jugadores?.length) {
    const j = snapshot.jugadores.find((x) => x.nombre && x.nombre.toLowerCase() === u);
    if (j?.id) return j.id;
  }
  const srvId = 'srv_' + playerId;
  if (snapshot.partidas?.[srvId]) return srvId;
  return null;
}

function getDatosPartida(snapshot, perfilId) {
  const partida = snapshot?.partidas?.[perfilId];
  if (!partida) return { datos: {}, partida: { t: Date.now(), datos: {} } };
  const datos = Object.assign({}, partida.datos || partida);
  if (!datos.mochila) datos.mochila = normalizarMochila([]);
  if (!datos.dinero) datos.dinero = { saldo: 100, control: '' };
  return { datos, partida };
}

function getSaldo(datos) {
  return Math.max(0, Math.round(Number(datos?.dinero?.saldo) || 0));
}

function emitirPartida(io, perfilId, snap, actualizadoEn) {
  if (!io) return;
  io.emit('partida:sync', { perfilId, partida: snap, actualizadoEn });
}

function guardarPartida(snapshot, perfilId, datos, io) {
  if (!snapshot.partidas) snapshot.partidas = {};
  const prev = snapshot.partidas[perfilId] || { t: Date.now() };
  const validados = validarPartidaMin(datos);
  const fusionados = Object.assign({}, prev.datos || {}, validados);
  const snap = {
    ...prev,
    datos: fusionados,
    t: Date.now(),
    statsT: Date.now()
  };
  snapshot.partidas[perfilId] = snap;
  snapshot.actualizadoEn = Date.now();
  saveWorldSnapshot(snapshot);
  emitirPartida(io, perfilId, snap, snapshot.actualizadoEn);
  return snap;
}

function stockDisponible(snapshot, tiendaId, entry) {
  if (entry.infinito) return Infinity;
  const key = tiendaId + '|' + entry.id;
  const st = snapshot.tiendasStock || {};
  if (st[key] !== undefined) return st[key];
  return entry.stock || 0;
}

function findTienda(snapshot, tiendaId) {
  return (snapshot?.tiendasAdmin || []).find((t) => t && t.id === tiendaId) || null;
}

function posTienda(tienda, snapshot) {
  return tienda.posicion || tienda.pos || snapshot?.posiciones?.[tienda.id] || null;
}

function findTesoro(snapshot, tesoroId) {
  return (snapshot?.tesoros || []).find((t) => t && t.id === tesoroId) || null;
}

function itemsDeTesoro(t) {
  if (!t) return [];
  if (t.recItems?.length) {
    return t.recItems
      .filter((it) => it?.id)
      .map((it) => ({ id: it.id, cantidad: Math.max(1, parseInt(it.cantidad, 10) || 1) }));
  }
  if (t.recItem) return [{ id: t.recItem, cantidad: Math.max(1, parseInt(t.recCant, 10) || 1) }];
  return [];
}

function tesoroDisponible(snapshot, tesoroId, respawnMin) {
  const st = snapshot?.tesorosEstado?.[tesoroId];
  if (!st?.recogidoAt) return true;
  if (!respawnMin) return false;
  return Date.now() - st.recogidoAt > respawnMin * 60000;
}

function comprarEnTienda(playerId, tiendaId, itemId, lat, lng, io) {
  const snapshot = getWorldSnapshot() || { actualizadoEn: Date.now(), partidas: {}, tiendasAdmin: [] };
  const pl = findPlayerById(playerId);
  if (!pl) return { ok: false, error: 'Jugador no encontrado' };
  const perfilId = buscarPerfilId(pl.name, playerId);
  if (!perfilId) return { ok: false, error: 'Sin perfil en el mundo' };

  const tienda = findTienda(snapshot, tiendaId);
  if (!tienda) return { ok: false, error: 'Tienda no encontrada' };
  const pos = posTienda(tienda, snapshot);
  if (pos && Number.isFinite(lat) && Number.isFinite(lng)) {
    if (distanciaMetros(lat, lng, pos[0], pos[1]) > SHOP_DISTANCE_METERS) {
      return { ok: false, error: 'Demasiado lejos de la tienda' };
    }
  }

  const entry = (tienda.vende || []).find((e) => e && e.id === itemId);
  if (!entry) return { ok: false, error: 'Este local no vende ese objeto' };

  if (!entry.infinito && stockDisponible(snapshot, tiendaId, entry) <= 0) {
    return { ok: false, error: 'Agotado en esta tienda' };
  }

  const precio = Math.max(0, parseInt(entry.precio, 10) || 0);
  const { datos } = getDatosPartida(snapshot, perfilId);
  if (getSaldo(datos) < precio) return { ok: false, error: 'No tienes suficiente dinero' };

  const agregar = agregarAMochila(datos.mochila, [{ id: itemId, cantidad: 1 }]);
  if (!agregar.ok) return agregar;

  datos.mochila = agregar.mochila;
  datos.dinero = { saldo: getSaldo(datos) - precio, control: '' };

  if (!entry.infinito) {
    if (!snapshot.tiendasStock) snapshot.tiendasStock = {};
    const key = tiendaId + '|' + itemId;
    snapshot.tiendasStock[key] = Math.max(0, stockDisponible(snapshot, tiendaId, entry) - 1);
    if (io) io.emit('world:shopStock', { tiendaId, itemId, stock: snapshot.tiendasStock[key] });
  }

  const snap = guardarPartida(snapshot, perfilId, datos, io);
  return {
    ok: true,
    precio,
    saldo: datos.dinero.saldo,
    mochila: datos.mochila,
    perfilId,
    partida: snap
  };
}

function registrarTesoroConRecompensa(tesoroId, playerId, io, opts) {
  const snapshot = getWorldSnapshot() || { actualizadoEn: Date.now() };
  if (!snapshot.tesorosEstado) snapshot.tesorosEstado = {};

  const t = findTesoro(snapshot, tesoroId);
  if (!t) return { ok: false, error: 'Tesoro no encontrado' };
  if (!tesoroDisponible(snapshot, tesoroId, t.respawnMin)) {
    return { ok: false, error: 'Tesoro no disponible' };
  }

  const pl = findPlayerById(playerId);
  const perfilId = pl ? buscarPerfilId(pl.name, playerId) : null;
  const { datos } = getDatosPartida(snapshot, perfilId || '_');

  const nivel = Math.max(1, parseInt(datos.nivel, 10) || 1);
  if (t.nivelMin && nivel < t.nivelMin) {
    return { ok: false, error: 'Nivel insuficiente' };
  }

  const lat = Number(opts?.lat ?? opts?.pos?.[0]);
  const lng = Number(opts?.lng ?? opts?.pos?.[1]);
  if (t.pos?.length >= 2 && Number.isFinite(lat) && Number.isFinite(lng)) {
    if (distanciaMetros(lat, lng, t.pos[0], t.pos[1]) > PICKUP_DISTANCE_METERS) {
      return { ok: false, error: 'Demasiado lejos' };
    }
  }

  const items = itemsDeTesoro(t);
  const dinero = Math.max(0, parseInt(t.dinero, 10) || 0);

  if (perfilId) {
    if (items.length) {
      const agregar = agregarAMochila(datos.mochila, items);
      if (!agregar.ok) return agregar;
      datos.mochila = agregar.mochila;
    }
    if (dinero > 0) {
      datos.dinero = { saldo: getSaldo(datos) + dinero, control: '' };
    }
    guardarPartida(snapshot, perfilId, datos, io);
  }

  const recogidoAt = Date.now();
  snapshot.tesorosEstado[tesoroId] = { recogidoAt, playerId };
  snapshot.actualizadoEn = Date.now();
  saveWorldSnapshot(snapshot);

  if (io) {
    io.emit('world:tesoroRecogido', { tesoroId, recogidoAt, playerId, dinero, items });
  }

  return {
    ok: true,
    recogidoAt,
    items,
    dinero,
    mochila: perfilId ? datos.mochila : null,
    saldo: perfilId ? datos.dinero?.saldo : null,
    perfilId
  };
}

function usarConsumible(playerId, itemId, cantidad, io) {
  const qty = Math.max(1, Math.min(10, parseInt(cantidad, 10) || 1));
  const snapshot = getWorldSnapshot() || { actualizadoEn: Date.now(), partidas: {} };
  const item = itemFromSnapshot(itemId, snapshot);
  const def = defEfecto(item);
  if (def && item) def._item = item;
  const tipo = tipoConsumible(itemId, snapshot);
  if (!def || !tipo) return { ok: false, error: 'Objeto no consumible' };
  const pl = findPlayerById(playerId);
  if (!pl) return { ok: false, error: 'Jugador no encontrado' };
  const perfilId = buscarPerfilId(pl.name, playerId);
  if (!perfilId) return { ok: false, error: 'Sin perfil' };

  const { datos } = getDatosPartida(snapshot, perfilId);
  if (datos.muerto || (datos.vida != null && datos.vida <= 0)) {
    return { ok: false, error: 'No puedes usar objetos estando muerto' };
  }

  const quitar = quitarDeMochila(datos.mochila, [{ id: itemId, cantidad: qty }]);
  if (!quitar.ok) return quitar;

  datos.mochila = quitar.mochila;
  const nivel = Math.max(1, parseInt(datos.nivel, 10) || 1);
  const vidaMax = vidaMaximaPorNivel(nivel);

  aplicarConsumibleEnDatos(datos, def, tipo, qty, vidaMax);

  const snap = guardarPartida(snapshot, perfilId, datos, io);
  return {
    ok: true,
    itemId,
    cantidad: qty,
    tipo,
    vida: datos.vida,
    hambre: datos.hambre,
    xp: datos.xp,
    mochila: datos.mochila,
    perfilId,
    partida: snap
  };
}

function cocinarItem(playerId, itemId, cantidad, io) {
  const qty = Math.max(1, Math.min(10, parseInt(cantidad, 10) || 1));
  const snapshot = getWorldSnapshot() || { actualizadoEn: Date.now(), partidas: {} };
  const item = require('./itemCatalog').itemFromSnapshot(itemId, snapshot);
  const destId = require('./itemCatalog').idResultadoCocina(item, itemId, snapshot);
  if (!destId) return { ok: false, error: 'No se puede cocinar' };
  const pl = findPlayerById(playerId);
  if (!pl) return { ok: false, error: 'Jugador no encontrado' };
  const perfilId = buscarPerfilId(pl.name, playerId);
  if (!perfilId) return { ok: false, error: 'Sin perfil' };

  const { datos } = getDatosPartida(snapshot, perfilId);
  if (datos.muerto || (datos.vida != null && datos.vida <= 0)) {
    return { ok: false, error: 'No puedes cocinar estando muerto' };
  }
  if (contarEnMochila(datos.mochila, 'cuchillo') < 1) {
    return { ok: false, error: 'Necesitas un cuchillo' };
  }

  const quitar = quitarDeMochila(datos.mochila, [{ id: itemId, cantidad: qty }]);
  if (!quitar.ok) return quitar;

  const agregar = agregarAMochila(quitar.mochila, [{ id: destId, cantidad: qty }]);
  if (!agregar.ok) {
    return { ok: false, error: agregar.error || 'Mochila llena' };
  }

  datos.mochila = agregar.mochila;
  datos.xp = Math.min(999999999, Math.round(datos.xp || 0) + 2 * qty);

  const snap = guardarPartida(snapshot, perfilId, datos, io);
  return {
    ok: true,
    itemId,
    destId,
    cantidad: qty,
    xp: datos.xp,
    mochila: datos.mochila,
    perfilId,
    partida: snap
  };
}

module.exports = {
  comprarEnTienda,
  registrarTesoroConRecompensa,
  usarConsumible,
  cocinarItem,
  getSaldo,
  guardarPartida
};
