/**
 * Sincroniza datos/mundo.json del admin del juego → SQLite + broadcast en vivo.
 */
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

function findObjectByOrigenId(origenId) {
  if (!origenId) return null;
  for (const row of getAllWorldObjects()) {
    const d = parseData(row);
    if (d.origenId === origenId) return row;
  }
  return null;
}

function findMissionByOrigenId(origenId) {
  if (!origenId) return null;
  for (const row of getAllMissions()) {
    const reward = JSON.parse(row.reward_json || '{}');
    if (reward.origenId === origenId) return row;
  }
  return null;
}

function upsertWorldObject(origenId, type, x, y, data, io) {
  const payload = Object.assign({ origenId }, data || {});
  const existing = findObjectByOrigenId(origenId);
  let row;
  if (existing) {
    row = updateWorldObject(existing.id, {
      type,
      x: Number(x),
      y: Number(y),
      state: 'active',
      data_json: JSON.stringify(payload)
    });
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
  if (io) io.emit('world:updateObject', formatted);
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
    }, io);
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
      origenX: pos[0],
      origenY: pos[1]
    }, io);
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
    }, io);
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
    }, io);
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

  saveWorldSnapshot(mundo);

  if (io) {
    io.emit('mundo:sync', {
      actualizadoEn: mundo.actualizadoEn,
      mundo
    });
  }

  return { ok: true, objetos, misiones, actualizadoEn: mundo.actualizadoEn };
}

module.exports = { syncMundoFromJson, getWorldSnapshot };
