/**
 * Respaldo permanente: sube datos/mundo.json a GitHub cuando el admin publica.
 * Requiere GITHUB_TOKEN en Render (repo con permiso contents:write).
 */
const { mergeJugadoresPartidas } = require('./syncMundo');

function repoConfig() {
  return {
    repo: process.env.GITHUB_REPO || 'randyraulbr1/github-pages',
    branch: process.env.GITHUB_BRANCH || 'claude/web-rpg-gps-game-n3ybow',
    path: 'datos/mundo.json'
  };
}

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

async function pushMundoToGitHub(mundo) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { ok: false, skipped: true, reason: 'GITHUB_TOKEN no configurado' };

  const { repo, branch, path: filePath } = repoConfig();
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };

  let sha;
  let remoto = null;
  try {
    const getRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, { headers });
    if (getRes.ok) {
      const file = await getRes.json();
      sha = file.sha;
      try {
        remoto = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
      } catch (e) { remoto = null; }
    } else if (getRes.status !== 404) {
      const err = await getRes.text();
      return { ok: false, error: `GET ${getRes.status}: ${err.slice(0, 120)}` };
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }

  const payload = mergeJugadoresPartidas(Object.assign({}, mundo), [remoto, mundo]);

  const body = {
    message: `sync mundo admin ${new Date().toISOString()}`,
    content: Buffer.from(JSON.stringify(payload, null, 2), 'utf8').toString('base64'),
    branch
  };
  if (sha) body.sha = sha;

  try {
    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
      body: JSON.stringify(body)
    });
    if (putRes.ok) return { ok: true };
    const err = await putRes.text();
    return { ok: false, error: `PUT ${putRes.status}: ${err.slice(0, 200)}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { pushMundoToGitHub, fetchMundoFromGitHub };
