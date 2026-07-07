/**
 * Sincroniza cuentas entre SQLite (users/players) y world_snapshot.jugadores.
 * Evita que desaparezcan usuarios tras redeploy o importación desde mundo.json.
 */
const {
  db,
  getWorldSnapshot,
  saveWorldSnapshot,
  findUserByUsername,
  findPlayerByUserId,
  findPlayerByName,
  findPlayerById,
  updatePlayer,
  createUser,
  createPlayer
} = require('./db');
const {
  mergeJugadoresPartidas,
  quitarCuerpoMuerto,
  revivirPartidaEnSnapshot,
  registrarCuerpoMuerto,
  buscarPerfilIdPorNombre
} = require('./syncMundo');
const { hashPassword } = require('./auth');
const {
  esNombreAdmin,
  esCuentaAdmin,
  leerAdminDesdeArchivo,
  asegurarAdminEnMundo
} = require('./adminCuenta');

function countUsers() {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
}

function listUsersWithPlayers() {
  return db.prepare(`
    SELECT u.id AS user_id, u.username, p.id AS player_id, p.name, u.created_at
    FROM users u
    INNER JOIN players p ON p.user_id = u.id
    ORDER BY p.id
  `).all();
}

function prioridadJugador(j) {
  let s = 0;
  if (j?.telefono) s += 20;
  if (j?.pinHash) s += 10;
  const id = String(j?.id || '');
  if (id && !id.startsWith('srv_')) s += 15;
  if (id.startsWith('pmr') || (id.startsWith('p') && id.length > 4)) s += 5;
  return s;
}

/** Una cuenta por nombre; prioriza id PWA (pmr…) y teléfono sobre srv_N duplicados. */
function deduplicarJugadoresPorNombre(lista) {
  if (!Array.isArray(lista)) return { jugadores: [], aliasIds: new Map() };
  const sinNombre = lista.filter(j => j?.id && !String(j.nombre || '').trim());
  const grupos = new Map();
  for (const j of lista) {
    if (!j?.id || !String(j.nombre || '').trim()) continue;
    const key = String(j.nombre).trim().toLowerCase();
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key).push(j);
  }
  const resultado = [...sinNombre];
  const aliasIds = new Map();
  for (const [, dupes] of grupos) {
    const ordenados = dupes.slice().sort((a, b) => prioridadJugador(b) - prioridadJugador(a));
    const canon = Object.assign({}, ordenados[0]);
    for (let i = 1; i < ordenados.length; i++) {
      const o = ordenados[i];
      if (!canon.telefono && o.telefono) canon.telefono = o.telefono;
      if (!canon.pinHash && o.pinHash) canon.pinHash = o.pinHash;
      if (!canon.creado && o.creado) canon.creado = o.creado;
      aliasIds.set(o.id, canon.id);
    }
    resultado.push(canon);
  }
  resultado.sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));
  return { jugadores: resultado, aliasIds };
}

function reconciliarCuentasEnSnapshot(mundoOpt) {
  const rows = listUsersWithPlayers();
  let mundo = mundoOpt || getWorldSnapshot();
  if (!mundo) {
    mundo = {
      actualizadoEn: Date.now(),
      jugadores: [],
      partidas: {},
      misiones: [],
      tesoros: [],
      objetos: [],
      enemigos: [],
      posiciones: {}
    };
  }

  if (!rows.length) {
    const dedupe = deduplicarJugadoresPorNombre(mundo.jugadores || []);
    mundo.jugadores = dedupe.jugadores;
    if (dedupe.aliasIds.size && mundo.partidas) {
      for (const [viejo, canon] of dedupe.aliasIds) {
        const p = mundo.partidas[viejo];
        if (!p) continue;
        const prev = mundo.partidas[canon];
        if (!prev || (p.t || 0) >= (prev.t || 0)) mundo.partidas[canon] = p;
        delete mundo.partidas[viejo];
      }
    }
    if (dedupe.aliasIds.size) {
      mundo.actualizadoEn = Date.now();
      if (!mundoOpt) saveWorldSnapshot(mundo);
    }
    return { ok: true, added: 0, merged: dedupe.aliasIds.size, total: dedupe.jugadores.length };
  }

  const porNombre = new Map();
  for (const j of (mundo.jugadores || [])) {
    if (j?.nombre) porNombre.set(String(j.nombre).toLowerCase(), j);
  }

  const nuevos = [];
  for (const r of rows) {
    const nombre = String(r.name || r.username || '').trim();
    if (!nombre) continue;
    const key = nombre.toLowerCase();
    if (porNombre.has(key)) continue;
    const entry = {
      id: 'srv_' + r.player_id,
      nombre,
      telefono: '',
      creado: Date.parse(String(r.created_at).replace(' ', 'T') + 'Z') || Date.now()
    };
    nuevos.push(entry);
    porNombre.set(key, entry);
  }

  if (nuevos.length) {
    mergeJugadoresPartidas(mundo, [{ jugadores: nuevos }]);
  }

  const dedupe = deduplicarJugadoresPorNombre(mundo.jugadores || []);
  mundo.jugadores = dedupe.jugadores;
  if (dedupe.aliasIds.size && mundo.partidas) {
    for (const [viejo, canon] of dedupe.aliasIds) {
      const p = mundo.partidas[viejo];
      if (!p) continue;
      const prev = mundo.partidas[canon];
      if (!prev || (p.t || 0) >= (prev.t || 0)) mundo.partidas[canon] = p;
      delete mundo.partidas[viejo];
    }
  }

  if (nuevos.length || dedupe.aliasIds.size) {
    mundo.actualizadoEn = Date.now();
    if (!mundoOpt) saveWorldSnapshot(mundo);
  }

  return {
    ok: true,
    added: nuevos.length,
    merged: dedupe.aliasIds.size,
    total: (mundo.jugadores || []).length,
    sqliteUsers: rows.length
  };
}

