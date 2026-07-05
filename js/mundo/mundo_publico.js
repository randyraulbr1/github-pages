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
  },

  async correoYaReclamado(codigo) {
    try {
      const texto = await this.descargar();
      if (!texto) return null;
      const m = JSON.parse(texto);
      const lista = m.correoReclamados || [];
      return lista.find(r => r.codigo === codigo) || null;
    } catch (e) { return null; }
  },

  async _leerMundoCorreo() {
    let mundo = { correoReclamados: [], correoCola: {} };
    try {
      const texto = await this.descargar();
      if (texto) mundo = Object.assign(mundo, JSON.parse(texto));
    } catch (e) {}
    if (!mundo.correoReclamados) mundo.correoReclamados = [];
    if (!mundo.correoCola) mundo.correoCola = {};
    return mundo;
  },

  async _guardarMundoCorreo(mundo) {
    const json = JSON.stringify(mundo, null, 2);
    const ok = await this._putMundoGitHub(json);
    if (typeof Admin !== 'undefined') {
      Admin.publicado.correoReclamados = mundo.correoReclamados;
      Admin.datos.correoReclamadosExtra = mundo.correoReclamados;
    }
    return ok;
  },

  async registrarReclamoParcial(codigo, perfil, cantidadTomada, cantidadTotal) {
    if (!this._tokenGitHub()) return { ok: true, completo: cantidadTomada >= cantidadTotal };

    const mundo = await this._leerMundoCorreo();
    let entrada = mundo.correoReclamados.find(r => r.codigo === codigo);
    if (!entrada) {
      entrada = {
        codigo,
        jugadorId: perfil.id,
        nombre: perfil.nombre,
        reclamado: 0,
        total: cantidadTotal,
        completo: false,
        t: Date.now()
      };
      mundo.correoReclamados.push(entrada);
    }
    entrada.reclamado = (entrada.reclamado || 0) + cantidadTomada;
    entrada.jugadorId = perfil.id;
    entrada.nombre = perfil.nombre;
    if (entrada.reclamado >= cantidadTotal) {
      entrada.reclamado = cantidadTotal;
      entrada.completo = true;
    }
    await this._guardarMundoCorreo(mundo);
    return { ok: true, completo: !!entrada.completo, reclamado: entrada.reclamado };
  },

  async reclamarCodigoCorreo(codigo, perfil, completo) {
    const ya = await this.correoYaReclamado(codigo);
    if (ya && ya.completo && ya.jugadorId !== perfil.id) return false;

    if (typeof Admin === 'undefined' || !this._tokenGitHub()) return true;

    let mundo = await this._leerMundoCorreo();
    const existente = mundo.correoReclamados.find(r => r.codigo === codigo);
    if (existente && existente.completo) return existente.jugadorId === perfil.id;

    if (!completo) {
      const cola = mundo.correoCola[codigo];
      const ahora = Date.now();
      if (cola && cola.jugadorId !== perfil.id && (ahora - cola.t) < 15000) return false;

      mundo.correoCola[codigo] = { jugadorId: perfil.id, nombre: perfil.nombre, t: ahora };
      await this._putMundoGitHub(JSON.stringify(mundo, null, 2));

      await new Promise(r => setTimeout(r, 800));
      const ver = await this.correoYaReclamado(codigo);
      if (ver && ver.completo && ver.jugadorId !== perfil.id) return false;

      try {
        const texto2 = await this.descargar();
        if (texto2) mundo = JSON.parse(texto2);
      } catch (e) {}
      const miCola = (mundo.correoCola || {})[codigo];
      if (miCola && miCola.jugadorId !== perfil.id) return false;
      return !!(miCola && miCola.jugadorId === perfil.id);
    }

    let entrada = mundo.correoReclamados.find(r => r.codigo === codigo);
    if (!entrada) {
      entrada = {
        codigo, jugadorId: perfil.id, nombre: perfil.nombre,
        reclamado: 0, total: 0, completo: true, t: Date.now()
      };
      mundo.correoReclamados.push(entrada);
    } else {
      entrada.completo = true;
      entrada.jugadorId = perfil.id;
      entrada.nombre = perfil.nombre;
    }
    delete mundo.correoCola[codigo];
    await this._guardarMundoCorreo(mundo);
    return true;
  }
};
