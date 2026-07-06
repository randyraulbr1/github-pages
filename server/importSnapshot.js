/**
 * Importa/merge el snapshot del mundo hacia SQLite.
 * Plan GRATIS Render: cuentas viven en GitHub (datos/mundo.json), no en disco local.
 */
const fs = require('fs');
const path = require('path');
const { getWorldSnapshot, saveWorldSnapshot } = require('./db');
const { mergeJugadoresPartidas } = require('./syncMundo');
const { countUsers, reconciliarCuentasEnSnapshot } = require('./syncCuentas');

function leerJugadoresDesdeCarpeta() {
  const dir = path.join(__dirname, '..', 'datos', 'jugadores');
  if (!fs.existsSync(dir)) return { jugadores: [], partidas: {} };
  const jugadores = [];
  const partidas = {};
  const indicePath = path.join(dir, 'indice.json');
  if (fs.existsSync(indicePath)) {
    try {
      const ind = JSON.parse(fs.readFileSync(indicePath, 'utf8'));
      if (Array.isArray(ind)) jugadores.push(...ind);
    } catch (e) { /* */ }
  }
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json') || f === 'indice.json') continue;
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (data?.id && data?.nombre) {
          const idx = jugadores.findIndex(j => j.id === data.id);
          const perfil = {
            id: data.id,
            nombre: data.nombre,
            telefono: data.telefono || '',
            pinHash: data.pinHash || '',
            creado: data.creado || Date.now()
          };
          if (idx >= 0) jugadores[idx] = Object.assign({}, jugadores[idx], perfil);
          else jugadores.push(perfil);
          if (data.partida) partidas[data.id] = data.partida;
        }
      } catch (e) { /* */ }
    }
  } catch (e) { /* */ }
  return { jugadores, partidas };
}

