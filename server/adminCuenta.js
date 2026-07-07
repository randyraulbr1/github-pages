/**
 * Cuenta administrador (randy / SoyCaos): nunca eliminable.
 * Perfil canónico en datos/jugadores/admin.json (separado del indice).
 */
const fs = require('fs');
const path = require('path');

const ADMIN_LOGIN_NAMES = new Set(
  ['randy', 'soycaos', String(process.env.ADMIN_NOMBRE || 'SoyCaos').toLowerCase()]
    .concat(String(process.env.ADMIN_ALIASES || 'randy').split(','))
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
);

const ADMIN_ID_FIJO = 'pmr7x4zhznzw5o';

function esNombreAdmin(nombre) {
  return ADMIN_LOGIN_NAMES.has(String(nombre || '').trim().toLowerCase());
}

function esCuentaAdmin(jugador) {
  if (!jugador) return false;
  if (String(jugador.id || '') === ADMIN_ID_FIJO) return true;
  return esNombreAdmin(jugador.nombre);
}

function rutaAdminJson() {
  return path.join(__dirname, '..', 'datos', 'jugadores', 'admin.json');
}

function leerAdminArchivoCompleto() {
  const ruta = rutaAdminJson();
  if (!fs.existsSync(ruta)) return null;
  try {
    return JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch (e) {
    return null;
  }
}

function leerAdminDesdeArchivo() {
  const data = leerAdminArchivoCompleto();
  if (!data?.id || !data?.nombre) return null;
  return {
    id: data.id,
    nombre: data.nombre,
    telefono: data.telefono || '',
    pinHash: data.pinHash || '',
    creado: data.creado || Date.now()
  };
}

/** Garantiza que el admin esté en mundo.jugadores (nunca se elimina al publicar). */
function asegurarAdminEnMundo(mundo) {
  if (!mundo || typeof mundo !== 'object') return mundo;
  const admin = leerAdminDesdeArchivo();
  if (!admin) return mundo;

  if (!Array.isArray(mundo.jugadores)) mundo.jugadores = [];

  let idx = mundo.jugadores.findIndex(j => esCuentaAdmin(j) || j?.id === admin.id);
  if (idx >= 0) {
    mundo.jugadores[idx] = Object.assign({}, admin, mundo.jugadores[idx], {
      id: admin.id,
      nombre: admin.nombre,
      pinHash: mundo.jugadores[idx].pinHash || admin.pinHash,
      telefono: mundo.jugadores[idx].telefono || admin.telefono
    });
  } else {
    mundo.jugadores.unshift(Object.assign({}, admin));
  }

  const archivo = leerAdminArchivoCompleto();
  if (archivo?.partida && admin.id) {
    if (!mundo.partidas) mundo.partidas = {};
    const prev = mundo.partidas[admin.id];
    const p = archivo.partida;
    if (!prev || !prev.t || (p.t || 0) >= (prev.t || 0)) mundo.partidas[admin.id] = p;
  }

  return mundo;
}

function filtrarJugadoresNoAdmin(lista) {
  return (lista || []).filter(j => j && !esCuentaAdmin(j));
}

module.exports = {
  ADMIN_LOGIN_NAMES,
  ADMIN_ID_FIJO,
  esCuentaAdmin,
  esNombreAdmin,
  leerAdminDesdeArchivo,
  leerAdminArchivoCompleto,
  asegurarAdminEnMundo,
  filtrarJugadoresNoAdmin,
  rutaAdminJson
};
