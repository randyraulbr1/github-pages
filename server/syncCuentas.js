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
  createUser,
  createPlayer
} = require('./db');
const { mergeJugadoresPartidas } = require('./syncMundo');
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

/** Lista publicada por el admin (snapshot). No re-añade SQLite huérfanos tras un borrado. */
function getJugadoresPublicos() {
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
  dejarSoloAdminEnSnapshot
};
