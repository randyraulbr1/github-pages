/**
 * Catálogo mínimo de ítems para validación en servidor (Fase 3b).
 * Precios de tienda admin vienen del snapshot; esto es para consumibles y fallback.
 */
const CONSUMIBLES = {
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

function efectoConsumible(itemId) {
  return CONSUMIBLES[itemId] || null;
}

function precioBase(itemId, snapshot) {
  const custom = snapshot?.precios?.[itemId];
  if (custom != null && Number.isFinite(Number(custom))) return Math.max(0, Number(custom));
  return PRECIOS_BASE[itemId] || 50;
}

function tipoConsumible(itemId) {
  const e = CONSUMIBLES[itemId];
  if (!e) return null;
  if (e.curaVida) return 'vida';
  if (e.cura) return 'hambre';
  return null;
}

module.exports = {
  efectoConsumible,
  precioBase,
  tipoConsumible
};
