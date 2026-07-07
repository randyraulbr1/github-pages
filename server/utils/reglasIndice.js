/**
 * Regla canónica del índice de jugadores.
 * El admin NUNCA va en indice.json (vive en admin.json).
 */
const { esCuentaAdmin } = require('../adminCuenta');

function indiceDesdeJugadores(jugadores) {
  return (jugadores || [])
    .filter(j => j?.id && j?.nombre && !esCuentaAdmin(j))
    .map(j => ({
      id: j.id,
      nombre: j.nombre,
      telefono: j.telefono || '',
      pinHash: j.pinHash || '',
      creado: j.creado || Date.now()
    }))
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
}

module.exports = { indiceDesdeJugadores };
