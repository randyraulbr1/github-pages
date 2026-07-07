/**
 * Estado de sincronización GitHub y errores recientes.
 */
const fs = require('fs');
const path = require('path');
const { hashContenido } = require('./utils/githubPush');
const { getWorldSnapshot } = require('./db');

const LOG_PATH = path.join(__dirname, 'data', 'sync_errors.log');
const MAX_ERRORES = 20;

let ultimaSyncOk = null;
let ultimoError = null;
let tokenValido = null;
let tokenVerificadoEn = null;

function _escribirLog(linea) {
  try {
    const dir = path.dirname(LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(LOG_PATH, linea + '\n', 'utf8');
  } catch (e) { /* */ }
}

function registrarSyncOk(tipo) {
  ultimaSyncOk = { tipo: tipo || 'mundo', at: Date.now() };
  ultimoError = null;
}

function registrarSyncError(error, tipo) {
  const msg = `[${new Date().toISOString()}] ${tipo || 'sync'}: ${String(error || 'error').slice(0, 300)}`;
  ultimoError = { tipo: tipo || 'sync', error: String(error), at: Date.now() };
  _escribirLog(msg);
}

function leerErroresRecientes() {
  try {
    if (!fs.existsSync(LOG_PATH)) return [];
    const lineas = fs.readFileSync(LOG_PATH, 'utf8').trim().split('\n').filter(Boolean);
    return lineas.slice(-MAX_ERRORES);
  } catch (e) {
    return [];
  }
}

async function validarGithubToken() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    tokenValido = false;
    tokenVerificadoEn = Date.now();
    return { ok: false, reason: 'GITHUB_TOKEN no configurado' };
  }
  try {
    const r = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    tokenValido = r.ok;
    tokenVerificadoEn = Date.now();
    if (!r.ok) {
      const t = await r.text();
      registrarSyncError(`Token inválido: ${r.status} ${t.slice(0, 80)}`, 'token');
      return { ok: false, reason: `Token inválido (${r.status})` };
    }
    return { ok: true };
  } catch (e) {
    tokenValido = false;
    tokenVerificadoEn = Date.now();
    return { ok: false, reason: e.message };
  }
}

function getSyncStatus() {
  const snap = getWorldSnapshot();
  const hash = snap ? hashContenido(snap) : null;
  return {
    ultimaSyncOk,
    ultimoError,
    tokenValido,
    tokenVerificadoEn,
    erroresRecientes: leerErroresRecientes(),
    mundoHash: hash,
    jugadores: (snap?.jugadores || []).length,
    objetos: (snap?.objetos || []).length,
    enemigos: (snap?.enemigos || []).length,
    actualizadoEn: snap?.actualizadoEn || 0
  };
}

module.exports = {
  registrarSyncOk,
  registrarSyncError,
  validarGithubToken,
  getSyncStatus,
  leerErroresRecientes
};
