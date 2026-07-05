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

  // Orden: primero el mismo sitio (Cuba / tcodm.com), luego GitHub raw
  urlsLectura() {
    if (CONFIG.firebaseMundoUrl) {
      return [CONFIG.firebaseMundoUrl.replace(/\/$/, '') + '/mundo.json'];
    }
    const lista = ['datos/mundo.json'];
    if (CONFIG.repoPublicacion && CONFIG.ramaPublicacion) {
      lista.push('https://raw.githubusercontent.com/' + CONFIG.repoPublicacion + '/' +
        CONFIG.ramaPublicacion + '/datos/mundo.json');
    }
    return lista;
  },

  _pesoMundo(texto) {
    try {
      const m = JSON.parse(texto);
      return (m.objetos && m.objetos.length || 0) + (m.tesoros && m.tesoros.length || 0) +
        (m.misiones && m.misiones.length || 0) + (m.jugadores && m.jugadores.length || 0);
    } catch (e) { return -1; }
  },

  async descargar() {
    const bust = '?v=' + Date.now();
    let mejor = null;
    let mejorPeso = -1;
    for (const base of this.urlsLectura()) {
      try {
        const url = base + (this.usaFirebase() ? '' : bust);
        const r = await Utilidades.fetchConTimeout(url, { cache: 'no-store' }, 4000);
        if (!r.ok) continue;
        const texto = await r.text();
        const peso = this._pesoMundo(texto);
        if (peso >= mejorPeso) {
          mejor = texto;
          mejorPeso = peso;
        }
      } catch (e) { /* probar la siguiente URL */ }
    }
    return mejor;
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
  },

  _tokenGitHub() {
    if (CONFIG.tokenRegistroJugadores) return CONFIG.tokenRegistroJugadores;
    try {
      const d = JSON.parse(localStorage.getItem('mariel_admin_v1') || 'null');
      if (d && d.tokenPublicar) return d.tokenPublicar;
    } catch (e) {}
    return null;
  },

  async _putMundoGitHub(json) {
    const token = this._tokenGitHub();
    if (!token || !CONFIG.repoPublicacion) return false;
    const url = 'https://api.github.com/repos/' + CONFIG.repoPublicacion + '/contents/datos/mundo.json';
    const cabeceras = {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json'
    };
    let sha = null;
    try {
      const r = await fetch(url + '?ref=' + CONFIG.ramaPublicacion, { headers: cabeceras });
      if (r.ok) sha = (await r.json()).sha;
    } catch (e) {}
    const cuerpo = {
      message: 'Registrar jugador desde el juego',
      content: btoa(unescape(encodeURIComponent(json))),
      branch: CONFIG.ramaPublicacion
    };
    if (sha) cuerpo.sha = sha;
    try {
      const r = await fetch(url, { method: 'PUT', headers: cabeceras, body: JSON.stringify(cuerpo) });
      return r.ok;
    } catch (e) { return false; }
  },

  // Añade el jugador a la lista global en mundo.json (si hay token de GitHub)
  async registrarJugadorEnMundo(perfil) {
    if (!perfil || !CONFIG.repoPublicacion) return false;
    const token = this._tokenGitHub();
    if (!token) return false;
    let mundo = {
      misiones: [], tesoros: [], objetos: [], posiciones: {}, eliminados: [],
      precios: {}, itemsNuevos: [], mantenimiento: { activo: false, mensaje: '' },
      baneados: [], mensajes: [], jugadores: []
    };
    try {
      const texto = await this.descargar();
      if (texto) mundo = Object.assign(mundo, JSON.parse(texto));
    } catch (e) {}
    if (!mundo.jugadores) mundo.jugadores = [];
    const n = perfil.nombre.trim().toLowerCase();
    const adminNom = (CONFIG.adminNombre || 'randy').toLowerCase();
    if (n === adminNom) {
      const randy = mundo.jugadores.find(j => j.nombre && j.nombre.toLowerCase() === adminNom);
      if (randy && randy.id !== perfil.id) return false;
    }
    for (const j of mundo.jugadores) {
      if (j.id === perfil.id) return true;
      if (j.nombre && j.nombre.toLowerCase() === n) return false;
      if (j.telefono && perfil.telefono && j.telefono === perfil.telefono) return false;
    }
    mundo.jugadores.push({
      id: perfil.id,
      nombre: perfil.nombre,
      telefono: perfil.telefono || '',
      creado: perfil.creado || Date.now()
    });
    const json = JSON.stringify(mundo, null, 2);
    return await this._putMundoGitHub(json);
  }
};