function _nombreJugadorDesdeCuerpos(snap, perfilId) {
  if (!snap?.cuerposMuertos) return null;
  if (String(perfilId).startsWith('srv_')) {
    const pid = parseInt(String(perfilId).slice(4), 10);
    const c = snap.cuerposMuertos[String(pid)];
    if (c?.name) return String(c.name).trim();
  }
  for (const c of Object.values(snap.cuerposMuertos)) {
    if (!c?.name) continue;
    const pid = Number(c.playerId);
    const srvId = 'srv_' + pid;
    if (srvId === perfilId || buscarPerfilIdPorNombre(c.name, pid) === perfilId) {
      return String(c.name).trim();
    }
  }
  return null;
}

/** Reincorpora cuentas con partida o ataúd pero fuera de jugadores[]. */
function asegurarJugadoresEnSnapshot(snap) {
  if (!snap) return false;
  let changed = false;
  const { leerJugadoresDesdeCarpeta } = require('./importSnapshot');
  const carpeta = leerJugadoresDesdeCarpeta();
  const porId = new Map();
  const porNombre = new Map();
  for (const j of (snap.jugadores || [])) {
    if (!j?.id) continue;
    porId.set(j.id, j);
    if (j.nombre) porNombre.set(String(j.nombre).trim().toLowerCase(), j);
  }

  const agregar = (perfil) => {
    if (!perfil?.id || porId.has(perfil.id)) return;
    snap.jugadores = snap.jugadores || [];
    snap.jugadores.push(Object.assign({}, perfil));
    porId.set(perfil.id, perfil);
    if (perfil.nombre) porNombre.set(String(perfil.nombre).trim().toLowerCase(), perfil);
    changed = true;
  };

  for (const perfilId of Object.keys(snap.partidas || {})) {
    if (porId.has(perfilId)) continue;
    const fromFile = (carpeta.jugadores || []).find(j => j.id === perfilId);
    if (fromFile) {
      agregar(fromFile);
      continue;
    }
    const nombre = _nombreJugadorDesdeCuerpos(snap, perfilId);
    if (nombre) agregar({ id: perfilId, nombre, telefono: '', creado: Date.now() });
  }

  for (const c of Object.values(snap.cuerposMuertos || {})) {
    const nombre = String(c?.name || '').trim();
    if (!nombre) continue;
    const key = nombre.toLowerCase();
    if (porNombre.has(key)) continue;
    const srvId = 'srv_' + Number(c.playerId);
    const fromFile = (carpeta.jugadores || []).find(j =>
      j.id === srvId || String(j.nombre || '').trim().toLowerCase() === key
    );
    const perfilId = fromFile?.id
      || buscarPerfilIdPorNombre(nombre, c.playerId)
      || srvId;
    if (!porId.has(perfilId)) {
      agregar(fromFile || { id: perfilId, nombre, telefono: '', creado: Date.now() });
    }
  }
  return changed;
}

