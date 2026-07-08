/**
 * Fase 4 + Fase 11 — rate limits simples en memoria (por proceso).
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
/** Fase 11 — solicitudes de amistad (REST) */
const limiteSolicitudAmistad = crearLimite({ ventanaMs: 60000, max: 12 });
/** Fase 11 — posición en mapa (socket player:move) */
const limiteMovimiento = crearLimite({ ventanaMs: 60000, max: 100 });
/** Fase 11 — crear/editar/borrar objetos admin (REST + socket) */
const limiteAdminMapa = crearLimite({ ventanaMs: 60000, max: 250 });
/** Fase 11 — publicar mundo completo (sync-mundo) */
const limitePublicarMundo = crearLimite({ ventanaMs: 60000, max: 15 });

const MENSAJES = {
  chat: 'Demasiados mensajes — espera un momento',
  amigos: 'Demasiadas solicitudes — espera un momento',
  registro: 'Demasiados registros — intenta más tarde',
  movimiento: 'Demasiados movimientos — espera un momento',
  adminMapa: 'Demasiados cambios en el mapa — espera un momento',
  publicar: 'Demasiadas publicaciones — espera un momento'
};

function ipCliente(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) {
    return xf.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function responderRateLimitHttp(res, tipo) {
  const error = MENSAJES[tipo] || 'Demasiadas acciones — espera un momento';
  return res.status(429).json({ ok: false, error });
}

function errorRateLimitSocket(tipo) {
  return { ok: false, error: MENSAJES[tipo] || 'Demasiadas acciones — espera un momento' };
}

module.exports = {
  limiteChat,
  limiteAmigos,
  limiteRegistro,
  limiteSolicitudAmistad,
  limiteMovimiento,
  limiteAdminMapa,
  limitePublicarMundo,
  ipCliente,
  crearLimite,
  responderRateLimitHttp,
  errorRateLimitSocket,
  MENSAJES
};
