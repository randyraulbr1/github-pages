/**
 * Capa de base de datos SQLite.
 * Diseñada para poder migrar a MySQL más adelante (mismas consultas parametrizadas).
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATABASE_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'game.sqlite');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'player',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login TEXT
    );

    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      x REAL NOT NULL DEFAULT 22.9936,
      y REAL NOT NULL DEFAULT -82.7539,
      hp INTEGER NOT NULL DEFAULT 100,
      hunger INTEGER NOT NULL DEFAULT 50,
      xp INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      inventory_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS world_objects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      state TEXT NOT NULL DEFAULT 'active',
      data_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS missions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      reward_json TEXT NOT NULL DEFAULT '{}',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by_admin INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS player_missions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL,
      mission_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      progress_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(player_id, mission_id),
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
      FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS friend_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_player_id INTEGER NOT NULL,
      to_player_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(from_player_id, to_player_id),
      FOREIGN KEY (from_player_id) REFERENCES players(id) ON DELETE CASCADE,
      FOREIGN KEY (to_player_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS player_blocks (
      blocker_id INTEGER NOT NULL,
      blocked_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (blocker_id, blocked_id),
      FOREIGN KEY (blocker_id) REFERENCES players(id) ON DELETE CASCADE,
      FOREIGN KEY (blocked_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS world_snapshot (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_player_id INTEGER NOT NULL,
      to_player_id INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'text',
      text TEXT NOT NULL DEFAULT '',
      location_lat REAL,
      location_lng REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (from_player_id) REFERENCES players(id) ON DELETE CASCADE,
      FOREIGN KEY (to_player_id) REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chat_pair ON chat_messages(from_player_id, to_player_id, created_at);

    CREATE TABLE IF NOT EXISTS chat_read_cursors (
      player_id INTEGER NOT NULL,
      other_player_id INTEGER NOT NULL,
      last_read_message_id INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (player_id, other_player_id),
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
      FOREIGN KEY (other_player_id) REFERENCES players(id) ON DELETE CASCADE
    );
  `);

  migrateUserRoleColumn();
  migrateAdminUserRoles();

  try {
    const { initWorldContentSchema } = require('./worldContent');
    initWorldContentSchema();
  } catch (e) {
    console.warn('   worldContent schema:', e.message);
  }

  // Solo si la BD está vacía: semilla mínima; importMundo trae datos reales de mundo.json
  // seedWorldIfEmpty(); — desactivado, usa importMundo.js
  try {
    const { importarDesdeMundoJson } = require('./importMundo');
    const imp = importarDesdeMundoJson(db);
    if (imp.objetos) console.log('   Importados', imp.objetos, 'objetos desde datos/mundo.json');
  } catch (e) { /* sin mundo.json */ }

  try {
    const { importarSnapshotSiFalta } = require('./importSnapshot');
    const snap = importarSnapshotSiFalta();
    if (snap.importado) {
      console.log('   Snapshot mundo:', snap.jugadores, 'jugadores en SQLite');
    }
  } catch (e) {
    console.warn('   importSnapshot:', e.message);
  }

  try {
    const { reconciliarCuentasEnSnapshot } = require('./syncCuentas');
    const rec = reconciliarCuentasEnSnapshot();
    if (rec.added > 0) {
      console.log('   Cuentas SQLite → snapshot:', rec.added, 'añadidas (total', rec.total + ')');
    }
  } catch (e) {
    console.warn('   syncCuentas:', e.message);
  }
}

/** Fase 2.1: columna role en users (migración en caliente). */
function migrateUserRoleColumn() {
  const cols = db.prepare('PRAGMA table_info(users)').all();
  if (!cols.some(c => c.name === 'role')) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'player'");
    console.log('   Migración users.role: columna añadida');
  }
}