/** Alinea ataúd ↔ partida ↔ SQLite (evita limbo tras revive admin). */
function reconciliarMuertoCuerpo(snap, io) {
  if (!snap?.partidas) return false;
  let changed = false;
  for (const [perfilId, partida] of Object.entries(snap.partidas)) {
    const datos = partida?.datos || partida;
    if (!datos) continue;
    const jug = (snap.jugadores || []).find(j => j.id === perfilId);
    const nombre = jug?.nombre || _nombreJugadorDesdeCuerpos(snap, perfilId);
    let playerId = null;
    if (String(perfilId).startsWith('srv_')) {
      playerId = parseInt(String(perfilId).slice(4), 10);
    } else if (nombre) {
      const pl = findPlayerByName(nombre);
      if (pl) playerId = pl.id;
    }
    const cuerpo = playerId != null ? snap.cuerposMuertos?.[String(playerId)] : null;
    const muerto = !!datos.muerto || (datos.vida != null && datos.vida <= 0);

    if (!muerto && datos.vida > 0) {
      if (playerId != null && cuerpo) {
        quitarCuerpoMuerto(playerId, io);
        changed = true;
      }
      if (playerId != null) {
        const pl = findPlayerById(playerId);
        if (pl && pl.hp <= 0) {
          updatePlayer(playerId, { hp: Math.max(1, Math.round(datos.vida)) });
          changed = true;
        }
      }
    } else if (muerto && playerId != null && !cuerpo && datos.muertePos?.length >= 2) {
      registrarCuerpoMuerto(playerId, {
        name: nombre || 'Jugador',
        deathX: datos.muertePos[0],
        deathY: datos.muertePos[1],
        deadLevel: datos.nivel || 1,
        deadInventory: datos.muerteInventario || [],
        level: datos.nivel || 1
      }, io);
      changed = true;
    }
  }
  return changed;
}

function vidaReviveDesdeMax(hpMax, reviveHp) {
  const max = Math.max(1, Math.round(hpMax || 100));
  const cura = reviveHp != null && reviveHp > 0 ? Math.round(reviveHp) : Math.max(1, Math.round(max * 0.4));
  return Math.max(1, Math.min(max, cura));
}

/** Revive por nombre (admin / reparación). */
function revivirJugadorPorNombre(snap, nombre, io) {
  if (!snap || !nombre) return false;
  const key = String(nombre).trim().toLowerCase();
  let perfilId = (snap.jugadores || []).find(j =>
    String(j.nombre || '').trim().toLowerCase() === key
  )?.id;
  if (!perfilId) {
    for (const [id] of Object.entries(snap.partidas || {})) {
      const n = _nombreJugadorDesdeCuerpos(snap, id);
      if (n && n.toLowerCase() === key) { perfilId = id; break; }
    }
  }
  if (!perfilId) {
    for (const c of Object.values(snap.cuerposMuertos || {})) {
      if (String(c.name || '').trim().toLowerCase() === key) {
        perfilId = buscarPerfilIdPorNombre(c.name, c.playerId) || ('srv_' + c.playerId);
        break;
      }
    }
  }
  if (!perfilId) return false;

  const partida = snap.partidas?.[perfilId];
  const datos = partida?.datos || partida;
  const muerto = !datos || !!datos.muerto || (datos.vida != null && datos.vida <= 0);
  let playerId = null;
  if (String(perfilId).startsWith('srv_')) {
    playerId = parseInt(String(perfilId).slice(4), 10);
  } else {
    const pl = findPlayerByName(nombre);
    if (pl) playerId = pl.id;
  }
  const cuerpo = playerId != null ? snap.cuerposMuertos?.[String(playerId)] : null;
  if (!muerto && !cuerpo) return false;

  const nivel = datos?.nivel || cuerpo?.deadLevel || 1;
  const hpMax = Math.max(1, 80 + (nivel - 1) * 20);
  const cura = vidaReviveDesdeMax(hpMax, datos?.vida > 0 ? datos.vida : null);
  const inv = (cuerpo?.deadInventory || datos?.muerteInventario || []).map(x => ({ ...x }));

  revivirPartidaEnSnapshot(perfilId, cura, io, inv);
  if (playerId != null) {
    updatePlayer(playerId, { hp: cura });
    quitarCuerpoMuerto(playerId, io);
  }
  return true;
}

let _ultimaReparacion = 0;

function repararSnapshotMundo(io, opts) {
  const snap = getWorldSnapshot();
  if (!snap) return { ok: false, reason: 'sin snapshot' };
  const ahora = Date.now();
  if (!opts?.forzar && ahora - _ultimaReparacion < 8000) {
    return { ok: true, skipped: true };
  }
  _ultimaReparacion = ahora;

  const c1 = asegurarJugadoresEnSnapshot(snap);
  const c2 = reconciliarMuertoCuerpo(snap, io);
  let c3 = false;
  if (opts?.revivirNombres?.length) {
    for (const nombre of opts.revivirNombres) {
      if (revivirJugadorPorNombre(snap, nombre, io)) c3 = true;
    }
  }
  if (c1 || c2 || c3) {
    snap.actualizadoEn = Date.now();
    asegurarAdminEnMundo(snap);
    saveWorldSnapshot(snap);
  }
  return { ok: true, changed: c1 || c2 || c3 };
}

