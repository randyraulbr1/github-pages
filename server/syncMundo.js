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

/**
 * Fusiona jugadores al publicar sin borrar cuentas por accidente.
 * Solo elimina del snapshot si mundo.purgarJugadores === true (admin borró jugador).
 */
function fusionarJugadoresPublicacion(mundo, prev) {
  const incoming = Array.isArray(mundo.jugadores) ? mundo.jugadores : null;
  const prevJ = prev?.jugadores || [];

  if (!incoming) {
    mergeJugadoresPartidas(mundo, [prev, mundo]);
    return;
  }

  if (incoming.length === 0 && prevJ.length > 0) {
    console.warn('[mundo] jugadores[] vacío — se conservan', prevJ.length, 'cuenta(s) del servidor');
    mergeJugadoresPartidas(mundo, [prev, mundo]);
    return;
  }

  const porId = new Map();
  const purgar = !!mundo.purgarJugadores;

  if (purgar) {
    if (!Array.isArray(mundo.eliminados_recuperables)) mundo.eliminados_recuperables = [];
    const incomingIds = new Set(incoming.filter(j => j?.id).map(j => j.id));
    const { esCuentaAdmin } = require('./adminCuenta');
    for (const j of prevJ) {
      if (!j?.id || incomingIds.has(j.id) || esCuentaAdmin(j)) continue;
      const ya = mundo.eliminados_recuperables.some(e => e?.tipo === 'jugador' && e.id === j.id);
      if (!ya) {
        mundo.eliminados_recuperables.push({
          tipo: 'jugador',
          id: j.id,
          datos: Object.assign({}, j),
          partida: prev?.partidas?.[j.id] || null,
          eliminadoEn: Date.now()
        });
      }
    }
    for (const j of incoming) {
      if (j?.id) porId.set(j.id, Object.assign({}, j));
    }
  } else {
    for (const j of prevJ) {
      if (j?.id) porId.set(j.id, Object.assign({}, j));
    }
    for (const j of incoming) {
      if (j?.id) porId.set(j.id, Object.assign({}, porId.get(j.id), j));
    }
  }

  const idsActivos = new Set([...porId.keys()]);
  const partidasPrev = {};
  if (prev?.partidas) {
    for (const [id, p] of Object.entries(prev.partidas)) {
      if (idsActivos.has(id)) partidasPrev[id] = p;
    }
  }

  mundo.jugadores = [...porId.values()];
  mergeJugadoresPartidas(mundo, [{ partidas: partidasPrev }]);
  const { asegurarAdminEnMundo } = require('./adminCuenta');
  asegurarAdminEnMundo(mundo);
}

const CAMPOS_MAPA = ['objetos', 'tesoros', 'enemigos', 'tiendasAdmin', 'misiones', 'cofres'];
const ESTADOS_MAPA = ['enemigosEstado', 'tesorosEstado', 'objetosEstado', 'tiendasStock'];

function contarElementosMapa(m) {
  if (!m || typeof m !== 'object') return 0;
  let n = Object.keys(m.posiciones || {}).length;
  for (const campo of CAMPOS_MAPA) {
    if (Array.isArray(m[campo])) n += m[campo].length;
  }
  return n;
}

function arrayMapaVacio(mundo, campo) {
  return !Array.isArray(mundo[campo]) || mundo[campo].length === 0;
}

/**
 * Evita borrar el mapa si la publicación llega con arrays vacíos
 * (caché borrada, mundo no cargado, etc.).
 */