/** Asigna role=admin a cuentas cuyo username coincide con nombres reservados. */
function migrateAdminUserRoles() {
  try {
    const { esNombreAdmin } = require('./adminCuenta');
    const users = db.prepare('SELECT id, username, role FROM users').all();
    let n = 0;
    for (const u of users) {
      if (esNombreAdmin(u.username) && u.role !== 'admin') {
        db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(u.id);
        n++;
      }
    }
    if (n > 0) console.log('   Migración users.role:', n, 'admin(s) asignados');
  } catch (e) {
    console.warn('   migrateAdminUserRoles:', e.message);
  }
}

/** Objetos iniciales del mapa (como el coco y cangrejo del juego original). */
function seedWorldIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM world_objects').get().n;
  if (count > 0) return;

  const insert = db.prepare(`
    INSERT INTO world_objects (type, x, y, state, data_json)
    VALUES (@type, @x, @y, @state, @data_json)
  `);

  const seeds = [
    { type: 'item', x: 22.993775, y: -82.759516, state: 'active', data_json: JSON.stringify({ itemId: 'coco', cantidad: 1, icon: '🥥' }) },
    { type: 'item', x: 22.992788, y: -82.759709, state: 'active', data_json: JSON.stringify({ itemId: 'cangrejo', cantidad: 1, icon: '🦀' }) },
    { type: 'tree', x: 22.9941, y: -82.758, state: 'active', data_json: JSON.stringify({ label: 'Palma', hp: 3, icon: '🌴' }) }
  ];

  const tx = db.transaction((rows) => {
    for (const row of rows) insert.run(row);
  });
  tx(seeds);
}

// --- Users ---
function findUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username);
}

function findUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function createUser(username, passwordHash, role) {
  const r = role === 'admin' ? 'admin' : 'player';
  const stmt = db.prepare(`
    INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)
  `);
  const info = stmt.run(username, passwordHash, r);
  return findUserById(info.lastInsertRowid);
}

function setUserRole(userId, role) {
  const r = role === 'admin' ? 'admin' : 'player';
  db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(r, userId);
  return findUserById(userId);
}

function updateLastLogin(userId) {
  db.prepare(`UPDATE users SET last_login = datetime('now') WHERE id = ?`).run(userId);
}

// --- Players ---
function findPlayerByUserId(userId) {
  return db.prepare('SELECT * FROM players WHERE user_id = ?').get(userId);
}

function findPlayerById(id) {
  return db.prepare('SELECT * FROM players WHERE id = ?').get(id);
}

function createPlayer(userId, name) {
  const stmt = db.prepare(`
    INSERT INTO players (user_id, name) VALUES (?, ?)
  `);
  const info = stmt.run(userId, name);
  return findPlayerById(info.lastInsertRowid);
}

