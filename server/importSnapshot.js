/**
 * Importa/merge el snapshot del mundo hacia SQLite.
 * Plan GRATIS Render: cuentas viven en GitHub (datos/mundo.json), no en disco local.
 */
const fs = require('fs');
const path = require('path');
const { getWorldSnapshot, saveWorldSnapshot } = require('./db');
const { mergeJugadoresPartidas } = require('./syncMundo');
const { countUsers, reconciliarCuentasEnSnapshot } = require('./syncCuentas');
const {
  leerAdminArchivoCompleto,
  asegurarAdminEnMundo
} = require('./adminCuenta');

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
  const idsIndice = new Set(jugadores.map(j => j?.id).filter(Boolean));
  const adminArchivo = leerAdminArchivoCompleto();
  if (adminArchivo?.id && adminArchivo?.nombre) {
    const perfil = {
      id: adminArchivo.id,
      nombre: adminArchivo.nombre,
      telefono: adminArchivo.telefono || '',
      pinHash: adminArchivo.pinHash || '',
      creado: adminArchivo.creado || Date.now()
    };
    const idx = jugadores.findIndex(j => j.id === perfil.id);
    if (idx >= 0) jugadores[idx] = Object.assign({}, jugadores[idx], perfil);
    else jugadores.unshift(perfil);
    if (adminArchivo.partida) partidas[perfil.id] = adminArchivo.partida;
  }

  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json') || f === 'indice.json' || f === 'admin.json') continue;
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (!data?.id) continue;
        const perfil = {
          id: data.id,
          nombre: data.nombre,
          telefono: data.telefono || '',
          pinHash: data.pinHash || '',
          creado: data.creado || Date.now()
        };
        if (!idsIndice.has(data.id)) {
          jugadores.push(perfil);
          idsIndice.add(data.id);
        } else {
          const idx = jugadores.findIndex(j => j.id === data.id);
          if (idx >= 0) jugadores[idx] = Object.assign({}, jugadores[idx], perfil);
        }
        if (data.partida) partidas[data.id] = data.partida;
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

function _nombresJugadores(m) {
  return new Set(
    (m?.jugadores || []).map(j => String(j.nombre || '').toLowerCase()).filter(Boolean)
  );
}

function _jugadoresDifieren(a, b) {
  const na = _nombresJugadores(a);
  const nb = _nombresJugadores(b);
  if (na.size !== nb.size) return true;
  for (const n of na) if (!nb.has(n)) return true;
  return false;
}

/**
 * Al arrancar: descarga mundo.json de GitHub (gratis, sin disco) y fusiona jugadores.
 */
