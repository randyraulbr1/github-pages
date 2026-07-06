const {
  db,
  getAllWorldObjects,
  getAllMissions,
  findWorldObject,
  createWorldObject,
  updateWorldObject,
  deleteWorldObject,
  createMission,
  updateMission,
  deleteMission,
  formatWorldObject,
  formatMission,
  saveWorldSnapshot,
  getWorldSnapshot
} = require('./db');
const { pushMundoToGitHub } = require('./githubMundo');

function parseData(row) {
  try { return JSON.parse(row.data_json || '{}'); } catch (e) { return {}; }
}

/** Nunca pierde jugadores/partidas al publicar solo el mapa. */
function mergeJugadoresPartidas(destino, fuentes) {
  if (!destino || typeof destino !== 'object') return destino;
  const porId = new Map();
  for (const fuente of (fuentes || [])) {
    if (!fuente) continue;
    for (const j of (fuente.jugadores || [])) {
      if (!j?.id) continue;
      porId.set(j.id, Object.assign({}, porId.get(j.id), j));
    }
  }
  if (porId.size) destino.jugadores = [...porId.values()];

  if (!destino.partidas) destino.partidas = {};
  for (const fuente of (fuentes || [])) {
    if (!fuente?.partidas) continue;
    for (const [id, p] of Object.entries(fuente.partidas)) {
      const prev = destino.partidas[id];
      if (!prev || !prev.t || (p.t || 0) >= (prev.t || 0)) destino.partidas[id] = p;
    }
  }
  return destino;
}

function registrarCuentaEnSnapshot(perfil, partida) {
  if (!perfil?.id) return false;
  const prev = getWorldSnapshot() || {
    actualizadoEn: Date.now(),
    jugadores: [],
    partidas: {},
    misiones: [],
    tesoros: [],
    objetos: [],
    enemigos: [],
    posiciones: {}
  };
  const mundo = Object.assign({}, prev);
  mergeJugadoresPartidas(mundo, [{
    jugadores: [{
      id: perfil.id,
      nombre: perfil.nombre,
      telefono: perfil.telefono || '',
      pinHash: perfil.pinHash || '',
      creado: perfil.creado || Date.now(),
      sesionToken: perfil.sesionToken,
      sesionT: perfil.sesionT
    }],
    partidas: partida ? { [perfil.id]: partida } : {}
  }]);
  mundo.actualizadoEn = Date.now();
  saveWorldSnapshot(mundo);
  return true;
}

function findObjectByOrigenId(origenId) {
  if (!origenId) return null;
  for (const row of getAllWorldObjects()) {
    const d = parseData(row);
    if (d.origenId === origenId) return row;
  }
  return null;
}

const CUERPO_MS = 3600000;

function limpiarCuerposExpirados(snapshot) {
  if (!snapshot.cuerposMuertos) {
    snapshot.cuerposMuertos = {};
    return false;
  }
  const now = Date.now();
  let changed = false;
  for (const [k, c] of Object.entries(snapshot.cuerposMuertos)) {
    if (!c.muertoAt || now - c.muertoAt > CUERPO_MS) {
      delete snapshot.cuerposMuertos[k];
      changed = true;
    }
  }
  return changed;
}

/** Borra ataúdes vencidos, guarda y avisa a todos los clientes. */
function sincronizarCuerposExpirados(io) {
  const snapshot = getWorldSnapshot();
  if (!snapshot) return;
  if (!limpiarCuerposExpirados(snapshot)) return;
  snapshot.actualizadoEn = Date.now();
  saveWorldSnapshot(snapshot);
  if (io) io.emit('cuerpos:sync', { cuerpos: snapshot.cuerposMuertos || {} });
}

function getCuerpoMuerto(playerId, io) {
  const snapshot = getWorldSnapshot();
  if (!snapshot) return null;
  if (limpiarCuerposExpirados(snapshot)) {
    snapshot.actualizadoEn = Date.now();
    saveWorldSnapshot(snapshot);
    if (io) io.emit('cuerpos:sync', { cuerpos: snapshot.cuerposMuertos || {} });
  }
  return snapshot.cuerposMuertos?.[String(playerId)] || null;
}