function updatePlayer(id, fields) {
  const allowed = ['name', 'x', 'y', 'hp', 'hunger', 'xp', 'level', 'inventory_json'];
  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  if (!sets.length) return findPlayerById(id);
  sets.push(`updated_at = datetime('now')`);
  values.push(id);
  db.prepare(`UPDATE players SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return findPlayerById(id);
}

function getAllPlayers() {
  return db.prepare('SELECT * FROM players ORDER BY id').all();
}

// --- World objects ---
function getAllWorldObjects() {
  return db.prepare('SELECT * FROM world_objects ORDER BY id').all();
}

function findWorldObject(id) {
  return db.prepare('SELECT * FROM world_objects WHERE id = ?').get(id);
}

function createWorldObject(obj) {
  const stmt = db.prepare(`
    INSERT INTO world_objects (type, x, y, state, data_json)
    VALUES (@type, @x, @y, @state, @data_json)
  `);
  const info = stmt.run({
    type: obj.type,
    x: obj.x,
    y: obj.y,
    state: obj.state || 'active',
    data_json: typeof obj.data_json === 'string' ? obj.data_json : JSON.stringify(obj.data_json || {})
  });
  return findWorldObject(info.lastInsertRowid);
}

function updateWorldObject(id, fields) {
  const current = findWorldObject(id);
  if (!current) return null;
  const stmt = db.prepare(`
    UPDATE world_objects
    SET type = @type, x = @x, y = @y, state = @state, data_json = @data_json,
        updated_at = datetime('now')
    WHERE id = @id
  `);
  stmt.run({
    id,
    type: fields.type ?? current.type,
    x: fields.x ?? current.x,
    y: fields.y ?? current.y,
    state: fields.state ?? current.state,
    data_json: fields.data_json ?? current.data_json
  });
  return findWorldObject(id);
}

function deleteWorldObject(id) {
  return db.prepare('DELETE FROM world_objects WHERE id = ?').run(id);
}

// --- Missions ---
function getActiveMissions() {
  return db.prepare('SELECT * FROM missions WHERE is_active = 1 ORDER BY id DESC').all();
}

function getAllMissions() {
  return db.prepare('SELECT * FROM missions ORDER BY id DESC').all();
}

function findMission(id) {
  return db.prepare('SELECT * FROM missions WHERE id = ?').get(id);
}

function createMission(mission) {
  const stmt = db.prepare(`
    INSERT INTO missions (title, description, reward_json, is_active, created_by_admin)
    VALUES (@title, @description, @reward_json, @is_active, @created_by_admin)
  `);
  const info = stmt.run({
    title: mission.title,
    description: mission.description || '',
    reward_json: typeof mission.reward_json === 'string' ? mission.reward_json : JSON.stringify(mission.reward_json || {}),
    is_active: mission.is_active !== undefined ? (mission.is_active ? 1 : 0) : 1,
    created_by_admin: mission.created_by_admin !== undefined ? mission.created_by_admin : 1
  });
  return findMission(info.lastInsertRowid);
}

function updateMission(id, fields) {
  const current = findMission(id);
  if (!current) return null;
  const stmt = db.prepare(`
    UPDATE missions
    SET title = @title, description = @description, reward_json = @reward_json,
        is_active = @is_active
    WHERE id = @id
  `);
  stmt.run({
    id,
    title: fields.title ?? current.title,
    description: fields.description ?? current.description,
    reward_json: fields.reward_json ?? current.reward_json,
    is_active: fields.is_active !== undefined ? (fields.is_active ? 1 : 0) : current.is_active
  });
  return findMission(id);
}

function deleteMission(id) {
  return db.prepare('DELETE FROM missions WHERE id = ?').run(id);
}

// --- Player missions ---
function getPlayerMissions(playerId) {
  return db.prepare(`
    SELECT pm.*, m.title, m.description, m.reward_json
    FROM player_missions pm
    JOIN missions m ON m.id = pm.mission_id
    WHERE pm.player_id = ?
    ORDER BY pm.updated_at DESC
  `).all(playerId);
}

function upsertPlayerMission(playerId, missionId, status, progress) {
  const existing = db.prepare(`
    SELECT * FROM player_missions WHERE player_id = ? AND mission_id = ?
  `).get(playerId, missionId);

  const progressJson = typeof progress === 'string' ? progress : JSON.stringify(progress || {});

  if (existing) {
    db.prepare(`
      UPDATE player_missions
      SET status = ?, progress_json = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(status, progressJson, existing.id);
    return db.prepare('SELECT * FROM player_missions WHERE id = ?').get(existing.id);
  }

  const info = db.prepare(`
    INSERT INTO player_missions (player_id, mission_id, status, progress_json)
    VALUES (?, ?, ?, ?)
  `).run(playerId, missionId, status, progressJson);
  return db.prepare('SELECT * FROM player_missions WHERE id = ?').get(info.lastInsertRowid);
}

function findPlayerByName(name) {
  return db.prepare('SELECT * FROM players WHERE name = ? COLLATE NOCASE').get(name);
}

