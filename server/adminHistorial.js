/**
 * Fase 9 — Historial de acciones admin (deshacer errores).
 * Registro en memoria + JSONL en disco.
 */
const fs = require('fs');
const path = require('path');

const MAX = 200;
const LOG_PATH = path.join(__dirname, 'data', 'admin_historial.jsonl');
const log = [];

function _leerDisco() {
  try {
    if (!fs.existsSync(LOG_PATH)) return;
    const lineas = fs.readFileSync(LOG_PATH, 'utf8').trim().split('\n').filter(Boolean);
    for (const linea of lineas.slice(-MAX)) {
      try {
        log.push(JSON.parse(linea));
      } catch (e) { /* */ }
    }
    if (log.length > MAX) log.length = MAX;
  } catch (e) { /* */ }
}

function _appendDisco(entry) {
  try {
    const dir = path.dirname(LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n', 'utf8');
  } catch (e) { /* */ }
}

function _versionJuego() {
  try {
    const p = path.join(__dirname, '..', 'version.json');
    if (fs.existsSync(p)) {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      return String(j.version || '');
    }
  } catch (e) { /* */ }
  return '';
}

function _snap(val) {
  if (val == null) return null;
  try {
    return JSON.parse(JSON.stringify(val));
  } catch (e) {
    return String(val);
  }
}

function registrarAdminHistorial({ quien, accion, id, tipo, antes, despues, detalle }) {
  const entry = {
    id: 'ah_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
    t: Date.now(),
    version: _versionJuego(),
    quien: String(quien || 'admin'),
    accion: String(accion || 'accion'),
    tipo: tipo || null,
    refId: id || null,
    detalle: detalle ? String(detalle).slice(0, 300) : null,
    antes: _snap(antes),
    despues: _snap(despues)
  };
  log.unshift(entry);
  if (log.length > MAX) log.length = MAX;
  _appendDisco(entry);
  try {
    const { registrar } = require('./eventLog');
    registrar('admin_historial', entry.accion + (entry.refId ? ':' + entry.refId : ''), {
      historialId: entry.id
    });
  } catch (e) { /* */ }
  return entry;
}

function getAdminHistorial(limite) {
  return log.slice(0, limite || 50);
}

function buscarEntradaHistorial(historialId) {
  return log.find((e) => e.id === historialId) || null;
}

/**
 * Restaura el estado «antes» de una entrada (upsert/delete/config).
 */
function restaurarEntradaHistorial(historialId, updatedBy, io) {
  const entry = buscarEntradaHistorial(historialId);
  if (!entry) return { ok: false, error: 'Entrada no encontrada' };

  const {
    adminUpsertContent,
    adminDeleteContent,
    adminConfigContent,
    refreshMundoPublicadoDesdeBD
  } = require('./worldContent');

  const by = updatedBy || entry.quien || 'restore';

  if (entry.accion === 'config' && entry.refId) {
    const r = adminConfigContent(entry.refId, entry.antes, by);
    if (!r.ok) return r;
    refreshMundoPublicadoDesdeBD(io);
    registrarAdminHistorial({
      quien: by,
      accion: 'restore_config',
      id: entry.refId,
      tipo: 'config',
      antes: entry.despues,
      despues: entry.antes,
      detalle: 'Restaurado desde ' + entry.id
    });
    return { ok: true, restored: entry.id, key: entry.refId };
  }

  if (entry.accion === 'delete' && entry.antes) {
    const b = entry.antes;
    const r = adminUpsertContent({
      id: entry.refId || b.id,
      type: entry.tipo || b.type || 'item',
      x: b.pos?.[0] ?? b.x,
      y: b.pos?.[1] ?? b.y,
      data: b,
      updatedBy: by
    });
    if (!r.ok) return r;
    refreshMundoPublicadoDesdeBD(io);
    registrarAdminHistorial({
      quien: by,
      accion: 'restore_upsert',
      id: entry.refId,
      tipo: entry.tipo,
      antes: null,
      despues: entry.antes,
      detalle: 'Restaurado desde ' + entry.id
    });
    return { ok: true, restored: entry.id, id: entry.refId };
  }

  if (entry.accion === 'upsert') {
    if (entry.antes == null) {
      const r = adminDeleteContent(entry.refId, by);
      if (!r.ok) return r;
      refreshMundoPublicadoDesdeBD(io);
      registrarAdminHistorial({
        quien: by,
        accion: 'restore_delete',
        id: entry.refId,
        tipo: entry.tipo,
        antes: entry.despues,
        despues: null,
        detalle: 'Eliminado al restaurar creación ' + entry.id
      });
      return { ok: true, restored: entry.id, id: entry.refId, tombstone: true };
    }
    const b = entry.antes;
    const r = adminUpsertContent({
      id: entry.refId || b.id,
      type: entry.tipo || b.type || 'item',
      x: b.pos?.[0] ?? b.x,
      y: b.pos?.[1] ?? b.y,
      data: b,
      updatedBy: by
    });
    if (!r.ok) return r;
    refreshMundoPublicadoDesdeBD(io);
    registrarAdminHistorial({
      quien: by,
      accion: 'restore_upsert',
      id: entry.refId,
      tipo: entry.tipo,
      antes: entry.despues,
      despues: entry.antes,
      detalle: 'Restaurado desde ' + entry.id
    });
    return { ok: true, restored: entry.id, id: entry.refId };
  }

  return { ok: false, error: 'Tipo de entrada no restaurable' };
}

_leerDisco();

module.exports = {
  registrarAdminHistorial,
  getAdminHistorial,
  buscarEntradaHistorial,
  restaurarEntradaHistorial
};
