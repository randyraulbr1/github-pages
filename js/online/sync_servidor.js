/**
 * Publica el mundo del admin al servidor Render → todos lo ven en vivo.
 */
const SyncServidor = {
  puedePublicar() {
    return !!(CONFIG.servidorOnline && localStorage.getItem(Multijugador.TOKEN_KEY));
  },

  async publicar(jsonStr) {
    const base = (CONFIG.servidorOnline || '').replace(/\/$/, '');
    const token = localStorage.getItem(Multijugador.TOKEN_KEY);
    if (!base || !token) return false;
    try {
      const mundo = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
      const r = await fetch(base + '/api/player/sync-mundo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token
        },
        body: JSON.stringify(mundo)
      });
      const data = await r.json().catch(() => ({}));
      return !!data.ok;
    } catch (e) {
      return false;
    }
  }
};
