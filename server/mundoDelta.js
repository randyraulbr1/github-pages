/**
 * mundo:sync por delta — solo envía claves que cambiaron.
 */
const MUNDO_DELTA_KEYS = [
  'jugadores', 'partidas', 'objetos', 'enemigos', 'tesoros', 'misiones',
  'tiendasAdmin', 'posiciones', 'eliminados', 'precios', 'itemsNuevos',
  'mantenimiento', 'baneados', 'mensajes', 'combate', 'cofres',
  'correoReclamados', 'correoTienda', 'enemigosEstado', 'botinesEnemigo',
  'objetosEstado', 'tesorosEstado', 'tiendasStock', 'cuerposMuertos',
  'bolsasDrop', 'optimizarVisibilidad', 'eliminados_recuperables'
];

function calcularDeltaMundo(prev, next) {
  if (!next || typeof next !== 'object') {
    return { full: true, mundo: next };
  }
  if (!prev || typeof prev !== 'object') {
    return { full: true, mundo: next };
  }

  const parcial = {};
  const keys = [];
  for (const key of MUNDO_DELTA_KEYS) {
    const a = JSON.stringify(prev[key] ?? null);
    const b = JSON.stringify(next[key] ?? null);
    if (a !== b) {
      parcial[key] = next[key];
      keys.push(key);
    }
  }
  parcial.actualizadoEn = next.actualizadoEn;

  if (!keys.length) {
    return { full: true, mundo: next, sinCambios: true };
  }

  const fullSize = JSON.stringify(next).length;
  const deltaSize = JSON.stringify(parcial).length;
  if (deltaSize >= fullSize * 0.85) {
    return { full: true, mundo: next };
  }

  return { full: false, delta: true, deltaKeys: keys, mundo: parcial };
}

function emitirMundoSync(io, prev, mundo) {
  if (!io || !mundo) return { full: true };
  const plan = calcularDeltaMundo(prev, mundo);
  if (plan.sinCambios) return plan;

  const msg = {
    actualizadoEn: mundo.actualizadoEn,
    mundo: plan.mundo
  };
  if (!plan.full) {
    msg.delta = true;
    msg.deltaKeys = plan.deltaKeys;
  }
  io.emit('mundo:sync', msg);
  return plan;
}

module.exports = {
  MUNDO_DELTA_KEYS,
  calcularDeltaMundo,
  emitirMundoSync
};
