// ============================================================
// MUNDO PÚBLICO — mapa compartido entre todos los jugadores
// Lee/escribe el mundo en Firebase (automático al pulsar Confirmar)
// o en datos/mundo.json de GitHub Pages como respaldo.
// ============================================================
const MundoPublico = {

  // ¿Hay nube configurada para publicar al pulsar Confirmar?
  puedePublicar() {
    return !!(CONFIG.firebaseMundoUrl || (typeof Admin !== 'undefined' && Admin.datos && Admin.datos.tokenPublicar));
  },

  usaFirebase() {
    return !!CONFIG.firebaseMundoUrl;
  },

  urlLectura() {
    if (CONFIG.firebaseMundoUrl) {
      return CONFIG.firebaseMundoUrl.replace(/\/$/, '') + '/mundo.json';
    }
    return 'datos/mundo.json';
  },

  async descargar() {
    const url = this.urlLectura() + (this.usaFirebase() ? '' : '?v=' + Date.now());
    const opciones = this.usaFirebase() ? {} : { cache: 'no-store' };
    const r = await Utilidades.fetchConTimeout(url, opciones, 8000);
    if (!r.ok) return null;
    return await r.text();
  },

  // Sube el mundo a la nube (Firebase primero; si no, GitHub API)
  async publicar(json) {
    if (CONFIG.firebaseMundoUrl) {
      const url = CONFIG.firebaseMundoUrl.replace(/\/$/, '') + '/mundo.json';
      const r = await Utilidades.fetchConTimeout(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: json
      }, 12000);
      return r.ok;
    }
    return null; // GitHub lo maneja Admin.publicarMundo()
  }
};
