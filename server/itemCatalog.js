/**
 * Catálogo de ítems para validación en servidor (Fase 3b + Fase 13).
 * Base fija + objetos personalizados del mundo (itemsNuevos).
 */
const CONSUMIBLES_BASE = {
  agua: { cura: 12 },
  refresco: { cura: 18 },
  cafe: { cura: 14 },
  pan: { cura: 16 },
  pizza: { cura: 32 },
  pollo_asado: { cura: 42 },
  arroz_congri: { cura: 28 },
  platano_frito: { cura: 20 },
  mango: { cura: 16 },
  coco: { cura: 18 },
  botiquin: { curaVida: 55 },
  pocion_vida: { curaVida: 100 },
  carne_cruda: { crudo: true, probCrudoNegativo: 55, efectoValor: 12 },
  carne_cocinada: { efecto: 'hambre', efectoValor: 25, efectoModo: 'porcentaje', cocinadoDe: 'carne_cruda' },
  pescado_cocinado: { efecto: 'hambre', efectoValor: 20, efectoModo: 'porcentaje', cocinadoDe: 'sardina' }
};

const ARMAS_BASE = {
  arma_nv1:  { dano: 5,  danoMin: 3,  danoMax: 7,  nivelMin: 1,  nivelMax: 10 },
  arma_nv2:  { dano: 10, danoMin: 8,  danoMax: 12, nivelMin: 11, nivelMax: 20 },
  arma_nv3:  { dano: 15, danoMin: 12, danoMax: 18, nivelMin: 21, nivelMax: 30 },
  arma_nv4:  { dano: 20, danoMin: 17, danoMax: 23, nivelMin: 31, nivelMax: 40 },
  arma_nv5:  { dano: 25, danoMin: 22, danoMax: 28, nivelMin: 41, nivelMax: 50 },
  arma_nv6:  { dano: 32, danoMin: 28, danoMax: 36, nivelMin: 51, nivelMax: 60 },
  arma_nv7:  { dano: 38, danoMin: 34, danoMax: 42, nivelMin: 61, nivelMax: 70 },
  arma_nv8:  { dano: 45, danoMin: 40, danoMax: 50, nivelMin: 71, nivelMax: 80 },
  arma_nv9:  { dano: 52, danoMin: 47, danoMax: 57, nivelMin: 81, nivelMax: 90 },
  arma_nv10: { dano: 60, danoMin: 54, danoMax: 66, nivelMin: 91, nivelMax: 100 }
};

const PECES_BASE = new Set([
  'sardina', 'mojarra', 'lisa', 'jurel', 'pargo', 'robalo', 'dorado', 'atun',
  'tiburon_perro', 'anguila', 'langosta', 'cangrejo', 'camaron', 'pulpo', 'pez_globo'
]);

const PRECIOS_BASE = {
  agua: 18, pan: 25, botiquin: 300, pocion_vida: 320, arroz_congri: 48,
  cafe: 22, coco: 35, mango: 28, pizza: 65, pollo_asado: 85,
  carne_cruda: 12, carne_cocinada: 28, pescado_cocinado: 22
};

const TIPOS_VALIDOS = new Set([
  'comida', 'arma', 'pez', 'herramienta', 'tesoro', 'material', 'especial',
  'casco', 'chaleco', 'botas', 'ropa'
]);

const RANURAS_EQUIPO = ['casco', 'chaleco', 'botas', 'ropa'];

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function defEfecto(item) {
  if (!item || typeof item !== 'object') return null;
  if (item.efecto && item.efectoValor != null && item.efectoValor > 0) {
    return {
      efecto: item.efecto,
      valor: Number(item.efectoValor),
      modo: item.efectoModo === 'porcentaje' ? 'porcentaje' : 'fijo'
    };
  }
  if (item.curaVida != null && item.curaVida > 0) {
    if (item.curaVida >= 100) return { efecto: 'vida', valor: 100, modo: 'porcentaje' };
    return { efecto: 'vida', valor: item.curaVida, modo: 'fijo' };
  }
  if (item.cura != null && item.cura > 0) {
    return { efecto: 'hambre', valor: item.cura, modo: 'fijo' };
  }
  if (item.crudo === true && item.tipo === 'comida') {
    return { efecto: 'crudo', valor: item.efectoValor || 12, modo: 'porcentaje' };
  }
  if (item.tipo === 'pez' && item.crudo !== false) {
    return { efecto: 'crudo', valor: item.efectoValor || 10, modo: 'porcentaje' };
  }
  return null;
}

