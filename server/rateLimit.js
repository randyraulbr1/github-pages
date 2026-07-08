/**
 * Fase 4 — rate limits simples en memoria (por proceso).
 */
function crearLimite({ ventanaMs, max }) {
  const hits = new Map();
  return function permitir(clave) {
    if (!clave) return true;
    const now = Date.now();
    let b = hits.get(clave);
    if (!b || now - b.t > ventanaMs) {
      b = { t: now, n: 0 };
      hits.set(clave, b);
    }
    b.n++;
    if (hits.size > 10000) {
      for (const [k, v] of hits) {
        if (now - v.t > ventanaMs) hits.delete(k);
      }
    }
    return b.n <= max;
  };
}

const limiteChat = crearLimite({ ventanaMs: 60000, max: 30 });
const limiteAmigos = crearLimite({ ventanaMs: 60000, max: 15 });
const limiteRegistro = crearLimite({ ventanaMs: 3600000, max: 8 });

function ipCliente(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) {
    return xf.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

module.exports = {
  limiteChat,
  limiteAmigos,
  limiteRegistro,
  ipCliente,
  crearLimite
};
