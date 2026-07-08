/**
 * Fase 3b — mochila autoritativa en servidor (pickup/drop).
 * Reglas alineadas con js/mochila/mochila.js y CONFIG.maxPila.
 */
const MOCHILA_SLOTS = 25;
const MAX_PILA_DEFAULT = 10;
const UNICOS = new Set(['nota_escrita']);

function esUnico(itemId) {
  const id = String(itemId || '');
  return UNICOS.has(id) || id.startsWith('arma_');
}

function maxPila(itemId) {
  return esUnico(itemId) ? 1 : MAX_PILA_DEFAULT;
}

function normalizarMochila(slots) {
  const m = Array.isArray(slots) ? slots.slice() : [];
  while (m.length < MOCHILA_SLOTS) m.push(null);
  if (m.length > MOCHILA_SLOTS) m.length = MOCHILA_SLOTS;
  return m.map((s) => (s && s.id ? { id: s.id, cantidad: Math.max(1, s.cantidad || 1) } : null));
}

function clonarMochila(slots) {
  return normalizarMochila(slots).map((s) => (s ? { ...s } : null));
}

function agregarAMochila(slots, items) {
  const mochila = clonarMochila(slots);
  const agregados = [];
  for (const it of (items || [])) {
    if (!it?.id) continue;
    let restante = Math.max(1, parseInt(it.cantidad, 10) || 1);
    const id = it.id;
    const max = maxPila(id);

    if (esUnico(id)) {
      for (let i = 0; i < MOCHILA_SLOTS && restante > 0; i++) {
        if (!mochila[i]) {
          mochila[i] = { id, cantidad: 1 };
          agregados.push({ id, cantidad: 1 });
          restante--;
        }
      }
    } else {
      for (let i = 0; i < MOCHILA_SLOTS && restante > 0; i++) {
        const sl = mochila[i];
        if (sl && sl.id === id && sl.cantidad < max) {
          const cabe = Math.min(restante, max - sl.cantidad);
          sl.cantidad += cabe;
          agregados.push({ id, cantidad: cabe });
          restante -= cabe;
        }
      }
      for (let i = 0; i < MOCHILA_SLOTS && restante > 0; i++) {
        if (!mochila[i]) {
          const poner = Math.min(restante, max);
          mochila[i] = { id, cantidad: poner };
          agregados.push({ id, cantidad: poner });
          restante -= poner;
        }
      }
    }
    if (restante > 0) {
      return { ok: false, error: 'Mochila llena', mochila: slots, agregados };
    }
  }
  return { ok: true, mochila, agregados };
}

/** Agrega hasta `cantidad`; devuelve lo que entró (como Mochila.agregarHasta). */
function agregarHastaAMochila(slots, itemId, cantidad) {
  const id = itemId;
  const total = Math.max(0, parseInt(cantidad, 10) || 0);
  if (!id || total <= 0) return { ok: true, mochila: clonarMochila(slots), agregado: 0, restante: 0 };
  const r = agregarAMochila(slots, [{ id, cantidad: total }]);
  if (r.ok) {
    const agregado = r.agregados.reduce((n, x) => n + (x.cantidad || 0), 0);
    return { ok: true, mochila: r.mochila, agregado, restante: total - agregado };
  }
  const agregado = (r.agregados || []).reduce((n, x) => n + (x.cantidad || 0), 0);
  if (agregado <= 0) return { ok: false, error: r.error || 'Mochila llena', mochila: slots, agregado: 0, restante: total };
  return { ok: true, mochila: r.mochila, agregado, restante: total - agregado };
}

function quitarDeMochila(slots, items) {
  const mochila = clonarMochila(slots);
  const quitados = [];
  for (const it of (items || [])) {
    if (!it?.id) continue;
    let restante = Math.max(1, parseInt(it.cantidad, 10) || 1);
    const id = it.id;
    for (let i = 0; i < MOCHILA_SLOTS && restante > 0; i++) {
      const sl = mochila[i];
      if (!sl || sl.id !== id) continue;
      const q = Math.min(restante, sl.cantidad || 1);
      sl.cantidad -= q;
      if (sl.cantidad <= 0) mochila[i] = null;
      quitados.push({ id, cantidad: q });
      restante -= q;
    }
    if (restante > 0) {
      return { ok: false, error: 'No tienes esos objetos en la mochila', mochila: slots, quitados };
    }
  }
  return { ok: true, mochila, quitados };
}

function itemsDeObjetoData(data) {
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data.items) && data.items.length) {
    return data.items
      .filter((it) => it?.id)
      .map((it) => ({ id: it.id, cantidad: Math.max(1, parseInt(it.cantidad, 10) || 1) }));
  }
  if (data.itemId) {
    return [{ id: data.itemId, cantidad: Math.max(1, parseInt(data.cantidad, 10) || 1) }];
  }
  return [];
}

module.exports = {
  MOCHILA_SLOTS,
  normalizarMochila,
  agregarAMochila,
  agregarHastaAMochila,
  quitarDeMochila,
  itemsDeObjetoData
};
