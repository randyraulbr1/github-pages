/**
 * Fase 3 — world_content + world_config (fuente de verdad del mapa).
 * 3.1 migración idempotente desde blob; 3.2 proyector BD → snapshot.
 */
const { db, getWorldSnapshot } = require('./db');

const TYPE_TO_CAMPO = {
  item: 'objetos',
  enemy: 'enemigos',
  treasure: 'tesoros',
  shop: 'tiendasAdmin',
  mission: 'misiones',
  chest: 'cofres'
};

const CONFIG_KEYS = [
  'precios',
  'itemsNuevos',
  'mantenimiento',
  'baneados',
  'mensajes',
  'combate',
  'optimizarVisibilidad',
  'tiendasStock',
  'enemigosEstado',
  'objetosEstado',
  'tesorosEstado'
];

const MAP_ARRAY_KEYS = ['objetos', 'tesoros', 'enemigos', 'tiendasAdmin', 'misiones', 'cofres'];

function initWorldContentSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_content (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      x REAL,
      y REAL,
      state TEXT NOT NULL DEFAULT 'active',
      data_json TEXT NOT NULL DEFAULT '{}',
      deleted INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_world_content_type ON world_content(type, deleted);

    CREATE TABLE IF NOT EXISTS world_config (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function isWorldContentMigrated() {
  if (getWorldConfig('_schema_migrated') === 'v1') return true;
  const n = db.prepare(`
    SELECT COUNT(*) AS c FROM world_config WHERE key != '_schema_migrated'
  `).get().c;
  if (n > 0) {
    setWorldConfig('_schema_migrated', 'v1');
    return true;
  }
  return false;
}

function countWorldContent() {
  return db.prepare('SELECT COUNT(*) AS n FROM world_content').get().n;
}

function posEnemigo(e, mundo) {
  if (e?.pos && e.pos.length >= 2) return e.pos;
  const p = (mundo?.posiciones || {})[e.id];
  return p && p.length >= 2 ? p : null;
}

function upsertContentRow(row) {
  db.prepare(`
    INSERT INTO world_content (id, type, x, y, state, data_json, deleted, updated_by, updated_at)
    VALUES (@id, @type, @x, @y, @state, @data_json, @deleted, @updated_by, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      x = excluded.x,
      y = excluded.y,
      state = excluded.state,
      data_json = excluded.data_json,
      deleted = excluded.deleted,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run({
    id: row.id,
    type: row.type,
    x: row.x ?? null,
    y: row.y ?? null,
    state: row.state || 'active',
    data_json: typeof row.data_json === 'string' ? row.data_json : JSON.stringify(row.data_json || {}),
    deleted: row.deleted ? 1 : 0,
    updated_by: row.updated_by || null
  });
}

function setWorldConfig(key, value) {
  if (value === undefined) return;
  db.prepare(`
    INSERT INTO world_config (key, value_json, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
  `).run(key, typeof value === 'string' ? value : JSON.stringify(value));
}

function getWorldConfig(key) {
  const row = db.prepare('SELECT value_json FROM world_config WHERE key = ?').get(key);
  if (!row) return undefined;
  try { return JSON.parse(row.value_json); } catch (e) { return undefined; }
}

function getAllWorldContent(activeOnly) {
  const sql = activeOnly
    ? 'SELECT * FROM world_content WHERE deleted = 0 ORDER BY type, id'
    : 'SELECT * FROM world_content ORDER BY type, id';
  return db.prepare(sql).all();
}

function migrarConfigDesdeSnapshot(mundo) {
  if (!mundo) return 0;
  let n = 0;
  for (const key of CONFIG_KEYS) {
    if (mundo[key] !== undefined) {
      setWorldConfig(key, mundo[key]);
      n++;
    }
  }
  return n;
}

function migrarElementosDesdeSnapshot(mundo) {
  if (!mundo || typeof mundo !== 'object') return { elementos: 0, tombstones: 0 };
  const eliminados = new Set(mundo.eliminados || []);
  let elementos = 0;

  const add = (id, type, x, y, blob) => {
    if (!id || eliminados.has(id)) return;
    upsertContentRow({
      id,
      type,
      x: x != null ? Number(x) : null,
      y: y != null ? Number(y) : null,
      data_json: blob,
      deleted: 0,
      updated_by: 'migration'
    });
    elementos++;
  };

  for (const o of (mundo.objetos || [])) {
    if (!o?.id || !o.pos || o.pos.length < 2) continue;
    add(o.id, 'item', o.pos[0], o.pos[1], o);
  }

  for (const e of (mundo.enemigos || [])) {
    if (!e?.id) continue;
    const pos = posEnemigo(e, mundo);
    if (!pos) continue;
    add(e.id, 'enemy', pos[0], pos[1], e);
  }

  for (const t of (mundo.tesoros || [])) {
    if (!t?.id || !t.pos || t.pos.length < 2) continue;
    add(t.id, 'treasure', t.pos[0], t.pos[1], t);
  }

  for (const t of (mundo.tiendasAdmin || [])) {
    if (!t?.id) continue;
    const pos = t.pos || t.posicion;
    if (!pos || pos.length < 2) continue;
    add(t.id, 'shop', pos[0], pos[1], t);
  }

  for (const m of (mundo.misiones || [])) {
    if (!m?.id || !m.pos || m.pos.length < 2) continue;
    add(m.id, 'mission', m.pos[0], m.pos[1], m);
  }

  for (const c of (mundo.cofres || [])) {
    if (!c?.id) continue;
    const pos = c.pos || (mundo.posiciones || {})[c.id];
    if (!pos || pos.length < 2) continue;
    add(c.id, 'chest', pos[0], pos[1], c);
  }

  let tombstones = 0;
  for (const id of eliminados) {
    if (!id) continue;
    const existing = db.prepare('SELECT id, deleted FROM world_content WHERE id = ?').get(id);
    if (existing && existing.deleted === 1) continue;
    if (existing && existing.deleted === 0) {
      db.prepare(`
        UPDATE world_content SET deleted = 1, updated_at = datetime('now'), updated_by = 'migration-tombstone'
        WHERE id = ?
      `).run(id);
    } else {
      upsertContentRow({
        id,
        type: 'tombstone',
        data_json: {},
        deleted: 1,
        updated_by: 'migration-tombstone'
      });
    }
    tombstones++;
  }

  return { elementos, tombstones };
}

/**
 * Migra blob → world_content si la tabla está vacía (idempotente).
 */
function migrarWorldContentSiVacio(snapshot) {
  initWorldContentSchema();
  if (isWorldContentMigrated()) {
    return { migrated: false, reason: 'ya migrado', count: countWorldContent() };
  }

  const mundo = snapshot || getWorldSnapshot();
  if (!mundo) return { migrated: false, reason: 'sin snapshot' };

  const tx = db.transaction(() => {
    const cfg = migrarConfigDesdeSnapshot(mundo);
    const { elementos, tombstones } = migrarElementosDesdeSnapshot(mundo);
    setWorldConfig('_schema_migrated', 'v1');
    return { cfg, elementos, tombstones };
  });

  const r = tx();
  const total = countWorldContent();
  console.log(
    '[world_content] Migración inicial:',
    r.elementos, 'elementos,',
    r.tombstones, 'tombstones,',
    r.cfg, 'config keys'
  );
  return { migrated: true, count: total, ...r };
}

function parseBlob(row) {
  try {
    const d = JSON.parse(row.data_json || '{}');
    return d && typeof d === 'object' ? d : {};
  } catch (e) {
    return {};
  }
}

/**
 * Genera la porción de mapa del snapshot desde world_content + world_config.
 * Conserva jugadores/partidas y demás campos de `base`.
 */
function construirSnapshotDesdeBD(base) {
  initWorldContentSchema();
  const snap = Object.assign({}, base || getWorldSnapshot() || {});

  for (const k of MAP_ARRAY_KEYS) snap[k] = [];
  snap.posiciones = {};
  snap.eliminados = [];

  const rows = getAllWorldContent(false);
  for (const row of rows) {
    if (row.deleted) {
      snap.eliminados.push(row.id);
      continue;
    }
    const campo = TYPE_TO_CAMPO[row.type];
    if (!campo) continue;
    const blob = parseBlob(row);
    if (!blob.id) blob.id = row.id;
    snap[campo].push(blob);
    const pos = blob.pos || blob.posicion;
    if (pos && pos.length >= 2) {
      snap.posiciones[row.id] = [pos[0], pos[1]];
    } else if (row.x != null && row.y != null) {
      snap.posiciones[row.id] = [row.x, row.y];
      if (campo === 'enemigos' && !blob.pos) blob.pos = [row.x, row.y];
    }
  }

  snap.eliminados = [...new Set(snap.eliminados)].sort();

  for (const key of CONFIG_KEYS) {
    const val = getWorldConfig(key);
    if (val !== undefined) snap[key] = val;
  }

  if (!snap.actualizadoEn) snap.actualizadoEn = Date.now();
  return snap;
}

function normalizarParaDiff(mundo) {
  const m = {
    objetos: (mundo.objetos || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id))),
    enemigos: (mundo.enemigos || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id))),
    tesoros: (mundo.tesoros || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id))),
    tiendasAdmin: (mundo.tiendasAdmin || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id))),
    misiones: (mundo.misiones || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id))),
    cofres: (mundo.cofres || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id))),
    posiciones: mundo.posiciones || {},
    eliminados: [...(mundo.eliminados || [])].sort(),
    precios: mundo.precios || {},
    combate: mundo.combate || {},
    tiendasStock: mundo.tiendasStock || {},
    enemigosEstado: mundo.enemigosEstado || {},
    objetosEstado: mundo.objetosEstado || {},
    tesorosEstado: mundo.tesorosEstado || {}
  };
  return m;
}

function diffMapa(a, b) {
  const diffs = [];
  const na = normalizarParaDiff(a);
  const nb = normalizarParaDiff(b);
  for (const key of Object.keys(na)) {
    const sa = JSON.stringify(na[key]);
    const sb = JSON.stringify(nb[key]);
    if (sa !== sb) diffs.push(key);
  }
  return diffs;
}

/** Compara snapshot original vs proyección desde BD (solo campos de mapa). */
function validarDobleLecturaMundo(baseSnapshot) {
  const base = baseSnapshot || getWorldSnapshot();
  if (!base) return { ok: false, reason: 'sin snapshot' };
  if (!isWorldContentMigrated()) return { ok: false, reason: 'sin migración world_content' };

  const proyectado = construirSnapshotDesdeBD(base);
  const diffs = diffMapa(base, proyectado);
  return {
    ok: diffs.length === 0,
    diffCount: diffs.length,
    diffs,
    resumen: diffs.length ? diffs.join(', ') : 'vacío'
  };
}

module.exports = {
  initWorldContentSchema,
  countWorldContent,
  migrarWorldContentSiVacio,
  construirSnapshotDesdeBD,
  validarDobleLecturaMundo,
  upsertContentRow,
  setWorldConfig,
  getWorldConfig,
  getAllWorldContent,
  TYPE_TO_CAMPO,
  CONFIG_KEYS
};
