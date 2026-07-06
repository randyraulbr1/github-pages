/**
 * Publica el mundo del admin al servidor Render → todos lo ven en vivo.
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
    if (!base || !token) return false;
    try {
      const mundo = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
      const r = await fetch(base + '/api/player/sync-mundo', {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(mundo)
      });
      const data = await r.json().catch(() => ({}));
      return !!data.ok;
    } catch (e) {
      return false;
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
  }
};