function registrarCuerpoMuerto(playerId, data, io) {
  const snapshot = getWorldSnapshot() || { actualizadoEn: Date.now() };
  if (!snapshot.cuerposMuertos) snapshot.cuerposMuertos = {};
  limpiarCuerposExpirados(snapshot);
  snapshot.cuerposMuertos[String(playerId)] = {
    playerId: Number(playerId),
    name: data.name || 'Jugador',
    deathX: data.deathX,
    deathY: data.deathY,
    deadLevel: data.deadLevel || data.level || 1,
    deadInventory: data.deadInventory || [],
    muertoAt: Date.now()
  };
  snapshot.actualizadoEn = Date.now();
  saveWorldSnapshot(snapshot);
  if (io) io.emit('cuerpos:sync', { cuerpos: snapshot.cuerposMuertos });
  return snapshot.cuerposMuertos[String(playerId)];
}

function quitarCuerpoMuerto(playerId, io) {
  const snapshot = getWorldSnapshot();
  if (!snapshot?.cuerposMuertos) return;
  delete snapshot.cuerposMuertos[String(playerId)];
  snapshot.actualizadoEn = Date.now();
  saveWorldSnapshot(snapshot);
  if (io) io.emit('cuerpos:sync', { cuerpos: snapshot.cuerposMuertos || {} });
}

/** Guarda partida de un jugador (vida/muerto) en el snapshot del mundo. */
function actualizarPartidaEnSnapshot(perfilId, partidaSnap, io) {
  if (!perfilId || !partidaSnap) return false;
  const snapshot = getWorldSnapshot() || { actualizadoEn: Date.now(), partidas: {}, jugadores: [] };
  if (!snapshot.partidas) snapshot.partidas = {};
  const actual = snapshot.partidas[perfilId];
  const tNew = partidaSnap.t || Date.now();
  const tOld = actual?.t || 0;
  if (actual && tOld > tNew) return false;
  snapshot.partidas[perfilId] = partidaSnap;
  snapshot.actualizadoEn = Date.now();
  saveWorldSnapshot(snapshot);
  if (io) {
    io.emit('partida:sync', {
      perfilId,
      partida: partidaSnap,
      actualizadoEn: snapshot.actualizadoEn
    });
  }
  return true;
}

/** Busca perfilId PWA por nombre de jugador online o id srv_N. */
function buscarPerfilIdPorNombre(nombre, playerId) {
  const snapshot = getWorldSnapshot();
  if (!snapshot) return null;
  const u = (nombre || '').trim().toLowerCase();
  if (u && snapshot.jugadores?.length) {
    const j = snapshot.jugadores.find(x => x.nombre && x.nombre.toLowerCase() === u);
    if (j?.id) return j.id;
  }
  const srvId = 'srv_' + playerId;
  if (snapshot.partidas?.[srvId]) return srvId;
  return null;
}

/** Convierte [{id,cantidad}] a slots de mochila (25 casillas). */
function inventarioAMochilaSlots(inv) {
  const slots = new Array(25).fill(null);
  let i = 0;
  for (const it of (inv || [])) {
    if (!it?.id || i >= 25) break;
    slots[i++] = { id: it.id, cantidad: it.cantidad || 1 };
  }
  return slots;
}

/** Actualiza mochila del muerto en snapshot (tras saqueo). */
function actualizarMochilaMuertoEnSnapshot(perfilId, inv, io) {
  if (!perfilId) return false;
  const snapshot = getWorldSnapshot() || { actualizadoEn: Date.now(), partidas: {} };
  if (!snapshot.partidas) snapshot.partidas = {};
  const prev = snapshot.partidas[perfilId] || { t: Date.now() };
  const snap = { ...prev };
  const datos = Object.assign({}, snap.datos || snap);
  datos.muerteInventario = inv || [];
  datos.mochila = inventarioAMochilaSlots(inv);
  datos.muerto = true;
  snap.datos = datos;
  snap.t = Date.now();
  snapshot.partidas[perfilId] = snap;
  snapshot.actualizadoEn = Date.now();
  saveWorldSnapshot(snapshot);
  if (io) {
    io.emit('partida:sync', {
      perfilId,
      partida: snap,
      actualizadoEn: snapshot.actualizadoEn
    });
  }
  return true;
}

