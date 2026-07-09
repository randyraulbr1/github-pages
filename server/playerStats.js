/**
 * Validación autoritativa de stats en servidor (Fase 2.3).
 * Fórmulas alineadas con js/vida/vida.js y js/config/config.js.
 */
const VIDA_BASE = 100;
const VIDA_EXTRA_POR_NIVEL = 4;
const NIVEL_MAX = 100;
const HAMBRE_MAX = 100;
const XP_MAX = 999999999;

const STATS_PARTIDA_KEYS = ['vida', 'hambre', 'xp', 'nivel', 'muerto', 'oro'];

function vidaMaximaPorNivel(level) {
  const n = Math.max(1, Math.min(NIVEL_MAX, Math.round(level || 1)));
  return VIDA_BASE + Math.floor((n - 1) * VIDA_EXTRA_POR_NIVEL);
}

function clampEntero(val, min, max) {
  const n = Math.round(Number(val));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/** Valida y acota hp/hunger/xp/level desde socket player:updateStats. */
function validarStatsJugador(payload) {
  const level = clampEntero(payload?.level ?? 1, 1, NIVEL_MAX);
  const hpMax = vidaMaximaPorNivel(level);
  const fields = { level };

  if (payload?.hp !== undefined) {
    fields.hp = clampEntero(payload.hp, 0, hpMax);
  }
  if (payload?.hunger !== undefined) {
    fields.hunger = clampEntero(payload.hunger, 0, HAMBRE_MAX);
  }
  if (payload?.xp !== undefined) {
    fields.xp = clampEntero(payload.xp, 0, XP_MAX);
  }

  return { fields, hpMax };
}

/** Acota campos de partidaMin (datos PWA) antes de guardar en snapshot. */
function validarPartidaMin(datos) {
  if (!datos || typeof datos !== 'object') return datos;
  const out = Object.assign({}, datos);
  const nivel = clampEntero(out.nivel ?? 1, 1, NIVEL_MAX);
  const maxVida = vidaMaximaPorNivel(nivel);
  out.nivel = nivel;
  if (out.vida != null) out.vida = clampEntero(out.vida, 0, maxVida);
  if (out.hambre != null) out.hambre = clampEntero(out.hambre, 0, HAMBRE_MAX);
  if (out.xp != null) out.xp = clampEntero(out.xp, 0, XP_MAX);
  if (out.oro != null) out.oro = clampEntero(out.oro, 0, XP_MAX);
  if (out.muerto != null) out.muerto = !!out.muerto;
  if (out.dinero != null && typeof out.dinero === 'object') {
    const saldo = clampEntero(out.dinero.saldo ?? 0, 0, XP_MAX);
    out.dinero = Object.assign({}, out.dinero, { saldo });
  }
  return out;
}

function normStatValor(key, val) {
  if (val == null) return val;
  if (key === 'muerto') return !!val;
  if (typeof val === 'number') return Math.round(val);
  return val;
}

function extraerStatsPartida(partidaSnap) {
  const d = partidaSnap?.datos || partidaSnap || {};
  const stats = {};
  for (const k of STATS_PARTIDA_KEYS) {
    if (d[k] !== undefined) stats[k] = normStatValor(k, d[k]);
  }
  return stats;
}

function statsPartidaIguales(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) {
    if (normStatValor(k, a?.[k]) !== normStatValor(k, b?.[k])) return false;
  }
  return true;
}

module.exports = {
  vidaMaximaPorNivel,
  validarStatsJugador,
  validarPartidaMin,
  extraerStatsPartida,
  statsPartidaIguales,
  STATS_PARTIDA_KEYS,
  NIVEL_MAX,
  HAMBRE_MAX
};
