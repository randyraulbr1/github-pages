/**
 * Push a GitHub con filtro anti-flood por hash SHA256 del contenido.
 */
const crypto = require('crypto');
const { repoConfig } = require('./repoConfig');

function hashContenido(contenido) {
  const txt = typeof contenido === 'string'
    ? contenido
    : JSON.stringify(contenido, null, 2);
  return crypto.createHash('sha256').update(txt).digest('hex');
}

function headersGitHub(token) {
  const t = token || process.env.GITHUB_TOKEN;
  if (!t) return null;
  return {
    Authorization: `Bearer ${t}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  };
}

async function leerArchivoGitHub(filePath, branchOpt) {
  const hdrs = headersGitHub();
  if (!hdrs) return null;
  const { repo, branch } = repoConfig();
  const ref = branchOpt || branch;
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;
  try {
    const r = await fetch(`${apiUrl}?ref=${encodeURIComponent(ref)}`, { headers: hdrs });
    if (!r.ok) return null;
    const file = await r.json();
    let contenido = null;
    try {
      contenido = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
    } catch (e) {
      contenido = Buffer.from(file.content, 'base64').toString('utf8');
    }
    return { sha: file.sha, contenido, hash: hashContenido(contenido) };
  } catch (e) {
    return null;
  }
}

/**
 * Sube un archivo JSON a GitHub solo si el contenido cambió.
 */
async function putArchivoGitHubSiCambio(filePath, contenido, mensaje) {
  const hdrs = headersGitHub();
  if (!hdrs) return { ok: false, skipped: true, reason: 'sin token' };

  const nuevoHash = hashContenido(contenido);
  const remoto = await leerArchivoGitHub(filePath);
  if (remoto && remoto.hash === nuevoHash) {
    return { ok: true, skipped: true, reason: 'sin cambios', hash: nuevoHash };
  }

  const { repo, branch } = repoConfig();
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;
  const body = {
    message: mensaje || `sync ${filePath}`,
    content: Buffer.from(JSON.stringify(contenido, null, 2), 'utf8').toString('base64'),
    branch
  };
  if (remoto?.sha) body.sha = remoto.sha;

  try {
    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: hdrs,
      body: JSON.stringify(body)
    });
    if (putRes.ok) return { ok: true, hash: nuevoHash, changed: true };
    const err = await putRes.text();
    return { ok: false, error: `PUT ${putRes.status}: ${err.slice(0, 160)}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function putConReintentos(filePath, contenido, mensaje, intentos = 3) {
  const delays = [0, 1000, 3000, 9000];
  let ultimo = null;
  for (let i = 0; i < intentos; i++) {
    if (delays[i]) await sleep(delays[i]);
    ultimo = await putArchivoGitHubSiCambio(filePath, contenido, mensaje);
    if (ultimo.ok) return ultimo;
    if (ultimo.skipped) return ultimo;
  }
  return ultimo;
}

module.exports = {
  hashContenido,
  leerArchivoGitHub,
  putArchivoGitHubSiCambio,
  putConReintentos
};