async function restaurarMundoAlArranque() {
  const local = leerMundoJson();
  const carpeta = leerJugadoresDesdeCarpeta();
  let remoto = null;
  let githubJugadores = { jugadores: [], partidas: {} };
  try {
    const { fetchMundoFromGitHub } = require('./githubMundo');
    remoto = await fetchMundoFromGitHub();
  } catch (e) {
    console.warn('[mundo] No se pudo leer GitHub mundo.json:', e.message);
  }
  try {
    const { fetchJugadoresDesdeGitHub } = require('./githubJugadores');
    githubJugadores = await fetchJugadoresDesdeGitHub();
  } catch (e) {
    console.warn('[mundo] No se pudo leer GitHub jugadores/:', e.message);
  }

  const fuentes = [remoto, local, carpeta, githubJugadores].filter(Boolean);
  if (!fuentes.length) return { ok: false, reason: 'sin mundo.json' };

  const prev = getWorldSnapshot();
  const sqliteVacio = countUsers() === 0;
  const sinSnapshot = !prev;
  const sinJugadores = !prev?.jugadores?.length;
  const maxJugadores = (m) => (m?.jugadores || []).length;
  const githubTieneMas = maxJugadores(remoto) > maxJugadores(prev);
  const carpetaTieneMas = maxJugadores(carpeta) > maxJugadores(prev);
  const githubJugTieneMas = maxJugadores(githubJugadores) > maxJugadores(prev);
  const githubDifiere = !!(remoto && prev && _jugadoresDifieren(remoto, prev));
  const carpetaDifiere = !!(carpeta?.jugadores?.length && prev && _jugadoresDifieren(carpeta, prev));
  const githubJugDifiere = !!(githubJugadores?.jugadores?.length && prev &&
    _jugadoresDifieren(githubJugadores, prev));

  if (!sqliteVacio && !sinSnapshot && !sinJugadores && !githubTieneMas &&
      !carpetaTieneMas && !githubJugTieneMas && !githubDifiere &&
      !carpetaDifiere && !githubJugDifiere) {
    return { ok: true, skipped: true, jugadores: prev.jugadores.length };
  }

  let mundo = prev ? Object.assign({}, prev) : _mundoVacio();
  const base = remoto || local;
  if (sinSnapshot && base) {
    mundo = Object.assign(_mundoVacio(), base, { jugadores: [], partidas: {} });
  }

  mergeJugadoresPartidas(mundo, fuentes.concat([prev]));
  const idsAut = new Set((mundo.jugadores || []).map(j => j?.id).filter(Boolean));
  const partidasExtra = {};
  for (const fuente of fuentes.concat([prev])) {
    for (const [id, p] of Object.entries(fuente?.partidas || {})) {
      if (idsAut.has(id)) partidasExtra[id] = p;
    }
  }
  _fusionarPartidas(mundo, fuentes.concat([prev, { partidas: partidasExtra }]));

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

  if (Array.isArray(mundo.jugadores) && mundo.jugadores.length) {
    const { purgarCuentasFueraDeSnapshot } = require('./syncCuentas');
    purgarCuentasFueraDeSnapshot(mundo);
  }
  reconciliarCuentasEnSnapshot(mundo);
  asegurarAdminEnMundo(mundo);
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
  asegurarAdminEnMundo(mundo);
  saveWorldSnapshot(mundo);

  return {
    ok: true,
    jugadores: (mundo.jugadores || []).length,
    importado: sinSnapshot || sinJugadores
  };
}

function forzarImportJugadores() {
  const archivo = leerMundoJson();
  const carpeta = leerJugadoresDesdeCarpeta();
  if (!archivo && !carpeta.jugadores?.length) {
    return { ok: false, error: 'mundo.json y datos/jugadores vacíos' };
  }
  const prev = getWorldSnapshot() || { jugadores: [], partidas: {} };
  const mundo = Object.assign({}, prev);
  mergeJugadoresPartidas(mundo, [archivo, carpeta, prev].filter(Boolean));
  _fusionarPartidas(mundo, [archivo, carpeta, prev].filter(Boolean));
  asegurarAdminEnMundo(mundo);
  mundo.actualizadoEn = Date.now();
  saveWorldSnapshot(mundo);
  return { ok: true, jugadores: (mundo.jugadores || []).length };
}

/** Recupera partidas de jugadores activos (no re-añade cuentas borradas). */
async function recuperarJugadoresPerdidos(io) {
  const prev = getWorldSnapshot() || _mundoVacio();
  const carpeta = leerJugadoresDesdeCarpeta();
  const antes = (prev.jugadores || []).length;
  const mundo = Object.assign({}, prev);
  mergeJugadoresPartidas(mundo, [{ jugadores: carpeta.jugadores || [] }]);
  const partidasCarpeta = {};
  for (const [id, p] of Object.entries(carpeta.partidas || {})) {
    partidasCarpeta[id] = p;
  }
  _fusionarPartidas(mundo, [{ partidas: partidasCarpeta }]);
  const { asegurarJugadoresEnSnapshot, reconciliarMuertoCuerpo, revivirJugadorPorNombre } = require('./syncCuentas');
  asegurarJugadoresEnSnapshot(mundo);
  reconciliarMuertoCuerpo(mundo, io);
  revivirJugadorPorNombre(mundo, '33', io);
  const despues = (mundo.jugadores || []).length;
  if (despues !== antes || Object.keys(partidasCarpeta).length) {
    mundo.actualizadoEn = Date.now();
    saveWorldSnapshot(mundo);
  }
  return { ok: true, antes, despues, recuperados: Math.max(0, despues - antes) };
}

module.exports = {
  importarSnapshotSiFalta,
  restaurarMundoAlArranque,
  forzarImportJugadores,
  recuperarJugadoresPerdidos,
  leerMundoJson,
  leerJugadoresDesdeCarpeta
};
