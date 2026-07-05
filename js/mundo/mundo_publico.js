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

  // Orden: GitHub raw (servidor) — no mezclar con datos/mundo.json local viejo
  urlsLectura() {
    if (CONFIG.firebaseMundoUrl) {
      return [CONFIG.firebaseMundoUrl.replace(/\/$/, '') + '/mundo.json'];
    }
    if (CONFIG.repoPublicacion && CONFIG.ramaPublicacion) {
      return ['https://raw.githubusercontent.com/' + CONFIG.repoPublicacion + '/' +
        CONFIG.ramaPublicacion + '/datos/mundo.json'];
    }
    return ['datos/mundo.json'];
  },

  _aplicarTokenDesdeTexto(texto) {
    // No cargar PAT desde mundo.json: GitHub bloquea tokens en el repo (secret scanning)
  },

  syncDisponible() {
    return !!this._tokenGitHub();
  },

  _versionMundo(texto) {
    try {
      const m = JSON.parse(texto);
      if (m.actualizadoEn) return m.actualizadoEn;
      let t = 0;
      for (const msg of (m.mensajes || [])) t = Math.max(t, msg.t || 0);
      for (const j of (m.jugadores || [])) {
        t = Math.max(t, j.creado || 0, j.sesionT || 0);
      }
      const pos = m.posiciones || {};
      t = Math.max(t, Object.keys(pos).length * 1000);
      return t;
    } catch (e) { return 0; }
  },

  _pesoMundo(texto) {
    try {
      const m = JSON.parse(texto);
      const pos = m.posiciones || {};
      return (m.objetos && m.objetos.length || 0) + (m.tesoros && m.tesoros.length || 0) +
        (m.misiones && m.misiones.length || 0) + (m.enemigos && m.enemigos.length || 0) +
        (m.jugadores && m.jugadores.length || 0) +
        (m.mensajes && m.mensajes.length || 0) + Object.keys(pos).length;
    } catch (e) { return -1; }
  },

  async descargar() {
    const bust = '?v=' + Date.now();
    const candidatos = [];
    for (const base of this.urlsLectura()) {
      try {
        const url = base + (this.usaFirebase() ? '' : bust);
        const r = await Utilidades.fetchConTimeout(url, { cache: 'no-store' }, 5000);
        if (!r.ok) continue;
        const texto = await r.text();
        candidatos.push({
          texto,
          version: this._versionMundo(texto),
          peso: this._pesoMundo(texto),
          esRaw: base.includes('raw.githubusercontent')
        });
      } catch (e) { /* probar la siguiente URL */ }
    }
    if (!candidatos.length) return null;
    candidatos.sort((a, b) => {
      if (b.version !== a.version) return b.version - a.version;
      if (b.peso !== a.peso) return b.peso - a.peso;
      return (b.esRaw ? 1 : 0) - (a.esRaw ? 1 : 0);
    });
    const mejor = candidatos[0].texto;
    this._aplicarTokenDesdeTexto(mejor);
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

  _tokenGitHub() {
    if (CONFIG.tokenRegistroJugadores) return CONFIG.tokenRegistroJugadores;
    try {
      const d = JSON.parse(localStorage.getItem('mariel_admin_v1') || 'null');
      if (d && d.tokenPublicar) return d.tokenPublicar;
    } catch (e) {}
    if (this._tokenDesdeMundo) return this._tokenDesdeMundo;
    return null;
  },

  _urlMundoGitHub() {
    return 'https://api.github.com/repos/' + CONFIG.repoPublicacion + '/contents/datos/mundo.json';
  },

  _rutaIndiceCuentas() { return 'datos/jugadores/indice.json'; },
  _rutaCuenta(id) { return 'datos/jugadores/' + id + '.json'; },

  _urlRawRepo(ruta) {
    return 'https://raw.githubusercontent.com/' + CONFIG.repoPublicacion + '/' +
      CONFIG.ramaPublicacion + '/' + ruta;
  },

  async _descargarJsonRepo(ruta) {
    const bust = '?v=' + Date.now();
    const urls = CONFIG.repoPublicacion
      ? [this._urlRawRepo(ruta), ruta]
      : [ruta];
    for (const base of urls) {
      try {
        const url = base + bust;
        const r = await Utilidades.fetchConTimeout(url, { cache: 'no-store' }, 6000);
        if (!r.ok) continue;
        return JSON.parse(await r.text());
      } catch (e) {}
    }
    return null;
  },

  async _leerArchivoGitHubAPI(ruta, token) {
    const url = 'https://api.github.com/repos/' + CONFIG.repoPublicacion +
      '/contents/' + ruta + '?ref=' + CONFIG.ramaPublicacion;
    const r = await fetch(url, { headers: this._cabecerasGitHub(token) });
    if (!r.ok) return { obj: null, sha: null };
    const meta = await r.json();
    const texto = decodeURIComponent(escape(atob(meta.content.replace(/\n/g, ''))));
    return { obj: JSON.parse(texto), sha: meta.sha };
  },

  async _escribirArchivoGitHub(ruta, obj, mensaje) {
    const token = this._tokenGitHub();
    if (!token || !CONFIG.repoPublicacion) return false;
    for (let intento = 0; intento < 6; intento++) {
      let sha = null;
      try {
        const api = await this._leerArchivoGitHubAPI(ruta, token);
        sha = api.sha;
      } catch (e) {}
      const json = JSON.stringify(obj, null, 2);
      const cuerpo = {
        message: mensaje || ('Actualizar ' + ruta),
        content: btoa(unescape(encodeURIComponent(json))),
        branch: CONFIG.ramaPublicacion
      };
      if (sha) cuerpo.sha = sha;
      try {
        const url = 'https://api.github.com/repos/' + CONFIG.repoPublicacion + '/contents/' + ruta;
        const r = await fetch(url, {
          method: 'PUT',
          headers: this._cabecerasGitHub(token),
          body: JSON.stringify(cuerpo)
        });
        if (r.ok) return true;
        if (r.status === 409) {
          await new Promise(res => setTimeout(res, 500 + intento * 400));
          continue;
        }
      } catch (e) {}
      break;
    }
    return false;
  },

  _perfilIndice(perfil) {
    return {
      id: perfil.id,
      nombre: perfil.nombre,
      telefono: perfil.telefono || '',
      pinHash: perfil.pinHash || '',
      creado: perfil.creado || Date.now()
    };
  },

  async buscarCuentaPorLogin(usuario) {
    const u = usuario.trim().toLowerCase();
    const limpio = usuario.trim().replace(/[\s-]/g, '');
    const buscar = lista => (lista || []).find(j =>
      (j.nombre && j.nombre.toLowerCase() === u) ||
      (j.telefono && j.telefono === limpio));

    const indice = await this._descargarJsonRepo(this._rutaIndiceCuentas());
    if (Array.isArray(indice)) {
      const hit = buscar(indice);
      if (hit) return hit;
    }

    try {
      const texto = await this.descargar();
      if (texto) {
        const hit = buscar(JSON.parse(texto).jugadores);
        if (hit) return hit;
      }
    } catch (e) {}
    return null;
  },

  async cargarCuenta(id) {
    if (!id) return null;
    const archivo = await this._descargarJsonRepo(this._rutaCuenta(id));
    if (archivo && archivo.id) return archivo;

    try {
      const texto = await this.descargar();
      if (!texto) return null;
      const m = JSON.parse(texto);
      const j = (m.jugadores || []).find(x => x.id === id);
      if (!j) return null;
      const partida = (m.partidas || {})[id] || null;
      return Object.assign({}, j, partida ? { partida } : {});
    } catch (e) { return null; }
  },

  async guardarCuenta(perfil, partidaSnap) {
    if (!perfil?.id || !this._tokenGitHub() || !CONFIG.repoPublicacion) return false;

    let cuenta = await this.cargarCuenta(perfil.id) || {};
    cuenta = Object.assign({}, cuenta, {
      id: perfil.id,
      nombre: perfil.nombre,
      telefono: perfil.telefono || '',
      pinHash: perfil.pinHash || cuenta.pinHash || '',
      creado: perfil.creado || cuenta.creado || Date.now()
    });
    if ('sesionToken' in perfil) cuenta.sesionToken = perfil.sesionToken;
    if (perfil.sesionT) cuenta.sesionT = perfil.sesionT;
    if (partidaSnap) {
      const prev = cuenta.partida;
      if (!prev || !prev.t || (partidaSnap.t || 0) >= (prev.t || 0)) {
        cuenta.partida = partidaSnap;
      }
    }

    const okArchivo = await this._escribirArchivoGitHub(
      this._rutaCuenta(perfil.id),
      cuenta,
      'Cuenta jugador: ' + perfil.nombre
    );

    let indice = await this._descargarJsonRepo(this._rutaIndiceCuentas());
    if (!Array.isArray(indice)) indice = [];
    const entrada = this._perfilIndice(cuenta);
    const idx = indice.findIndex(x => x.id === perfil.id);
    if (idx >= 0) indice[idx] = Object.assign({}, indice[idx], entrada);
    else indice.push(entrada);
    indice.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

    const okIndice = await this._escribirArchivoGitHub(
      this._rutaIndiceCuentas(),
      indice,
      'Índice cuentas: ' + perfil.nombre
    );

    const okMundo = await this.registrarJugadorEnMundo(perfil, {
      pinHash: cuenta.pinHash,
      sesionToken: cuenta.sesionToken,
      sesionT: cuenta.sesionT,
      partida: cuenta.partida
    });

    // El login usa índice + mundo.json; el archivo individual es opcional
    return okIndice || okMundo;
  },

  async subirPartidaCuenta(perfil, snapshot) {
    if (!perfil?.id || !snapshot) return false;
    if (!this._tokenGitHub()) return this.subirPartida(perfil, snapshot);
    return this.guardarCuenta(perfil, snapshot);
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

    for (let intento = 0; intento < 8; intento++) {
      let mundo = {
        misiones: [], tesoros: [], objetos: [], posiciones: {}, eliminados: [],
        precios: {}, itemsNuevos: [], mantenimiento: { activo: false, mensaje: '' },
        baneados: [], mensajes: [], jugadores: [], partidas: {}, cofres: [],
        correoReclamados: [], correoTienda: [],
        enemigos: [], enemigosEstado: {}, tiendasAdmin: [], combate: {}
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
      if (!mundo.enemigos) mundo.enemigos = [];
      if (!mundo.enemigosEstado) mundo.enemigosEstado = {};
      if (!mundo.tiendasAdmin) mundo.tiendasAdmin = [];

      editar(mundo);
      mundo.actualizadoEn = Date.now();

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
          if (typeof Admin !== 'undefined') {
            Admin._crudoPublicado = json;
            Admin._ultimoPublicado = json;
            try { Admin.publicado = Object.assign(Admin.publicado || {}, JSON.parse(json)); } catch (e) {}
          }
          return true;
        }
        if (r.status === 409) {
          await new Promise(res => setTimeout(res, 500 + intento * 400));
          continue;
        }
        const errTxt = await r.text().catch(() => '');
        console.warn('GitHub PUT falló:', r.status, errTxt.slice(0, 200));
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
      if (actual?.datos && !actual.datos.muerto && snapshot.datos?.muerto) return;
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
    const cuenta = await this.cargarCuenta(perfilId);
    if (cuenta?.partida) return cuenta.partida;
    try {
      const texto = await this.descargar();
      if (!texto) return null;
      const m = JSON.parse(texto);
      return (m.partidas || {})[perfilId] || null;
    } catch (e) { return null; }
  },

  async buscarJugadorPorLogin(usuario) {
    const cuenta = await this.buscarCuentaPorLogin(usuario);
    if (cuenta) return cuenta;
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
