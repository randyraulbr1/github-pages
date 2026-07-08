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
  pocion_vida: { curaVida: 100 }
};

const PRECIOS_BASE = {
  agua: 18, pan: 25, botiquin: 300, pocion_vida: 320, arroz_congri: 48,
  cafe: 22, coco: 35, mango: 28, pizza: 65, pollo_asado: 85
};

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
  const base = CONSUMIBLES_BASE[itemId];
  if (base) return Object.assign({ id: itemId, tipo: 'comida' }, base);
  return null;
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
  defEfecto,
  itemFromSnapshot,
  efectoConsumible,
  tipoConsumible,
  calcularPuntosEfecto,
  aplicarConsumibleEnDatos,
  precioBase
};
