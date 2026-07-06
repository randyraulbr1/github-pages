/**
 * Respaldo por jugador en datos/jugadores/{id}.json (GitHub).
 * Complementa mundo.json para no perder cuentas ni partidas.
 */
const { repoConfig } = require('./githubMundo');

function headersGitHub() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  };
}

function perfilDesdeJugador(j, partida) {
  const entry = {
    id: j.id,
    nombre: j.nombre || '',
    telefono: j.telefono || '',
    pinHash: j.pinHash || '',
    creado: j.creado || Date.now(),
    actualizadoEn: Date.now()
  };
  if (partida) entry.partida = partida;
  return entry;
}

async function putArchivoGitHub(filePath, contenido, mensaje) {
  const hdrs = headersGitHub();
  if (!hdrs) return { ok: false, skipped: true, reason: 'sin token' };

  const { repo, branch } = repoConfig();
  const apiUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;

  let sha;
  try {
    const getRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, { headers: hdrs });
    if (getRes.ok) sha = (await getRes.json()).sha;
    else if (getRes.status !== 404) {
      return { ok: false, error: `GET ${getRes.status}` };
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }

  const body = {
    message: mensaje || `sync jugador ${filePath}`,
    content: Buffer.from(JSON.stringify(contenido, null, 2), 'utf8').toString('base64'),
    branch
  };
  if (sha) body.sha = sha;

  try {
    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: hdrs,
      body: JSON.stringify(body)
    });
    if (putRes.ok) return { ok: true };
    const err = await putRes.text();
    return { ok: false, error: `PUT ${putRes.status}: ${err.slice(0, 120)}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Sube indice.json + archivos de cada jugador (async, no bloquea). */
async function respaldarJugadoresEnGitHub(mundo) {
  if (!mundo?.jugadores?.length) return { ok: true, count: 0 };

  const indice = mundo.jugadores
    .filter(j => j?.id && j?.nombre)
    .map(j => ({
      id: j.id,
      nombre: j.nombre,
      telefono: j.telefono || '',
      pinHash: j.pinHash || '',
      creado: j.creado || Date.now()
    }))
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));

  const partidas = mundo.partidas || {};
  let ok = 0;
  let fail = 0;

  const indRes = await putArchivoGitHub(
    'datos/jugadores/indice.json',
    indice,
    `sync indice ${indice.length} jugadores`
  );
  if (indRes.ok) ok++; else fail++;

  for (const j of indice) {
    const partida = partidas[j.id] || null;
    const archivo = perfilDesdeJugador(j, partida);
    const res = await putArchivoGitHub(
      `datos/jugadores/${j.id}.json`,
      archivo,
      `sync jugador ${j.nombre}`
    );
    if (res.ok) ok++; else fail++;
  }

  return { ok: fail === 0, count: ok, fail };
}

function respaldarJugadoresEnGitHubAsync(mundo) {
  respaldarJugadoresEnGitHub(mundo).then((r) => {
    if (r.ok && r.count) console.log('[jugadores] Respaldo GitHub:', r.count, 'archivo(s)');
    else if (r.fail) console.warn('[jugadores] Respaldo parcial:', r);
  }).catch((e) => console.warn('[jugadores] Respaldo:', e.message));
}

module.exports = {
  respaldarJugadoresEnGitHub,
  respaldarJugadoresEnGitHubAsync,
  perfilDesdeJugador
};
