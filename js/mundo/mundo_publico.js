// ============================================================
// MUNDO PÚBLICO — mapa compartido entre todos los jugadores
// Todo vive en datos/mundo.json (GitHub Pages, sin VPN).
// Admin escribe con token GitHub; jugadores solo leen el mismo archivo.
// ============================================================
const MundoPublico = {
  _mundoCache: null,

  puedePublicar() {
    return typeof SyncServidor !== 'undefined' && SyncServidor.puedePublicar();
  },

  usaFirebase() {
    return !!CONFIG.firebaseMundoUrl;
  },

  _baseFirebase() {
    return (CONFIG.firebaseMundoUrl || '').replace(/\/$/, '');
  },

  _urlFirebase(ruta) {
    const path = (ruta || '').replace(/^\//, '').replace(/\.json$/, '');
    return this._baseFirebase() + '/' + path + '.json';
  },

  async _firebaseGet(ruta) {
    if (!this.usaFirebase()) return null;
    try {
      const url = this._urlFirebase(ruta) + '?t=' + Date.now();
      const r = await Utilidades.fetchConTimeout(url, { cache: 'no-store' }, 8000);
      if (!r.ok) return null;
      const texto = await r.text();
      if (!texto || texto === 'null') return null;
      return JSON.parse(texto);
    } catch (e) { return null; }
  },

  async _firebasePut(ruta, data) {
    if (!this.usaFirebase()) return false;
    try {
      const r = await Utilidades.fetchConTimeout(this._urlFirebase(ruta), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }, 15000);
      return r.ok;
    } catch (e) { return false; }
  },

  _mundoVacio() {
    return {
      misiones: [], tesoros: [], objetos: [], posiciones: {}, eliminados: [],
      precios: {}, itemsNuevos: [], mantenimiento: { activo: false, mensaje: '' },
      baneados: [], mensajes: [], jugadores: [], partidas: {}, cofres: [],
      correoReclamados: [], correoTienda: [],
      enemigos: [], enemigosEstado: {}, tiendasAdmin: [], combate: {}
    };
  },

  async _leerMundoFirebase() {
    const mundo = await this._firebaseGet('mundo');
    if (!mundo) return this._mundoVacio();
    if (!mundo.jugadores) mundo.jugadores = [];
    if (!mundo.partidas) mundo.partidas = {};
    return mundo;
  },

  _indiceDesdeMundo(mundo) {
    return (mundo?.jugadores || [])
      .filter(j => j && j.id && j.nombre)
      .map(j => this._perfilIndice(j))
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  },

  async _syncIndiceFirebase(mundo) {
    return this._firebasePut('indice', this._indiceDesdeMundo(mundo));
  },

  async _guardarMundoFirebase(mundo) {
    mundo.actualizadoEn = Date.now();
    const ok = await this._firebasePut('mundo', mundo);
    if (ok) await this._syncIndiceFirebase(mundo);
    return ok;
  },

  async _actualizarMundoFirebase(editar) {
    const mundo = await this._leerMundoFirebase();
    editar(mundo);
    const ok = await this._guardarMundoFirebase(mundo);
    if (ok) {
      const json = JSON.stringify(mundo);
      if (typeof Admin !== 'undefined') {
        Admin._crudoPublicado = json;
        Admin._ultimoPublicado = json;
        try { Admin.publicado = Object.assign(Admin.publicado || {}, JSON.parse(json)); } catch (e) {}
      }
    }
    return ok;
  },

  async _guardarCuentaFirebase(perfil, partidaSnap) {
    let cuenta = await this._firebaseGet('cuentas/' + perfil.id) || {};
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
    await this._firebasePut('cuentas/' + perfil.id, cuenta);
    return this.registrarJugadorEnMundo(perfil, {
      pinHash: cuenta.pinHash,
      sesionToken: cuenta.sesionToken,
      sesionT: cuenta.sesionT,
      partida: cuenta.partida
    });
  },

  async migrarDesdeGitHubSiVacio() {
    if (!this.usaFirebase()) return false;
    const actual = await this._firebaseGet('mundo');
    if (actual && ((actual.jugadores && actual.jugadores.length) ||
      (actual.objetos && actual.objetos.length))) return false;
    let texto = null;
    if (CONFIG.repoPublicacion && CONFIG.ramaPublicacion) {
      try {
        const url = 'https://raw.githubusercontent.com/' + CONFIG.repoPublicacion + '/' +
          CONFIG.ramaPublicacion + '/datos/mundo.json?t=' + Date.now();
        const r = await Utilidades.fetchConTimeout(url, { cache: 'no-store' }, 8000);
        if (r.ok) texto = await r.text();
      } catch (e) {}
    }
    if (!texto) {
      try {
        const r = await Utilidades.fetchConTimeout('datos/mundo.json?t=' + Date.now(), { cache: 'no-store' }, 5000);
        if (r.ok) texto = await r.text();
      } catch (e) {}
    }
    if (!texto) return false;
    try {
      const mundo = JSON.parse(texto);
      const ok = await this._guardarMundoFirebase(mundo);
      if (ok && typeof Notificaciones !== 'undefined') {
        Notificaciones.mostrar('☁️ Mundo copiado a Firebase (sin tokens)', 'exito', 6000);
      }
      return ok;
    } catch (e) { return false; }
  },

  // Fuente principal: servidor Render. Respaldo: datos/mundo.json en GitHub Pages.
  urlsLectura() {
    return [];
  },

  _contarElementosMapa(m) {
    if (!m || typeof m !== 'object') return 0;
    let n = Object.keys(m.posiciones || {}).length;
    for (const campo of ['objetos', 'tesoros', 'enemigos', 'tiendasAdmin', 'misiones', 'cofres']) {
      if (Array.isArray(m[campo])) n += m[campo].length;
    }
    return n;
  },

  /** Hay elementos en el mapa (enemigos, objetos, tesoros, misiones…). */
  mundoTieneMapa(m) {
    return this._contarElementosMapa(m) > 0;
  },

  /** Mundo válido para usar como fuente (jugadores, timestamp, o mapa). */
  mundoEsValido(m) {
    if (!m || typeof m !== 'object') return false;
    if (this.mundoTieneMapa(m)) return true;
    if ((m.jugadores?.length || 0) > 0) return true;
    if ((m.eliminados?.length || 0) > 0) return true;
    return typeof m.actualizadoEn === 'number' && m.actualizadoEn > 0;
  },

  /** Para decidir si un snapshot remoto sustituye uno local con mapa. */
  mundoTieneContenido(m) {
    return this.mundoTieneMapa(m);
  },

  _elegirMejorDescarga(servidor, github) {
    if (!servidor && !github) return null;
    if (!servidor) return github;
    if (!github) return servidor;
    let mSrv = null;
    let mGh = null;
    try { mSrv = JSON.parse(servidor.texto); } catch (e) { /* */ }
    try { mGh = JSON.parse(github.texto); } catch (e) { /* */ }
    const nSrv = this._contarElementosMapa(mSrv);
    const nGh = this._contarElementosMapa(mGh);
    if (nGh > nSrv) return github;
    if (nSrv > nGh) return servidor;
    const tSrv = servidor.actualizadoEn || mSrv?.actualizadoEn || 0;
    const tGh = github.actualizadoEn || mGh?.actualizadoEn || 0;
    return tGh > tSrv ? github : servidor;
  },

  async _descargarDesdeGitHub() {
    const urls = [];
    if (CONFIG.repoPublicacion && CONFIG.ramaPublicacion) {
      urls.push('https://raw.githubusercontent.com/' + CONFIG.repoPublicacion + '/' +
        CONFIG.ramaPublicacion + '/datos/mundo.json');
    }
    urls.push('datos/mundo.json');
    for (const base of urls) {
      try {
        const r = await Utilidades.fetchConTimeout(base + '?t=' + Date.now(), { cache: 'no-store' }, 8000);
        if (!r.ok) continue;
        const texto = await r.text();
        const m = JSON.parse(texto);
        if (this.mundoEsValido(m)) {
          return { texto, actualizadoEn: m.actualizadoEn || 0 };
        }
      } catch (e) { /* siguiente URL */ }
    }
    return null;
  },

  async _descargarDesdeServidor() {
    if (!CONFIG.servidorOnline) return this._descargarDesdeGitHub();

    let servidor = null;
    try {
      const base = CONFIG.servidorOnline.replace(/\/$/, '');
      const r = await Utilidades.fetchConTimeout(base + '/api/public/mundo', { cache: 'no-store' }, 12000);
      const data = await r.json().catch(() => ({}));
      if (data.ok && data.mundo && typeof data.mundo === 'object') {
        servidor = {
          texto: JSON.stringify(data.mundo),
          actualizadoEn: data.actualizadoEn || data.mundo.actualizadoEn || 0
        };
      }
    } catch (e) { /* */ }
    if (!servidor && typeof SyncServidor !== 'undefined' && SyncServidor.obtenerMundo) {
      const data = await SyncServidor.obtenerMundo();
      if (data?.mundo && typeof data.mundo === 'object') {
        servidor = {
          texto: JSON.stringify(data.mundo),
          actualizadoEn: data.actualizadoEn || data.mundo.actualizadoEn || 0
        };
      }
    }

    if (!servidor) {
      return this._descargarDesdeGitHub();
    }
    const github = await this._descargarDesdeGitHub();
    return this._elegirMejorDescarga(servidor, github) || servidor;
  },

  _aplicarTokenDesdeTexto(texto) {
    // No cargar PAT desde mundo.json: GitHub bloquea tokens en el repo (secret scanning)
  },

  syncDisponible() {
    if (this.usaFirebase()) return true;
    return !!this._tokenGitHub();
  },

  // El login y la lectura de partida no necesitan token — solo la escritura a GitHub
  lecturaNubeOk() {
    return true;
  },

  async refrescarCuentasServidor(opts) {
    const omitirMundo = !!(opts && opts.omitirMundo);
    if (this.usaFirebase()) {
      const [mundo, indice] = await Promise.all([
        this._firebaseGet('mundo'),
        this._firebaseGet('indice')
      ]);
      const ind = Array.isArray(indice) ? indice : this._indiceDesdeMundo(mundo);
      if (mundo) this._mundoCache = JSON.stringify(mundo);
      return { indice: ind, mundo };
    }

    if (!CONFIG.servidorOnline) {
      return { indice: [], mundo: null };
    }

    let indice = [];
    try {
      const base = CONFIG.servidorOnline.replace(/\/$/, '');
      const r = await Utilidades.fetchConTimeout(base + '/api/public/cuentas', { cache: 'no-store' }, 8000);
      const data = await r.json().catch(() => ({}));
      if (data.ok && Array.isArray(data.jugadores)) {
        indice = data.jugadores.slice().sort((a, b) =>
          (a.nombre || '').localeCompare(b.nombre || ''));
      }
    } catch (e) { /* */ }

    let mundo = null;
    if (omitirMundo && this._mundoCache) {
      try { mundo = JSON.parse(this._mundoCache); } catch (e) { /* */ }
    } else {
      const remoto = await this._descargarDesdeServidor();
      if (remoto?.texto) {
        this._mundoCache = remoto.texto;
        try { mundo = JSON.parse(remoto.texto); } catch (e) {}
      }
    }

    if (!indice.length && mundo?.jugadores?.length) {
      indice = mundo.jugadores.slice().sort((a, b) =>
        (a.nombre || '').localeCompare(b.nombre || ''));
    }

    return { indice, mundo };
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
    const remoto = await this._descargarDesdeServidor();
    if (remoto?.texto) {
      this._mundoCache = remoto.texto;
      return remoto.texto;
    }
    return null;
  },

  puedeEscribir() {
    return !!(CONFIG.firebaseMundoUrl || this._tokenGitHub());
  },

  // Sube el mundo a la nube (Firebase primero; si no, GitHub API)
  async publicar(json) {
    if (CONFIG.firebaseMundoUrl) {
      try {
        const mundo = typeof json === 'string' ? JSON.parse(json) : json;
        return this._guardarMundoFirebase(mundo);
      } catch (e) { return false; }
    }
    return null;
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
    if (this.usaFirebase()) {
      if (ruta.includes('indice')) return this._firebaseGet('indice');
      if (ruta.includes('jugadores/')) {
        const id = ruta.split('/').pop().replace('.json', '');
        return this._firebaseGet('cuentas/' + id);
      }
      return null;
    }
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
    const buscarParcial = lista => {
      const parciales = (lista || []).filter(j => {
        const n = String(j.nombre || '').toLowerCase();
        return n.includes(u) || (j.telefono && String(j.telefono).includes(limpio));
      });
      if (parciales.length === 1) return parciales[0];
      return buscar(parciales);
    };

    if (CONFIG.servidorOnline) {
      try {
        const base = CONFIG.servidorOnline.replace(/\/$/, '');
        const r = await Utilidades.fetchConTimeout(
          base + '/api/public/buscar-cuenta?q=' + encodeURIComponent(usuario.trim()),
          { cache: 'no-store' },
          8000
        );
        const data = await r.json().catch(() => ({}));
        if (data.ok && data.jugador) return data.jugador;
      } catch (e) { /* */ }
    }

    const { indice, mundo } = await this.refrescarCuentasServidor().catch(() => ({ indice: null, mundo: null }));

    if (mundo && Array.isArray(mundo.jugadores)) {
      const hit = buscar(mundo.jugadores) || buscarParcial(mundo.jugadores);
      if (hit) return hit;
    }

    if (Array.isArray(indice)) {
      const hit = buscar(indice) || buscarParcial(indice);
      if (hit) return hit;
    }

    return null;
  },

  async cargarCuenta(id) {
    if (!id) return null;
    if (this.usaFirebase()) {
      const archivo = await this._firebaseGet('cuentas/' + id);
      if (archivo && archivo.id) return archivo;
      const mundo = await this._leerMundoFirebase();
      const j = (mundo.jugadores || []).find(x => x.id === id);
      if (!j) return null;
      const partida = (mundo.partidas || {})[id] || null;
      return Object.assign({}, j, partida ? { partida } : {});
    }
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

  async guardarCuenta(perfil, partidaSnap, clave) {
    if (!perfil?.id) return false;
    if (this.usaFirebase()) return this._guardarCuentaFirebase(perfil, partidaSnap);

    if (typeof SyncServidor !== 'undefined' && SyncServidor.puedePublicar()) {
      return SyncServidor.registrarCuenta(perfil, partidaSnap, clave);
    }
    return false;
  },

  async subirPartidaCuenta(perfil, snapshot) {
    if (!perfil?.id || !snapshot) return false;
    if (this.usaFirebase()) return this._guardarCuentaFirebase(perfil, snapshot);
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
    if (this.usaFirebase()) return this._actualizarMundoFirebase(editar);
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
    if (this.usaFirebase()) {
      try {
        const mundo = JSON.parse(json);
        return this._guardarMundoFirebase(mundo);
      } catch (e) { return false; }
    }
    const token = this._tokenGitHub();
    if (!token || !CONFIG.repoPublicacion) return false;
    try {
      const mundo = JSON.parse(json);
      return this.actualizarMundo(m => Object.assign(m, mundo), 'Actualizar mundo.json');
    } catch (e) { return false; }
  },

  async registrarJugadorEnMundo(perfil, extras) {
    if (!perfil) return false;
    if (this.usaFirebase()) {
      const n = perfil.nombre.trim().toLowerCase();
      const adminNom = (CONFIG.adminNombre || 'randy').toLowerCase();
      return this._actualizarMundoFirebase(mundo => {
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
      });
    }
    if (!CONFIG.repoPublicacion) return false;
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
    if (!perfil?.id || !snapshot) return false;
    if (this.usaFirebase()) {
      return this._actualizarMundoFirebase(mundo => {
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
      });
    }
    if (!this._tokenGitHub()) return false;
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
    if (this.usaFirebase()) {
      const ok = await this._guardarMundoFirebase(mundo);
      if (typeof Admin !== 'undefined') {
        Admin.publicado.correoReclamados = mundo.correoReclamados;
        Admin.datos.correoReclamadosExtra = mundo.correoReclamados;
      }
      return ok;
    }
    const json = JSON.stringify(mundo, null, 2);
    const ok = await this._putMundoGitHub(json);
    if (typeof Admin !== 'undefined') {
      Admin.publicado.correoReclamados = mundo.correoReclamados;
      Admin.datos.correoReclamadosExtra = mundo.correoReclamados;
    }
    return ok;
  },

  async registrarReclamoParcial(codigo, perfil, cantidadTomada, cantidadTotal) {
    if (!this.puedeEscribir()) return { ok: true, completo: cantidadTomada >= cantidadTotal };

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

    if (typeof Admin === 'undefined' || !this.puedeEscribir()) return true;

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