// --- Friends & blocks ---
function isBlocked(a, b) {
  const row = db.prepare(`
    SELECT 1 FROM player_blocks
    WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
  `).get(a, b, b, a);
  return !!row;
}

function getBlockedIds(playerId) {
  return db.prepare(`
    SELECT blocked_id AS id FROM player_blocks WHERE blocker_id = ?
  `).all(playerId).map(r => r.id);
}

function getBlockedByIds(playerId) {
  return db.prepare(`
    SELECT blocker_id AS id FROM player_blocks WHERE blocked_id = ?
  `).all(playerId).map(r => r.id);
}

function blockPlayer(blockerId, blockedId) {
  db.prepare(`
    INSERT OR IGNORE INTO player_blocks (blocker_id, blocked_id) VALUES (?, ?)
  `).run(blockerId, blockedId);
  db.prepare(`
    DELETE FROM friend_requests
    WHERE status = 'pending' AND (
      (from_player_id = ? AND to_player_id = ?) OR (from_player_id = ? AND to_player_id = ?)
    )
  `).run(blockerId, blockedId, blockedId, blockerId);
}

function unblockPlayer(blockerId, blockedId) {
  db.prepare('DELETE FROM player_blocks WHERE blocker_id = ? AND blocked_id = ?')
    .run(blockerId, blockedId);
}

function findFriendRequestBetween(a, b) {
  return db.prepare(`
    SELECT * FROM friend_requests
    WHERE (from_player_id = ? AND to_player_id = ?)
       OR (from_player_id = ? AND to_player_id = ?)
  `).get(a, b, b, a);
}

function sendFriendRequest(fromId, toId) {
  if (isBlocked(fromId, toId)) {
    return { ok: false, error: 'No puedes enviar solicitud a este jugador' };
  }
  if (!findPlayerById(toId)) return { ok: false, error: 'Jugador no encontrado' };

  const existing = findFriendRequestBetween(fromId, toId);
  if (existing) {
    if (existing.status === 'accepted') return { ok: false, error: 'Ya son amigos' };
    if (existing.status === 'pending') {
      if (existing.from_player_id === toId) {
        return acceptFriendRequest(existing.id, fromId);
      }
      return { ok: false, error: 'Solicitud pendiente' };
    }
  }

  const info = db.prepare(`
    INSERT INTO friend_requests (from_player_id, to_player_id, status)
    VALUES (?, ?, 'pending')
  `).run(fromId, toId);

  const row = db.prepare('SELECT * FROM friend_requests WHERE id = ?').get(info.lastInsertRowid);
  const fromP = findPlayerById(fromId);
  const toP = findPlayerById(toId);
  return {
    ok: true,
    request: formatFriendRequest(row, fromP, toP)
  };
}

function formatFriendRequest(row, fromP, toP) {
  if (!row) return null;
  return {
    id: row.id,
    fromPlayerId: row.from_player_id,
    toPlayerId: row.to_player_id,
    fromName: fromP?.name || '?',
    toName: toP?.name || '?',
    status: row.status,
    createdAt: row.created_at
  };
}

function acceptFriendRequest(requestId, playerId) {
  const row = db.prepare('SELECT * FROM friend_requests WHERE id = ?').get(requestId);
  if (!row || row.status !== 'pending') {
    return { ok: false, error: 'Solicitud no encontrada' };
  }
  if (row.to_player_id !== playerId) {
    return { ok: false, error: 'No puedes aceptar esta solicitud' };
  }
  if (isBlocked(row.from_player_id, row.to_player_id)) {
    return { ok: false, error: 'No puedes aceptar esta solicitud' };
  }
  db.prepare(`UPDATE friend_requests SET status = 'accepted' WHERE id = ?`).run(requestId);
  const updated = db.prepare('SELECT * FROM friend_requests WHERE id = ?').get(requestId);
  return {
    ok: true,
    request: formatFriendRequest(updated, findPlayerById(updated.from_player_id), findPlayerById(updated.to_player_id))
  };
}

