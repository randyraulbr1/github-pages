/**
 * Importa/merge el snapshot del mundo desde datos/mundo.json hacia SQLite.
 * Se ejecuta al arrancar si el snapshot está vacío o sin jugadores.
 */
const fs = require('fs');
const path = require('path');
const { getWorldSnapshot, saveWorldSnapshot } = require('./db');
const { mergeJugadoresPartidas } = require('./syncMundo');
const { countUsers, reconciliarCuentasEnSnapshot } = require('./syncCuentas');

function leerMundoJson() {
  const ruta = path.join(__dirname, '..', 'datos', 'mundo.json');
  if (!fs.existsSync(ruta)) return null;
  try {
    return JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch (e) {
    return null;
  }
}

function importarSnapshotSiFalta() {
  const archivo = leerMundoJson();
  if (!archivo) return { ok: false, reason: 'sin archivo' };

  const prev = getWorldSnapshot();
  const sinSnapshot = !prev;
  const sinJugadores = !prev?.jugadores?.length;
  const archivoTieneJugadores = (archivo.jugadores || []).length > 0;
  const usuariosSqlite = countUsers();

  if (!sinSnapshot && !sinJugadores && usuariosSqlite === 0) {
    return { ok: true, skipped: true, jugadores: prev.jugadores.length };
  }

  let mundo = prev || {
    actualizadoEn: Date.now(),
    misiones: [],
    tesoros: [],
    objetos: [],
    enemigos: [],
    posiciones: {},
    eliminados: [],
    precios: {},
    itemsNuevos: [],
    mantenimiento: { activo: false, mensaje: '' },
    baneados: [],
    mensajes: [],
    jugadores: [],
    cofres: [],
    correoReclamados: [],
    correoTienda: [],
    partidas: {},
    enemigosEstado: {},
    objetosEstado: {},
    tesorosEstado: {},
    tiendasAdmin: [],
    tiendasStock: {},
    combate: {}
  };

  if (sinSnapshot) {
    mundo = Object.assign(mundo, archivo);
  }

  mergeJugadoresPartidas(mundo, [archivo, prev]);

  if (!mundo.partidas && archivo.partidas) mundo.partidas = archivo.partidas;
  if (sinSnapshot || !(mundo.objetos || []).length) {
    if ((archivo.objetos || []).length) mundo.objetos = archivo.objetos;
    if ((archivo.enemigos || []).length) mundo.enemigos = archivo.enemigos;
    if ((archivo.misiones || []).length) mundo.misiones = archivo.misiones;
    if ((archivo.tesoros || []).length) mundo.tesoros = archivo.tesoros;
    if (archivo.posiciones) mundo.posiciones = Object.assign({}, archivo.posiciones, mundo.posiciones || {});
  }

  if (archivoTieneJugadores && sinJugadores) {
    console.log('[importSnapshot] Restaurando', (archivo.jugadores || []).length, 'jugadores desde mundo.json');
  }

  mundo.actualizadoEn = Math.max(mundo.actualizadoEn || 0, archivo.actualizadoEn || Date.now());
  reconciliarCuentasEnSnapshot(mundo);
  saveWorldSnapshot(mundo);

  return {
    ok: true,
    jugadores: (mundo.jugadores || []).length,
    importado: sinSnapshot || sinJugadores
  };
}

/** Fuerza merge de jugadores desde archivo (endpoint admin). */
function forzarImportJugadores() {
  const archivo = leerMundoJson();
  if (!archivo) return { ok: false, error: 'mundo.json no encontrado' };
  const prev = getWorldSnapshot() || { jugadores: [], partidas: {} };
  const mundo = Object.assign({}, prev);
  mergeJugadoresPartidas(mundo, [archivo, prev]);
  if (archivo.partidas) {
    mundo.partidas = Object.assign({}, archivo.partidas, mundo.partidas || {});
  }
  mundo.actualizadoEn = Date.now();
  saveWorldSnapshot(mundo);
  return { ok: true, jugadores: (mundo.jugadores || []).length };
}

module.exports = { importarSnapshotSiFalta, forzarImportJugadores, leerMundoJson };
