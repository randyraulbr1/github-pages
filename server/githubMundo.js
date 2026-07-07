/**
 * Respaldo permanente: sube datos/mundo.json a GitHub cuando el admin publica.
 * Requiere GITHUB_TOKEN en Render (repo con permiso contents:write).
 */
const { mergeJugadoresPartidas, fusionarMapaPublicacion } = require('./syncMundo');
const { putArchivoGitHubSiCambio, putConReintentos } = require('./utils/githubPush');
const { registrarSyncOk, registrarSyncError } = require('./syncStatus');

const { repoConfig } = require('./utils/repoConfig');

/** Lee mundo.json desde GitHub (público, sin token). */
async function fetchMundoFromGitHub() {
  const { repo, branch } = repoConfig();
  const rawUrl = `https://raw.githubusercontent.com/${repo}/${branch}/datos/mundo.json?t=${Date.now()}`;
  try {
    const r = await fetch(rawUrl, { headers: { 'Cache-Control': 'no-cache' } });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

async function prepararPayloadMundo(mundo) {
  const { repo, branch, path: filePath } = repoConfig();
  const { leerArchivoGitHub } = require('./utils/githubPush');
  const remotoFile = await leerArchivoGitHub(filePath, branch);
  const remoto = remotoFile?.contenido || null;

  const payload = Object.assign({}, mundo);
  if (Array.isArray(mundo.jugadores)) {
    if (mundo.jugadores.length === 0 && (remoto?.jugadores || []).length > 0) {
      mergeJugadoresPartidas(payload, [remoto, mundo]);
    } else if (mundo.purgarJugadores) {
      mergeJugadoresPartidas(payload, [{ partidas: (remoto || {}).partidas || {} }, mundo]);
    } else {
      mergeJugadoresPartidas(payload, [remoto, { partidas: (remoto || {}).partidas || {} }, mundo]);
    }
  } else {
    mergeJugadoresPartidas(payload, [remoto, mundo]);
  }
  delete payload.purgarJugadores;
  fusionarMapaPublicacion(payload, remoto);
  const { asegurarAdminEnMundo } = require('./adminCuenta');
  asegurarAdminEnMundo(payload);
  return payload;
}

async function pushMundoToGitHub(mundo, opts) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    registrarSyncError('GITHUB_TOKEN no configurado', 'mundo');
    return { ok: false, skipped: true, reason: 'GITHUB_TOKEN no configurado' };
  }

  const { path: filePath } = repoConfig();
  const payload = await prepararPayloadMundo(mundo);
  const mensaje = opts?.mensaje || `sync mundo ${new Date().toISOString()}`;
  const intentos = opts?.intentos || 3;

  const r = await putConReintentos(filePath, payload, mensaje, intentos);
  if (r.ok) {
    if (!r.skipped) registrarSyncOk('mundo');
    return r;
  }
  registrarSyncError(r.error || r.reason, 'mundo');
  return r;
}

/** Fuerza volcado SQLite → GitHub (admin). */
async function forcePushMundoActual() {
  const { getWorldSnapshot } = require('./db');
  const snap = getWorldSnapshot();
  if (!snap) return { ok: false, error: 'Sin snapshot en SQLite' };
  return pushMundoToGitHub(snap, { mensaje: 'force-git-sync admin', intentos: 3 });
}

module.exports = {
  pushMundoToGitHub,
  fetchMundoFromGitHub,
  repoConfig,
  forcePushMundoActual,
  prepararPayloadMundo
};