function rejectFriendRequest(requestId, playerId) {
  const row = db.prepare('SELECT * FROM friend_requests WHERE id = ?').get(requestId);
  if (!row || row.status !== 'pending') {
    return { ok: false, error: 'Solicitud no encontrada' };
  }
  if (row.to_player_id !== playerId && row.from_player_id !== playerId) {
    return { ok: false, error: 'No autorizado' };
  }
  db.prepare('DELETE FROM friend_requests WHERE id = ?').run(requestId);
  return { ok: true };
}

function removeFriendship(playerId, friendId) {
  const row = findFriendRequestBetween(playerId, friendId);
  if (!row || row.status !== 'accepted') {
    return { ok: false, error: 'No son amigos' };
  }
  db.prepare('DELETE FROM friend_requests WHERE id = ?').run(row.id);
  return { ok: true };
}

function getFriendIds(playerId) {
  return db.prepare(`
    SELECT
      CASE WHEN from_player_id = ? THEN to_player_id ELSE from_player_id END AS friend_id
    FROM friend_requests
    WHERE status = 'accepted' AND (from_player_id = ? OR to_player_id = ?)
  `).all(playerId, playerId, playerId).map(r => r.friend_id);
}

function getSocialData(playerId, onlineIds) {
  const online = new Set(onlineIds || []);
  const blocked = getBlockedIds(playerId);
  const blockedBy = getBlockedByIds(playerId);

  const friends = db.prepare(`
    SELECT fr.*,
      CASE WHEN fr.from_player_id = ? THEN fr.to_player_id ELSE fr.from_player_id END AS friend_id
    FROM friend_requests fr
    WHERE fr.status = 'accepted' AND (fr.from_player_id = ? OR fr.to_player_id = ?)
  `).all(playerId, playerId, playerId).map(r => {
    const fp = findPlayerById(r.friend_id);
    return {
      playerId: r.friend_id,
      name: fp?.name || '?',
      online: online.has(r.friend_id)
    };
  });

  const pendingIn = db.prepare(`
    SELECT fr.* FROM friend_requests fr
    WHERE fr.status = 'pending' AND fr.to_player_id = ?
  `).all(playerId).map(r => formatFriendRequest(r, findPlayerById(r.from_player_id), findPlayerById(r.to_player_id)));

  const pendingOut = db.prepare(`
    SELECT fr.* FROM friend_requests fr
    WHERE fr.status = 'pending' AND fr.from_player_id = ?
  `).all(playerId).map(r => formatFriendRequest(r, findPlayerById(r.from_player_id), findPlayerById(r.to_player_id)));

  const blockedList = blocked.map(id => {
    const p = findPlayerById(id);
    return { playerId: id, name: p?.name || '?' };
  });

  const blockedByList = blockedBy.map(id => {
    const p = findPlayerById(id);
    return { playerId: id, name: p?.name || '?' };
  });

  return {
    friends,
    pendingIn: pendingIn.filter(r => !isBlocked(playerId, r.fromPlayerId)),
    pendingOut: pendingOut.filter(r => !isBlocked(playerId, r.toPlayerId)),
    blocked: blockedList,
    blockedBy: blockedByList,
    friendIds: friends.map(f => f.playerId),
    blockedIds: blocked,
    blockedByIds: blockedBy
  };
}

function formatPlayer(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    x: row.x,
    y: row.y,
    hp: row.hp,
    hunger: row.hunger,
    xp: row.xp,
    level: row.level,
    inventory: JSON.parse(row.inventory_json || '[]'),
    updatedAt: row.updated_at
  };
}

function formatWorldObject(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    x: row.x,
    y: row.y,
    state: row.state,
    data: JSON.parse(row.data_json || '{}'),
    updatedAt: row.updated_at
  };
}