/** Admin revive: actualiza partida en snapshot por perfilId del juego PWA. */
function revivirPartidaEnSnapshot(perfilId, hp, io, inventarioRestante) {
  if (!perfilId) return false;
  const snapshot = getWorldSnapshot() || { actualizadoEn: Date.now(), partidas: {} };
  if (!snapshot.partidas) snapshot.partidas = {};
  const prev = snapshot.partidas[perfilId];
  const snap = prev ? { ...prev } : { t: Date.now() };
  const datos = Object.assign({}, snap.datos || snap);
  const inv = inventarioRestante != null
    ? inventarioRestante
    : (datos.muerteInventario || []);
  datos.vida = hp;
  datos.muerto = false;
  datos.muerteInventario = null;
  datos.muertePos = null;
  datos.mochila = inventarioAMochilaSlots(inv);
  snap.datos = datos;
  snap.t = Date.now();
  snapshot.partidas[perfilId] = snap;
  snapshot.actualizadoEn = Date.now();
  saveWorldSnapshot(snapshot);
  if (io) {
    io.emit('partida:sync', {
      perfilId,
      partida: snap,
      actualizadoEn: snapshot.actualizadoEn
    });
  }
  return true;
}

/** Elimina jugador y su partida del snapshot (solo admin). */
function eliminarJugadorDeSnapshot(perfilId, io) {
  if (!perfilId) return false;
  const snapshot = getWorldSnapshot();
  if (!snapshot) return false;
  if (snapshot.jugadores) {
    snapshot.jugadores = snapshot.jugadores.filter(j => j && j.id !== perfilId);
  }
  if (snapshot.partidas) delete snapshot.partidas[perfilId];
  snapshot.actualizadoEn = Date.now();
  saveWorldSnapshot(snapshot);
  if (io) {
    io.emit('partida:sync', {
      perfilId,
      eliminado: true,
      actualizadoEn: snapshot.actualizadoEn
    });
  }
  return true;
}

function actualizarInventarioCuerpo(playerId, inv, io) {
  const snapshot = getWorldSnapshot();
  if (!snapshot?.cuerposMuertos?.[String(playerId)]) return;
  snapshot.cuerposMuertos[String(playerId)].deadInventory = inv;
  snapshot.actualizadoEn = Date.now();
  saveWorldSnapshot(snapshot);
  if (io) io.emit('player:lootUpdate', { playerId, deadInventory: inv });
}

/** Saqueo: cuerpo en mapa + partida guardada del muerto. */
function registrarLootMuerto(playerId, perfilId, inv, io) {
  const snapshot = getWorldSnapshot();
  if (snapshot?.cuerposMuertos?.[String(playerId)]) {
    snapshot.cuerposMuertos[String(playerId)].deadInventory = inv;
    snapshot.actualizadoEn = Date.now();
    saveWorldSnapshot(snapshot);
  }
  if (perfilId) actualizarMochilaMuertoEnSnapshot(perfilId, inv, io);
  if (io) io.emit('player:lootUpdate', { playerId, deadInventory: inv });
}

function registrarRecogidaTesoro(tesoroId, playerId, io) {
  const snapshot = getWorldSnapshot() || { actualizadoEn: Date.now() };
  if (!snapshot.tesorosEstado) snapshot.tesorosEstado = {};

  const recogidoAt = Date.now();
  snapshot.tesorosEstado[tesoroId] = { recogidoAt, playerId };
  snapshot.actualizadoEn = Date.now();
  saveWorldSnapshot(snapshot);

  if (io) {
    io.emit('world:tesoroRecogido', { tesoroId, recogidoAt, playerId });
  }

  return { ok: true, recogidoAt };
}

