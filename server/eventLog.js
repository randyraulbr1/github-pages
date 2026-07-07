/**
 * Registro en memoria de las últimas acciones importantes (panel admin).
 */
const MAX = 100;
const log = [];

function registrar(tipo, detalle, meta) {
  log.unshift({
    t: Date.now(),
    tipo,
    detalle: String(detalle || '').slice(0, 500),
    meta: meta || null
  });
  if (log.length > MAX) log.length = MAX;
  console.log(`[evento:${tipo}]`, detalle);
}

function getEventos(limite) {
  return log.slice(0, limite || MAX);
}

module.exports = { registrar, getEventos };