function formatMission(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    reward: JSON.parse(row.reward_json || '{}'),
    isActive: !!row.is_active,
    createdAt: row.created_at
  };
}

function saveWorldSnapshot(mundo) {
  let snap = mundo;
  if (typeof mundo === 'string') {
    try { snap = JSON.parse(mundo); } catch (e) { snap = null; }
  }
  if (snap && typeof snap === 'object') {
    try {
      const { asegurarAdminEnMundo } = require('./adminCuenta');
      asegurarAdminEnMundo(snap);
    } catch (e) { /* */ }
  }
  const json = typeof snap === 'string' ? snap : JSON.stringify(snap);
  db.prepare(`
    INSERT INTO world_snapshot (id, json, updated_at) VALUES (1, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at
  `).run(json);
}

function getWorldSnapshot() {
  const row = db.prepare('SELECT json FROM world_snapshot WHERE id = 1').get();
  if (!row) return null;
  try { return JSON.parse(row.json); } catch (e) { return null; }
}

/** Snapshot para clientes: siempre incluye la cuenta admin (randy). */
function getWorldSnapshotPublic() {
  const snap = getWorldSnapshot();
  if (!snap) return null;
  try {
    const { asegurarAdminEnMundo } = require('./adminCuenta');
    return asegurarAdminEnMundo(snap);
  } catch (e) {
    return snap;
  }
}

function parseChatTime(value) {
  if (!value) return Date.now();
  const t = Date.parse(String(value).replace(' ', 'T') + 'Z');
  return Number.isFinite(t) ? t : Date.now();
}

function getChatReadCursor(playerId, otherId) {
  const row = db.prepare(`
    SELECT last_read_message_id FROM chat_read_cursors
    WHERE player_id = ? AND other_player_id = ?
  `).get(playerId, otherId);
  return row ? Number(row.last_read_message_id) || 0 : 0;
}

function markChatRead(playerId, otherId, messageId) {
  const mid = parseInt(messageId, 10);
  if (!Number.isFinite(mid) || mid <= 0) return null;
  const msg = db.prepare(`
    SELECT id, from_player_id, to_player_id FROM chat_messages WHERE id = ?
  `).get(mid);
  if (!msg) return null;
  const valid =
    (msg.from_player_id === otherId && msg.to_player_id === playerId) ||
    (msg.from_player_id === playerId && msg.to_player_id === otherId);
  if (!valid) return null;
  const prev = getChatReadCursor(playerId, otherId);
  if (mid <= prev) return { playerId, otherId, lastReadMessageId: prev };
  db.prepare(`
    INSERT INTO chat_read_cursors (player_id, other_player_id, last_read_message_id, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(player_id, other_player_id) DO UPDATE SET
      last_read_message_id = excluded.last_read_message_id,
      updated_at = excluded.updated_at
  `).run(playerId, otherId, mid);
  return { playerId, otherId, lastReadMessageId: mid };
}

function formatChatMessage(row, viewerId, readByOtherCursor) {
  if (!row) return null;
  const fromId = row.from_player_id;
  const toId = row.to_player_id;
  let readAt = null;
  if (viewerId && fromId === viewerId && readByOtherCursor != null) {
    if (Number(row.id) <= Number(readByOtherCursor)) readAt = parseChatTime(row.created_at);
  }
  return {
    id: row.id,
    fromPlayerId: fromId,
    toPlayerId: toId,
    fromName: row.from_name || row.fromName || '?',
    toName: row.to_name || row.toName || '?',
    type: row.type || 'text',
    text: row.text || '',
    location: row.location_lat != null && row.location_lng != null
      ? { lat: row.location_lat, lng: row.location_lng, playerId: 'JG-' + fromId }
      : null,
    createdAt: parseChatTime(row.created_at),
    readAt
  };
}

