/**
 * Emisión de world:updateObject con alcance por posición (enemigos).
 */
const { emitirACercanosPorCoordenadas } = require('./interest');

let _onlinePlayers = () => new Map();

function setOnlinePlayersGetter(fn) {
  _onlinePlayers = typeof fn === 'function' ? fn : () => new Map();
}

/** Devuelve el Map de jugadores conectados (para el panel de administración). */
function getOnlinePlayers() {
  try {
    return _onlinePlayers() || new Map();
  } catch (e) {
    return new Map();
  }
}

function emitirWorldUpdateObject(io, obj) {
  if (!io || !obj) return;
  const onlinePlayers = _onlinePlayers();
  if (obj.type === 'enemy' && Number.isFinite(obj.x) && Number.isFinite(obj.y) && onlinePlayers.size) {
    emitirACercanosPorCoordenadas(
      io,
      onlinePlayers,
      obj.x,
      obj.y,
      'world:updateObject',
      obj
    );
    return;
  }
  io.emit('world:updateObject', obj);
}

module.exports = {
  setOnlinePlayersGetter,
  getOnlinePlayers,
  emitirWorldUpdateObject
};
