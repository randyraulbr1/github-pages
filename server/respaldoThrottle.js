/**
 * Respaldo a GitHub con freno: como mucho cada 10 minutos.
 * Eventos críticos usan respaldoInmediato().
 */
let pendiente = false;
let ejecutando = false;
const MIN_MS = 10 * 60 * 1000;

function pedirRespaldo() {
  pendiente = true;
}

async function _ejecutar() {
  if (!pendiente || ejecutando) return;
  pendiente = false;
  ejecutando = true;
  try {
    const { getWorldSnapshot } = require('./db');
    const snap = getWorldSnapshot();
    if (!snap) return;
    const { pushMundoToGitHub } = require('./githubMundo');
    const { respaldarJugadoresEnGitHub } = require('./jugadoresBackup');
    await pushMundoToGitHub(snap).catch(() => {});
    await respaldarJugadoresEnGitHub(snap).catch(() => {});
  } catch (e) {
    console.warn('[respaldoThrottle]', e.message);
  } finally {
    ejecutando = false;
  }
}

function iniciarRespaldoThrottle() {
  setInterval(_ejecutar, MIN_MS);
}

async function respaldoInmediato() {
  pendiente = true;
  await _ejecutar();
}

module.exports = { pedirRespaldo, iniciarRespaldoThrottle, respaldoInmediato };