function itemFromSnapshot(itemId, snapshot) {
  const custom = (snapshot?.itemsNuevos || []).find((i) => i && i.id === itemId);
  if (custom && (custom.estado || 'activo') !== 'oculto' && custom.estado !== 'eliminado') {
    return custom;
  }
  const consumible = CONSUMIBLES_BASE[itemId];
  if (consumible) return Object.assign({ id: itemId, tipo: 'comida' }, consumible);
  const arma = ARMAS_BASE[itemId];
  if (arma) return Object.assign({ id: itemId, tipo: 'arma' }, arma);
  if (PECES_BASE.has(itemId)) return { id: itemId, tipo: 'pez' };
  return null;
}

function armaAptaParaNivel(item, nivel) {
  if (!item || item.tipo !== 'arma') return false;
  const min = item.nivelMin || 1;
  const max = item.nivelMax || 100;
  const n = Math.max(1, parseInt(nivel, 10) || 1);
  return n >= min && n <= max;
}

function rangoDanoArma(item) {
  if (!item || item.tipo !== 'arma') return { lo: 0, hi: 0 };
  let lo = Number(item.danoMin);
  let hi = Number(item.danoMax);
  if (!Number.isFinite(lo) && !Number.isFinite(hi)) {
    const d = Number(item.dano) || 0;
    lo = Math.max(1, d - 2);
    hi = d + 2;
  }
  if (!Number.isFinite(lo)) lo = hi;
  if (!Number.isFinite(hi)) hi = lo;
  lo = Math.max(0, Math.round(lo));
  hi = Math.max(lo, Math.round(hi));
  return { lo, hi };
}

function bonusDePieza(item) {
  if (!item) return { defensa: 0, dano: 0 };
  return {
    defensa: Math.max(0, Number(item.defensa) || 0),
    dano: Math.max(0, Number(item.bonusDano) || 0)
  };
}

function calcularBonusesEquipo(loadout, snapshot) {
  const acc = { defensa: 0, dano: 0 };
  const eq = loadout?.equipoEquipado || {};
  for (const ranura of RANURAS_EQUIPO) {
    const id = eq[ranura];
    if (!id) continue;
    const item = itemFromSnapshot(id, snapshot);
    if (!item) continue;
    const b = bonusDePieza(item);
    acc.defensa += b.defensa;
    acc.dano += b.dano;
  }
  return acc;
}

function danoJugadorVsEnemigo(playerLevel, snapshot, loadout) {
  const combate = snapshot?.combate || {};
  const ref = Math.max(1, parseInt(combate.nivelReferencia, 10) || 1);
  const nv = Math.max(1, parseInt(playerLevel, 10) || 1);
  const f = nv / ref;
  const baseLo = Math.max(1, Math.round((combate.danoMin || 5) * f));
  const baseHi = Math.max(baseLo, Math.round((combate.danoMax || 8) * f));

  let armaLo = 0;
  let armaHi = 0;
  if (loadout?.armaEquipada) {
    const arma = itemFromSnapshot(loadout.armaEquipada, snapshot);
    if (arma && armaAptaParaNivel(arma, nv)) {
      const r = rangoDanoArma(arma);
      armaLo = r.lo;
      armaHi = r.hi;
    }
  }

  const bonusEq = calcularBonusesEquipo(loadout, snapshot).dano;
  const totalLo = baseLo + armaLo + bonusEq;
  const totalHi = baseHi + armaHi + bonusEq;
  if (totalHi <= totalLo) return totalLo;
  return totalLo + Math.floor(Math.random() * (totalHi - totalLo + 1));
}

function validarItemDef(item) {
  const errors = [];
  if (!item || typeof item !== 'object') return { ok: false, errors: ['Objeto inválido'], item: null };
  const out = Object.assign({}, item);
  if (!out.id || typeof out.id !== 'string') errors.push('id requerido');
  if (!out.nombre || String(out.nombre).trim().length < 2) errors.push('nombre muy corto');
  if (out.tipo && !TIPOS_VALIDOS.has(out.tipo)) errors.push('tipo no válido: ' + out.tipo);
  if (out.precio != null) out.precio = clamp(Math.round(Number(out.precio) || 5), 5, 5000);
  if (out.tipo === 'arma') {
    const r = rangoDanoArma(out);
    out.danoMin = r.lo;
    out.danoMax = r.hi;
    if (!out.dano) out.dano = Math.round((r.lo + r.hi) / 2);
    out.nivelMin = clamp(Math.round(Number(out.nivelMin) || 1), 1, 100);
    out.nivelMax = clamp(Math.round(Number(out.nivelMax) || out.nivelMin + 9), out.nivelMin, 100);
  }
  if (out.efectoValor != null) out.efectoValor = Math.max(0, Number(out.efectoValor) || 0);
  if (out.efectoModo && !['porcentaje', 'fijo'].includes(out.efectoModo)) errors.push('efectoModo inválido');
  if (out.estado && !['activo', 'oculto', 'eliminado'].includes(out.estado)) out.estado = 'activo';
  if (out.probCrudoNegativo != null) {
    out.probCrudoNegativo = clamp(Math.round(Number(out.probCrudoNegativo) || 0), 0, 100);
  }
  return { ok: errors.length === 0, errors, item: out };
}

