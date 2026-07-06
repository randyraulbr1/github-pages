/**
 * Sincroniza cuentas entre SQLite (users/players) y world_snapshot.jugadores.
 * Evita que desaparezcan usuarios tras redeploy o importación desde mundo.json.
 */
const { db, getWorldSnapshot, saveWorldSnapshot } = require('./db');
const { mergeJugadoresPartidas } = require('./syncMundo');

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
    return { ok: true, added: 0, total: (mundo.jugadores || []).length };
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
    mundo.actualizadoEn = Date.now();
    if (!mundoOpt) saveWorldSnapshot(mundo);
  }

  return {
    ok: true,
    added: nuevos.length,
    total: (mundo.jugadores || []).length,
    sqliteUsers: rows.length
  };
}

function getJugadoresPublicos() {
  const snap = getWorldSnapshot();
  const porId = new Map();
  for (const j of (snap?.jugadores || [])) {
    if (j?.id) porId.set(j.id, j);
  }

  for (const r of listUsersWithPlayers()) {
    const nombre = String(r.name || r.username || '').trim();
    if (!nombre) continue;
    const existe = [...porId.values()].some(
      j => String(j.nombre || '').toLowerCase() === nombre.toLowerCase()
    );
    if (existe) continue;
    const id = 'srv_' + r.player_id;
    porId.set(id, {
      id,
      nombre,
      telefono: '',
      creado: Date.parse(String(r.created_at).replace(' ', 'T') + 'Z') || Date.now()
    });
  }

  return [...porId.values()].sort((a, b) =>
    String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es')
  );
}

async function respaldarCuentasEnGitHub() {
  const snap = getWorldSnapshot();
  if (!snap) return { ok: false, reason: 'sin snapshot' };
  try {
    const { pushMundoToGitHub } = require('./githubMundo');
    return await pushMundoToGitHub(snap);
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  countUsers,
  listUsersWithPlayers,
  reconciliarCuentasEnSnapshot,
  getJugadoresPublicos,
  respaldarCuentasEnGitHub
};