function leerMundoJson() {
  const ruta = path.join(__dirname, '..', 'datos', 'mundo.json');
  if (!fs.existsSync(ruta)) return null;
  try {
    return JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch (e) {
    return null;
  }
}

function _mundoVacio() {
  return {
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
}

function _fusionarPartidas(mundo, fuentes) {
  if (!mundo.partidas) mundo.partidas = {};
  for (const f of fuentes) {
    if (!f?.partidas) continue;
    for (const [id, p] of Object.entries(f.partidas)) {
      const prev = mundo.partidas[id];
      if (!prev || !prev.t || (p.t || 0) >= (prev.t || 0)) mundo.partidas[id] = p;
    }
  }
}

/**
 * Al arrancar: descarga mundo.json de GitHub (gratis, sin disco) y fusiona jugadores.
 */
async function restaurarMundoAlArranque() {
  const local = leerMundoJson();
  const carpeta = leerJugadoresDesdeCarpeta();
  let remoto = null;
  try {
    const { fetchMundoFromGitHub } = require('./githubMundo');
    remoto = await fetchMundoFromGitHub();
  } catch (e) {
    console.warn('[mundo] No se pudo leer GitHub:', e.message);
  }

  const fuentes = [remoto, local].filter(Boolean);
  if (!fuentes.length) return { ok: false, reason: 'sin mundo.json' };

  const prev = getWorldSnapshot();
  const sqliteVacio = countUsers() === 0;
  const sinSnapshot = !prev;
  const sinJugadores = !prev?.jugadores?.length;
  const githubTieneMas = (remoto?.jugadores?.length || 0) > (prev?.jugadores?.length || 0);

  if (!sqliteVacio && !sinSnapshot && !sinJugadores && !githubTieneMas) {
    return { ok: true, skipped: true, jugadores: prev.jugadores.length };
  }

  let mundo = prev ? Object.assign({}, prev) : _mundoVacio();
  const base = remoto || local;
  if (sinSnapshot && base) {
    mundo = Object.assign(_mundoVacio(), base, { jugadores: [], partidas: {} });
  }

  mergeJugadoresPartidas(mundo, fuentes.concat(prev, [{ jugadores: carpeta.jugadores }]));
  _fusionarPartidas(mundo, fuentes.concat(prev, [{ partidas: carpeta.partidas }]));

  if ((sinSnapshot || !(mundo.objetos || []).length) && base) {
    if ((base.objetos || []).length) mundo.objetos = base.objetos;
    if ((base.enemigos || []).length) mundo.enemigos = base.enemigos;
    if ((base.misiones || []).length) mundo.misiones = base.misiones;
    if ((base.tesoros || []).length) mundo.tesoros = base.tesoros;
    if (base.posiciones) {
      mundo.posiciones = Object.assign({}, base.posiciones, mundo.posiciones || {});
    }
  }

  const ts = Math.max(
    mundo.actualizadoEn || 0,
    remoto?.actualizadoEn || 0,
    local?.actualizadoEn || 0
  );
  mundo.actualizadoEn = ts || Date.now();

  reconciliarCuentasEnSnapshot(mundo);
  saveWorldSnapshot(mundo);

  const n = (mundo.jugadores || []).length;
  console.log(
    '[mundo] Cuentas restauradas:', n,
    'jugador(es) — GitHub:', remoto ? 'sí' : 'no',
    '| local:', local ? 'sí' : 'no'
  );

  return { ok: true, jugadores: n, desdeGitHub: !!remoto };
}

function importarSnapshotSiFalta() {
  const archivo = leerMundoJson();
  if (!archivo) return { ok: false, reason: 'sin archivo' };

  const prev = getWorldSnapshot();
  const sinSnapshot = !prev;
  const sinJugadores = !prev?.jugadores?.length;
  const usuariosSqlite = countUsers();

  if (!sinSnapshot && !sinJugadores && usuariosSqlite === 0) {
    return { ok: true, skipped: true, jugadores: prev.jugadores.length };
  }

  let mundo = prev || _mundoVacio();
  if (sinSnapshot) mundo = Object.assign(mundo, archivo);
  mergeJugadoresPartidas(mundo, [archivo, prev]);
  _fusionarPartidas(mundo, [archivo, prev]);

  if (!mundo.partidas && archivo.partidas) mundo.partidas = archivo.partidas;
  if (sinSnapshot || !(mundo.objetos || []).length) {
    if ((archivo.objetos || []).length) mundo.objetos = archivo.objetos;
    if ((archivo.enemigos || []).length) mundo.enemigos = archivo.enemigos;
    if ((archivo.misiones || []).length) mundo.misiones = archivo.misiones;
    if ((archivo.tesoros || []).length) mundo.tesoros = archivo.tesoros;
    if (archivo.posiciones) {
      mundo.posiciones = Object.assign({}, archivo.posiciones, mundo.posiciones || {});
    }
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

function forzarImportJugadores() {
  const archivo = leerMundoJson();
  if (!archivo) return { ok: false, error: 'mundo.json no encontrado' };
  const prev = getWorldSnapshot() || { jugadores: [], partidas: {} };
  const mundo = Object.assign({}, prev);
  mergeJugadoresPartidas(mundo, [archivo, prev]);
  _fusionarPartidas(mundo, [archivo, prev]);
  mundo.actualizadoEn = Date.now();
  saveWorldSnapshot(mundo);
  return { ok: true, jugadores: (mundo.jugadores || []).length };
}

/** Recupera jugadores desde GitHub / datos/jugadores si el snapshot perdió cuentas. */
async function recuperarJugadoresPerdidos() {
  const prev = getWorldSnapshot() || _mundoVacio();
  const carpeta = leerJugadoresDesdeCarpeta();
  let remoto = null;
  try {
    const { fetchMundoFromGitHub } = require('./githubMundo');
    remoto = await fetchMundoFromGitHub();
  } catch (e) { /* */ }

  const antes = (prev.jugadores || []).length;
  const mundo = Object.assign({}, prev);
  mergeJugadoresPartidas(mundo, [remoto, { jugadores: carpeta.jugadores }, prev]);
  _fusionarPartidas(mundo, [remoto, { partidas: carpeta.partidas }, prev]);
  reconciliarCuentasEnSnapshot(mundo);

  const despues = (mundo.jugadores || []).length;
  if (despues > antes) {
    mundo.actualizadoEn = Date.now();
    saveWorldSnapshot(mundo);
    try {
      const { respaldarJugadoresEnGitHubAsync } = require('./jugadoresBackup');
      respaldarJugadoresEnGitHubAsync(mundo);
    } catch (e) { /* */ }
    console.log('[mundo] Cuentas recuperadas:', despues - antes, '— total:', despues);
    return { ok: true, antes, despues, recuperados: despues - antes };
  }
  return { ok: true, antes, despues, recuperados: 0 };
}

module.exports = {
  importarSnapshotSiFalta,
  restaurarMundoAlArranque,
  forzarImportJugadores,
  recuperarJugadoresPerdidos,
  leerMundoJson
};