/** Lista publicada por el admin (snapshot). No re-añade SQLite huérfanos tras un borrado. */
function getJugadoresPublicos(io) {
  repararSnapshotMundo(io);
  const snap = getWorldSnapshot();
  const porId = new Map();
  for (const j of (snap?.jugadores || [])) {
    if (j?.id) porId.set(j.id, j);
  }
  const admin = leerAdminDesdeArchivo();
  if (admin?.id) porId.set(admin.id, Object.assign({}, porId.get(admin.id), admin));
  return deduplicarJugadoresPorNombre([...porId.values()]).jugadores;
}

/** Borra de SQLite usuarios que ya no están en la lista publicada por el admin. */
function purgarCuentasFueraDeSnapshot(mundo) {
  if (!Array.isArray(mundo?.jugadores)) return { ok: true, removed: 0, removedAccounts: [] };
  if (!mundo.jugadores.length) {
    console.warn('[mundo] purgar omitido: lista de jugadores vacía');
    return { ok: true, removed: 0, skipped: true, removedAccounts: [] };
  }
  const nombres = new Set(
    mundo.jugadores.map(j => String(j.nombre || '').toLowerCase()).filter(Boolean)
  );
  const snap = getWorldSnapshot();
  const rows = listUsersWithPlayers();
  const del = db.prepare('DELETE FROM users WHERE id = ?');
  let removed = 0;
  const removedAccounts = [];
  for (const r of rows) {
    const nombre = String(r.name || r.username || '').toLowerCase();
    if (!nombre || nombres.has(nombre)) continue;
    if (esNombreAdmin(nombre)) continue;
    const nombreVisible = String(r.name || r.username || '').trim();
    let perfilId = null;
    if (snap?.jugadores?.length) {
      const j = snap.jugadores.find(x =>
        x?.nombre && x.nombre.toLowerCase() === nombre
      );
      if (j?.id) perfilId = j.id;
    }
    if (!perfilId && r.player_id) perfilId = 'srv_' + r.player_id;
    removedAccounts.push({
      userId: r.user_id,
      playerId: r.player_id,
      nombre: nombreVisible,
      perfilId
    });
    del.run(r.user_id);
    removed++;
  }
  return { ok: true, removed, removedAccounts };
}

