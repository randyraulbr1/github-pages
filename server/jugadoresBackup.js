/**
 * Respaldo por jugador en datos/jugadores/{id}.json (GitHub).
 * Complementa mundo.json para no perder cuentas ni partidas.
 */
const { repoConfig } = require('./utils/repoConfig');
const { esCuentaAdmin, leerAdminArchivoCompleto } = require('./adminCuenta');
const { indiceDesdeJugadores } = require('./utils/reglasIndice');
const { putArchivoGitHubSiCambio } = require('./utils/githubPush');

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

/** Sube indice.json (sin admin) + admin.json + archivos de cada jugador (async, no bloquea). */
async function respaldarJugadoresEnGitHub(mundo) {
  if (!mundo?.jugadores?.length) return { ok: true, count: 0 };

  const todos = mundo.jugadores.filter(j => j?.id && j?.nombre);
  const adminJugador = todos.find(esCuentaAdmin);
  const indice = indiceDesdeJugadores(todos);
  const partidas = mundo.partidas || {};
  let ok = 0;
  let fail = 0;
  let skipped = 0;

  const indRes = await putArchivoGitHubSiCambio(
    'datos/jugadores/indice.json',
    indice,
    `sync indice ${indice.length} jugadores`
  );
  if (indRes.ok) { indRes.skipped ? skipped++ : ok++; } else fail++;

  if (adminJugador) {
    const adminArchivo = leerAdminArchivoCompleto() || perfilDesdeJugador(
      adminJugador,
      partidas[adminJugador.id] || null
    );
    const partidaSnap = partidas[adminJugador.id];
    if (partidaSnap) adminArchivo.partida = partidaSnap;
    adminArchivo.actualizadoEn = Date.now();
    const adminRes = await putArchivoGitHubSiCambio(
      'datos/jugadores/admin.json',
      adminArchivo,
      `sync admin ${adminJugador.nombre}`
    );
    if (adminRes.ok) { adminRes.skipped ? skipped++ : ok++; } else fail++;
  }

  for (const j of indice) {
    const partida = partidas[j.id] || null;
    const archivo = perfilDesdeJugador(j, partida);
    const res = await putArchivoGitHubSiCambio(
      `datos/jugadores/${j.id}.json`,
      archivo,
      `sync jugador ${j.nombre}`
    );
    if (res.ok) { res.skipped ? skipped++ : ok++; } else fail++;
  }

  return { ok: fail === 0, count: ok, fail, skipped };
}

function respaldarJugadoresEnGitHubAsync(mundo) {
  respaldarJugadoresEnGitHub(mundo).then((r) => {
    if (r.ok && r.count > 0) console.log('[jugadores] Respaldo GitHub:', r.count, 'archivo(s)');
    else if (r.skipped) { /* sin cambios — no log */ }
    else if (r.fail) console.warn('[jugadores] Respaldo parcial:', r);
  }).catch((e) => console.warn('[jugadores] Respaldo:', e.message));
}

module.exports = {
  respaldarJugadoresEnGitHub,
  respaldarJugadoresEnGitHubAsync,
  perfilDesdeJugador
};
