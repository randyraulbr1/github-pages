/**
 * Recuperación lazy de cuentas huérfanas desde backup o partidas{}.
 */
const fs = require('fs');
const path = require('path');
const { getWorldSnapshot, saveWorldSnapshot } = require('./db');
const { mergeJugadoresPartidas } = require('./syncMundo');
const { esCuentaAdmin } = require('./adminCuenta');
const { registrar } = require('./eventLog');

const DIR_JUGADORES = path.join(__dirname, '..', 'datos', 'jugadores');

function _normalizarUsuario(usuario) {
  const u = String(usuario || '').trim();
  return {
    lower: u.toLowerCase(),
    limpio: u.replace(/[\s-]/g, '')
  };
}

function _coincideJugador(j, usuario) {
  if (!j) return false;
  const { lower, limpio } = _normalizarUsuario(usuario);
  if (j.nombre && String(j.nombre).toLowerCase() === lower) return true;
  if (j.telefono && String(j.telefono).replace(/[\s-]/g, '') === limpio) return true;
  if (j.id && String(j.id) === usuario) return true;
  return false;
}

function leerBackupJugador(id) {
  const p = path.join(DIR_JUGADORES, id + '.json');
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return null;
  }
}

function listarBackupsJugadores() {
  if (!fs.existsSync(DIR_JUGADORES)) return [];
  const out = [];
  for (const f of fs.readdirSync(DIR_JUGADORES)) {
    if (!f.endsWith('.json') || f === 'indice.json' || f === 'admin.json') continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(DIR_JUGADORES, f), 'utf8'));
      if (data?.id && data?.nombre) out.push(data);
    } catch (e) { /* */ }
  }
  return out;
}

function buscarEnEliminadosRecuperables(snap, usuario) {
  const lista = snap?.eliminados_recuperables || [];
  return lista.find(e =>
    e?.tipo === 'jugador' && (
      _coincideJugador(e.datos || e, usuario) ||
      (e.id && e.id === usuario)
    )
  ) || null;
}

function buscarHuérfano(usuario) {
  const snap = getWorldSnapshot() || {};
  const enLista = (snap.jugadores || []).find(j => _coincideJugador(j, usuario));
  if (enLista) return { tipo: 'activa', jugador: enLista };

  const eliminado = buscarEnEliminadosRecuperables(snap, usuario);
  if (eliminado) return { tipo: 'eliminada', registro: eliminado };

  for (const b of listarBackupsJugadores()) {
    if (_coincideJugador(b, usuario)) {
      return { tipo: 'backup', jugador: b, partida: b.partida || null };
    }
  }

  const partidas = snap.partidas || {};
  for (const [id, p] of Object.entries(partidas)) {
    const b = leerBackupJugador(id);
    if (b && _coincideJugador(b, usuario)) {
      return { tipo: 'partida', jugador: b, partida: p };
    }
  }

  for (const [id, p] of Object.entries(partidas)) {
    const b = leerBackupJugador(id);
    if (b) continue;
    if (id === usuario) {
      return { tipo: 'partida_sin_backup', id, partida: p };
    }
  }

  return null;
}

function perfilDesdeBackup(data) {
  return {
    id: data.id,
    nombre: data.nombre,
    telefono: data.telefono || '',
    pinHash: data.pinHash || '',
    creado: data.creado || Date.now()
  };
}

function restaurarJugadorSiExiste(idOrUsuario) {
  const snap = getWorldSnapshot() || { jugadores: [], partidas: {} };
  const hit = buscarHuérfano(idOrUsuario);
  if (!hit) return { ok: false, reason: 'no_encontrado' };
  if (hit.tipo === 'activa') return { ok: true, jugador: hit.jugador, recovered: false };
  if (hit.tipo === 'eliminada') return { ok: false, reason: 'eliminada', registro: hit.registro };

  let jugador = null;
  let partida = null;

  if (hit.tipo === 'backup' || hit.tipo === 'partida') {
    jugador = perfilDesdeBackup(hit.jugador);
    partida = hit.partida || hit.jugador.partida || snap.partidas?.[jugador.id] || null;
  } else if (hit.tipo === 'partida_sin_backup') {
    const b = listarBackupsJugadores().find(x => x.id === hit.id);
    if (!b) return { ok: false, reason: 'no_encontrado' };
    jugador = perfilDesdeBackup(b);
    partida = hit.partida;
  }

  if (!jugador?.id || esCuentaAdmin(jugador)) {
    return { ok: false, reason: 'no_encontrado' };
  }

  if (!Array.isArray(snap.jugadores)) snap.jugadores = [];
  const ya = snap.jugadores.some(j => j.id === jugador.id);
  if (!ya) {
    mergeJugadoresPartidas(snap, [{ jugadores: [jugador] }]);
  }
  if (partida) {
    if (!snap.partidas) snap.partidas = {};
    const prev = snap.partidas[jugador.id];
    if (!prev || !prev.t || (partida.t || 0) >= (prev.t || 0)) {
      snap.partidas[jugador.id] = partida;
    }
  }
  snap.actualizadoEn = Date.now();
  saveWorldSnapshot(snap);
  registrar('recovery', `Cuenta ${jugador.nombre} (${jugador.id}) reinsertada desde backup`);
  console.log('[RECOVERY] cuenta', jugador.id, 'reinsertada desde backup');
  return { ok: true, jugador, recovered: true };
}

function intentarRecuperarPorLogin(usuario) {
  const estado = buscarHuérfano(usuario);
  if (!estado) return { accion: 'no_registrado' };
  if (estado.tipo === 'activa') return { accion: 'ok', jugador: estado.jugador };
  if (estado.tipo === 'eliminada') return { accion: 'eliminada' };
  const res = restaurarJugadorSiExiste(usuario);
  if (res.ok) return { accion: 'recuperada', jugador: res.jugador };
  return { accion: 'no_registrado' };
}

module.exports = {
  leerBackupJugador,
  listarBackupsJugadores,
  buscarHuérfano,
  restaurarJugadorSiExiste,
  intentarRecuperarPorLogin,
  buscarEnEliminadosRecuperables
};