async function respaldarCuentasEnGitHub() {
  try {
    const { pedirRespaldo } = require('./respaldoThrottle');
    pedirRespaldo();
    return { ok: true, throttled: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function respaldarCuentasEnGitHubInmediato() {
  const snap = getWorldSnapshot();
  if (!snap) return { ok: false, reason: 'sin snapshot' };
  asegurarAdminEnMundo(snap);
  try {
    const { respaldoInmediato } = require('./respaldoThrottle');
    await respaldoInmediato();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Busca jugador por nombre o teléfono (exacto o parcial si hay un solo match). */
function buscarJugadorPublico(termino) {
  const raw = String(termino || '').trim();
  if (!raw) return null;
  const t = raw.toLowerCase();
  const limpio = raw.replace(/[\s-]/g, '');
  const lista = getJugadoresPublicos();

  if (esNombreAdmin(t)) {
    const admin = leerAdminDesdeArchivo();
    if (admin) return admin;
  }

  let hit = lista.find(j =>
    (j.nombre && j.nombre.toLowerCase() === t) ||
    (j.telefono && String(j.telefono).replace(/[\s-]/g, '') === limpio)
  );
  if (hit) return hit;

  const parciales = lista.filter(j => {
    const n = String(j.nombre || '').toLowerCase();
    return n.includes(t) || (j.telefono && String(j.telefono).includes(limpio));
  });
  if (parciales.length === 1) return parciales[0];
  if (parciales.length > 1) {
    const prefijo = parciales.find(j => j.nombre.toLowerCase().startsWith(t));
    if (prefijo) return prefijo;
  }
  return null;
}

/** Asegura fila en SQLite para un perfil del snapshot (amigos/chat en vivo). */
function asegurarPlayerEnSqlite(jugador) {
  if (!jugador?.nombre) return null;
  const nombre = String(jugador.nombre).trim();
  let p = findPlayerByName(nombre);
  if (p) return p;

  const idStr = String(jugador.id || '');
  if (idStr.startsWith('srv_')) {
    const n = parseInt(idStr.slice(4), 10);
    if (Number.isFinite(n)) {
      p = db.prepare('SELECT * FROM players WHERE id = ?').get(n);
      if (p) return p;
    }
  }

  let user = findUserByUsername(nombre);
  if (!user) {
    try {
      user = createUser(nombre, hashPassword('sync_' + (jugador.id || Date.now())));
      p = createPlayer(user.id, nombre);
      return p;
    } catch (e) {
      user = findUserByUsername(nombre);
    }
  }
  if (user) {
    p = findPlayerByUserId(user.id);
    if (p) return p;
    try {
      return createPlayer(user.id, nombre);
    } catch (e) {
      return findPlayerByName(nombre);
    }
  }
  return null;
}

/** Resuelve playerId numérico para amigos/chat desde nombre. */
function resolverPlayerIdPorNombre(nombre) {
  const p = findPlayerByName(String(nombre || '').trim());
  if (p) return p.id;
  const j = buscarJugadorPublico(nombre);
  if (!j) return null;
  const migrado = asegurarPlayerEnSqlite(j);
  return migrado?.id || null;
}

/**
 * Deja solo la cuenta admin (randy) en snapshot + SQLite.
 * Borra partidas y respaldos de jugadores normales.
 */
async function dejarSoloAdminEnSnapshot(opts) {
  const snap = getWorldSnapshot() || {
    actualizadoEn: Date.now(),
    jugadores: [],
    partidas: {},
    misiones: [],
    tesoros: [],
    objetos: [],
    enemigos: [],
    posiciones: {}
  };

  const eliminados = [];
  const idsBorrar = [];
  for (const j of (snap.jugadores || [])) {
    if (!j?.id || esCuentaAdmin(j)) continue;
    eliminados.push(j.nombre || j.id);
    idsBorrar.push(j.id);
  }

  snap.jugadores = (snap.jugadores || []).filter(j => j?.id && esCuentaAdmin(j));
  asegurarAdminEnMundo(snap);

  const idsActivos = new Set((snap.jugadores || []).map(j => j.id));
  if (snap.partidas) {
    for (const id of Object.keys(snap.partidas)) {
      if (!idsActivos.has(id)) delete snap.partidas[id];
    }
  }
  if (Array.isArray(snap.eliminados_recuperables)) {
    snap.eliminados_recuperables = snap.eliminados_recuperables.filter(
      e => e?.tipo !== 'jugador' || esCuentaAdmin(e.datos || e)
    );
  }

  const purga = purgarCuentasFueraDeSnapshot(snap);
  snap.actualizadoEn = Date.now();
  delete snap.soloAdmin;
  saveWorldSnapshot(snap);

  const { deleteArchivoGitHub } = require('./utils/githubPush');
  const { indiceDesdeJugadores } = require('./utils/reglasIndice');
  for (const id of idsBorrar) {
    await deleteArchivoGitHub(`datos/jugadores/${id}.json`, `purge cuenta ${id}`).catch(() => {});
  }
  await deleteArchivoGitHub('datos/jugadores/indice.json', 'purge indice vacio')
    .catch(() => {});
  const { putArchivoGitHubSiCambio } = require('./utils/githubPush');
  await putArchivoGitHubSiCambio(
    'datos/jugadores/indice.json',
    indiceDesdeJugadores(snap.jugadores),
    'purge indice 0 jugadores'
  ).catch(() => {});

  if (opts?.io && purga.removedAccounts?.length) {
    try {
      const { expulsarCuentasEliminadas } = require('./sockets');
      expulsarCuentasEliminadas(opts.io, purga.removedAccounts);
    } catch (e) { /* */ }
  }

  try {
    const { registrar } = require('./eventLog');
    registrar('purge_cuentas', `Solo admin — eliminadas: ${eliminados.join(', ') || 'ninguna'}`);
  } catch (e) { /* */ }

  return {
    ok: true,
    eliminados,
    sqliteRemoved: purga.removed,
    jugadores: (snap.jugadores || []).length
  };
}

module.exports = {
  countUsers,
  listUsersWithPlayers,
  reconciliarCuentasEnSnapshot,
  purgarCuentasFueraDeSnapshot,
  deduplicarJugadoresPorNombre,
  getJugadoresPublicos,
  respaldarCuentasEnGitHub,
  respaldarCuentasEnGitHubInmediato,
  buscarJugadorPublico,
  asegurarPlayerEnSqlite,
  resolverPlayerIdPorNombre,
  dejarSoloAdminEnSnapshot,
  asegurarJugadoresEnSnapshot,
  reconciliarMuertoCuerpo,
  revivirJugadorPorNombre,
  repararSnapshotMundo
};
