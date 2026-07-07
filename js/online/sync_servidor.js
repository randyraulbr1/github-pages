/**
 * Publica el mundo del admin al servidor Render (fuente única de verdad).
 */
const SyncServidor = {
  puedePublicar() {
    return !!(CONFIG.servidorOnline && localStorage.getItem(Multijugador.TOKEN_KEY));
  },

  _headers() {
    const token = localStorage.getItem(Multijugador.TOKEN_KEY);
    return {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    };
  },

  async publicar(jsonStr) {
    const base = (CONFIG.servidorOnline || '').replace(/\/$/, '');
    const token = localStorage.getItem(Multijugador.TOKEN_KEY);
    if (!base || !token) {
      return { ok: false, error: 'Sin sesión en el servidor. Inicia sesión de nuevo.' };
    }
    const body = typeof jsonStr === 'string' ? jsonStr : JSON.stringify(jsonStr);
    for (let intento = 0; intento < 3; intento++) {
      try {
        const r = await Utilidades.fetchConTimeout(base + '/api/player/sync-mundo', {
          method: 'POST',
          headers: this._headers(),
          body: body
        }, 12000);
        const data = await r.json().catch(() => ({}));
        if (r.ok && data.ok) return { ok: true, data };
        if (intento < 2) {
          await new Promise(res => setTimeout(res, 1500 * (intento + 1)));
          continue;
        }
        return { ok: false, error: data.error || ('Error ' + r.status) };
      } catch (e) {
        if (intento < 2) {
          await new Promise(res => setTimeout(res, 1500 * (intento + 1)));
          continue;
        }
        return { ok: false, error: 'Sin conexión al servidor' };
      }
    }
    return { ok: false, error: 'Sin conexión al servidor' };
  },

  /** Sube vida/muerto de la partida al snapshot del servidor. */
  async subirPartida(perfilId, partida) {
    const base = (CONFIG.servidorOnline || '').replace(/\/$/, '');
    const token = localStorage.getItem(Multijugador.TOKEN_KEY);
    if (!base || !token || !perfilId || !partida) return false;
    try {
      const r = await fetch(base + '/api/player/sync-partida', {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({ perfilId, partida })
      });
      const data = await r.json().catch(() => ({}));
      return !!data.ok;
    } catch (e) {
      return false;
    }
  },

  async registrarCuenta(perfil, partida, clave) {
    const base = (CONFIG.servidorOnline || '').replace(/\/$/, '');
    const token = localStorage.getItem(Multijugador.TOKEN_KEY);
    if (!base || !token || !perfil?.id) return false;
    try {
      const body = { perfil, partida: partida || null };
      if (clave) body.clave = clave;
      const r = await fetch(base + '/api/player/registrar-cuenta', {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(body)
      });
      const data = await r.json().catch(() => ({}));
      return !!data.ok;
    } catch (e) {
      return false;
    }
  },

  /** Descarga el mundo desde SQLite (público o autenticado). */
  async obtenerMundo() {
    const base = (CONFIG.servidorOnline || '').replace(/\/$/, '');
    if (!base) return null;
    const token = localStorage.getItem(Multijugador.TOKEN_KEY);
    const headers = token ? { Authorization: 'Bearer ' + token } : {};
    const url = token ? base + '/api/player/mundo' : base + '/api/public/mundo';
    try {
      const r = await fetch(url, { headers, cache: 'no-store' });
      const data = await r.json().catch(() => ({}));
      if (!data.ok) return null;
      return {
        mundo: data.mundo,
        actualizadoEn: data.actualizadoEn || data.mundo?.actualizadoEn || 0
      };
    } catch (e) {
      return null;
    }
  }
};