function registrarRecogidaObjeto(origenId, playerId, io) {
  const snapshot = getWorldSnapshot() || { actualizadoEn: Date.now() };
  if (!snapshot.objetosEstado) snapshot.objetosEstado = {};

  const recogidoAt = Date.now();
  snapshot.objetosEstado[origenId] = { recogidoAt, playerId };
  snapshot.actualizadoEn = Date.now();

  const row = findObjectByOrigenId(origenId);
  let reaparece = 0;
  if (row) {
    const d = parseData(row);
    reaparece = d.reaparece || 0;
    if (!reaparece) {
      deleteWorldObject(row.id);
      if (io) io.emit('world:removeObject', { id: row.id, origenId });
    }
  }

  saveWorldSnapshot(snapshot);

  if (io) {
    io.emit('world:objetoRecogido', { origenId, recogidoAt, reaparece });
  }

  return { ok: true, recogidoAt, reaparece };
}

function findMissionByOrigenId(origenId) {
  if (!origenId) return null;
  for (const row of getAllMissions()) {
    const reward = JSON.parse(row.reward_json || '{}');
    if (reward.origenId === origenId) return row;
  }
  return null;
}

function upsertWorldObject(origenId, type, x, y, data, io, silent) {
  const payload = Object.assign({ origenId }, data || {});
  const existing = findObjectByOrigenId(origenId);
  let row;
  if (existing) {
    const campos = {
      type,
      state: 'active',
      data_json: JSON.stringify(payload)
    };
    // La IA mueve enemigos en vivo — no resetear x/y al sincronizar mundo.json
    if (type !== 'enemy') {
      campos.x = Number(x);
      campos.y = Number(y);
    } else {
      let prev = {};
      try { prev = JSON.parse(existing.data_json || '{}'); } catch (e) { prev = {}; }
      if (payload.origenX == null && prev.origenX != null) payload.origenX = prev.origenX;
      if (payload.origenY == null && prev.origenY != null) payload.origenY = prev.origenY;
      campos.data_json = JSON.stringify(payload);
    }
    row = updateWorldObject(existing.id, campos);
  } else {
    row = createWorldObject({
      type,
      x: Number(x),
      y: Number(y),
      state: 'active',
      data_json: JSON.stringify(payload)
    });
  }
  const formatted = formatWorldObject(row);
  if (io && !silent) io.emit('world:updateObject', formatted);
  return formatted;
}

function upsertMission(m, io) {
  const reward = {
    origenId: m.id,
    xp: m.xp || 0,
    dinero: m.dinero || 0,
    reqItem: m.reqItem || null,
    reqCant: m.reqCant || 0,
    consumir: !!m.consumir,
    recItems: m.recItems || [],
    pos: m.pos
  };
  const existing = findMissionByOrigenId(m.id);
  let row;
  if (existing) {
    row = updateMission(existing.id, {
      title: m.titulo || m.title || 'Misión',
      description: m.texto || m.description || '',
      reward_json: JSON.stringify(reward),
      is_active: 1
    });
    if (io) io.emit('mission:update', formatMission(row));
  } else {
    row = createMission({
      title: m.titulo || m.title || 'Misión',
      description: m.texto || m.description || '',
      reward_json: JSON.stringify(reward),
      is_active: 1
    });
    if (io) io.emit('mission:create', formatMission(row));
  }
  return row;
}

function removeWorldObjectByOrigenId(origenId, io) {
  const row = findObjectByOrigenId(origenId);
  if (!row) return;
  deleteWorldObject(row.id);
  if (io) io.emit('world:removeObject', { id: row.id, origenId });
}

function deactivateMissionByOrigenId(origenId, io) {
  const row = findMissionByOrigenId(origenId);
  if (!row) return;
  updateMission(row.id, { is_active: 0 });
  if (io) io.emit('mission:update', { id: row.id, isActive: false, deleted: true, origenId });
}

function posEnemigo(e, mundo) {
  if (e.pos && e.pos.length >= 2) return e.pos;
  const p = (mundo.posiciones || {})[e.id];
  return p && p.length >= 2 ? p : null;
}