function sanitizarItemsNuevos(lista) {
  const out = [];
  for (const raw of (lista || [])) {
    const v = validarItemDef(raw);
    if (v.ok && v.item) out.push(v.item);
  }
  return out;
}

function efectoConsumible(itemId, snapshot) {
  return defEfecto(itemFromSnapshot(itemId, snapshot));
}

function tipoConsumible(itemId, snapshot) {
  const item = itemFromSnapshot(itemId, snapshot);
  const def = defEfecto(item);
  if (!def) return null;
  if (def.efecto === 'crudo') return 'crudo';
  if (def.efecto === 'vida' || def.efecto === 'veneno') return 'vida';
  if (def.efecto === 'hambre') return 'hambre';
  return null;
}

function calcularPuntosEfecto(def, tipoAplicar, stats) {
  if (!def) return 0;
  const efecto = tipoAplicar || def.efecto;
  const max = efecto === 'hambre'
    ? (stats.hambreMax || 100)
    : (stats.vidaMax || 100);
  if (def.modo === 'porcentaje') {
    return Math.max(0, Math.round(max * def.valor / 100));
  }
  return Math.max(0, Math.round(def.valor));
}

function aplicarConsumibleEnDatos(datos, def, tipo, qty, vidaMax) {
  const HAMBRE_MAX = 100;
  const hambre = Math.round(datos.hambre || 0);
  const vida = Math.round(datos.vida || 0);

  if (tipo === 'crudo') {
    const item = def._item;
    const prob = item?.probCrudoNegativo ?? 60;
    let negativo = false;
    for (let i = 0; i < qty; i++) {
      if (Math.random() * 100 < prob) {
        const dmg = Math.max(1, Math.round(vidaMax * (def.valor || 10) / 100));
        datos.vida = Math.max(0, Math.round(datos.vida || 0) - dmg);
        negativo = true;
      } else {
        datos.hambre = Math.min(HAMBRE_MAX, Math.round(datos.hambre || 0) + Math.round(HAMBRE_MAX * 0.08));
      }
    }
    datos.xp = Math.min(999999999, Math.round(datos.xp || 0) + (negativo ? 0 : 2 * qty));
    return;
  }

  if (tipo === 'hambre') {
    const por = calcularPuntosEfecto(def, 'hambre', { hambreMax: HAMBRE_MAX, hambre });
    datos.hambre = Math.min(HAMBRE_MAX, hambre + por * qty);
    datos.xp = Math.min(999999999, Math.round(datos.xp || 0) + 5 * qty);
    return;
  }

  if (tipo === 'vida') {
    const por = calcularPuntosEfecto(def, 'vida', { vidaMax, vida });
    const cura = por * qty;
    datos.vida = Math.min(vidaMax, vida + cura);
    datos.xp = Math.min(999999999, Math.round(datos.xp || 0) + 3 * qty);
  }
}

function precioBase(itemId, snapshot) {
  const custom = snapshot?.precios?.[itemId];
  if (custom != null && Number.isFinite(Number(custom))) return Math.max(0, Number(custom));
  const item = itemFromSnapshot(itemId, snapshot);
  if (item?.precio != null) return Math.max(0, Number(item.precio));
  return PRECIOS_BASE[itemId] || 50;
}

module.exports = {
  CONSUMIBLES_BASE,
  ARMAS_BASE,
  defEfecto,
  itemFromSnapshot,
  armaAptaParaNivel,
  rangoDanoArma,
  calcularBonusesEquipo,
  danoJugadorVsEnemigo,
  validarItemDef,
  sanitizarItemsNuevos,
  efectoConsumible,
  tipoConsumible,
  calcularPuntosEfecto,
  aplicarConsumibleEnDatos,
  precioBase
};
