/**
 * Capa de base de datos SQLite.
 * Diseñada para poder migrar a MySQL más adelante (mismas consultas parametrizadas).
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'game.sqlite');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
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
  `);

  // Solo si la BD está vacía: semilla mínima; importMundo trae datos reales de mundo.json
  // seedWorldIfEmpty(); — desactivado, usa importMundo.js
  try {
    const { importarDesdeMundoJson } = require('./importMundo');
    const imp = importarDesdeMundoJson(db);
    if (imp.objetos) console.log('   Importados', imp.objetos, 'objetos desde datos/mundo.json');
  } catch (e) { /* sin mundo.json */ }
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

function createUser(username, passwordHash) {
  const stmt = db.prepare(`
    INSERT INTO users (username, password_hash) VALUES (?, ?)
  `);
  const info = stmt.run(username, passwordHash);
  return findUserById(info.lastInsertRowid);
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

module.exports = {
  db,
  initDb,
  findUserByUsername,
  findUserById,
  createUser,
  updateLastLogin,
  findPlayerByUserId,
  findPlayerById,
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
  formatPlayer,
  formatWorldObject,
  formatMission
};