function fusionarMapaPublicacion(mundo, prev) {
  if (!prev) return;

  for (const campo of CAMPOS_MAPA) {
    const incoming = mundo[campo];
    const prevArr = Array.isArray(prev[campo]) ? prev[campo] : [];

    if (!Array.isArray(incoming)) {
      if (prevArr.length) mundo[campo] = prevArr.slice();
      continue;
    }

    if (incoming.length === 0 && prevArr.length > 0) {
      console.warn('[mundo]', campo + '[] vacío — se conservan', prevArr.length, 'del servidor');
      mundo[campo] = prevArr.slice();
    }
  }

  const posIn = mundo.posiciones && typeof mundo.posiciones === 'object' ? mundo.posiciones : {};
  const posPrev = prev.posiciones && typeof prev.posiciones === 'object' ? prev.posiciones : {};
  if (!Object.keys(posIn).length && Object.keys(posPrev).length) {
    console.warn('[mundo] posiciones vacías — se conservan', Object.keys(posPrev).length, 'del servidor');
    mundo.posiciones = Object.assign({}, posPrev);
  } else {
    mundo.posiciones = Object.assign({}, posPrev, posIn);
  }

  for (const campo of ESTADOS_MAPA) {
    mundo[campo] = Object.assign({}, prev[campo] || {}, mundo[campo] || {});
  }
}

