/**
 * Lee backups de jugadores desde GitHub (datos/jugadores/).
 * Complementa mundo.json cuando está desactualizado.
 */
const { repoConfig } = require('./utils/repoConfig');

async function _fetchRawJson(ruta) {
  const { repo, branch } = repoConfig();
  const url = `https://raw.githubusercontent.com/${repo}/${branch}/${ruta}?t=${Date.now()}`;
  try {
    const r = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

/** Descarga indice.json + cada {id}.json referenciado. */
async function fetchJugadoresDesdeGitHub() {
  const indice = await _fetchRawJson('datos/jugadores/indice.json');
  if (!Array.isArray(indice) || !indice.length) {
    return { jugadores: [], partidas: {} };
  }

  const jugadores = [];
  const partidas = {};
  const ids = new Set();

  for (const entry of indice) {
    if (!entry?.id) continue;
    ids.add(entry.id);
    jugadores.push(Object.assign({}, entry));
  }

  const admin = await _fetchRawJson('datos/jugadores/admin.json');
  if (admin?.id) {
    const idx = jugadores.findIndex(j => j.id === admin.id);
    const perfil = {
      id: admin.id,
      nombre: admin.nombre,
      telefono: admin.telefono || '',
      pinHash: admin.pinHash || '',
      creado: admin.creado || Date.now()
    };
    if (idx >= 0) jugadores[idx] = Object.assign({}, jugadores[idx], perfil);
    else jugadores.unshift(perfil);
    if (admin.partida) partidas[admin.id] = admin.partida;
  }

  await Promise.all([...ids].map(async (id) => {
    const data = await _fetchRawJson(`datos/jugadores/${id}.json`);
    if (!data?.id) return;
    const idx = jugadores.findIndex(j => j.id === data.id);
    const perfil = {
      id: data.id,
      nombre: data.nombre,
      telefono: data.telefono || '',
      pinHash: data.pinHash || '',
      creado: data.creado || Date.now()
    };
    if (idx >= 0) jugadores[idx] = Object.assign({}, jugadores[idx], perfil);
    else jugadores.push(perfil);
    if (data.partida) partidas[data.id] = data.partida;
  }));

  return { jugadores, partidas };
}

module.exports = {
  fetchJugadoresDesdeGitHub
};