function syncMundoFromJson(mundo, io) {
  if (!mundo || typeof mundo !== 'object') {
    return { ok: false, error: 'Mundo inválido' };
  }

  const prev = getWorldSnapshot();
  if (Array.isArray(mundo.jugadores)) {
    // Publicación completa del admin: la lista de jugadores del JSON manda.
    const ids = new Set(mundo.jugadores.map(j => j?.id).filter(Boolean));
    const partidasPrev = {};
    if (prev?.partidas) {
      for (const [id, p] of Object.entries(prev.partidas)) {
        if (ids.has(id)) partidasPrev[id] = p;
      }
    }
    mergeJugadoresPartidas(mundo, [{ partidas: partidasPrev }]);
  } else {
    mergeJugadoresPartidas(mundo, [prev, mundo]);
  }
  if (prev?.cuerposMuertos) {
    mundo.cuerposMuertos = mundo.cuerposMuertos || prev.cuerposMuertos;
    limpiarCuerposExpirados(mundo);
  }

  mundo.actualizadoEn = mundo.actualizadoEn || Date.now();
  const eliminados = new Set(mundo.eliminados || []);
  const seenObjects = new Set();
  const seenMissions = new Set();
  let objetos = 0;
  let misiones = 0;

  for (const o of (mundo.objetos || [])) {
    if (!o?.id || eliminados.has(o.id)) continue;
    if (!o.pos || o.pos.length < 2) continue;
    seenObjects.add(o.id);
    const icon = o.icono || (o.items && o.items[0]?.icon) || '📦';
    upsertWorldObject(o.id, 'item', o.pos[0], o.pos[1], {
      itemId: o.itemId || o.id,
      cantidad: o.cantidad || 1,
      icon,
      items: o.items || [],
      reaparece: o.reaparece,
      nombre: o.nombre || o.itemId
    }, io, true);
    objetos++;
  }

  for (const e of (mundo.enemigos || [])) {
    if (!e?.id || eliminados.has(e.id)) continue;
    const pos = posEnemigo(e, mundo);
    if (!pos) continue;
    seenObjects.add(e.id);
    const st = (mundo.enemigosEstado || {})[e.id] || {};
    upsertWorldObject(e.id, 'enemy', pos[0], pos[1], {
      nombre: e.nombre || 'Enemigo',
      icon: e.icono || '👹',
      hp: st.vida != null ? st.vida : (e.vida || e.vidaMax || 30),
      hpMax: e.vidaMax || e.vida || 30,
      nivel: e.nivel || 1,
      danoMin: e.danoMin || 5,
      danoMax: e.danoMax || e.dano || 10,
      xp: e.xp || 0,
      dinero: e.dinero || 0,
      recItems: e.recItems || [],
      respawnMin: e.respawnMin,
      radioZona: e.radioZona || 40,
      radioAtaque: e.radioAtaque || e.radioPersecucion || 18,
      origenX: (e.posOrigen && e.posOrigen.length >= 2) ? e.posOrigen[0] : pos[0],
      origenY: (e.posOrigen && e.posOrigen.length >= 2) ? e.posOrigen[1] : pos[1]
    }, io, true);
    objetos++;
  }

  for (const t of (mundo.tesoros || [])) {
    if (!t?.id || eliminados.has(t.id)) continue;
    if (!t.pos || t.pos.length < 2) continue;
    seenObjects.add(t.id);
    upsertWorldObject(t.id, 'treasure', t.pos[0], t.pos[1], {
      invisible: !!t.invisible,
      itemParaVer: t.itemParaVer,
      iconoMapa: t.iconoMapa || '💎',
      nivelMin: t.nivelMin || 1,
      recItems: t.recItems || [],
      dinero: t.dinero || 0,
      respawnMin: t.respawnMin,
      tesoroEstado: (mundo.tesorosEstado || {})[t.id] || {}
    }, io, true);
    objetos++;
  }

  for (const t of (mundo.tiendasAdmin || [])) {
    if (!t?.id || eliminados.has(t.id)) continue;
    const pos = t.pos || t.posicion;
    if (!pos || pos.length < 2) continue;
    seenObjects.add(t.id);
    upsertWorldObject(t.id, 'shop', pos[0], pos[1], {
      nombre: t.nombre || 'Tienda',
      icon: t.icono || '🏪',
      vende: t.vende || [],
      stock: (mundo.tiendasStock || {})[t.id] || {}
    }, io, true);
    objetos++;
  }

  for (const m of (mundo.misiones || [])) {
    if (!m?.id || eliminados.has(m.id)) continue;
    if (!m.pos || m.pos.length < 2) continue;
    seenMissions.add(m.id);
    upsertMission(m, io);
    misiones++;
  }

  for (const id of eliminados) {
    removeWorldObjectByOrigenId(id, io);
    deactivateMissionByOrigenId(id, io);
  }

  for (const row of getAllWorldObjects()) {
    const d = parseData(row);
    if (!d.origenId) continue;
    if (seenObjects.has(d.origenId) || eliminados.has(d.origenId)) continue;
    if (row.type === 'enemy' && (mundo.enemigos || []).length === 0) continue;
    deleteWorldObject(row.id);
    if (io) io.emit('world:removeObject', { id: row.id, origenId: d.origenId });
  }

  for (const row of getAllMissions()) {
    const reward = JSON.parse(row.reward_json || '{}');
    if (reward.origenId && !seenMissions.has(reward.origenId) && !eliminados.has(reward.origenId)) {
      updateMission(row.id, { is_active: 0 });
      if (io) io.emit('mission:update', { id: row.id, isActive: false, deleted: true, origenId: reward.origenId });
    }
  }

  try {
    const {
      reconciliarCuentasEnSnapshot,
      purgarCuentasFueraDeSnapshot,
      deduplicarJugadoresPorNombre
    } = require('./syncCuentas');
    if (Array.isArray(mundo.jugadores)) {
      purgarCuentasFueraDeSnapshot(mundo);
      const dedupe = deduplicarJugadoresPorNombre(mundo.jugadores);
      mundo.jugadores = dedupe.jugadores;
      if (dedupe.aliasIds.size) {
        mundo.partidas = mundo.partidas || {};
        for (const [viejo, canon] of dedupe.aliasIds) {
          const p = mundo.partidas[viejo];
          if (!p) continue;
          const prev = mundo.partidas[canon];
          if (!prev || (p.t || 0) >= (prev.t || 0)) mundo.partidas[canon] = p;
          delete mundo.partidas[viejo];
        }
      }
    } else {
      reconciliarCuentasEnSnapshot(mundo);
    }
  } catch (e) { /* */ }

  saveWorldSnapshot(mundo);

  pushMundoToGitHub(mundo).then((r) => {
    if (r.ok) console.log('[mundo] Respaldo GitHub OK');
    else if (!r.skipped) console.warn('[mundo] Respaldo GitHub:', r.error || r.reason);
  }).catch((e) => console.warn('[mundo] Respaldo GitHub:', e.message));

  if (io) {
    io.emit('mundo:sync', {
      actualizadoEn: mundo.actualizadoEn,
      mundo
    });
  }

  return { ok: true, objetos, misiones, actualizadoEn: mundo.actualizadoEn };
}

module.exports = {
  syncMundoFromJson,
  mergeJugadoresPartidas,
  registrarCuentaEnSnapshot,
  getWorldSnapshot,
  registrarRecogidaObjeto,
  registrarRecogidaTesoro,
  registrarCuerpoMuerto,
  quitarCuerpoMuerto,
  getCuerpoMuerto,
  sincronizarCuerposExpirados,
  actualizarInventarioCuerpo,
  registrarLootMuerto,
  actualizarMochilaMuertoEnSnapshot,
  inventarioAMochilaSlots,
  limpiarCuerposExpirados,
  actualizarPartidaEnSnapshot,
  revivirPartidaEnSnapshot,
  buscarPerfilIdPorNombre,
  eliminarJugadorDeSnapshot
};