function debeProtegerTipoEnPurge(mundo, rowType) {
  switch (rowType) {
    case 'enemy': return arrayMapaVacio(mundo, 'enemigos');
    case 'item': return arrayMapaVacio(mundo, 'objetos');
    case 'treasure': return arrayMapaVacio(mundo, 'tesoros');
    case 'shop': return arrayMapaVacio(mundo, 'tiendasAdmin');
    default: return false;
  }
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
  const { asegurarAdminEnMundo } = require('./adminCuenta');
  asegurarAdminEnMundo(mundo);
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
  const jugador = (snapshot.jugadores || []).find(j => j && j.id === perfilId);
  const nombre = jugador?.nombre || '';
  let playerId = null;
  if (String(perfilId).startsWith('srv_')) {
    const n = parseInt(String(perfilId).slice(4), 10);
    if (Number.isFinite(n)) playerId = n;
  }
  if (!playerId && nombre) {
    const { findPlayerByName } = require('./db');
    const p = findPlayerByName(nombre);
    if (p) playerId = p.id;
  }
  if (snapshot.jugadores) {
    snapshot.jugadores = snapshot.jugadores.filter(j => j && j.id !== perfilId);
  }
  if (snapshot.partidas) delete snapshot.partidas[perfilId];
  snapshot.actualizadoEn = Date.now();
  saveWorldSnapshot(snapshot);
  if (io) {
    const { expulsarCuentasEliminadas } = require('./sockets');
    expulsarCuentasEliminadas(io, [{
      perfilId,
      playerId,
      nombre
    }]);
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

const BOLSA_DROP_TTL_MS = 5 * 60 * 1000;
const MOCHILA_SLOTS = 25;
const MAX_PILA = 10;

/** Quita bolsas vacías o sin recoger tras 5 minutos. */
function limpiarBolsasExpiradas(mundo) {
  if (!mundo?.bolsasDrop?.length) return;
  const now = Date.now();
  mundo.bolsasDrop = mundo.bolsasDrop.filter((b) => {
    if (!b?.items?.length) return false;
    if (b.ultimoRecogidoEn) return true;
    return now - (b.creadoEn || 0) < BOLSA_DROP_TTL_MS;
  });
}

function findBolsaDrop(mundo, bolsaId) {
  if (!mundo?.bolsasDrop?.length || !bolsaId) return null;
  return mundo.bolsasDrop.find((b) => b && b.id === bolsaId) || null;
}

function crearBolsaDrop(playerId, x, y, items, io, opts) {
  const snapshot = getWorldSnapshot() || { actualizadoEn: Date.now(), bolsasDrop: [] };
  if (!snapshot.bolsasDrop) snapshot.bolsasDrop = [];
  limpiarBolsasExpiradas(snapshot);

  const lista = (items || [])
    .filter((it) => it?.id && (it.cantidad || 1) > 0)
    .map((it) => ({ id: it.id, cantidad: Math.max(1, parseInt(it.cantidad, 10) || 1) }));
  if (!lista.length) return { ok: false, error: 'Sin objetos' };
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, error: 'Posición inválida' };

  const bolsa = {
    id: 'bolsa_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
    pos: [+x, +y],
    items: lista,
    creadoEn: Date.now(),
    dropperPlayerId: playerId || null,
    esBolsa: true
  };
  const extra = opts || {};
  if (extra.ocultoHasta) bolsa.ocultoHasta = extra.ocultoHasta;
  if (extra.ocultoParaPlayerId) bolsa.ocultoParaPlayerId = extra.ocultoParaPlayerId;
  if (extra.recogibleDesde) bolsa.recogibleDesde = extra.recogibleDesde;
  if (extra.soloDropper) bolsa.soloDropper = true;
  snapshot.bolsasDrop.push(bolsa);
  snapshot.actualizadoEn = Date.now();
  saveWorldSnapshot(snapshot);
  if (io) io.emit('world:bagUpdate', { bolsa });
  return { ok: true, bolsa };
}

function aplicarRecogidaBolsa(bolsa, recogidos) {
  const tomados = [];
  for (const r of (recogidos || [])) {
    if (!r?.id || (r.cantidad || 0) <= 0) continue;
    const idx = bolsa.items.findIndex((it) => it.id === r.id);
    if (idx < 0) continue;
    const max = bolsa.items[idx].cantidad || 1;
    const q = Math.min(max, Math.max(1, parseInt(r.cantidad, 10) || 1));
    if (q <= 0) continue;
    bolsa.items[idx].cantidad -= q;
    if (bolsa.items[idx].cantidad <= 0) bolsa.items.splice(idx, 1);
    tomados.push({ id: r.id, cantidad: q });
  }
  return tomados;
}

function recogerBolsaDrop(bolsaId, playerId, recogidos, io) {
  const snapshot = getWorldSnapshot() || { actualizadoEn: Date.now(), bolsasDrop: [] };
  if (!snapshot.bolsasDrop) snapshot.bolsasDrop = [];
  limpiarBolsasExpiradas(snapshot);

  const bolsa = findBolsaDrop(snapshot, bolsaId);
  if (!bolsa) return { ok: false, error: 'Bolsa no encontrada' };
  if (!bolsa.items?.length) return { ok: false, error: 'Bolsa vacía' };
  if (bolsa.recogibleDesde && Date.now() < bolsa.recogibleDesde) {
    return { ok: false, error: 'Aún no se pueden recoger (espera 2 min)' };
  }
  if (bolsa.soloDropper && bolsa.dropperPlayerId && bolsa.dropperPlayerId !== playerId) {
    return { ok: false, error: 'Solo quien huyó puede recoger estos objetos' };
  }

  const tomados = aplicarRecogidaBolsa(bolsa, recogidos);
  if (!tomados.length) return { ok: false, error: 'Nada que recoger' };

  bolsa.ultimoRecogidoEn = Date.now();
  if (!bolsa.items.length) {
    snapshot.bolsasDrop = snapshot.bolsasDrop.filter((b) => b.id !== bolsaId);
    snapshot.actualizadoEn = Date.now();
    saveWorldSnapshot(snapshot);
    if (io) io.emit('world:bagRemove', { bolsaId });
    return { ok: true, tomados, vacia: true };
  }

  snapshot.actualizadoEn = Date.now();
  saveWorldSnapshot(snapshot);
  if (io) io.emit('world:bagUpdate', { bolsa });
  return { ok: true, tomados, bolsa, vacia: false };
}

/** Borra bolsas expiradas o vacías y avisa a los clientes. */
function sincronizarBolsasExpiradas(io) {
  const snapshot = getWorldSnapshot();
  if (!snapshot?.bolsasDrop?.length) return;
  const antes = snapshot.bolsasDrop.map((b) => b.id);
  limpiarBolsasExpiradas(snapshot);
  const despues = new Set(snapshot.bolsasDrop.map((b) => b.id));
  const removidas = antes.filter((id) => !despues.has(id));
  if (!removidas.length) return;
  snapshot.actualizadoEn = Date.now();
  saveWorldSnapshot(snapshot);
  if (io) {
    for (const bolsaId of removidas) io.emit('world:bagRemove', { bolsaId });
  }
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

function distanciaMetros(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Daño de jugador contra enemigo según reglas globales del mundo. */
function danoJugadorVsEnemigo(playerLevel, snapshot) {
  const combate = snapshot?.combate || {};
  const ref = Math.max(1, parseInt(combate.nivelReferencia, 10) || 1);
  const nv = Math.max(1, parseInt(playerLevel, 10) || 1);
  const f = nv / ref;
  const lo = Math.max(1, Math.round((combate.danoMin || 5) * f));
  const hi = Math.max(lo, Math.round((combate.danoMax || 8) * f));
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/** Probabilidad de fallar ataque según diferencia de nivel. */
function probFalloAtaque(playerLevel, enemyLevel) {
  const diff = Math.max(0, (enemyLevel || 1) - (playerLevel || 1));
  return Math.min(45, 12 + diff * 4);
}

function registrarAtaqueEnemigo(enemyId, playerId, px, py, playerLevel, io) {
  const row = findObjectByOrigenId(enemyId);
  if (!row || row.type !== 'enemy' || row.state !== 'active') {
    return { ok: false, error: 'Enemigo no encontrado' };
  }

  const data = parseData(row);
  const snapshot = getWorldSnapshot() || { actualizadoEn: Date.now() };
  if (!snapshot.enemigosEstado) snapshot.enemigosEstado = {};
  const stPrev = snapshot.enemigosEstado[enemyId] || {};
  if (stPrev.ocultoHasta && Date.now() < stPrev.ocultoHasta) {
    return { ok: false, error: 'Enemigo no disponible' };
  }

  const hpMax = data.hpMax || data.vidaMax || data.hp || 30;
  let hp = stPrev.vida != null ? stPrev.vida : (data.hp != null ? data.hp : hpMax);
  if (hp <= 0) return { ok: false, error: 'Enemigo ya derrotado' };

  data.hpMax = hpMax;

  const radioZona = data.radioZona || 40;
  if (distanciaMetros(px, py, row.x, row.y) > radioZona + 3) {
    return { ok: false, error: 'Fuera de la zona roja' };
  }

  const nvEn = data.nivel || data.level || 1;
  const fallo = Math.random() * 100 < probFalloAtaque(playerLevel, nvEn);
  if (fallo) {
    return { ok: true, miss: true, hp, hpMax };
  }

  const dmg = danoJugadorVsEnemigo(playerLevel);
  hp = Math.max(0, hp - dmg);
  const ahora = Date.now();
  const estado = { vida: hp, ultimoGolpe: ahora, ultimoAtacante: String(playerId) };
  snapshot.enemigosEstado[enemyId] = estado;

  let muerto = false;
  let respawnMin = 0;
  let eliminado = false;

  if (hp <= 0) {
    muerto = true;
    const def = (snapshot.enemigos || []).find((e) => e && e.id === enemyId);
    respawnMin = def?.respawnMin || data.respawnMin || 0;
    if (respawnMin > 0) {
      estado.vida = hpMax;
      estado.ultimoGolpe = 0;
      estado.ocultoHasta = ahora + respawnMin * 60000;
      data.hp = hpMax;
    } else {
      eliminado = true;
      data.hp = 0;
      snapshot.eliminados = snapshot.eliminados || [];
      if (!snapshot.eliminados.includes(enemyId)) snapshot.eliminados.push(enemyId);
      deleteWorldObject(row.id);
      if (io) io.emit('world:removeObject', { id: row.id, origenId: enemyId });
    }
  } else {
    data.hp = hp;
    data.hpMax = hpMax;
  }

  if (!eliminado) {
    data.ocultoHasta = estado.ocultoHasta || 0;
    const { bearingDeg } = require('./enemyAI');
    data.facingDeg = bearingDeg(row.x, row.y, px, py);
    data.targetPlayerId = playerId;
    const updated = updateWorldObject(row.id, { data_json: JSON.stringify(data) });
    if (io) io.emit('world:updateObject', formatWorldObject(updated));
  }

  snapshot.actualizadoEn = ahora;
  saveWorldSnapshot(snapshot);
  if (io) {
    io.emit('mundo:enemyState', {
      enemyId,
      estado,
      eliminado,
      respawnMin: respawnMin || 0
    });
  }

  return {
    ok: true,
    miss: false,
    damage: dmg,
    hp,
    hpMax,
    muerto,
    eliminado,
    respawnMin,
    ocultoHasta: estado.ocultoHasta || 0,
    xp: muerto ? (data.xp || 0) : 0,
    dinero: muerto ? (data.dinero || 0) : 0,
    recItems: muerto ? (data.recItems || []) : []
  };
}

function syncMundoFromJson(mundo, io) {
  if (!mundo || typeof mundo !== 'object') {
    return { ok: false, error: 'Mundo inválido' };
  }

  const prev = getWorldSnapshot();
  fusionarJugadoresPublicacion(mundo, prev);
  fusionarMapaPublicacion(mundo, prev);
  const { asegurarAdminEnMundo } = require('./adminCuenta');
  asegurarAdminEnMundo(mundo);
  if (prev?.bolsasDrop?.length && !mundo.bolsasDrop?.length) {
    mundo.bolsasDrop = prev.bolsasDrop;
  }
  limpiarBolsasExpiradas(mundo);
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
    if (debeProtegerTipoEnPurge(mundo, row.type)) continue;
    deleteWorldObject(row.id);
    if (io) io.emit('world:removeObject', { id: row.id, origenId: d.origenId });
  }

  for (const row of getAllMissions()) {
    const reward = JSON.parse(row.reward_json || '{}');
    if (reward.origenId && !seenMissions.has(reward.origenId) && !eliminados.has(reward.origenId)) {
      if (arrayMapaVacio(mundo, 'misiones')) continue;
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
      if (mundo.purgarJugadores) {
        const r = purgarCuentasFueraDeSnapshot(mundo);
        if (r.removed > 0) {
          console.log('[mundo] Cuentas purgadas (admin):', r.removed);
          if (io && r.removedAccounts?.length) {
            const { expulsarCuentasEliminadas } = require('./sockets');
            expulsarCuentasEliminadas(io, r.removedAccounts);
          }
        }
      }
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

  delete mundo.purgarJugadores;

  if (Array.isArray(mundo.eliminados_recuperables)) {
    const limite = Date.now() - 30 * 24 * 60 * 60 * 1000;
    mundo.eliminados_recuperables = mundo.eliminados_recuperables.filter(e =>
      !e.eliminadoEn || e.eliminadoEn > limite
    );
  }

  saveWorldSnapshot(mundo);

  try {
    const { registrar } = require('./eventLog');
    registrar('publish', `Mundo publicado — ${(mundo.jugadores || []).length} jugadores, ${(mundo.objetos || []).length} objetos`);
  } catch (e) { /* */ }

  try {
    const { pedirRespaldo } = require('./respaldoThrottle');
    pedirRespaldo();
  } catch (e) { /* */ }

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
  fusionarMapaPublicacion,
  contarElementosMapa,
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
  eliminarJugadorDeSnapshot,
  limpiarBolsasExpiradas,
  crearBolsaDrop,
  recogerBolsaDrop,
  sincronizarBolsasExpiradas,
  registrarAtaqueEnemigo
};
