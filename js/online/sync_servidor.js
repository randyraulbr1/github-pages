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
    try {
      const mundo = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
      const r = await fetch(base + '/api/player/sync-mundo', {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(mundo)
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) {
        return { ok: false, error: data.error || ('Error ' + r.status) };
      }
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: 'Sin conexión al servidor' };
    }
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

  async registrarCuenta(perfil, partida) {
    const base = (CONFIG.servidorOnline || '').replace(/\/$/, '');
    const token = localStorage.getItem(Multijugador.TOKEN_KEY);
    if (!base || !token || !perfil?.id) return false;
    try {
      const r = await fetch(base + '/api/player/registrar-cuenta', {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({ perfil, partida: partida || null })
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
