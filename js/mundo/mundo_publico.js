// ============================================================
// MUNDO PÚBLICO — mapa compartido entre todos los jugadores
// Lee/escribe el mundo en Firebase (automático al pulsar Confirmar)
// o en datos/mundo.json de GitHub Pages como respaldo.
// ============================================================
const MundoPublico = {

  // ¿Hay nube configurada para publicar al pulsar Confirmar?
  puedePublicar() {
    if (CONFIG.firebaseMundoUrl) return true;
    if (this._tokenGitHub()) return true;
    try {
      const d = JSON.parse(localStorage.getItem('mariel_admin_v1') || 'null');
      if (d && d.tokenPublicar) return true;
    } catch (e) {}
    return false;
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
    if (mejor) {
      try {
        const m = JSON.parse(mejor);
        if (m.claveSyncNube) this._tokenDesdeMundo = m.claveSyncNube;
        else if (m._syncToken) this._tokenDesdeMundo = m._syncToken;
      } catch (e) {}
    }
    return mejor;
  },

  puedeEscribir() {
    return !!(CONFIG.firebaseMundoUrl || this._tokenGitHub());
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

  _tokenDesdeMundo: null,
  _tokenDesdeArchivo: null,

  async cargarClaveSync() {
    if (this._tokenDesdeArchivo) return this._tokenDesdeArchivo;
    if (CONFIG.tokenRegistroJugadores) {
      this._tokenDesdeArchivo = CONFIG.tokenRegistroJugadores;
      return this._tokenDesdeArchivo;
    }
    try {
      const r = await Utilidades.fetchConTimeout('datos/clave_sync.json?v=' + Date.now(), { cache: 'no-store' }, 5000);
      if (!r.ok) return null;
      const j = await r.json();
      const t = (j.token || '').trim();
      if (t.length > 10) {
        this._tokenDesdeArchivo = t;
        return t;
      }
    } catch (e) {}
    return null;
  },

  _tokenGitHub() {
    if (CONFIG.tokenRegistroJugadores) return CONFIG.tokenRegistroJugadores;
    if (this._tokenDesdeArchivo) return this._tokenDesdeArchivo;
    if (this._tokenDesdeMundo) return this._tokenDesdeMundo;
    try {
      const d = JSON.parse(localStorage.getItem('mariel_admin_v1') || 'null');
      if (d && d.tokenPublicar) return d.tokenPublicar;
    } catch (e) {}
    return null;
  },

  _urlMundoGitHub() {
    return 'https://api.github.com/repos/' + CONFIG.repoPublicacion + '/contents/datos/mundo.json';
  },

  _cabecerasGitHub(token) {
    return {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json'
    };
  },

  async _leerMundoGitHubAPI(token) {
    const url = this._urlMundoGitHub() + '?ref=' + CONFIG.ramaPublicacion;
    const r = await fetch(url, { headers: this._cabecerasGitHub(token) });
    if (!r.ok) return { mundo: null, sha: null };
    const meta = await r.json();
    const texto = decodeURIComponent(escape(atob(meta.content.replace(/\n/g, ''))));
    return { mundo: JSON.parse(texto), sha: meta.sha };
  },

  async actualizarMundo(editar, mensaje) {
    if (!CONFIG.repoPublicacion) return false;
    const token = this._tokenGitHub();
    if (!token) return false;

    for (let intento = 0; intento < 4; intento++) {
      let mundo = {
        misiones: [], tesoros: [], objetos: [], posiciones: {}, eliminados: [],
        precios: {}, itemsNuevos: [], mantenimiento: { activo: false, mensaje: '' },
        baneados: [], mensajes: [], jugadores: [], partidas: {}, cofres: [],
        correoReclamados: [], correoTienda: []
      };
      let sha = null;

      try {
        const api = await this._leerMundoGitHubAPI(token);
        if (api.mundo) { mundo = api.mundo; sha = api.sha; }
        else {
          const texto = await this.descargar();
          if (texto) mundo = Object.assign(mundo, JSON.parse(texto));
        }
      } catch (e) {
        const texto = await this.descargar();
        if (texto) try { mundo = Object.assign(mundo, JSON.parse(texto)); } catch (e2) {}
      }

      if (!mundo.jugadores) mundo.jugadores = [];
      if (!mundo.partidas) mundo.partidas = {};

      editar(mundo);

      const json = JSON.stringify(mundo, null, 2);
      const cuerpo = {
        message: mensaje || 'Actualizar mundo desde el juego',
        content: btoa(unescape(encodeURIComponent(json))),
        branch: CONFIG.ramaPublicacion
      };
      if (sha) cuerpo.sha = sha;

      try {
        const r = await fetch(this._urlMundoGitHub(), {
          method: 'PUT',
          headers: this._cabecerasGitHub(token),
          body: JSON.stringify(cuerpo)
        });
        if (r.ok) {
          if (mundo._syncToken) this._tokenDesdeMundo = mundo._syncToken;
          if (typeof Admin !== 'undefined') {
            Admin._crudoPublicado = json;
            try { Admin.publicado = Object.assign(Admin.publicado || {}, JSON.parse(json)); } catch (e) {}
          }
          return true;
        }
        if (r.status === 409) {
          await new Promise(res => setTimeout(res, 400 + intento * 300));
          continue;
        }
      } catch (e) {}
      break;
    }
    return false;
  },

  async _putMundoGitHub(json) {
    const token = this._tokenGitHub();
    if (!token || !CONFIG.repoPublicacion) return false;
    try {
      const mundo = JSON.parse(json);
      return this.actualizarMundo(m => Object.assign(m, mundo), 'Actualizar mundo.json');
    } catch (e) { return false; }
  },

  async registrarJugadorEnMundo(perfil, extras) {
    if (!perfil || !CONFIG.repoPublicacion) return false;
    if (!this._tokenGitHub()) return false;

    const n = perfil.nombre.trim().toLowerCase();
    const adminNom = (CONFIG.adminNombre || 'randy').toLowerCase();

    return this.actualizarMundo(mundo => {
      let j = mundo.jugadores.find(x => x.id === perfil.id);
      if (!j) {
        if (n === adminNom) {
          const randy = mundo.jugadores.find(x => x.nombre && x.nombre.toLowerCase() === adminNom);
          if (randy && randy.id !== perfil.id) return;
        }
        for (const otro of mundo.jugadores) {
          if (otro.nombre && otro.nombre.toLowerCase() === n && otro.id !== perfil.id) return;
          if (otro.telefono && perfil.telefono && otro.telefono === perfil.telefono && otro.id !== perfil.id) return;
        }
        j = {
          id: perfil.id,
          nombre: perfil.nombre,
          telefono: perfil.telefono || '',
          creado: perfil.creado || Date.now()
        };
        mundo.jugadores.push(j);
      }
      if (perfil.pinHash) j.pinHash = perfil.pinHash;
      if (perfil.nombre) j.nombre = perfil.nombre;
      if (perfil.telefono) j.telefono = perfil.telefono;
      if (extras) {
        if (extras.pinHash) j.pinHash = extras.pinHash;
        if ('sesionToken' in extras) j.sesionToken = extras.sesionToken;
        if (extras.sesionT) j.sesionT = extras.sesionT;
        if (extras.partida) {
          const actual = mundo.partidas[perfil.id];
          if (!actual || !actual.t || extras.partida.t >= actual.t) {
            mundo.partidas[perfil.id] = extras.partida;
          }
        }
      }
    }, 'Registrar jugador: ' + perfil.nombre);
  },

  async subirPartida(perfil, snapshot) {
    if (!perfil?.id || !snapshot || !this._tokenGitHub()) return false;
    return this.actualizarMundo(mundo => {
      const actual = (mundo.partidas || {})[perfil.id];
      if (actual && actual.t > snapshot.t) return;
      if (!mundo.partidas) mundo.partidas = {};
      mundo.partidas[perfil.id] = snapshot;

      let j = mundo.jugadores.find(x => x.id === perfil.id);
      if (!j) {
        j = {
          id: perfil.id,
          nombre: perfil.nombre,
          telefono: perfil.telefono || '',
          creado: perfil.creado || Date.now(),
          pinHash: perfil.pinHash
        };
        mundo.jugadores.push(j);
      }
      if (perfil.pinHash) j.pinHash = perfil.pinHash;
      if (perfil.sesionToken) j.sesionToken = perfil.sesionToken;
      if (perfil.sesionT) j.sesionT = perfil.sesionT;
    }, 'Sync partida: ' + perfil.nombre);
  },

  async leerPartida(perfilId) {
    try {
      const texto = await this.descargar();
      if (!texto) return null;
      const m = JSON.parse(texto);
      return (m.partidas || {})[perfilId] || null;
    } catch (e) { return null; }
  },

  async buscarJugadorPorLogin(usuario) {
    try {
      const texto = await this.descargar();
      if (!texto) return null;
      const m = JSON.parse(texto);
      const u = usuario.trim().toLowerCase();
      const limpio = usuario.trim().replace(/[\s-]/g, '');
      return (m.jugadores || []).find(j =>
        (j.nombre && j.nombre.toLowerCase() === u) ||
        (j.telefono && j.telefono === limpio)
      ) || null;
    } catch (e) { return null; }
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