function getChatMessageById(id, viewerId) {
  const row = db.prepare(`
    SELECT cm.*, fp.name AS from_name, tp.name AS to_name
    FROM chat_messages cm
    JOIN players fp ON fp.id = cm.from_player_id
    JOIN players tp ON tp.id = cm.to_player_id
    WHERE cm.id = ?
  `).get(id);
  if (!row) return null;
  const otherId = row.from_player_id === viewerId ? row.to_player_id : row.from_player_id;
  const readCursor = viewerId ? getChatReadCursor(otherId, viewerId) : 0;
  return formatChatMessage(row, viewerId, readCursor);
}

function insertChatMessage(fromId, toId, type, text, lat, lng) {
  const info = db.prepare(`
    INSERT INTO chat_messages (from_player_id, to_player_id, type, text, location_lat, location_lng)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(fromId, toId, type || 'text', text || '', lat ?? null, lng ?? null);
  return getChatMessageById(info.lastInsertRowid, fromId);
}

function getChatHistory(playerId, otherId, limit = 120) {
  const readByOther = getChatReadCursor(otherId, playerId);
  const rows = db.prepare(`
    SELECT cm.*, fp.name AS from_name, tp.name AS to_name
    FROM chat_messages cm
    JOIN players fp ON fp.id = cm.from_player_id
    JOIN players tp ON tp.id = cm.to_player_id
    WHERE (cm.from_player_id = ? AND cm.to_player_id = ?)
       OR (cm.from_player_id = ? AND cm.to_player_id = ?)
    ORDER BY cm.id DESC
    LIMIT ?
  `).all(playerId, otherId, otherId, playerId, limit);
  return rows.reverse().map(r => formatChatMessage(r, playerId, readByOther)).filter(Boolean);
}

function getChatConversations(playerId) {
  const rows = db.prepare(`
    SELECT cm.*, fp.name AS from_name, tp.name AS to_name
    FROM chat_messages cm
    JOIN players fp ON fp.id = cm.from_player_id
    JOIN players tp ON tp.id = cm.to_player_id
    WHERE cm.from_player_id = ? OR cm.to_player_id = ?
    ORDER BY cm.id DESC
  `).all(playerId, playerId);

  const seen = new Set();
  const list = [];
  for (const row of rows) {
    const otherId = row.from_player_id === playerId ? row.to_player_id : row.from_player_id;
    const key = String(otherId);
    if (seen.has(key)) continue;
    seen.add(key);
    const readByOther = getChatReadCursor(otherId, playerId);
    const msg = formatChatMessage(row, playerId, readByOther);
    if (msg) list.push({ playerId: otherId, lastMessage: msg });
  }
  return list;
}

function canChatBetween(playerA, playerB) {
  if (playerA === playerB) return false;
  if (isBlocked(playerA, playerB) || isBlocked(playerB, playerA)) return false;
  return true;
}

module.exports = {
  db,
  initDb,
  findUserByUsername,
  findUserById,
  createUser,
  setUserRole,
  updateLastLogin,
  findPlayerByUserId,
  findPlayerById,
  findPlayerByName,
  createPlayer,
  updatePlayer,
  getAllPlayers,
  getAllWorldObjects,
  findWorldObject,
  createWorldObject,
  updateWorldObject,
  deleteWorldObject,
  getActiveMissions,
  getAllMissions,
  findMission,
  createMission,
  updateMission,
  deleteMission,
  getPlayerMissions,
  upsertPlayerMission,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriendship,
  blockPlayer,
  unblockPlayer,
  getBlockedIds,
  getBlockedByIds,
  getFriendIds,
  getSocialData,
  isBlocked,
  formatPlayer,
  formatWorldObject,
  formatMission,
  saveWorldSnapshot,
  getWorldSnapshot,
  getWorldSnapshotPublic,
  insertChatMessage,
  getChatMessageById,
  getChatHistory,
  getChatConversations,
  formatChatMessage,
  getChatReadCursor,
  markChatRead,
  canChatBetween
};
