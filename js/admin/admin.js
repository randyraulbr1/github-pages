// ============================================================
// MODO ADMINISTRADOR (solo para el dueño del juego)
// Protegido con PIN propio. Permite:
//  - Crear misiones con texto propio, condición de inventario
//    y recompensa de dinero + objetos
//  - Crear tesoros visibles o invisibles (los invisibles avisan
//    los metros aproximados si el jugador lleva el objeto elegido)
//  - Dejar objetos en el mapa para que los jugadores los recojan
//  - Organizar (mover) los pines arrastrándolos
//  - Eliminar pines del mapa
// Todo se guarda automáticamente en este dispositivo.
// ============================================================
const Admin = {
  CLAVE: 'mariel_admin_v1',
  datos: null,      // borradores locales del admin (solo en este teléfono)
  publicado: null,  // mundo oficial descargado de datos/mundo.json (lo ven todos)
  modo: null,       // null | 'colocar' | 'organizar'
  _colocacion: null,  // { tipo, valores, marcador }
  _fantasmas: [],     // marcadores temporales de tesoros base en modo admin

  // ---------- CARGA (llamar antes que tiendas/pesca/tesoros/misiones) ----------
  // Carga los borradores locales Y el mundo publicado en GitHub.
  async cargar() {
    try {
      this.datos = JSON.parse(localStorage.getItem(this.CLAVE) || 'null');
    } catch (e) { this.datos = null; }
    if (!this.datos) {
      this.datos = { pinHash: null, misiones: [], tesoros: [], objetos: [], posiciones: {}, eliminados: [] };
    }
    if (!this.datos.precios) this.datos.precios = {};
    if (!this.datos.itemsNuevos) this.datos.itemsNuevos = [];
    if (!this.datos.baneados) this.datos.baneados = [];
    if (!this.datos.mensajes) this.datos.mensajes = [];
    if (!this.datos.jugadoresExtra) this.datos.jugadoresExtra = [];
    if (!this.datos.misiones) this.datos.misiones = [];
    if (!this.datos.tesoros) this.datos.tesoros = [];
    if (!this.datos.objetos) this.datos.objetos = [];
    if (!this.datos.posiciones) this.datos.posiciones = {};
    if (!this.datos.eliminados) this.datos.eliminados = [];
    if (!this.datos.partidasExtra) this.datos.partidasExtra = {};
    if (!this.datos.jugadoresPinAdmin) this.datos.jugadoresPinAdmin = {};
    if (localStorage.getItem('mariel_cuentas_reset_v') !== '56') {
      this.datos.jugadoresExtra = [];
      this.datos.partidasExtra = {};
      this.datos.jugadoresPinAdmin = {};
      localStorage.setItem(this.CLAVE, JSON.stringify(this.datos,
        (clave, valor) => clave.startsWith('_') ? undefined : valor));
    }
    if (this.datos.verCofresOcultos === undefined) this.datos.verCofresOcultos = false;
    if (!this.datos.enemigos) this.datos.enemigos = [];
    if (!this.datos.tiendasAdmin) this.datos.tiendasAdmin = [];
    if (this.datos.moverPinJugador === undefined) {
      this.datos.moverPinJugador = !!(this.publicado && this.publicado.moverPinJugador);
    }
    if (this.datos.mantenimiento === undefined) this.datos.mantenimiento = null;

    // El mundo oficial vive en GitHub: al actualizar datos/mundo.json,
    // todos los jugadores reciben las misiones nuevas al recargar el juego
    this.publicado = { misiones: [], tesoros: [], objetos: [], posiciones: {}, eliminados: [], precios: {}, itemsNuevos: [], jugadores: [] };
    this._crudoPublicado = null;
    try {
      const texto = await MundoPublico.descargar();
      if (texto) {
        this._crudoPublicado = texto;
        this.publicado = Object.assign(this.publicado, JSON.parse(texto));
      }
    } catch (e) { /* sin conexión: se sigue con lo guardado */ }
    if (!this.publicado.precios) this.publicado.precios = {};
    if (!this.publicado.itemsNuevos) this.publicado.itemsNuevos = [];
    if (!this.publicado.baneados) this.publicado.baneados = [];
    if (!this.publicado.mensajes) this.publicado.mensajes = [];
    if (!this.publicado.mantenimiento) this.publicado.mantenimiento = { activo: false, mensaje: '' };
    if (!this.publicado.jugadores) this.publicado.jugadores = [];
    if (!this.publicado.cofres) this.publicado.cofres = [];
    if (!this.publicado.correoReclamados) this.publicado.correoReclamados = [];
    if (!this.publicado.correoTienda) this.publicado.correoTienda = [];
    if (!this.publicado.partidas) this.publicado.partidas = {};
    if (!this.publicado.enemigos) this.publicado.enemigos = [];
    if (!this.publicado.enemigosEstado) this.publicado.enemigosEstado = {};
    if (!this.publicado.tiendasAdmin) this.publicado.tiendasAdmin = [];
    if (!this.publicado.tiendasStock) this.publicado.tiendasStock = {};
    if (!this.publicado.combate) {
      this.publicado.combate = {
        danoMin: 5, danoMax: 8, nivelReferencia: 1,
        radioZona: 40, radioPersecucion: 20, curacionMs: 120000
      };
    }
    if (!this.publicado.tesorosEstado) this.publicado.tesorosEstado = {};
    if (!this.datos.tesoroIconoMapa && this.publicado.tesoroIconoMapa) {
      this.datos.tesoroIconoMapa = this.publicado.tesoroIconoMapa;
    }
    this._asegurarObjetoIconoTesoro(this.tesoroIconoMapa());
    this._aplicarTokenTelefono();

    if (!Array.isArray(this.publicado.misiones)) this.publicado.misiones = [];
    if (!Array.isArray(this.publicado.tesoros)) this.publicado.tesoros = [];
    if (!Array.isArray(this.publicado.objetos)) this.publicado.objetos = [];
    if (!this.publicado.posiciones) this.publicado.posiciones = {};
    if (!Array.isArray(this.publicado.eliminados)) this.publicado.eliminados = [];

    // Conservar posiciones del mundo publicado si el borrador local no las tiene
    if (this.publicado.posiciones) {
      for (const [id, pos] of Object.entries(this.publicado.posiciones)) {
        if (!this.datos.posiciones[id] && Array.isArray(pos) && pos.length >= 2) {
          this.datos.posiciones[id] = [pos[0], pos[1]];
        }
      }
    }

    // Aplicar al catálogo los objetos nuevos y precios globales
    const nuevosPorId = new Map();
    for (const it of this.publicado.itemsNuevos) nuevosPorId.set(it.id, it);
    for (const it of this.datos.itemsNuevos) nuevosPorId.set(it.id, it);
    Items.aplicarMundo([...nuevosPorId.values()],
      Object.assign({}, this.publicado.precios, this.datos.precios));

    // Todos los jugadores vigilan el mundo desde que arranca el juego
    this.iniciarVigilancia();

    // Admin: si hay borradores locales no publicados, subirlos en segundo plano
    if (typeof Usuarios !== 'undefined' && Usuarios.esAdministrador() && MundoPublico.puedePublicar()) {
      const localN = (this.datos.objetos || []).length + (this.datos.tesoros || []).length +
        (this.datos.misiones || []).length + (this.datos.enemigos || []).length;
      const pubN = (this.publicado.objetos || []).length + (this.publicado.tesoros || []).length +
        (this.publicado.misiones || []).length + (this.publicado.enemigos || []).length;
      const posLocal = Object.keys(this.datos.posiciones || {}).length;
      const posPub = Object.keys(this.publicado.posiciones || {}).length;
      if (localN > pubN || posLocal > posPub) {
        setTimeout(() => this._publicarParaTodos(true), 3500);
      }
    }
    this._mundoCargado = true;
    this._ultimoPublicado = this._crudoPublicado;
    if (this._crudoPublicado) this._ultimoFirmaPublicada = this._firmaMundo(this._crudoPublicado);
    this._detectarCambiosLocalesSinPublicar();
  },

  _firmaMundo(jsonStr) {
    try {
      const o = JSON.parse(jsonStr);
      delete o.actualizadoEn;
      return JSON.stringify(o);
    } catch (e) {
      return jsonStr || '';
    }
  },

  _sincronizarEstadoTrasPublicar(adminLocal, json) {
    this._ultimoPublicado = json;
    this._crudoPublicado = json;
    this._ultimoFirmaPublicada = this._firmaMundo(json);
    try {
      this.publicado = Object.assign(this.publicado || {}, JSON.parse(json));
    } catch (e) {}
    if (adminLocal && adminLocal.partidas) {
      this.publicado.partidas = Object.assign({}, this.publicado.partidas || {}, adminLocal.partidas);
      this.datos.partidasExtra = {};
    }
    this._limpiarBorradoresLocalesPublicados(['enemigos', 'misiones', 'tesoros', 'objetos', 'tiendasAdmin']);
  },

  _limpiarBorradoresLocalesPublicados(campos) {
    for (const campo of campos) {
      const pub = this.publicado[campo] || [];
      const ids = new Set(pub.map(x => x && x.id).filter(Boolean));
      if (this.datos[campo]) {
        this.datos[campo] = this.datos[campo].filter(x => !ids.has(x.id));
      }
    }
  },

  _detectarCambiosLocalesSinPublicar() {
    if (!this.esAdminJugador() || !MundoPublico.puedePublicar()) return;
    const json = this._jsonMundo();
    if (this._ultimoFirmaPublicada && this._firmaMundo(json) === this._ultimoFirmaPublicada) return;
    const localN = (this.datos.objetos || []).length + (this.datos.tesoros || []).length +
      (this.datos.misiones || []).length + (this.datos.enemigos || []).length;
    const pubN = (this.publicado.objetos || []).length + (this.publicado.tesoros || []).length +
      (this.publicado.misiones || []).length + (this.publicado.enemigos || []).length;
    const posLocal = Object.keys(this.datos.posiciones || {}).length;
    const posPub = Object.keys(this.publicado.posiciones || {}).length;
    if (localN > pubN || posLocal > posPub) {
      this._encolarPublicacion(true);
    }
  },

  // ---------- VISTA COMBINADA: publicado en GitHub + borradores locales ----------
  _combinar(publicados, locales) {
    const porId = new Map();
    for (const e of (publicados || [])) porId.set(e.id, e);
    for (const e of (locales || [])) porId.set(e.id, e);
    return [...porId.values()].filter(e => e && e.id && !this.eliminado(e.id));
  },
  misionesTodas() {
    if (this.esAdminJugador()) {
      return this._combinar(this.publicado.misiones || [], this.datos.misiones || []);
    }
    return (this.publicado.misiones || []).filter(e => !this.eliminado(e.id));
  },
  tesorosTodos() {
    if (this.esAdminJugador()) {
      return this._combinar(this.publicado.tesoros || [], this.datos.tesoros || []);
    }
    return (this.publicado.tesoros || []).filter(e => !this.eliminado(e.id));
  },
  enemigosTodos() {
    if (this.esAdminJugador()) {
      return this._combinar(this.publicado.enemigos || [], this.datos.enemigos || []);
    }
    return (this.publicado.enemigos || []).filter(e => !this.eliminado(e.id));
  },
  tiendasAdminTodas() {
    if (this.esAdminJugador()) {
      return this._combinar(this.publicado.tiendasAdmin || [], this.datos.tiendasAdmin || []);
    }
    return (this.publicado.tiendasAdmin || []).filter(e => !this.eliminado(e.id));
  },
  combateConfig() {
    return Object.assign({
      danoMin: 5, danoMax: 8, nivelReferencia: 1,
      radioZona: 40, radioPersecucion: 20, curacionMs: 120000
    }, this.publicado.combate || {}, this.datos.combate || {});
  },
  objetosTodos() {
    if (this.esAdminJugador()) {
      return this._combinar(this.publicado.objetos || [], this.datos.objetos || []);
    }
    return (this.publicado.objetos || []).filter(e => !this.eliminado(e.id));
  },

  guardar() {
    // Las claves que empiezan con "_" son estado temporal (marcadores de
    // Leaflet, avisos) y no deben guardarse
    localStorage.setItem(this.CLAVE, JSON.stringify(this.datos,
      (clave, valor) => clave.startsWith('_') ? undefined : valor));
    this._autoPublicar();
  },

  // ---------- PUBLICACIÓN AUTOMÁTICA AL EDITAR ----------
  // Si el admin tiene su clave configurada, CUALQUIER cambio suyo se sube
  // solo al archivo global (con una espera corta para agrupar cambios).
  // Los jugadores lo reciben al momento por la vigilancia del mundo.
  _autoPublicar() {
    if (!this._mundoCargado) return;
    if (!this.esAdminJugador()) return;
    if (!MundoPublico.puedePublicar()) {
      if (!this._avisoSinToken) {
        this._avisoSinToken = true;
        Notificaciones.mostrar(
          '⚠️ Sin token en este teléfono. Admin → Token GitHub para publicar mapa y cuentas.',
          'alerta', 12000
        );
      }
      return;
    }
    this._encolarPublicacion(true);
  },

  _encolarPublicacion(silencioso) {
    this._pubSilencioso = silencioso;
    this._pubPendiente = true;
    clearTimeout(this._tempPublicar);
    this._tempPublicar = setTimeout(() => this._procesarColaPublicacion(), silencioso ? 2000 : 400);
  },

  async _procesarColaPublicacion() {
    if (!this._pubPendiente || this._publicando) return;
    if (!this.esAdminJugador() || !MundoPublico.puedePublicar()) return;
    this._pubPendiente = false;
    this._publicando = true;
    try {
      const ok = await this.publicarMundo(this._pubSilencioso !== false);
      if (!ok) {
        this._intentosPub = (this._intentosPub || 0) + 1;
        if (this._intentosPub < 10) {
          this._pubPendiente = true;
          const espera = Math.min(30000, 2000 + this._intentosPub * 2500);
          clearTimeout(this._tempPublicar);
          this._tempPublicar = setTimeout(() => this._procesarColaPublicacion(), espera);
        } else if (this.esAdminJugador()) {
          Notificaciones.mostrar(
            '❌ No se pudo subir a GitHub. Revisa 🔑 Token o pulsa Sincronizar.',
            'error', 8000
          );
        }
      } else {
        this._intentosPub = 0;
      }
    } finally {
      this._publicando = false;
    }
  },

  // Sube el mapa para que TODOS los jugadores lo vean (GitHub + servidor en vivo)
  async _publicarParaTodos(silencioso) {
    if (!this._mundoCargado) return false;
    if (!this.esAdminJugador()) return false;
    const puedeGitHub = MundoPublico.puedePublicar();
    const puedeServidor = typeof SyncServidor !== 'undefined' && SyncServidor.puedePublicar();
    if (!puedeGitHub && !puedeServidor) {
      if (!silencioso) {
        Notificaciones.mostrar(
          '⚠️ Conéctate al juego (login) para publicar en vivo, o configura la 🔑 clave GitHub',
          'alerta', 12000
        );
      }
      return false;
    }
    clearTimeout(this._tempPublicar);
    return this.publicarMundo(silencioso !== false);
  },

  _tokenPublicacion() {
    if (this.datos && this.datos.tokenPublicar) return this.datos.tokenPublicar;
    return MundoPublico._tokenGitHub() || null;
  },

  CLAVE_DESBLOQUEO: 'mariel_admin_desbloqueado_v1',

  _panelDesbloqueado() {
    if (!Usuarios.perfilActivo || !Usuarios.perfilActivo.pinHash) return false;
    try {
      const d = JSON.parse(localStorage.getItem(this.CLAVE_DESBLOQUEO) || 'null');
      return d && d.id === Usuarios.perfilActivo.id && d.pinHash === Usuarios.perfilActivo.pinHash;
    } catch (e) { return false; }
  },

  _marcarPanelDesbloqueado() {
    if (!Usuarios.perfilActivo) return;
    localStorage.setItem(this.CLAVE_DESBLOQUEO, JSON.stringify({
      id: Usuarios.perfilActivo.id,
      pinHash: Usuarios.perfilActivo.pinHash
    }));
  },

  // ---------- ADMINISTRADOR (solo el jugador "randy") ----------
  esAdminJugador() {
    return typeof Usuarios !== 'undefined' && Usuarios.esAdministrador();
  },

  jugadoresGlobales() {
    if (!this.publicado) this.publicado = { jugadores: [] };
    if (!this.datos) this.datos = { jugadoresExtra: [] };
    const porId = new Map();
    for (const j of (this.publicado.jugadores || [])) {
      if (j && j.id) porId.set(j.id, j);
    }
    for (const j of (this.datos.jugadoresExtra || [])) {
      if (j && j.id) porId.set(j.id, j);
    }
    if (typeof Usuarios !== 'undefined' && Usuarios.datos && Usuarios.datos.lista) {
      for (const p of Usuarios.datos.lista) {
        if (!p || !p.id) continue;
        const prev = porId.get(p.id) || {};
        porId.set(p.id, Object.assign({}, prev, {
          id: p.id,
          nombre: p.nombre || prev.nombre,
          telefono: p.telefono || prev.telefono || '',
          creado: p.creado || prev.creado,
          pinHash: p.pinHash || prev.pinHash
        }));
      }
    }
    return [...porId.values()].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  },

  async actualizarJugadoresGlobales() {
    if (!this.publicado) this.publicado = { jugadores: [], baneados: [] };
    if (!this.datos) {
      try { this.datos = JSON.parse(localStorage.getItem(this.CLAVE) || 'null'); } catch (e) {}
    }
    try {
      const texto = await MundoPublico.descargar();
      if (texto) {
        const p = JSON.parse(texto);
        if (Array.isArray(p.jugadores)) this.publicado.jugadores = p.jugadores;
      }
    } catch (e) { /* sin conexión */ }
  },

  validarRegistro(nombre, telefono, perfilIdExcluir) {
    if (!this.publicado) this.publicado = { jugadores: [] };
    if (!this.datos) this.datos = { jugadoresExtra: [] };
    const n = nombre.trim().toLowerCase();
    const adminNom = (CONFIG.adminNombre || 'randy').toLowerCase();
    if (n === adminNom) {
      const existe = this.jugadoresGlobales().find(j => j.nombre && j.nombre.toLowerCase() === adminNom);
      if (existe && perfilIdExcluir !== existe.id) {
        return 'Ese nombre de usuario no está disponible';
      }
    }
    for (const j of this.jugadoresGlobales()) {
      if (j.nombre && j.nombre.toLowerCase() === n && j.id !== perfilIdExcluir) {
        return 'Ya existe un jugador llamado "' + nombre + '" en el juego';
      }
      if (j.telefono && telefono && j.telefono === telefono && j.id !== perfilIdExcluir) {
        return 'Ese número ya está registrado a "' + j.nombre + '"';
      }
    }
    for (const p of Usuarios.datos.lista) {
      if (perfilIdExcluir && p.id === perfilIdExcluir) continue;
      if (p.nombre.toLowerCase() === n) return 'Ya existe un jugador con ese nombre en este teléfono';
      if (telefono && p.telefono === telefono) return 'Ese número ya está en este teléfono (' + p.nombre + ')';
    }
    return null;
  },

  registrarJugador(perfil, silencioso) {
    if (!perfil || !perfil.id) return;
    if (!this.datos) {
      try { this.datos = JSON.parse(localStorage.getItem(this.CLAVE) || 'null'); } catch (e) {}
    }
    if (!this.datos) this.datos = { jugadoresExtra: [], misiones: [], tesoros: [], objetos: [], posiciones: {}, eliminados: [] };
    if (!this.datos.jugadoresExtra) this.datos.jugadoresExtra = [];
    const entrada = {
      id: perfil.id,
      nombre: perfil.nombre,
      telefono: perfil.telefono || '',
      creado: perfil.creado || Date.now(),
      pinHash: perfil.pinHash,
      sesionToken: perfil.sesionToken,
      sesionT: perfil.sesionT
    };
    const idx = this.datos.jugadoresExtra.findIndex(j => j.id === perfil.id);
    if (idx >= 0) this.datos.jugadoresExtra[idx] = entrada;
    else this.datos.jugadoresExtra.push(entrada);
    localStorage.setItem(this.CLAVE, JSON.stringify(this.datos,
      (clave, valor) => clave.startsWith('_') ? undefined : valor));
    if (!silencioso && this.esAdminJugador() && MundoPublico.puedePublicar()) {
      this._encolarPublicacion(true);
    }
  },

  _pinAdminGet(id) {
    return (this.datos.jugadoresPinAdmin || {})[id] || '';
  },

  _pinAdminSet(id, clave) {
    if (!this.datos.jugadoresPinAdmin) this.datos.jugadoresPinAdmin = {};
    if (clave) this.datos.jugadoresPinAdmin[id] = clave;
    else delete this.datos.jugadoresPinAdmin[id];
  },

  _adminAviso(texto, tipo) {
    const el = document.getElementById('admin-aviso-inline');
    if (!el) return;
    el.textContent = texto;
    el.className = 'admin-aviso-inline ' + (tipo || 'alerta');
    el.classList.remove('oculto');
    clearTimeout(this._adminAvisoTimer);
    this._adminAvisoTimer = setTimeout(() => el.classList.add('oculto'), 5500);
  },

  _adminAvisoMensaje(texto, tipo) {
    const el = document.getElementById('admin-msg-aviso');
    if (!el) return;
    el.textContent = texto;
    el.className = 'auth-aviso-mensaje ' + (tipo || 'alerta');
    el.classList.remove('oculto');
  },

  _ocultarAvisoMensaje() {
    const el = document.getElementById('admin-msg-aviso');
    if (el) el.classList.add('oculto');
  },

  _toggleCarpetaAdmin(contId, btnId) {
    const cont = document.getElementById(contId);
    const btn = document.getElementById(btnId);
    if (!cont || !btn) return;
    cont.classList.toggle('oculto');
    const abierto = !cont.classList.contains('oculto');
    const flecha = btn.querySelector('.admin-carpeta-flecha');
    if (flecha) flecha.textContent = abierto ? '▼' : '▶';
  },

  _jugadoresParaPublicar() {
    const porId = new Map();
    for (const j of (this.publicado.jugadores || [])) {
      if (j && j.id) porId.set(j.id, Object.assign({}, j));
    }
    for (const j of (this.datos.jugadoresExtra || [])) {
      if (j && j.id) porId.set(j.id, Object.assign({}, porId.get(j.id) || {}, j));
    }
    if (Usuarios.datos && Usuarios.datos.lista) {
      for (const p of Usuarios.datos.lista) {
        porId.set(p.id, Object.assign({}, porId.get(p.id) || {}, {
          id: p.id,
          nombre: p.nombre,
          telefono: p.telefono || '',
          creado: p.creado || Date.now(),
          pinHash: p.pinHash || (porId.get(p.id) && porId.get(p.id).pinHash),
          sesionToken: p.sesionToken || (porId.get(p.id) && porId.get(p.id).sesionToken),
          sesionT: p.sesionT || (porId.get(p.id) && porId.get(p.id).sesionT)
        }));
      }
    }
    return [...porId.values()].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  },

  // Posición corregida de un pin (si el admin lo movió). Muta la base en sitio
  // para que todas las referencias del módulo queden sincronizadas.
  pos(id, base) {
    if (!base || !Array.isArray(base)) return base;
    const o = (this.datos.posiciones || {})[id] || (this.publicado.posiciones || {})[id];
    if (o) { base[0] = o[0]; base[1] = o[1]; }
    return base;
  },

  _posItem(item) {
    if (!item || !item.id) return null;
    if (item.pos && Array.isArray(item.pos) && item.pos.length >= 2) {
      return this.pos(item.id, item.pos);
    }
    const o = (this.datos.posiciones || {})[item.id] || (this.publicado.posiciones || {})[item.id];
    if (o && o.length >= 2) {
      item.pos = [o[0], o[1]];
      return item.pos;
    }
    return null;
  },

  eliminado(id) {
    if ((this.publicado.eliminados || []).includes(id)) return true;
    return this.esAdminJugador() && (this.datos.eliminados || []).includes(id);
  },

  // Progreso del jugador actual sobre el contenido creado por el admin
  _progreso() {
    if (!Guardado.datos.admin) Guardado.datos.admin = { misiones: [], tesoros: [], objetos: [] };
    return Guardado.datos.admin;
  },

  // ---------- ARRANQUE (después de los módulos base) ----------
  iniciar() {
    this._progreso();
    if (this.esAdminJugador() && Usuarios.datos && Usuarios.datos.lista) {
      for (const p of Usuarios.datos.lista) this.registrarJugador(p, true);
    }
    // (las misiones del admin las gestiona el módulo Misiones)
    for (const t of this.tesorosTodos()) {
      if (!t || !t.pos) continue;
      this.pos(t.id, t.pos);
      this._prepararTesoro(t);
    }
    for (const o of this.objetosTodos()) {
      if (!o || !o.pos) continue;
      this.pos(o.id, o.pos);
      this._crearMarcadorObjeto(o);
    }

    // Botones del panel (solo si existen en la página)
    const enlazar = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };
    enlazar('admin-colocar-cofre', () => this.abrirCofreEnPanel());
    enlazar('admin-crear-enemigo', () => this.abrirFormulario('enemigo'));
    enlazar('admin-crear-tienda', () => this.abrirFormulario('tienda_admin'));
    enlazar('admin-combate-config', () => this.abrirCombateConfig());
    enlazar('btn-admin-combate-guardar', () => this._guardarCombateConfig());
    enlazar('btn-admin-cofre-panel', () => this._continuarCofrePanel());
    const chkCofreVis = document.getElementById('admin-cofre-visible');
    if (chkCofreVis) {
      chkCofreVis.addEventListener('change', () => {
        const pinPanel = document.getElementById('cofre-pin-panel');
        if (pinPanel) pinPanel.classList.toggle('oculto', chkCofreVis.checked);
      });
    }
    enlazar('admin-crear-mision', () => this.abrirFormulario('mision'));
    enlazar('admin-crear-tesoro', () => this.abrirFormulario('tesoro'));
    enlazar('admin-dejar-objeto', () => this.abrirFormulario('objeto'));
    enlazar('admin-precios', () => this.abrirFormulario('precio'));
    enlazar('admin-item-nuevo', () => this.abrirFormulario('item_nuevo'));
    enlazar('admin-mantenimiento', () => this.abrirMantenimiento());
    enlazar('admin-mensaje', () => this.abrirMensaje());
    enlazar('admin-organizar', () => this.entrarModo('organizar'));
    enlazar('admin-mover-pin', () => this.toggleMoverPinJugador());
    enlazar('admin-jugadores', () => this._listarCuentasAsync());
    enlazar('admin-crear-jugador', () => this._abrirCrearJugador());
    enlazar('btn-admin-crear-jugador-guardar', () => this._guardarCrearJugador());
    const chkInv = document.getElementById('admin-nuevo-inventario-default');
    if (chkInv) {
      chkInv.addEventListener('change', () => {
        if (!this._editorJugador?._creando) return;
        if (chkInv.checked) {
          this._editorJugador.partida = this._partidaNuevaCompleta();
          this._pintarCrearJugador();
        }
      });
    }
    enlazar('admin-carpeta-cofres', () => this._toggleCarpetaAdmin('admin-carpeta-cofres-cont', 'admin-carpeta-cofres'));
    enlazar('admin-ver-cofres-ocultos', () => this.toggleVerCofresOcultos());
    enlazar('admin-publicar', () => this.publicarMundo(false));
    enlazar('admin-clave-publicar', () => this.abrirConfiguracionClave());
    enlazar('btn-admin-clave-guardar', () => this._guardarClaveTelefono());
    enlazar('btn-admin-crear-token', () => this.abrirCrearTokenGitHub());
    enlazar('btn-admin-clave-borrar', () => this._borrarClaveTelefono());
    enlazar('btn-admin-msg-enviar', () => this._enviarMensajeUi());
    enlazar('btn-admin-mant-activar', () => this._activarMantenimientoUi());
    enlazar('btn-admin-mant-quitar', () => this._quitarMantenimientoUi());
    document.querySelectorAll('[data-volver-admin]').forEach(btn => {
      btn.addEventListener('click', () => this._volverAlPanel());
    });
    enlazar('btn-admin-guardar', () => this.guardarFormulario());
    enlazar('btn-admin-confirmar', () => this.confirmarColocacion());
    enlazar('btn-admin-salir-modo', () => this.salirModo());
    enlazar('btn-admin-editor-guardar', () => this._guardarEditorJugador());
    enlazar('btn-admin-entrar-jugador', () => this._entrarComoJugador());
    enlazar('admin-ban-30m', () => this._aplicarBan(30 * 60000));
    enlazar('admin-ban-1h', () => this._aplicarBan(3600000));
    enlazar('admin-ban-1d', () => this._aplicarBan(86400000));
    enlazar('admin-ban-1sem', () => this._aplicarBan(604800000));
    enlazar('admin-ban-1mes', () => this._aplicarBan(2592000000));
    enlazar('admin-ban-perm', () => this._aplicarBan(0));
    enlazar('admin-ban-quitar', () => this._aplicarBan(null));
    this._actualizarEtiquetaMoverPin();
    this._actualizarEtiquetaVerCofresOcultos();
    if (typeof Cofres !== 'undefined') {
      Cofres.verOcultos = !!this.datos.verCofresOcultos;
      Cofres._pintarTodos();
    }
    if (typeof GPS !== 'undefined') GPS._actualizarArrastre();
  },

  puedeMoverPinJugador() {
    return this.esAdminJugador() && !!this.datos.moverPinJugador;
  },

  toggleMoverPinJugador() {
    if (!this.esAdminJugador()) return;
    this.datos.moverPinJugador = !this.datos.moverPinJugador;
    this.guardar();
    this._actualizarEtiquetaMoverPin();
    if (typeof GPS !== 'undefined') GPS._actualizarArrastre();
    Notificaciones.mostrar(
      this.datos.moverPinJugador
        ? '🎯 Puedes arrastrar el pin azul del jugador'
        : '🎯 Pin del jugador bloqueado (solo GPS 📍)',
      'info', 4000
    );
  },

  _actualizarEtiquetaMoverPin() {
    const el = document.getElementById('admin-mover-pin-texto');
    if (!el) return;
    const on = !!this.datos.moverPinJugador;
    el.textContent = 'Mover pin: ' + (on ? 'ON' : 'OFF');
    const btn = document.getElementById('admin-mover-pin');
    if (btn) btn.classList.toggle('admin-toggle-on', on);
  },

  toggleVerCofresOcultos() {
    if (!this.esAdminJugador()) return;
    this.datos.verCofresOcultos = !this.datos.verCofresOcultos;
    this.guardar();
    if (typeof Cofres !== 'undefined') {
      Cofres.verOcultos = !!this.datos.verCofresOcultos;
      Cofres._pintarTodos();
    }
    this._actualizarEtiquetaVerCofresOcultos();
    Notificaciones.mostrar(
      this.datos.verCofresOcultos
        ? '👻 Cofres ocultos visibles en el mapa'
        : '👻 Cofres ocultos ocultos de nuevo',
      'info', 4000
    );
  },

  _actualizarEtiquetaVerCofresOcultos() {
    const el = document.getElementById('admin-ver-cofres-ocultos-texto');
    if (!el) return;
    const on = !!this.datos.verCofresOcultos;
    el.textContent = 'Ver ocultos: ' + (on ? 'ON' : 'OFF');
    const btn = document.getElementById('admin-ver-cofres-ocultos');
    if (btn) btn.classList.toggle('admin-toggle-on', on);
  },

  // ---------- VIGILANCIA DEL MUNDO ----------
  // Cada 5 segundos relee el mundo y pinta lo nuevo en el mapa.
  iniciarVigilancia() {
    if (this._vigilanciaActiva) return;
    this._vigilanciaActiva = true;
    setInterval(() => this._revisarActualizacion(), 8000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this._revisarActualizacion();
    });
  },

  async _revisarActualizacion() {
    try {
      const texto = await MundoPublico.descargar();
      if (!texto) return;
      if (this._crudoPublicado === null) { this._crudoPublicado = texto; return; }
      if (texto === this._crudoPublicado) {
        if (typeof Usuarios !== 'undefined') Usuarios.verificarSesionRemota();
        if (typeof Guardado !== 'undefined' && Usuarios.perfilActivo) {
          Guardado.sincronizarNube(true).catch(() => {});
        }
        return;
      }
      if (this._crudoPublicado && this._firmaMundo(texto) === this._firmaMundo(this._crudoPublicado)) {
        this._crudoPublicado = texto;
        return;
      }
      this._aplicarMundoRemoto(texto);
    } catch (e) { /* sin conexión: se intenta en el próximo ciclo */ }
  },

  // Aplica el mundo publicado sin recargar toda la página
  _aplicarMundoRemoto(texto) {
    const idsObjetosAntes = new Set(this.objetosTodos().map(o => o.id));
    const idsTesorosAntes = new Set(this.tesorosTodos().map(t => t.id));
    const idsMisionesAntes = new Set(this.misionesTodas().map(m => m.id));
    const eliminadosAntes = new Set(this.publicado.eliminados || []);

    this._crudoPublicado = texto;
    try {
      this.publicado = Object.assign({
        misiones: [], tesoros: [], objetos: [], posiciones: {}, eliminados: [],
        precios: {}, itemsNuevos: [], baneados: [], mensajes: [], jugadores: [], cofres: [],
        correoReclamados: [],
        correoTienda: [],
        partidas: {},
        enemigos: [],
        enemigosEstado: {},
        tiendasAdmin: [],
        mantenimiento: { activo: false, mensaje: '' }
      }, JSON.parse(texto));
    } catch (e) { return; }

    if (!this.publicado.precios) this.publicado.precios = {};
    if (!this.publicado.itemsNuevos) this.publicado.itemsNuevos = [];
    if (!this.publicado.baneados) this.publicado.baneados = [];
    if (!this.publicado.mensajes) this.publicado.mensajes = [];
    if (!this.publicado.mantenimiento) this.publicado.mantenimiento = { activo: false, mensaje: '' };
    if (!this.publicado.tesorosEstado) this.publicado.tesorosEstado = {};
    if (!this.publicado.tiendasStock) this.publicado.tiendasStock = {};
    if (!this.publicado.enemigos) this.publicado.enemigos = [];
    if (!this.publicado.enemigosEstado) this.publicado.enemigosEstado = {};
    if (!this.publicado.tiendasAdmin) this.publicado.tiendasAdmin = [];

    const nuevosPorId = new Map();
    for (const it of this.publicado.itemsNuevos) nuevosPorId.set(it.id, it);
    for (const it of this.datos.itemsNuevos) nuevosPorId.set(it.id, it);
    Items.aplicarMundo([...nuevosPorId.values()],
      Object.assign({}, this.publicado.precios, this.datos.precios));

    this._sincronizarMapaRemoto(idsObjetosAntes, idsTesorosAntes, idsMisionesAntes, eliminadosAntes);

    if (typeof Cofres !== 'undefined') Cofres._pintarTodos();
    if (typeof Enemigos !== 'undefined') Enemigos._recargar();
    if (typeof Tiendas !== 'undefined' && Tiendas.refrescarAdmin) Tiendas.refrescarAdmin();
    if (typeof Usuarios !== 'undefined') Usuarios.verificarSesionRemota();
    if (this.publicado.moverPinJugador !== undefined) {
      this.datos.moverPinJugador = !!this.publicado.moverPinJugador;
      this._actualizarEtiquetaMoverPin();
      if (typeof GPS !== 'undefined') GPS._actualizarArrastre();
    }

    this.refrescarVisibles();
    this.mostrarMensajes();
    if (typeof Notificaciones !== 'undefined') Notificaciones._actualizarBadge();
    this._aplicarRevivirDesdeNube();
  },

  _jugadorEstaMuerto(pd, vida) {
    if (pd && pd.muerto) return true;
    return vida != null && vida <= 0;
  },

  _vidaMaximaJugador(partida) {
    const nivel = partida?.nivel ?? 1;
    return (typeof Vida !== 'undefined' && Vida.vidaMaxima)
      ? Vida.vidaMaxima(nivel) : CONFIG.vidaMaxima;
  },

  _aplicarRevivirDesdeNube() {
    if (typeof Usuarios === 'undefined' || !Usuarios.perfilActivo) return;
    if (typeof Guardado === 'undefined' || !Guardado.datos) return;
    const muertoLocal = Guardado.datos.muerto ||
      (typeof Vida !== 'undefined' && Vida.estaMuerto && Vida.estaMuerto());
    if (!muertoLocal) return;

    const snap = (this.publicado.partidas || {})[Usuarios.perfilActivo.id];
    if (!snap?.datos || snap.datos.muerto) return;
    if ((snap.t || 0) <= (Guardado.datos.nubeT || 0)) return;

    Guardado._aplicarSnapshot(snap.datos);
    Guardado.datos.nubeT = snap.t;
    Guardado.guardarAhora();
    if (typeof Vida !== 'undefined' && typeof Vida.revivir === 'function') {
      Vida.revivir(snap.datos.vida);
    }
  },

  async _revivirJugador(perfil) {
    const j = typeof perfil === 'string'
      ? this.jugadoresGlobales().find(x => x.id === perfil)
      : perfil;
    if (!j) return;

    const partida = await this._obtenerPartidaJugador(j);
    if (!this._jugadorEstaMuerto(partida, partida.vida)) {
      this._adminAviso(j.nombre + ' no está muerto');
      return;
    }

    partida.vida = this._vidaMaximaJugador(partida);
    partida.muerto = false;
    if (partida.hambre == null || partida.hambre < CONFIG.hambreInicial) {
      partida.hambre = CONFIG.hambreInicial;
    }

    await this._guardarPartidaJugador(j, partida);
    Notificaciones.mostrar('❤️ ' + j.nombre + ' revivido', 'exito', 5000);
    this._listarCuentasAsync();
  },

  _sincronizarMapaRemoto(idsObjetosAntes, idsTesorosAntes, idsMisionesAntes, eliminadosAntes) {
    const idsObjetosAhora = new Set(this.objetosTodos().map(o => o.id));
    const idsTesorosAhora = new Set(this.tesorosTodos().map(t => t.id));
    const idsMisionesAhora = new Set(this.misionesTodas().map(m => m.id));

    for (const id of this.publicado.eliminados) {
      if (!eliminadosAntes.has(id)) this._quitarDelMapa(id);
    }
    for (const id of idsObjetosAntes) {
      if (!idsObjetosAhora.has(id) || this.eliminado(id)) this._quitarDelMapa(id);
    }
    for (const id of idsTesorosAntes) {
      if (!idsTesorosAhora.has(id) || this.eliminado(id)) this._quitarDelMapa(id);
    }
    for (const id of idsMisionesAntes) {
      if (!idsMisionesAhora.has(id) || this.eliminado(id)) this._quitarDelMapa(id);
    }

    if (typeof Misiones !== 'undefined') {
      for (const m of this.misionesTodas()) {
        if (this.eliminado(m.id)) continue;
        this.pos(m.id, m.pos);
        const existente = Misiones.lista.find(x => x.id === m.id);
        if (!existente) {
          Misiones.agregarAdmin(m);
        } else {
          existente.pos = m.pos.slice();
          if (Misiones._marcadores[m.id]) Misiones._marcadores[m.id].setLatLng(m.pos);
          this._actualizarPuntoEnMapa(m.id, m.pos);
        }
      }
    }

    for (const t of this.tesorosTodos()) {
      if (this.eliminado(t.id)) continue;
      this.pos(t.id, t.pos);
      if (!idsTesorosAntes.has(t.id)) {
        this._prepararTesoro(t);
      } else {
        this._actualizarPuntoEnMapa(t.id, t.pos);
        if (t._marcador) t._marcador.setLatLng(t.pos);
        if (GPS.posicion) this._revisarTesoro(t, Utilidades.distanciaMetros(GPS.posicion, t.pos));
      }
    }

    for (const o of this.objetosTodos()) {
      if (this.eliminado(o.id)) continue;
      this.pos(o.id, o.pos);
      if (!idsObjetosAntes.has(o.id)) {
        this._crearMarcadorObjeto(o);
      } else {
        this._actualizarPuntoEnMapa(o.id, o.pos);
        if (o._marcador) o._marcador.setLatLng(o.pos);
        this._revisarObjeto(o);
      }
    }
  },

  _actualizarPuntoEnMapa(id, pos) {
    const p = Mapa.puntosInteractivos.find(x => x.id === id);
    if (!p || !pos) return;
    p.posicion[0] = pos[0];
    p.posicion[1] = pos[1];
    if (p.marcador && p.marcador.setLatLng) p.marcador.setLatLng(pos);
  },

  _quitarDelMapa(id) {
    for (const o of this.objetosTodos()) {
      if (o.id !== id || !o._marcador) continue;
      o._marcador.remove();
      o._marcador = null;
    }
    for (const t of this.tesorosTodos()) {
      if (t.id !== id) continue;
      if (t._marcador) { t._marcador.remove(); t._marcador = null; }
    }
    if (typeof Misiones !== 'undefined' && Misiones._marcadores[id]) {
      Misiones._marcadores[id].remove();
      delete Misiones._marcadores[id];
      if (Misiones._lineas[id]) { Misiones._lineas[id].remove(); delete Misiones._lineas[id]; }
    }
    const i = Mapa.puntosInteractivos.findIndex(p => p.id === id);
    if (i >= 0) Mapa.puntosInteractivos.splice(i, 1);
  },

  // Admin entra directo al panel (sin contraseña en el menú).
  async solicitarAcceso() {
    if (!this.esAdminJugador()) return;
    this._marcarPanelDesbloqueado();
    this._actualizarEtiquetaClave();
    document.getElementById('ventana-admin').classList.remove('oculto');
  },

  _mostrarPanelDerecho(vistaId, titulo) {
    document.querySelectorAll('.admin-vista').forEach(v => v.classList.add('oculto'));
    const vista = document.getElementById(vistaId);
    if (vista) vista.classList.remove('oculto');
    const tit = document.getElementById('admin-panel-titulo');
    if (tit) tit.textContent = titulo || '';
    document.getElementById('admin-panel-derecho').classList.remove('oculto');
    document.getElementById('ventana-admin').classList.remove('oculto');
  },

  _ocultarPanelDerecho() {
    document.getElementById('admin-panel-derecho').classList.add('oculto');
    document.querySelectorAll('.admin-vista').forEach(v => v.classList.add('oculto'));
  },

  _volverAlPanel() {
    if (this._editorJugador?._creando) this._editorJugador = null;
    this._ocultarPanelDerecho();
    document.getElementById('btn-admin-guardar').style.display = '';
    document.getElementById('ventana-admin').classList.remove('oculto');
  },

  // ---------- FORMULARIOS ----------
  _opcionesItems(incluirNinguno) {
    let html = incluirNinguno ? '<option value="">(ninguno)</option>' : '';
    for (const id of this._idsCatalogoCompleto()) {
      const it = Items.seguro(id);
      html += '<option value="' + id + '">' + it.icono + ' ' + it.nombre + '</option>';
    }
    return html;
  },

  EMOJIS_OBJETO: [
    '📦','🍎','🍞','🥖','🧀','🍖','🍗','🥩','🐟','🦐','🍤','🌮','🍕','🍔','🌭','🥪',
    '🍹','🍺','🍷','☕','🧃','💧','🧪','💊','🩹','🔧','🔨','⚙️','🔑','🗝️','💎','💰',
    '🪙','📜','📋','📝','🗺️','🧭','🔦','🕯️','🪓','⛏️','🎣','🪝','🧲','📡','🔫','🏹',
    '🛡️','⚔️','🗡️','🧨','💣','🎁','🧰','👑','🪖','🥾','👢','🧤','🎒','🧳','🪴','🌿',
    '🌺','🍀','🌵','🐚','🦀','🐙','🦞','🐠','🐡','⭐','🔥','❄️','⚡','🌙','☀️','🌴'
  ],

  _rejillaEmojisHtml() {
    let h = '<div class="admin-emoji-rejilla" id="admin-emoji-rejilla">';
    for (const e of this.EMOJIS_OBJETO) {
      h += '<button type="button" class="admin-emoji-btn" data-emoji="' + e + '">' + e + '</button>';
    }
    h += '</div>';
    return h;
  },

  _enlazarEmojisObjeto() {
    const inp = document.getElementById('af-icono');
    const rej = document.getElementById('admin-emoji-rejilla');
    if (!inp || !rej) return;
    rej.querySelectorAll('.admin-emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        inp.value = btn.dataset.emoji;
        rej.querySelectorAll('.admin-emoji-btn').forEach(b => b.classList.remove('sel'));
        btn.classList.add('sel');
      });
    });
  },

  abrirFormulario(tipo) {
    const campos = document.getElementById('admin-form-campos');
    let titulo = 'Crear';
    this._colocacion = { tipo, valores: null, marcador: null };

    if (tipo === 'mision') {
      titulo = '📜 Crear misión';
      this._misionRecompensas = [];
      campos.innerHTML =
        this._campoTexto('af-titulo', 'Título de la misión', 'Ej: El encargo del pescador') +
        this._campoArea('af-texto', 'Texto que verá el jugador', 'Ej: Tráeme 5 sardinas al muelle viejo...') +
        '<div class="campo-doble">' +
          this._campoSelect('af-req-item', 'Objeto requerido (condición)', this._opcionesItems(true)) +
          this._campoNumero('af-req-cant', 'Cantidad', 1) +
        '</div>' +
        '<div class="campo-caja"><input type="checkbox" id="af-consumir"><label for="af-consumir">Quitar esos objetos al cumplir (es una entrega)</label></div>' +
        '<div class="campo-doble">' +
          this._campoNumero('af-dinero', 'Recompensa en dinero $', 50) +
          this._campoNumero('af-xp', 'Experiencia (XP)', 25) +
        '</div>' +
        '<div class="admin-editor-horizontal admin-mision-horizontal">' +
          '<div class="admin-editor-columna">' +
            '<div class="admin-editor-seccion">Recompensas (solo al completar) — arrastra desde ADM →</div>' +
            '<div id="admin-mision-recompensas" class="admin-rejilla-inventario admin-rejilla-fija"></div>' +
          '</div>' +
          '<div class="admin-editor-columna admin-editor-columna-adm">' +
            '<div class="admin-editor-seccion">ADM ∞</div>' +
            '<div id="admin-mision-infinito" class="admin-rejilla-infinito"></div>' +
          '</div>' +
        '</div>';
      setTimeout(() => {
        this._pintarMisionRecompensas();
        this._enlazarAdmRejilla('admin-mision-infinito', this._misionRecompensas, 'admin-mision-recompensas', 'mision-recompensa-slot');
      }, 0);
    } else if (tipo === 'enemigo') {
      titulo = '👹 Crear enemigo';
      const nom = Enemigos.NOMBRES[Math.floor(Math.random() * Enemigos.NOMBRES.length)];
      const ico = Enemigos.ICONOS[Math.floor(Math.random() * Enemigos.ICONOS.length)];
      campos.innerHTML =
        this._campoTexto('af-nombre', 'Nombre', nom) +
        '<div class="campo-admin"><label>Icono</label>' +
        '<input id="af-icono-enemigo" maxlength="4" value="' + ico + '">' +
        this._rejillaEmojisHtml().replace('admin-emoji-rejilla', 'admin-emoji-rejilla admin-emoji-enemigo') + '</div>' +
        '<div class="campo-doble">' +
          this._campoNumero('af-vida', 'Vida', 60) +
          this._campoNumero('af-nivel-enemigo', 'Nivel (1–100)', 1) +
        '</div>' +
        '<div class="campo-doble">' +
          this._campoNumero('af-dano-min', 'Daño mínimo', 8) +
          this._campoNumero('af-dano-max', 'Daño máximo', 14) +
        '</div>' +
        '<div class="campo-doble">' +
          this._campoNumero('af-xp', 'XP al derrotarlo', 30) +
          this._campoNumero('af-dinero', 'Dinero extra $', 0) +
        '</div>' +
        this._campoRespawn('af-enemigo-respawn', 'Vuelve a salir', 0) +
        '<div class="admin-editor-horizontal admin-mision-horizontal">' +
          '<div class="admin-editor-columna">' +
            '<div class="admin-editor-seccion">Botín al derrotarlo — arrastra ADM →</div>' +
            '<div id="admin-enemigo-recompensas" class="admin-rejilla-inventario admin-rejilla-fija"></div>' +
          '</div>' +
          '<div class="admin-editor-columna admin-editor-columna-adm">' +
            '<div class="admin-editor-seccion">ADM ∞</div>' +
            '<div id="admin-enemigo-infinito" class="admin-rejilla-infinito"></div>' +
          '</div>' +
        '</div>';
      this._enemigoRecompensas = [];
      setTimeout(() => {
        const inp = document.getElementById('af-icono-enemigo');
        const rej = document.querySelector('.admin-emoji-enemigo');
        if (rej && inp) {
          rej.querySelectorAll('.admin-emoji-btn').forEach(btn => {
            btn.addEventListener('click', () => { inp.value = btn.dataset.emoji; });
          });
        }
        this._pintarRejillaGenerica('admin-enemigo-recompensas', this._enemigoRecompensas, 'enemigo-rec-slot');
        this._enlazarAdmRejilla('admin-enemigo-infinito', this._enemigoRecompensas, 'admin-enemigo-recompensas', 'enemigo-rec-slot');
      }, 0);
    } else if (tipo === 'tienda_admin') {
      titulo = '🏪 Crear tienda';
      this._tiendaAdminSlots = [null];
      campos.innerHTML =
        this._campoTexto('af-nombre', 'Nombre de la tienda', 'Ej: Bodega del puerto') +
        this._campoTexto('af-icono-tienda', 'Icono en el mapa', '🏪') +
        '<div class="admin-editor-horizontal admin-mision-horizontal">' +
          '<div class="admin-editor-columna">' +
            '<div class="admin-editor-seccion">Artículos — toca o arrastra ADM → (aparece otra casilla)</div>' +
            '<div id="admin-tienda-rejilla" class="admin-rejilla-inventario admin-rejilla-fija admin-tienda-rejilla"></div>' +
            '<div id="admin-tienda-detalle"></div>' +
          '</div>' +
          '<div class="admin-editor-columna admin-editor-columna-adm">' +
            '<div class="admin-editor-seccion">ADM ∞ — un toque añade</div>' +
            '<div id="admin-tienda-infinito" class="admin-rejilla-infinito"></div>' +
          '</div>' +
        '</div>';
      setTimeout(() => {
        this._pintarTiendaRejillaDinamica();
        this._pintarInventarioInfinito(document.getElementById('admin-tienda-infinito'), (id, cel) => {
          cel.addEventListener('pointerdown', ev => this._arrastreAdmATienda(ev, id));
        });
      }, 0);
    } else if (tipo === 'tesoro') {
      titulo = '🎁 Crear tesoro';
      this._tesoroItems = [];
      const iconoDef = this.tesoroIconoMapa();
      campos.innerHTML =
        this._campoSelect('af-visible', 'Tipo de tesoro',
          '<option value="visible">Visible en el mapa</option><option value="invisible">Invisible (avisa metros aproximados)</option>') +
        this._campoSelect('af-item-ver', 'Objeto necesario para detectarlo', this._opcionesItems(true)) +
        '<div class="campo-doble">' +
          this._campoTexto('af-icono-mapa', 'Icono en el mapa (variable global)', iconoDef) +
          this._campoNumero('af-nivel-min', 'Nivel mínimo del jugador', 1) +
        '</div>' +
        '<div class="campo-doble">' +
          this._campoNumero('af-dinero', 'Dinero extra $', 0) +
        '</div>' +
        this._campoRespawn('af-tesoro-respawn', 'Vuelve a salir', 0) +
        '<div class="admin-editor-horizontal admin-mision-horizontal">' +
          '<div class="admin-editor-columna">' +
            '<div class="admin-editor-seccion">Contenido (6 casillas) — toca o arrastra ADM →</div>' +
            '<div id="admin-tesoro-rejilla" class="admin-rejilla-inventario admin-rejilla-fija"></div>' +
          '</div>' +
          '<div class="admin-editor-columna admin-editor-columna-adm">' +
            '<div class="admin-editor-seccion">ADM ∞</div>' +
            '<div id="admin-tesoro-infinito" class="admin-rejilla-infinito"></div>' +
          '</div>' +
        '</div>';
      setTimeout(() => {
        this._pintarRejillaGenerica('admin-tesoro-rejilla', this._tesoroItems, 'tesoro-slot');
        this._enlazarAdmRejilla('admin-tesoro-infinito', this._tesoroItems, 'admin-tesoro-rejilla', 'tesoro-slot');
      }, 0);
    } else if (tipo === 'objeto') {
      titulo = '📦 Dejar objeto';
      this._objetoItems = [];
      campos.innerHTML =
        '<div class="admin-editor-horizontal admin-mision-horizontal">' +
          '<div class="admin-editor-columna">' +
            '<div class="admin-editor-seccion">Objetos en el mapa — arrastra ADM →</div>' +
            '<div id="admin-objeto-rejilla" class="admin-rejilla-inventario admin-rejilla-fija"></div>' +
          '</div>' +
          '<div class="admin-editor-columna admin-editor-columna-adm">' +
            '<div class="admin-editor-seccion">ADM ∞</div>' +
            '<div id="admin-objeto-infinito" class="admin-rejilla-infinito"></div>' +
          '</div>' +
        '</div>' +
        this._campoRespawn('af-reaparece', 'Vuelve a salir', 0);
      setTimeout(() => {
        this._pintarRejillaGenerica('admin-objeto-rejilla', this._objetoItems, 'objeto-slot');
        this._enlazarAdmRejilla('admin-objeto-infinito', this._objetoItems, 'admin-objeto-rejilla', 'objeto-slot');
      }, 0);
    } else if (tipo === 'precio') {
      titulo = '💲 Cambiar precio global';
      campos.innerHTML =
        this._campoSelect('af-item', 'Objeto', this._opcionesItems(false)) +
        this._campoNumero('af-precio', 'Precio nuevo (entre 5 y 5000)', 100) +
        '<div class="campo-caja">El precio cambia para TODOS al publicar el mundo</div>';
      document.getElementById('btn-admin-guardar').textContent = 'Guardar precio';
    } else {
      titulo = '➕ Crear objeto nuevo';
      campos.innerHTML =
        this._campoTexto('af-nombre', 'Nombre del objeto', 'Ej: Ron añejo') +
        '<div class="campo-admin"><label>Icono — elige un emoji</label>' +
        '<input id="af-icono" maxlength="4" placeholder="Ej: 🍹" readonly>' +
        this._rejillaEmojisHtml() + '</div>' +
        '<div class="campo-doble">' +
          this._campoNumero('af-precio', 'Precio (5 a 5000)', 50) +
          this._campoNumero('af-cura', 'Cura vida (0 = no se usa)', 0) +
        '</div>' +
        this._campoTexto('af-desc', 'Descripción', 'Ej: Reserva especial del puerto');
      document.getElementById('btn-admin-guardar').textContent = 'Crear objeto';
      setTimeout(() => this._enlazarEmojisObjeto(), 0);
    }
    if (tipo === 'mision' || tipo === 'tesoro' || tipo === 'objeto' || tipo === 'enemigo' || tipo === 'tienda_admin') {
      document.getElementById('btn-admin-guardar').textContent = 'Continuar → colocar en el mapa';
    }
    document.getElementById('btn-admin-guardar').style.display = '';
    this._mostrarPanelDerecho('admin-vista-form', titulo);
  },

  _campoTexto(id, etiqueta, marcador) {
    return '<div class="campo-admin"><label for="' + id + '">' + etiqueta + '</label>' +
      '<input id="' + id + '" maxlength="60" placeholder="' + marcador + '"></div>';
  },
  _campoArea(id, etiqueta, marcador) {
    return '<div class="campo-admin"><label for="' + id + '">' + etiqueta + '</label>' +
      '<textarea id="' + id + '" maxlength="300" placeholder="' + marcador + '"></textarea></div>';
  },
  _campoNumero(id, etiqueta, valor) {
    return '<div class="campo-admin"><label for="' + id + '">' + etiqueta + '</label>' +
      '<input id="' + id + '" type="number" inputmode="numeric" min="0" value="' + valor + '"></div>';
  },
  _campoSelect(id, etiqueta, opciones) {
    return '<div class="campo-admin"><label for="' + id + '">' + etiqueta + '</label>' +
      '<select id="' + id + '">' + opciones + '</select></div>';
  },

  _opcionesRespawnHtml(valor) {
    const opts = [
      { v: 0, t: 'Solo una vez' },
      { v: 5, t: '5 minutos' },
      { v: 30, t: '30 minutos' },
      { v: 60, t: '1 hora' },
      { v: 1440, t: '1 día' }
    ];
    return opts.map(o =>
      '<option value="' + o.v + '"' + (Number(valor) === o.v ? ' selected' : '') + '>' + o.t + '</option>'
    ).join('');
  },

  _campoRespawn(id, etiqueta, valor) {
    return this._campoSelect(id, etiqueta, this._opcionesRespawnHtml(valor));
  },

  _pintarRejillaGenerica(rejId, arr, claseSlot) {
    const rej = document.getElementById(rejId);
    if (!rej) return;
    while (arr.length < 6) arr.push(null);
    rej.innerHTML = '';
    arr.forEach((sl, i) => {
      const cel = document.createElement('div');
      cel.className = 'slot admin-slot-jugador ' + claseSlot;
      cel.dataset.indice = i;
      if (sl) {
        const item = Items.seguro(sl.id);
        cel.textContent = item.icono;
        const cant = document.createElement('span');
        cant.className = 'cantidad';
        cant.textContent = sl.cantidad || 1;
        cel.appendChild(cant);
        cel.title = item.nombre;
      }
      cel.addEventListener('pointerdown', ev => this._slotRejillaArrastre(ev, arr, rejId, i, claseSlot));
      rej.appendChild(cel);
    });
  },

  _tapAdmARejilla(itemId, arr, rejId, claseSlot) {
    while (arr.length < 6) arr.push(null);
    const max = CONFIG.maxPila || 10;
    const mismo = arr.findIndex(s => s && s.id === itemId);
    if (mismo >= 0) {
      arr[mismo].cantidad = Math.min(max, (arr[mismo].cantidad || 1) + 1);
    } else {
      const vacio = arr.findIndex(s => !s);
      if (vacio < 0) {
        Notificaciones.mostrar('Rejilla llena (máx. 6 casillas)', 'alerta', 2500);
        return;
      }
      arr[vacio] = { id: itemId, cantidad: 1 };
    }
    this._pintarRejillaGenerica(rejId, arr, claseSlot);
  },

  _arrastreAdmARejilla(ev, itemId, arr, rejId, claseSlot) {
    const icono = Items.seguro(itemId).icono;
    this._iniciarArrastreFantasma(ev, {
      icono,
      selectorDestino: '.' + claseSlot,
      onTap: () => this._tapAdmARejilla(itemId, arr, rejId, claseSlot),
      onSoltar: (bajo) => {
        const slot = bajo?.closest?.('.' + claseSlot);
        if (slot) {
          const idx = parseInt(slot.dataset.indice, 10);
          arr[idx] = { id: itemId, cantidad: 1 };
        } else {
          const vacio = arr.findIndex(s => !s);
          if (vacio >= 0) arr[vacio] = { id: itemId, cantidad: 1 };
        }
        this._pintarRejillaGenerica(rejId, arr, claseSlot);
      }
    });
  },

  _enlazarAdmRejilla(infinitoId, arr, rejId, claseSlot) {
    const inf = document.getElementById(infinitoId);
    if (!inf) return;
    this._pintarInventarioInfinito(inf, (id, cel) => {
      cel.addEventListener('pointerdown', ev => this._arrastreAdmARejilla(ev, id, arr, rejId, claseSlot));
    });
  },

  tesoroIconoMapa() {
    return (this.datos.tesoroIconoMapa || this.publicado.tesoroIconoMapa || '🎁').trim() || '🎁';
  },

  _asegurarObjetoIconoTesoro(icono) {
    const id = 'marcador_tesoro_mapa';
    if (!Items.obtener(id)) {
      const nuevo = {
        id, nombre: 'Icono mapa tesoro', icono: icono || '🎁',
        precio: 0, tipo: 'especial', desc: 'Marcador de tesoros en el mapa'
      };
      this.datos.itemsNuevos = this.datos.itemsNuevos || [];
      if (!this.datos.itemsNuevos.find(x => x.id === id)) {
        this.datos.itemsNuevos.push(nuevo);
        Items.aplicarMundo([nuevo], {});
      }
    }
    return id;
  },

  combateRangoNivel(nivel) {
    const cfg = this.combateConfig();
    const ref = Math.max(1, cfg.nivelReferencia || 1);
    const f = Math.max(1, nivel) / ref;
    const lo = Math.max(1, Math.round(cfg.danoMin * f));
    const hi = Math.max(lo, Math.round(cfg.danoMax * f));
    return { lo, hi };
  },

  _pintarGraficaCombate() {
    const cont = document.getElementById('admin-combate-grafica');
    if (!cont) return;
    let html = '<div class="combate-grafica-titulo">Daño por nivel (1–100): tirada aleatoria entre mín y máx</div>' +
      '<div class="combate-grafica-barras combate-grafica-scroll">';
    let maxHi = 1;
    const datos = [];
    for (let n = 1; n <= 100; n++) {
      const r = this.combateRangoNivel(n);
      maxHi = Math.max(maxHi, r.hi);
      datos.push({ n, r });
    }
    for (const d of datos) {
      const pct = Math.round((d.r.hi / maxHi) * 100);
      html += '<div class="combate-graf-fila"><span class="combate-graf-nv">Nv ' + d.n + '</span>' +
        '<div class="combate-graf-barra"><div class="combate-graf-relleno" style="width:' + pct + '%"></div></div>' +
        '<span class="combate-graf-val">' + d.r.lo + '–' + d.r.hi + '</span></div>';
    }
    html += '</div>';
    cont.innerHTML = html;
  },

  _iniciarArrastreFantasma(ev, cfg) {
    ev.preventDefault();
    const act = { x0: ev.clientX, y0: ev.clientY, movio: false, fantasma: null };
    const quitarDestino = () => {
      if (cfg.selectorDestino) {
        document.querySelectorAll(cfg.selectorDestino + '.destino').forEach(el => el.classList.remove('destino'));
      }
    };
    const mover = e => {
      if (!act.movio && Math.hypot(e.clientX - act.x0, e.clientY - act.y0) < 8) return;
      if (!act.movio) {
        act.movio = true;
        act.fantasma = document.createElement('div');
        act.fantasma.id = 'item-fantasma';
        act.fantasma.textContent = cfg.icono || '📦';
        document.body.appendChild(act.fantasma);
      }
      act.fantasma.style.left = e.clientX + 'px';
      act.fantasma.style.top = e.clientY + 'px';
      quitarDestino();
      const bajo = document.elementFromPoint(e.clientX, e.clientY);
      if (cfg.selectorDestino && bajo?.closest?.(cfg.selectorDestino)) {
        bajo.closest(cfg.selectorDestino).classList.add('destino');
      }
    };
    const soltar = e => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      if (act.fantasma) act.fantasma.remove();
      quitarDestino();
      const bajo = document.elementFromPoint(e.clientX, e.clientY);
      if (!act.movio) {
        if (cfg.onTap) cfg.onTap();
        return;
      }
      if (cfg.onSoltar) cfg.onSoltar(bajo, act);
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
  },

  _slotRejillaArrastre(ev, arr, rejId, i, claseSlot) {
    const sl = arr[i];
    if (!sl) return;
    const icono = Items.seguro(sl.id).icono;
    this._iniciarArrastreFantasma(ev, {
      icono,
      selectorDestino: '.' + claseSlot,
      onSoltar: (bajo) => {
        const slot = bajo?.closest?.('.' + claseSlot);
        if (slot) {
          const dest = parseInt(slot.dataset.indice, 10);
          if (dest !== i) {
            const tmp = arr[i];
            arr[i] = arr[dest] || null;
            arr[dest] = tmp;
          }
        } else {
          arr[i] = null;
        }
        this._pintarRejillaGenerica(rejId, arr, claseSlot);
      }
    });
  },

  _valor(id) { const el = document.getElementById(id); return el ? el.value : ''; },
  _numero(id) { return Math.max(0, parseInt(this._valor(id), 10) || 0); },

  guardarFormulario() {
    const tipo = this._colocacion && this._colocacion.tipo;
    if (!tipo) return;
    let valores;

    if (tipo === 'crear_jugador') {
      this._colocacion = null;
      Usuarios.cambiarJugador(); // lleva a la pantalla de registro
      return;
    }

    // Los formularios de precio y objeto nuevo no colocan nada en el mapa
    if (tipo === 'precio') {
      const idItem = this._valor('af-item');
      const precio = Items._limitarPrecio(this._numero('af-precio'));
      this.datos.precios[idItem] = precio;
      CATALOGO_ITEMS[idItem].precio = precio;
      this.guardar();
      this._colocacion = null;
      this._ocultarPanelDerecho();
      Notificaciones.mostrar('💲 ' + Items.seguro(idItem).nombre + ' ahora vale $' + precio, 'exito', 6000);
      this._publicarParaTodos();
      return;
    }
    if (tipo === 'item_nuevo') {
      const nombre = this._valor('af-nombre').trim();
      const icono = this._valor('af-icono').trim() || '📦';
      if (nombre.length < 2) { alert('Ponle un nombre al objeto'); return; }
      if (!icono) { alert('Elige un emoji para el objeto'); return; }
      const id = 'obj_' + nombre.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '').slice(0, 16) +
        '_' + Date.now().toString(36).slice(-4);
      const nuevo = {
        id, nombre, icono,
        precio: Items._limitarPrecio(this._numero('af-precio')),
        cura: this._numero('af-cura') || undefined,
        tipo: 'especial',
        desc: this._valor('af-desc').trim()
      };
      this.datos.itemsNuevos.push(nuevo);
      Items.aplicarMundo([nuevo], {});
      this.guardar();
      this._colocacion = null;
      this._ocultarPanelDerecho();
      Notificaciones.mostrar('➕ Objeto creado: ' + icono + ' ' + nombre + ' ($' + nuevo.precio +
        '). Ya puedes dejarlo en el mapa o darlo de recompensa', 'exito', 6000);
      this._publicarParaTodos(true);
      return;
    }

    if (tipo === 'mision') {
      const titulo = this._valor('af-titulo').trim();
      if (!titulo) { alert('Ponle un título a la misión'); return; }
      const recItems = (this._misionRecompensas || []).filter(Boolean);
      valores = {
        titulo,
        texto: this._valor('af-texto').trim(),
        reqItem: this._valor('af-req-item') || null,
        reqCant: Math.max(1, this._numero('af-req-cant')),
        consumir: document.getElementById('af-consumir').checked,
        dinero: this._numero('af-dinero'),
        xp: this._numero('af-xp') || 25,
        recItems
      };
      if (!valores.dinero && !recItems.length) { alert('Pon recompensa: dinero u objetos en la rejilla'); return; }
    } else if (tipo === 'enemigo') {
      const nombre = this._valor('af-nombre').trim() || Enemigos.NOMBRES[0];
      const icono = (document.getElementById('af-icono-enemigo')?.value || '👹').trim();
      const vida = Math.max(10, this._numero('af-vida') || 60);
      const dMin = Math.max(1, this._numero('af-dano-min') || 8);
      const dMax = Math.max(dMin, this._numero('af-dano-max') || 14);
      valores = {
        nombre, icono, vida, vidaMax: vida,
        nivel: Math.max(1, Math.min(100, this._numero('af-nivel-enemigo') || 1)),
        danoMin: dMin,
        danoMax: dMax,
        dano: dMax,
        xp: this._numero('af-xp') || 30,
        dinero: this._numero('af-dinero') || 0,
        recItems: (this._enemigoRecompensas || []).filter(Boolean),
        respawnMin: parseInt(this._valor('af-enemigo-respawn'), 10) || 0
      };
    } else if (tipo === 'tienda_admin') {
      const nombre = this._valor('af-nombre').trim();
      if (nombre.length < 2) { alert('Ponle nombre a la tienda'); return; }
      const vende = (this._tiendaAdminSlots || []).filter(Boolean);
      if (!vende.length) { alert('Añade al menos un artículo (toca ADM ∞)'); return; }
      valores = {
        nombre,
        icono: this._valor('af-icono-tienda').trim() || '🏪',
        vende
      };
    } else if (tipo === 'tesoro') {
      const recItems = (this._tesoroItems || []).filter(Boolean);
      if (!recItems.length && !this._numero('af-dinero')) {
        alert('Pon recompensas en la rejilla o dinero $'); return;
      }
      const iconoMapa = (this._valor('af-icono-mapa') || '🎁').trim() || '🎁';
      this.datos.tesoroIconoMapa = iconoMapa;
      this._asegurarObjetoIconoTesoro(iconoMapa);
      valores = {
        invisible: this._valor('af-visible') === 'invisible',
        itemParaVer: this._valor('af-item-ver') || null,
        iconoMapa,
        nivelMin: Math.max(1, this._numero('af-nivel-min') || 1),
        recItems,
        recItem: recItems[0]?.id,
        recCant: recItems[0]?.cantidad || 1,
        dinero: this._numero('af-dinero'),
        respawnMin: parseInt(this._valor('af-tesoro-respawn'), 10) || 0
      };
    } else {
      const items = (this._objetoItems || []).filter(Boolean);
      if (!items.length) { alert('Arrastra al menos un objeto desde ADM ∞'); return; }
      valores = {
        items,
        itemId: items[0].id,
        cantidad: items[0].cantidad || 1,
        reaparece: parseInt(this._valor('af-reaparece'), 10) || 0
      };
    }

    this._colocacion.valores = valores;
    this._ocultarPanelDerecho();
    this._empezarColocacion();
  },

  // ---------- COLOCAR EL PIN EN EL MAPA ----------
  _empezarColocacion() {
    document.getElementById('ventana-admin').classList.add('oculto');
    this.modo = 'colocar';
    const centro = Mapa.mapa.getCenter();
    const marcador = L.marker([centro.lat, centro.lng], {
      draggable: true,
      zIndexOffset: 2000,
      icon: L.divIcon({ className: '', html: '<div class="icono-admin-pin">📌</div>', iconSize: [34, 34], iconAnchor: [17, 30] })
    }).addTo(Mapa.mapa);
    this._colocacion.marcador = marcador;
    this._mostrarControles('Arrastra el pin 📌 a su lugar y confirma', true);
  },

  async confirmarColocacion() {
    if (typeof Cofres !== 'undefined' && Cofres._colocarPin) {
      await Cofres.confirmarPin();
      return;
    }
    const c = this._colocacion;
    if (!c || !c.marcador) return;
    const p = c.marcador.getLatLng();
    const pos = [+p.lat.toFixed(6), +p.lng.toFixed(6)];
    c.marcador.remove();

    const id = 'admx_' + c.tipo[0] + '_' + Date.now().toString(36);
    if (c.tipo === 'mision') {
      const m = Object.assign({ id, pos }, c.valores);
      this.datos.misiones.push(m);
      Misiones.agregarAdmin(m);
      Notificaciones.mostrar('📜 Misión creada: ' + m.titulo, 'exito', 5000);
    } else if (c.tipo === 'enemigo') {
      const e = Object.assign({
        id: 'enm_' + Date.now().toString(36),
        pos,
        posOrigen: pos.slice()
      }, c.valores);
      this.datos.enemigos.push(e);
      if (!this.datos.posiciones) this.datos.posiciones = {};
      this.datos.posiciones[e.id] = pos.slice();
      if (typeof Enemigos !== 'undefined') Enemigos.agregarAdmin(e);
      Notificaciones.mostrar('👹 Enemigo ' + e.nombre + ' colocado', 'exito', 5000);
    } else if (c.tipo === 'tienda_admin') {
      const t = Object.assign({
        id: 'tadm_' + Date.now().toString(36),
        posicion: pos,
        pos
      }, c.valores);
      this.datos.tiendasAdmin.push(t);
      if (typeof Tiendas !== 'undefined') Tiendas.agregarAdmin(t);
      Notificaciones.mostrar('🏪 Tienda ' + t.nombre + ' creada', 'exito', 5000);
    } else if (c.tipo === 'tesoro') {
      const t = Object.assign({ id, pos }, c.valores);
      this.datos.tesoros.push(t);
      this._prepararTesoro(t);
      Notificaciones.mostrar('🎁 Tesoro ' + (t.invisible ? 'invisible' : 'visible') + ' creado', 'exito');
    } else {
      const o = Object.assign({ id, pos }, c.valores);
      this.datos.objetos.push(o);
      this._crearMarcadorObjeto(o);
      const item = Items.obtener(o.itemId);
      Notificaciones.mostrar('📦 ' + item.nombre + ' x' + o.cantidad + ' dejado en el mapa', 'exito');
    }
    localStorage.setItem(this.CLAVE, JSON.stringify(this.datos,
      (clave, valor) => clave.startsWith('_') ? undefined : valor));
    const ok = await this._publicarParaTodos(true);
    if (!ok && this.esAdminJugador()) {
      this._adminAviso('Guardado en tu teléfono. Pulsa Sincronizar para que los demás lo vean.', 'alerta');
    }
    this._colocacion = null;
    this.salirModo();
  },

  // ---------- MISIONES DEL ADMIN ----------





  // ---------- TESOROS DEL ADMIN ----------
  _tesorosEstadoGlobal() {
    if (!this.publicado.tesorosEstado) this.publicado.tesorosEstado = {};
    return this.publicado.tesorosEstado;
  },

  _tesoroDisponible(t) {
    const st = this._tesorosEstadoGlobal()[t.id];
    if (!st || !st.recogidoAt) return true;
    if (!t.respawnMin) return false;
    return Date.now() - st.recogidoAt > t.respawnMin * 60000;
  },

  _itemsDeTesoro(t) {
    if (t.recItems && t.recItems.length) return t.recItems;
    if (t.recItem) return [{ id: t.recItem, cantidad: t.recCant || 1 }];
    return [];
  },

  _prepararTesoro(t) {
    if (!this._tesoroDisponible(t)) return;
    t._marcador = null;
    Mapa.registrarPunto({
      id: t.id,
      posicion: t.pos,
      radio: CONFIG.distanciaInteraccion,
      marcador: null,
      alCambiarDistancia: d => this._revisarTesoro(t, d)
    });
    this._revisarTesoro(t, Utilidades.distanciaMetros(GPS.posicion ? GPS.posicion : CONFIG.centro, t.pos));
  },

  _puedeDetectar(t) {
    return !t.itemParaVer || Mochila.tieneItem(t.itemParaVer);
  },

  _revisarTesoro(t, distancia) {
    if (!this._tesoroDisponible(t)) {
      if (t._marcador) { t._marcador.remove(); t._marcador = null; }
      return;
    }
    const detecta = this._puedeDetectar(t);
    const icono = t.iconoMapa || this.tesoroIconoMapa();
    const debeVerse = detecta && (!t.invisible || distancia <= CONFIG.distanciaVerTesoro);

    if (debeVerse && !t._marcador) {
      t._marcador = L.marker(t.pos, {
        icon: L.divIcon({
          className: '',
          html: '<div class="icono-tesoro">' + icono + '</div>',
          iconSize: [34, 34], iconAnchor: [17, 17]
        })
      }).addTo(Mapa.mapa);
      t._marcador.on('click', () => {
        if (this.manejarClickPunto({ id: t.id, esTesoroAdmin: t })) return;
        this._recogerTesoro(t);
      });
    } else if (!debeVerse && t._marcador) {
      t._marcador.remove();
      t._marcador = null;
    }
  },

  // Tesoros invisibles detectables ahora mismo (para el banner de metros)
  tesorosDetectables() {
    const lista = [];
    for (const t of this.tesorosTodos()) {
      if (!this._tesoroDisponible(t)) continue;
      if (t.invisible && this._puedeDetectar(t)) lista.push(t.pos);
    }
    return lista;
  },

  refrescarVisibles() {
    if (!GPS.posicion) return;
    for (const t of this.tesorosTodos()) {
      this._revisarTesoro(t, Utilidades.distanciaMetros(GPS.posicion, t.pos));
    }
  },

  async _recogerTesoro(t) {
    const d = Utilidades.distanciaMetros(GPS.posicion, t.pos);
    if (d > CONFIG.distanciaInteraccion) {
      Notificaciones.mostrar('📍 Acércate más (' + Math.round(d) + ' m)', 'alerta');
      return;
    }
    if (!this._tesoroDisponible(t)) return;
    if (t.nivelMin && Vida.nivel < t.nivelMin) {
      Notificaciones.mostrar('⭐ Necesitas nivel ' + t.nivelMin + ' (tienes ' + Vida.nivel + ')', 'alerta', 4000);
      return;
    }
    const items = this._itemsDeTesoro(t);
    for (const it of items) {
      if (!Mochila.agregar(it.id, it.cantidad || 1, { silencioso: true })) {
        Notificaciones.mostrar('🎒 No tienes espacio para todo el tesoro', 'error');
        return;
      }
    }
    const est = this._tesorosEstadoGlobal();
    est[t.id] = { recogidoAt: Date.now() };
    if (!this._progreso().tesoros.includes(t.id)) this._progreso().tesoros.push(t.id);
    Guardado.guardar();
    this.guardar();
    this._publicarParaTodos(true);

    const punto = Mapa.mapa.latLngToContainerPoint(t.pos);
    Utilidades.volarHaciaMochila(t.iconoMapa || this.tesoroIconoMapa(), punto.x, punto.y);
    if (t._marcador) { t._marcador.remove(); t._marcador = null; }

    const nombres = items.map(it => Items.seguro(it.id).icono + ' x' + (it.cantidad || 1)).join(', ');
    setTimeout(async () => {
      if (t.dinero) await Dinero.ganar(t.dinero, 'Tesoro encontrado');
      Notificaciones.mostrar('🎁 ¡Tesoro! ' + nombres +
        (t.dinero ? ' + $' + t.dinero : '') +
        (t.respawnMin ? ' (vuelve en ' + t.respawnMin + ' min)' : ''), 'exito', 5000);
      if (typeof Tesoros !== 'undefined') Tesoros.refrescarBanner();
    }, 800);
  },

  // ---------- OBJETOS DEJADOS EN EL MAPA (con reaparición) ----------
  // El progreso guarda CUÁNDO se recogió cada objeto: si el admin puso
  // reaparición, pasado ese tiempo vuelve a salir para ese jugador.
  _objetosRecogidos() {
    const p = this._progreso();
    if (Array.isArray(p.objetos)) {
      const mapa = {};
      for (const id of p.objetos) mapa[id] = Date.now();
      p.objetos = mapa;
    }
    if (!p.objetos || typeof p.objetos !== 'object') p.objetos = {};
    return p.objetos;
  },

  _objetoDisponible(o) {
    const t = this._objetosRecogidos()[o.id];
    if (!t) return true;
    return (o.reaparece || 0) > 0 && Date.now() - t > o.reaparece * 60000;
  },

  _itemsDeObjeto(o) {
    if (o.items && o.items.length) return o.items;
    if (o.itemId) return [{ id: o.itemId, cantidad: o.cantidad || 1 }];
    return [];
  },

  _crearMarcadorObjeto(o) {
    const items = this._itemsDeObjeto(o);
    if (!items.length) return;
    const principal = Items.obtener(items[0].id);
    if (!principal) return;
    o._marcador = null;
    Mapa.registrarPunto({
      id: o.id,
      posicion: o.pos,
      radio: CONFIG.distanciaInteraccion,
      marcador: null,
      alCambiarDistancia: () => this._revisarObjeto(o)
    });
    this._revisarObjeto(o);
  },

  _revisarObjeto(o) {
    const items = this._itemsDeObjeto(o);
    if (!items.length) return;
    const principal = Items.obtener(items[0].id);
    if (!principal) return;
    const disponible = this._objetoDisponible(o);
    const icono = items.length > 1 ? principal.icono + '<span class="obj-multi">+' + (items.length - 1) + '</span>' : principal.icono;
    if (disponible && !o._marcador) {
      o._marcador = Mapa.crearMarcadorEmoji(o.pos, principal.icono, 26);
      if (items.length > 1) {
        const el = o._marcador.getElement?.();
        if (el) el.classList.add('marcador-obj-multi');
      }
      o._marcador.on('click', () => {
        if (this.manejarClickPunto({ id: o.id, marcador: o._marcador })) return;
        this._recogerObjeto(o);
      });
    } else if (!disponible && o._marcador) {
      o._marcador.remove();
      o._marcador = null;
    }
  },

  _recogerObjeto(o) {
    if (!this._objetoDisponible(o)) return;
    const d = Utilidades.distanciaMetros(GPS.posicion, o.pos);
    if (d > CONFIG.distanciaInteraccion) {
      Notificaciones.mostrar('📍 Acércate más (' + Math.round(d) + ' m)', 'alerta');
      return;
    }
    const items = this._itemsDeObjeto(o);
    for (const it of items) {
      if (!Mochila.agregar(it.id, it.cantidad || 1, { silencioso: true })) {
        Notificaciones.mostrar('🎒 No tienes espacio para todo', 'error');
        return;
      }
    }
    this._objetosRecogidos()[o.id] = Date.now();
    Guardado.guardar();
    const principal = Items.obtener(items[0].id);
    const punto = Mapa.mapa.latLngToContainerPoint(o.pos);
    Utilidades.volarHaciaMochila(principal.icono, punto.x, punto.y);
    const nombres = items.map(it => Items.seguro(it.id).nombre + ' x' + (it.cantidad || 1)).join(', ');
    Notificaciones.mostrar('📦 Recogiste: ' + nombres +
      ((o.reaparece || 0) > 0 ? ' (vuelve en ' + o.reaparece + ' min)' : ''), 'exito');
    if (o._marcador) { o._marcador.remove(); o._marcador = null; }
  },

  // Habilita arrastre de un marcador Leaflet (organizar pines)
  _punteroDeEvento(ev) {
    const e = ev?.originalEvent || ev;
    if (!e) return null;
    if (e.changedTouches?.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    if (e.touches?.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (typeof e.clientX === 'number') return { x: e.clientX, y: e.clientY };
    return null;
  },

  _sobreCesto(ev, marcador) {
    const cesto = document.getElementById('admin-cesto-borrar');
    if (!cesto || cesto.classList.contains('oculto')) return false;
    const pt = this._punteroDeEvento(ev);
    if (pt) {
      const bajo = document.elementFromPoint(pt.x, pt.y);
      if (bajo?.closest?.('#admin-cesto-borrar')) return true;
    }
    return this._marcadorSobreCesto(marcador);
  },

  _actualizarHoverCesto(ev, marcador) {
    const cesto = document.getElementById('admin-cesto-borrar');
    if (!cesto) return;
    cesto.classList.toggle('cesto-hover', this._sobreCesto(ev, marcador));
  },

  _arrastreOrganizarMarcador(marcador, punto, alMoverPos) {
    if (!marcador) return;
    const fin = (ev) => {
      const cesto = document.getElementById('admin-cesto-borrar');
      if (cesto) cesto.classList.remove('cesto-hover');
      if (this._sobreCesto(ev, marcador)) {
        this._eliminarPin(punto, true);
        return;
      }
      if (alMoverPos) alMoverPos(marcador);
    };
    if (punto._movOrg) marcador.off('drag', punto._movOrg);
    if (punto._finOrg) marcador.off('dragend', punto._finOrg);
    punto._movOrg = (ev) => this._actualizarHoverCesto(ev, marcador);
    punto._finOrg = fin;
    marcador.on('drag', punto._movOrg);
    this._habilitarArrastreMarcador(marcador, fin);
  },

  _habilitarArrastreMarcador(marcador, alSoltar) {
    if (!marcador || marcador === GPS.marcador) return;
    marcador.options.draggable = true;
    if (marcador.dragging) marcador.dragging.enable();
    if (alSoltar) marcador.on('dragend', alSoltar);
  },

  // ---------- MODOS ORGANIZAR / ELIMINAR ----------
  entrarModo(modo) {
    this._ocultarPanelDerecho();
    document.getElementById('ventana-admin').classList.add('oculto');
    this.modo = modo;
    const cesto = document.getElementById('admin-cesto-borrar');
    if (cesto) {
      cesto.classList.remove('oculto');
      cesto.classList.add('activo');
    }
    this._mostrarControles(
      '✋ Arrastra un pin y suéltalo en 🗑️ para borrarlo',
      false
    );

    // Mostrar pines fantasma de los tesoros base (normalmente invisibles)
    for (const t of DATOS_TESOROS) {
      if (this.eliminado(t.id)) continue;
      const fantasma = L.marker(t.posicion, {
        draggable: modo === 'organizar',
        opacity: 0.75,
        icon: L.divIcon({ className: '', html: '<div class="icono-tesoro">✨</div>', iconSize: [30, 30], iconAnchor: [15, 15] })
      }).addTo(Mapa.mapa);
      fantasma.on('dragend', (ev) => {
        if (this._sobreCesto(ev, fantasma)) {
          this._eliminarPin({ id: t.id, marcador: fantasma, nombre: 'Tesoro oculto' }, true);
          return;
        }
        const p = fantasma.getLatLng();
        t.posicion[0] = +p.lat.toFixed(6);
        t.posicion[1] = +p.lng.toFixed(6);
        this.datos.posiciones[t.id] = [t.posicion[0], t.posicion[1]];
        this.guardar();
      });
      fantasma.on('drag', (ev) => this._actualizarHoverCesto(ev, fantasma));
      this._fantasmas.push(fantasma);
    }

    // Igual con los tesoros invisibles del admin
    for (const t of this.tesorosTodos()) {
      if (t._marcador) continue;
      const fantasma = L.marker(t.pos, {
        draggable: modo === 'organizar',
        opacity: 0.75,
        icon: L.divIcon({ className: '', html: '<div class="icono-tesoro">🎁</div>', iconSize: [30, 30], iconAnchor: [15, 15] })
      }).addTo(Mapa.mapa);
      fantasma.on('dragend', (ev) => {
        if (this._sobreCesto(ev, fantasma)) {
          this._eliminarPin({ id: t.id, marcador: fantasma, nombre: 'Tesoro del admin' }, true);
          return;
        }
        const p = fantasma.getLatLng();
        t.pos[0] = +p.lat.toFixed(6); t.pos[1] = +p.lng.toFixed(6);
        this.datos.posiciones[t.id] = [t.pos[0], t.pos[1]];
        this.guardar();
      });
      fantasma.on('drag', (ev) => this._actualizarHoverCesto(ev, fantasma));
      this._fantasmas.push(fantasma);
    }

    if (modo === 'organizar') {
      if (typeof GPS !== 'undefined' && GPS.marcador && this.puedeMoverPinJugador()) {
        this._habilitarArrastreMarcador(GPS.marcador, () => {
          const p = GPS.marcador.getLatLng();
          GPS._actualizar([+p.lat.toFixed(6), +p.lng.toFixed(6)], false);
        });
      }
      for (const p of Mapa.puntosInteractivos) {
        if (!p.marcador || p.marcador === GPS.marcador) continue;
        this._arrastreOrganizarMarcador(p.marcador, p, (m) => {
          const nueva = m.getLatLng();
          p.posicion[0] = +nueva.lat.toFixed(6);
          p.posicion[1] = +nueva.lng.toFixed(6);
          this.datos.posiciones[p.id] = [p.posicion[0], p.posicion[1]];
          this.guardar();
        });
      }
      for (const o of this.objetosTodos()) {
        if (!o._marcador) continue;
        this._arrastreOrganizarMarcador(o._marcador, { id: o.id, marcador: o._marcador, nombre: Items.seguro(o.itemId || o.items?.[0]?.id)?.nombre }, (m) => {
          const p = m.getLatLng();
          o.pos[0] = +p.lat.toFixed(6);
          o.pos[1] = +p.lng.toFixed(6);
          this.datos.posiciones[o.id] = [o.pos[0], o.pos[1]];
          this.guardar();
        });
      }
      if (typeof Cofres !== 'undefined' && Cofres._marcadores) {
        for (const [id, m] of Object.entries(Cofres._marcadores)) {
          this._arrastreOrganizarMarcador(m, { id, marcador: m, nombre: 'Cofre' }, (marc) => {
            const p = marc.getLatLng();
            this.datos.posiciones[id] = [+p.lat.toFixed(6), +p.lng.toFixed(6)];
            this.guardar();
          });
        }
      }
      if (typeof Misiones !== 'undefined') {
        for (const [id, m] of Object.entries(Misiones._marcadores)) {
          const mis = Misiones.lista.find(x => x.id === id);
          this._arrastreOrganizarMarcador(m, { id, marcador: m, nombre: mis?.titulo || 'Misión' }, (marc) => {
            const p = marc.getLatLng();
            const pos = [+p.lat.toFixed(6), +p.lng.toFixed(6)];
            this.datos.posiciones[id] = pos;
            const exist = Misiones.lista.find(x => x.id === id);
            if (exist) exist.pos = pos;
            this.guardar();
          });
        }
      }
      if (typeof Enemigos !== 'undefined') {
        for (const e of Enemigos.lista) {
          const m = Enemigos._marcadores[e.id];
          if (!m) continue;
          this._arrastreOrganizarMarcador(m, { id: e.id, marcador: m, nombre: e.nombre || 'Enemigo' }, (marc) => {
            const p = marc.getLatLng();
            const pos = [+p.lat.toFixed(6), +p.lng.toFixed(6)];
            e.pos = pos;
            e.posOrigen = pos.slice();
            this.datos.posiciones[e.id] = pos;
            this.guardar();
          });
        }
      }
      if (typeof Tiendas !== 'undefined' && Tiendas._marcadoresAdmin) {
        for (const [id, m] of Object.entries(Tiendas._marcadoresAdmin)) {
          const t = Tiendas._listaAdmin.find(x => x.id === id);
          this._arrastreOrganizarMarcador(m, { id, marcador: m, nombre: t?.nombre || 'Tienda' }, (marc) => {
            const p = marc.getLatLng();
            const pos = [+p.lat.toFixed(6), +p.lng.toFixed(6)];
            if (t) { t.pos = pos; t.posicion = pos; }
            this.datos.posiciones[id] = pos;
            this.guardar();
          });
        }
      }
    }
  },

  // Interceptor de toques sobre pines cuando hay un modo admin activo.
  // Devuelve true si el toque fue consumido por el modo.
  _marcadorSobreCesto(marcador) {
    if (!marcador || !Mapa.mapa) return false;
    const cesto = document.getElementById('admin-cesto-borrar');
    if (!cesto || cesto.classList.contains('oculto')) return false;
    const pt = Mapa.mapa.latLngToContainerPoint(marcador.getLatLng());
    const mapRect = Mapa.mapa.getContainer().getBoundingClientRect();
    const x = mapRect.left + pt.x;
    const y = mapRect.top + pt.y;
    const r = cesto.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  },

  manejarClickPunto(punto) {
    if (this.modo === 'organizar') {
      if (punto._adminMovio) { punto._adminMovio = false; return true; }
      return true;
    }
    return this.modo === 'colocar';
  },

  _eliminarPin(punto, sinConfirm) {
    if (!sinConfirm && !confirm('¿Eliminar este pin del mapa?' + (punto.nombre ? ' (' + punto.nombre + ')' : ''))) return;

    if (punto.id.startsWith('admx_')) {
      // Contenido creado por el admin: se borra el borrador local, y si
      // ya estaba publicado en GitHub, se marca como eliminado
      const habiaLocal =
        this.datos.misiones.some(x => x.id === punto.id) ||
        this.datos.tesoros.some(x => x.id === punto.id) ||
        this.datos.objetos.some(x => x.id === punto.id);
      this.datos.misiones = this.datos.misiones.filter(x => x.id !== punto.id);
      this.datos.tesoros = this.datos.tesoros.filter(x => x.id !== punto.id);
      this.datos.objetos = this.datos.objetos.filter(x => x.id !== punto.id);
      this.datos.enemigos = (this.datos.enemigos || []).filter(x => x.id !== punto.id);
      this.datos.tiendasAdmin = (this.datos.tiendasAdmin || []).filter(x => x.id !== punto.id);
      if (!habiaLocal && !this.datos.eliminados.includes(punto.id)) {
        this.datos.eliminados.push(punto.id);
      }
    } else {
      // Pines base del juego: se marcan como eliminados
      if (!this.datos.eliminados.includes(punto.id)) this.datos.eliminados.push(punto.id);
    }
    this.guardar();
    this._publicarParaTodos(true);

    if (punto.marcador) punto.marcador.remove();
    if (typeof Enemigos !== 'undefined' && Enemigos._marcadores[punto.id]) {
      Enemigos._quitarMarcador(punto.id);
    }
    if (typeof Tiendas !== 'undefined' && Tiendas._marcadoresAdmin[punto.id]) {
      Tiendas._marcadoresAdmin[punto.id].remove();
      delete Tiendas._marcadoresAdmin[punto.id];
      Tiendas._listaAdmin = Tiendas._listaAdmin.filter(t => t.id !== punto.id);
    }
    if (typeof Misiones !== 'undefined' && Misiones._marcadores[punto.id]) {
      Misiones._marcadores[punto.id].remove();
      delete Misiones._marcadores[punto.id];
      if (Misiones._lineas[punto.id]) { Misiones._lineas[punto.id].remove(); delete Misiones._lineas[punto.id]; }
    }
    if (punto.esTesoroAdmin && punto.esTesoroAdmin._marcador) punto.esTesoroAdmin._marcador.remove();
    const i = Mapa.puntosInteractivos.findIndex(p => p.id === punto.id);
    if (i >= 0) Mapa.puntosInteractivos.splice(i, 1);
    Notificaciones.mostrar('🗑️ Pin eliminado', 'alerta');
  },

  salirModo() {
    // Cancelar colocación pendiente
    if (this._colocacion && this._colocacion.marcador) this._colocacion.marcador.remove();
    this._colocacion = null;

    // Quitar fantasmas y desactivar arrastres
    for (const f of this._fantasmas) f.remove();
    this._fantasmas = [];
    const cesto = document.getElementById('admin-cesto-borrar');
    if (cesto) {
      cesto.classList.add('oculto');
      cesto.classList.remove('activo', 'cesto-hover');
    }
    if (typeof Cofres !== 'undefined') Cofres.cancelarPin(true);
    for (const p of Mapa.puntosInteractivos) {
      if (p.marcador && p.marcador.dragging) {
        p.marcador.dragging.disable();
        if (p._movOrg) { p.marcador.off('drag', p._movOrg); p._movOrg = null; }
        if (p._finOrg) { p.marcador.off('dragend', p._finOrg); p._finOrg = null; }
        if (p._alSoltar) { p.marcador.off('dragend', p._alSoltar); p._alSoltar = null; }
      }
    }
    this.modo = null;
    document.getElementById('admin-controles').classList.add('oculto');
  },

  _mostrarControles(texto, conConfirmar) {
    document.getElementById('admin-modo-texto').textContent = texto;
    document.getElementById('btn-admin-confirmar').style.display = conConfirmar ? '' : 'none';
    document.getElementById('admin-controles').classList.remove('oculto');
  },

  // ---------- BLOQUEO DEL JUEGO (mantenimiento y baneos) ----------
  estadoBloqueoPara(perfil) {
    if (!this.publicado) this.publicado = { baneados: [], jugadores: [] };
    if (!this.publicado.baneados) this.publicado.baneados = [];
    const id = perfil ? perfil.id : '';
    const telefono = perfil ? (perfil.telefono || '') : '';
    const baneadosDat = (this.datos && this.datos.baneados) ? this.datos.baneados : [];
    const ban = [...(this.publicado.baneados || []), ...baneadosDat]
      .find(b => b.id === id || (telefono && b.id === telefono));
    if (ban && this._banActivo(ban)) {
      const hastaTxt = ban.hasta ? ' Hasta: ' + Utilidades.fechaLegible(ban.hasta) : ' (permanente)';
      return { tipo: 'ban', mensaje: (ban.motivo || 'Cuenta suspendida.') + hastaTxt };
    }
    return null;
  },

  _banActivo(ban) {
    if (!ban.hasta) return true;
    return Date.now() < ban.hasta;
  },

  estadoBloqueo() {
    const id = Usuarios.perfilActivo ? Usuarios.perfilActivo.id : '';
    const telefono = Usuarios.perfilActivo ? (Usuarios.perfilActivo.telefono || '') : '';
    const ban = [...(this.publicado.baneados || []), ...(this.datos.baneados || [])]
      .find(b => b.id === id || (telefono && b.id === telefono));
    if (ban && this._banActivo(ban)) {
      const hastaTxt = ban.hasta ? ' Hasta: ' + Utilidades.fechaLegible(ban.hasta) : ' (permanente)';
      return { tipo: 'ban', mensaje: (ban.motivo || 'Contacta al administrador.') + hastaTxt };
    }
    const mant = this.datos.mantenimiento || this.publicado.mantenimiento;
    if (mant && mant.activo) {
      if (this.esAdminJugador()) return null;
      return { tipo: 'mantenimiento', mensaje: mant.mensaje || 'Volvemos pronto.' };
    }
    return null;
  },

  alternarMantenimiento() { this.abrirMantenimiento(); },

  abrirMantenimiento() {
    const mant = this.datos.mantenimiento || this.publicado.mantenimiento || { activo: false, mensaje: '' };
    const estado = document.getElementById('admin-mant-estado');
    const msg = document.getElementById('admin-mant-mensaje');
    if (estado) {
      estado.textContent = mant.activo ? '🚧 Mantenimiento ACTIVO' : '🟢 Juego activo para todos';
      estado.className = 'admin-clave-estado' + (mant.activo ? '' : ' ok');
    }
    if (msg) msg.value = mant.mensaje || '';
    this._mostrarPanelDerecho('admin-vista-mantenimiento', '🚧 Mantenimiento');
  },

  _activarMantenimientoUi() {
    const mensaje = (document.getElementById('admin-mant-mensaje').value || '').trim() ||
      'Estamos mejorando el juego, vuelve más tarde 🌴';
    this.datos.mantenimiento = { activo: true, mensaje };
    this.guardar();
    Notificaciones.mostrar('🚧 Mantenimiento activado (tú como admin puedes seguir jugando)', 'alerta', 6000);
    this._publicarParaTodos(true);
    this._volverAlPanel();
  },

  _quitarMantenimientoUi() {
    this.datos.mantenimiento = { activo: false, mensaje: '' };
    this.guardar();
    Notificaciones.mostrar('🟢 Mantenimiento desactivado', 'exito', 5000);
    this._publicarParaTodos(true);
    this._volverAlPanel();
  },

  enviarMensaje() { this.abrirMensaje(); },

  abrirMensaje(paraId) {
    this._msgPara = paraId || 'todos';
    const chips = document.getElementById('admin-msg-chips');
    if (chips) {
      chips.innerHTML = '';
      const addChip = (id, label) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'admin-msg-chip' + (this._msgPara === id ? ' activo' : '');
        b.textContent = label;
        b.dataset.id = id;
        b.addEventListener('click', () => {
          this._msgPara = id;
          chips.querySelectorAll('.admin-msg-chip').forEach(c => {
            c.classList.toggle('activo', c.dataset.id === id);
          });
        });
        chips.appendChild(b);
      };
      addChip('todos', '📢 Todos');
      for (const j of this.jugadoresGlobales()) {
        addChip(j.id, '👤 ' + j.nombre);
      }
    }
    const texto = document.getElementById('admin-msg-texto');
    const preview = document.getElementById('admin-msg-preview-texto');
    const contador = document.getElementById('admin-msg-contador');
    if (texto) {
      texto.value = '';
      texto.oninput = () => {
        const val = (texto.value || '').trim();
        if (preview) preview.textContent = val || 'Escribe tu mensaje abajo…';
        if (contador) contador.textContent = String(texto.value.length);
      };
    }
    if (preview) preview.textContent = 'Escribe tu mensaje abajo…';
    if (contador) contador.textContent = '0';
    this._ocultarAvisoMensaje();
    this._mostrarPanelDerecho('admin-vista-mensaje', '✉️ Enviar mensaje');
  },

  _enviarMensajeUi() {
    const para = this._msgPara || 'todos';
    const texto = (document.getElementById('admin-msg-texto').value || '').trim();
    if (!texto) { this._adminAvisoMensaje('Escribe un mensaje'); return; }
    this.datos.mensajes.push({
      id: 'msg_' + Date.now().toString(36),
      para, texto, t: Date.now()
    });
    this.guardar();
    this._adminAvisoMensaje('✉️ Mensaje enviado', 'exito');
    setTimeout(() => this._volverAlPanel(), 1200);
  },

  mostrarMensajes() {
    if (!Guardado.datos.mensajesVistos) Guardado.datos.mensajesVistos = [];
    const id = Usuarios.perfilActivo ? Usuarios.perfilActivo.id : '';
    const todos = [...(this.publicado.mensajes || []), ...(this.datos.mensajes || [])];
    for (const m of todos) {
      if (Guardado.datos.mensajesVistos.includes(m.id)) continue;
      if (m.para !== 'todos' && m.para !== id) continue;
      Notificaciones.mostrarAdmin(m.texto, 10000);
      Guardado.datos.mensajesVistos.push(m.id);
    }
    Guardado.guardar();
  },

  listarCofresPin() { this.toggleVerCofresOcultos(); },

  // Lee la tarjeta de jugador que alguien le mandó al admin
  async inspeccionar() {
    const codigo = prompt('Pega la tarjeta del jugador (empieza con TJ.):');
    if (!codigo) return;
    const datos = await Opciones.leerTarjeta(codigo.trim());
    if (!datos) { alert('❌ Tarjeta inválida o alterada'); return; }
    const resumen =
      '🪪 TARJETA VERIFICADA (firma correcta)\n\n' +
      'Jugador: ' + datos.nombre + '\nID: ' + datos.id + '\n' +
      'Teléfono: ' + (datos.telefono || 'sin número') + '\n' +
      'Dinero: $' + datos.dinero + '\nVida: ' + datos.vida + '\n' +
      'Objetos en mochila: ' + datos.objetos + '\n' +
      'Historial íntegro: ' + (datos.integro ? 'SÍ ✅' : 'NO ⚠️ POSIBLE HACKEO') + '\n' +
      'Generada: ' + Utilidades.fechaLegible(datos.t);
    if (confirm(resumen + '\n\n¿Banear a este jugador?')) {
      const motivo = prompt('Motivo del baneo:', 'Revisión del administrador');
      if (motivo === null) return;
      this.datos.baneados.push({ id: datos.id, motivo, t: Date.now() });
      this.guardar();
      Notificaciones.mostrar('🚫 ' + datos.nombre + ' baneado (publica el mundo)', 'alerta', 6000);
    }
  },

  // ---------- CUENTAS REGISTRADAS (panel admin) ----------
  listarCuentas() {
    this._listarCuentasAsync();
  },

  async _listarCuentasAsync() {
    await this.actualizarJugadoresGlobales();
    const cont = document.getElementById('admin-lista-jugadores');
    const buscar = document.getElementById('admin-buscar-jugador');
    if (buscar) buscar.value = '';

    const pintar = (filtro) => {
      cont.innerHTML = '';
      const f = (filtro || '').trim().toLowerCase();
      const globales = this.jugadoresGlobales().filter(j => {
        if (!f) return true;
        return (j.nombre || '').toLowerCase().includes(f) ||
          (j.telefono || '').includes(f) ||
          (j.id || '').toLowerCase().includes(f);
      });
      for (const j of globales) {
        const local = Usuarios.datos.lista.find(p => p.id === j.id);
        const partida = (this.publicado.partidas || {})[j.id] || (this.datos.partidasExtra || {})[j.id];
        let pd = partida ? (partida.datos || partida) : null;
        if (Usuarios.perfilActivo && j.id === Usuarios.perfilActivo.id && typeof Guardado !== 'undefined') {
          pd = {
            dinero: Guardado.datos.dinero,
            vida: Guardado.datos.vida,
            mochila: Guardado.datos.mochila,
            muerto: Guardado.datos.muerto,
            nivel: Guardado.datos.nivel
          };
        }
        const oro = pd?.dinero?.saldo;
        const nivel = pd?.nivel ?? 1;
        const maxVida = (typeof Vida !== 'undefined' && Vida.vidaMaxima)
          ? Vida.vidaMaxima(nivel) : CONFIG.vidaMaxima;
        const vida = pd?.vida ?? maxVida;
        const muerto = this._jugadorEstaMuerto(pd, vida);
        const ban = [...(this.publicado.baneados || []), ...(this.datos.baneados || [])]
          .find(b => b.id === j.id || b.id === j.telefono);
        const pctV = muerto ? 0 : Math.max(0, Math.min(100, Math.round((vida / maxVida) * 100)));
        const claseV = pctV > 70 ? 'alta' : pctV > 30 ? 'media' : 'baja';
        const fila = document.createElement('div');
        fila.className = 'fila-jugador-admin' + (muerto ? ' jugador-muerto-admin' : '');
        const inicial = (j.nombre || '?').trim()[0].toUpperCase();
        let chips = '';
        if (ban && this._banActivo(ban)) chips += '<span class="stat-chip ban">🚫 Baneado</span>';
        if (muerto) chips += '<span class="stat-chip muerto">💀 Muerto</span>';
        if (oro != null) chips += '<span class="stat-chip">💰 ' + oro + '</span>';
        fila.innerHTML =
          '<div class="avatar">' + inicial + '</div>' +
          '<div class="datos"><div class="nombre">' + j.nombre + '</div>' +
          '<div class="meta">📱 ' + (j.telefono || 'sin teléfono') + '</div>' +
          '<div class="meta">ID: ' + j.id + '</div>' +
          '<div class="jugador-barra-vida ' + claseV + '" title="Vida ' + (muerto ? 0 : vida) + '/' + maxVida + '">' +
          '<div class="jugador-barra-relleno" style="width:' + pctV + '%"></div>' +
          '<span class="jugador-barra-texto">❤️ ' + (muerto ? '0' : vida) + '/' + maxVida + '</span></div>' +
          (chips ? '<div class="stats">' + chips + '</div>' : '') + '</div>';
        const acciones = document.createElement('div');
        acciones.className = 'acciones';
        const mk = (t, fn, title, cls) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = t;
          if (title) b.title = title;
          if (cls) b.className = cls;
          b.addEventListener('click', fn);
          acciones.appendChild(b);
        };
        if (muerto) mk('❤️', () => this._revivirJugador(j), 'Revivir jugador', 'btn-revivir-jugador');
        mk('✏️', () => this._abrirEditorJugador(local || j, !local), 'Editar cuenta e inventario');
        mk('✉️', () => this.abrirMensaje(j.id), 'Enviar mensaje');
        mk('🚫', () => this._abrirBanJugador(j), 'Banear');
        fila.appendChild(acciones);
        cont.appendChild(fila);
      }
      if (!globales.length) {
        cont.innerHTML = '<div class="campo-caja" style="padding:14px;">No hay jugadores con ese criterio</div>';
      }
    };

    buscar.oninput = () => pintar(buscar.value);
    pintar('');
    this._colocacion = null;
    this._mostrarPanelDerecho('admin-vista-jugadores', '👥 Jugadores');
  },

  listarJugadores() { this.listarCuentas(); },

  _partidaDefault() {
    return {
      mochila: new Array(25).fill(null),
      dinero: { saldo: CONFIG.dineroInicial, control: '' }
    };
  },

  _partidaNuevaCompleta() {
    const mochila = new Array(25).fill(null);
    mochila[0] = { id: 'agua', cantidad: 2 };
    mochila[1] = { id: 'pan', cantidad: 1 };
    return {
      mochila,
      dinero: { saldo: CONFIG.dineroInicial },
      vida: CONFIG.vidaMaxima,
      hambre: CONFIG.hambreInicial,
      muerto: false
    };
  },

  _abrirCrearJugador() {
    this._editorJugador = {
      perfil: { id: '__nuevo__', nombre: '', telefono: '' },
      partida: this._partidaNuevaCompleta(),
      _arrastre: null,
      _creando: true
    };
    const nom = document.getElementById('admin-nuevo-nombre');
    const tel = document.getElementById('admin-nuevo-telefono');
    const c1 = document.getElementById('admin-nuevo-clave');
    const c2 = document.getElementById('admin-nuevo-clave2');
    const chk = document.getElementById('admin-nuevo-inventario-default');
    if (nom) nom.value = '';
    if (tel) tel.value = '';
    if (c1) c1.value = '';
    if (c2) c2.value = '';
    if (chk) chk.checked = true;
    this._pintarCrearJugador();
    this._mostrarPanelDerecho('admin-vista-crear-jugador', '➕ Crear jugador');
  },

  _pintarCrearJugador() {
    const ed = this._editorJugador;
    if (!ed || !ed._creando) return;
    const rejJug = document.getElementById('admin-nuevo-rejilla');
    const rejInf = document.getElementById('admin-nuevo-infinito');
    if (!rejJug) return;
    rejJug.innerHTML = '';
    ed.partida.mochila.forEach((sl, i) => {
      const cel = document.createElement('div');
      cel.className = 'slot admin-slot-jugador';
      cel.dataset.indice = i;
      if (sl) {
        const item = Items.seguro(sl.id);
        cel.textContent = item.icono;
        const cant = document.createElement('span');
        cant.className = 'cantidad';
        cant.textContent = sl.cantidad;
        cel.appendChild(cant);
        cel.title = item.nombre + ' x' + sl.cantidad;
      }
      cel.addEventListener('pointerdown', ev => this._editorArrastre(ev, 'jugador', i));
      rejJug.appendChild(cel);
    });
    this._pintarInventarioInfinito(rejInf);
  },

  async _guardarCrearJugador() {
    const ed = this._editorJugador;
    if (!ed || !ed._creando) return;
    const nombre = (document.getElementById('admin-nuevo-nombre').value || '').trim();
    const telefono = (document.getElementById('admin-nuevo-telefono').value || '').trim().replace(/[\s-]/g, '');
    const clave = document.getElementById('admin-nuevo-clave').value || '';
    const clave2 = document.getElementById('admin-nuevo-clave2').value || '';
    const usarDefault = document.getElementById('admin-nuevo-inventario-default').checked;

    if (nombre.length < 2) { alert('Ponle un nombre al jugador'); return; }
    if (clave.length < 4) { alert('La contraseña debe tener al menos 4 caracteres'); return; }
    if (clave !== clave2) { alert('Las contraseñas no coinciden'); return; }
    if (telefono && typeof Usuarios !== 'undefined' && !Usuarios.telefonoValido(telefono)) {
      alert('Número de teléfono inválido');
      return;
    }

    await this.actualizarJugadoresGlobales();
    const err = this.validarRegistro(nombre, telefono, null);
    if (err) { alert(err); return; }

    if (usarDefault && !ed.partida.mochila.some(s => s)) {
      ed.partida = this._partidaNuevaCompleta();
    }

    const perfil = {
      id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      nombre,
      telefono,
      pinHash: await Utilidades.sha256('pin-perfil|' + clave),
      creado: Date.now()
    };

    const partida = {
      mochila: ed.partida.mochila,
      dinero: ed.partida.dinero || { saldo: CONFIG.dineroInicial },
      vida: ed.partida.vida ?? CONFIG.vidaMaxima,
      hambre: CONFIG.hambreInicial,
      muerto: false
    };
    partida.dinero.control = await Utilidades.sha256(Guardado.SAL + '|saldo|' + partida.dinero.saldo);

    this.registrarJugador(perfil, true);
    this._pinAdminSet(perfil.id, clave);
    if (typeof Usuarios !== 'undefined' && Usuarios.datos) {
      if (!Usuarios.datos.lista.find(p => p.id === perfil.id)) {
        Usuarios.datos.lista.push(Object.assign({}, perfil));
        Usuarios._guardarLista();
      }
    }
    if (!this.datos.partidasExtra) this.datos.partidasExtra = {};
    const snap = { datos: partida, t: Date.now() };
    this.datos.partidasExtra[perfil.id] = snap;
    this.guardar();

    const ok = await MundoPublico.guardarCuenta(perfil, snap);
    await this._publicarParaTodos(true);

    this._editorJugador = null;
    Notificaciones.mostrar(
      (ok ? '✅' : '⚠️') + ' Cuenta de ' + nombre + ' en el servidor. Entra con nombre y contraseña.',
      ok ? 'exito' : 'alerta', 9000);
    this._listarCuentasAsync();
  },

  async _obtenerPartidaJugador(perfil) {
    const base = (d) => ({
      mochila: d.mochila || new Array(25).fill(null),
      dinero: d.dinero || { saldo: CONFIG.dineroInicial },
      vida: d.vida ?? CONFIG.vidaMaxima,
      hambre: d.hambre ?? CONFIG.hambreInicial,
      muerto: d.vida === 0 || !!d.muerto,
      armaEquipada: d.armaEquipada || null,
      posicionJugador: d.posicionJugador || null,
      xp: d.xp ?? 0,
      nivel: d.nivel ?? 1
    });
    if (perfil.id === Usuarios.perfilActivo?.id) {
      return JSON.parse(JSON.stringify(base(Guardado.datos)));
    }
    if (typeof MundoPublico !== 'undefined' && MundoPublico.cargarCuenta) {
      const cuenta = await MundoPublico.cargarCuenta(perfil.id);
      if (cuenta?.partida?.datos) {
        return JSON.parse(JSON.stringify(base(cuenta.partida.datos)));
      }
    }
    const clave = CONFIG.claveGuardado + '::' + perfil.id;
    try {
      const p = JSON.parse(localStorage.getItem(clave));
      if (p?.datos) return JSON.parse(JSON.stringify(base(p.datos)));
    } catch (e) {}
    const nube = (this.publicado.partidas || {})[perfil.id];
    if (nube) {
      const d = nube.datos || nube;
      if (d.mochila) return JSON.parse(JSON.stringify(base(d)));
    }
    const extra = (this.datos.partidasExtra || {})[perfil.id];
    if (extra) {
      const d = extra.datos || extra;
      if (d.mochila) return JSON.parse(JSON.stringify(base(d)));
    }
    return Object.assign(this._partidaDefault(), { vida: CONFIG.vidaMaxima, muerto: false });
  },

  async _guardarPartidaJugador(perfil, partida) {
    if (!partida.mochila) partida.mochila = new Array(25).fill(null);
    if (!partida.dinero) partida.dinero = { saldo: 0 };
    partida.dinero.control = await Utilidades.sha256(Guardado.SAL + '|saldo|' + partida.dinero.saldo);
    if (partida.vida == null) partida.vida = CONFIG.vidaMaxima;
    partida.muerto = partida.vida <= 0;

    if (perfil.id === Usuarios.perfilActivo?.id) {
      Guardado.datos.mochila = partida.mochila;
      Guardado.datos.dinero = partida.dinero;
      Guardado.datos.vida = partida.vida;
      Guardado.datos.muerto = partida.muerto;
      if (partida.armaEquipada !== undefined) Guardado.datos.armaEquipada = partida.armaEquipada;
      await Guardado.guardarAhora();
      Mochila.slots = Guardado.datos.mochila;
      Mochila.pintar();
      Dinero.saldo = partida.dinero.saldo;
      Dinero.pintar();
      if (partida.muerto) Vida._activarMuerte();
      else if (typeof Vida.revivir === 'function' && (Guardado.datos.muerto || Vida.estaMuerto())) {
        Vida.revivir(partida.vida);
      } else {
        Vida.actual = partida.vida;
        if (partida.hambre != null) {
          Vida.hambre = partida.hambre;
          Guardado.datos.hambre = partida.hambre;
        }
        Vida.pintar();
      }
      return;
    }

    const clave = CONFIG.claveGuardado + '::' + perfil.id;
    let paquete;
    try { paquete = JSON.parse(localStorage.getItem(clave)); } catch (e) { paquete = null; }
    if (!paquete?.datos) paquete = { datos: Guardado._estadoNuevo() };
    paquete.datos.mochila = partida.mochila;
    paquete.datos.dinero = partida.dinero;
    paquete.datos.vida = partida.vida;
    paquete.datos.muerto = partida.muerto;
    if (partida.armaEquipada !== undefined) paquete.datos.armaEquipada = partida.armaEquipada;
    if (partida.hambre != null) paquete.datos.hambre = partida.hambre;
    if (partida.posicionJugador && partida.posicionJugador.length >= 2) {
      paquete.datos.posicionJugador = partida.posicionJugador.slice();
    }
    if (partida.xp != null) paquete.datos.xp = partida.xp;
    if (partida.nivel != null) paquete.datos.nivel = partida.nivel;
    paquete.firma = await Utilidades.sha256(JSON.stringify(paquete.datos) + Guardado.SAL);
    localStorage.setItem(clave, JSON.stringify(paquete));

    if (!this.datos.partidasExtra) this.datos.partidasExtra = {};
    const snap = {
      datos: {
        mochila: partida.mochila,
        dinero: partida.dinero,
        vida: partida.vida,
        hambre: partida.hambre ?? CONFIG.hambreInicial,
        muerto: partida.muerto,
        xp: partida.xp,
        nivel: partida.nivel,
        armaEquipada: partida.armaEquipada || null
      },
      t: Date.now()
    };
    this.datos.partidasExtra[perfil.id] = snap;
    this.guardar();
    if (MundoPublico.puedeEscribir()) {
      await MundoPublico.guardarCuenta(perfil, snap);
    }
    await this._publicarParaTodos(true);
  },

  async _abrirEditorJugador(perfil, soloGlobal) {
    let p = perfil;
    if (soloGlobal) {
      const g = this.jugadoresGlobales().find(j => j.id === perfil.id);
      if (g) p = Object.assign({}, g);
    }
    this._editorJugador = {
      perfil: p,
      partida: await this._obtenerPartidaJugador(p),
      _arrastre: null
    };
    if (!this._editorJugador.partida.mochila) {
      this._editorJugador.partida.mochila = new Array(25).fill(null);
    }
    document.getElementById('admin-editor-oro').value = this._editorJugador.partida.dinero?.saldo ?? 0;
    document.getElementById('admin-editor-vida').value = this._editorJugador.partida.vida ?? CONFIG.vidaMaxima;
    const nom = document.getElementById('admin-editor-nombre');
    const tel = document.getElementById('admin-editor-telefono');
    const clv = document.getElementById('admin-editor-clave');
    if (nom) nom.value = this._editorJugador.perfil.nombre || '';
    if (tel) tel.value = this._editorJugador.perfil.telefono || '';
    if (clv) clv.value = this._pinAdminGet(this._editorJugador.perfil.id) || '';
    this._pintarEditorJugador();
    this._mostrarPanelDerecho('admin-vista-editor', '✏️ ' + this._editorJugador.perfil.nombre);
  },

  _maxPila(id) {
    return Items.seguro(id).unico ? 1 : (CONFIG.maxPila || 10);
  },

  _idsCatalogoCompleto() {
    const ids = new Set(Object.keys(CATALOGO_ITEMS));
    for (const it of (this.datos.itemsNuevos || [])) if (it?.id) ids.add(it.id);
    for (const it of (this.publicado.itemsNuevos || [])) if (it?.id) ids.add(it.id);
    return [...ids].sort((a, b) => Items.seguro(a).nombre.localeCompare(Items.seguro(b).nombre));
  },

  _pintarInventarioInfinito(contenedor, enlazar) {
    if (!contenedor) return;
    const padre = contenedor.parentElement;
    if (!enlazar && padre) {
      let barra = padre.querySelector('.admin-infinito-barra');
      if (!barra) {
        barra = document.createElement('div');
        barra.className = 'admin-infinito-barra';
        const btnNota = document.createElement('button');
        btnNota.type = 'button';
        btnNota.className = 'btn-admin-nota-mini';
        btnNota.textContent = '📝 Crear nota';
        btnNota.addEventListener('click', () => this._crearNotaAdmin());
        barra.appendChild(btnNota);
        padre.insertBefore(barra, contenedor);
      }
    }
    contenedor.innerHTML = '';
    if (this._notaPendiente && !enlazar) {
      const celNota = document.createElement('div');
      celNota.className = 'slot admin-slot-infinito admin-slot-nota';
      celNota.textContent = '📝';
      celNota.title = this._notaPendiente.slice(0, 80);
      celNota.addEventListener('pointerdown', ev => this._editorArrastre(ev, 'nota', null));
      contenedor.appendChild(celNota);
    }
    const porCat = { consumibles: [], armas: [], animales: [], objetos: [] };
    for (const id of this._idsCatalogoCompleto()) {
      const cat = Items.categoriaAdm(Items.seguro(id));
      (porCat[cat] || porCat.objetos).push(id);
    }
    const orden = ['consumibles', 'armas', 'animales', 'objetos'];
    for (const cat of orden) {
      const ids = porCat[cat];
      if (!ids.length) continue;
      const tit = document.createElement('div');
      tit.className = 'admin-adm-categoria';
      tit.textContent = Items.tituloCategoriaAdm(cat);
      contenedor.appendChild(tit);
      const rej = document.createElement('div');
      rej.className = 'admin-adm-categoria-rejilla';
      for (const id of ids) {
        const item = Items.seguro(id);
        const cel = document.createElement('div');
        cel.className = 'slot admin-slot-infinito';
        cel.dataset.itemId = id;
        cel.textContent = item.icono;
        const inf = document.createElement('span');
        inf.className = 'cantidad infinito';
        inf.textContent = '∞';
        cel.appendChild(inf);
        let hint = item.nombre;
        if (item.cura) hint += ' · hambre +' + item.cura;
        if (item.curaVida) hint += ' · vida +' + item.curaVida;
        if (item.dano) hint += ' · daño +' + item.dano + ' (nv ' + (item.nivelMin || 1) + '–' + (item.nivelMax || 100) + ')';
        cel.title = hint;
        if (enlazar) enlazar(id, cel);
        else cel.addEventListener('pointerdown', ev => this._editorArrastre(ev, 'infinito', id));
        rej.appendChild(cel);
      }
      contenedor.appendChild(rej);
    }
  },

  _apilarEnMochilaAdmin(mochila, dest, id, cantidad) {
    const item = Items.obtener(id);
    if (!item) return false;
    const max = this._maxPila(id);
    if (item.unico) {
      if (mochila[dest]) return false;
      mochila[dest] = { id, cantidad: 1 };
      return true;
    }
    const sl = mochila[dest];
    if (sl && sl.id === id) {
      if (sl.cantidad >= max) return false;
      sl.cantidad = Math.min(max, sl.cantidad + cantidad);
      return true;
    }
    if (sl) return false;
    mochila[dest] = { id, cantidad: Math.min(cantidad, max) };
    return true;
  },

  _moverSlotAdmin(mochila, origen, destino) {
    const o = mochila[origen];
    const d = mochila[destino];
    if (!o) return;
    const max = this._maxPila(o.id);
    if (d && d.id === o.id && !Items.seguro(o.id).unico) {
      const espacio = max - d.cantidad;
      if (espacio <= 0) {
        mochila[destino] = o;
        mochila[origen] = d;
      } else {
        const mover = Math.min(o.cantidad, espacio);
        d.cantidad += mover;
        o.cantidad -= mover;
        if (o.cantidad <= 0) mochila[origen] = null;
      }
    } else {
      mochila[destino] = o;
      mochila[origen] = d || null;
    }
  },

  _pintarEditorJugador() {
    const ed = this._editorJugador;
    if (!ed) return;
    const rejJug = document.getElementById('admin-rejilla-jugador');
    const rejInf = document.getElementById('admin-rejilla-infinito');
    rejJug.innerHTML = '';

    ed.partida.mochila.forEach((sl, i) => {
      const cel = document.createElement('div');
      cel.className = 'slot admin-slot-jugador';
      cel.dataset.indice = i;
      if (sl) {
        const item = Items.seguro(sl.id);
        cel.textContent = item.icono;
        const cant = document.createElement('span');
        cant.className = 'cantidad';
        cant.textContent = sl.cantidad;
        cel.appendChild(cant);
        cel.title = item.nombre + ' x' + sl.cantidad;
      }
      cel.addEventListener('pointerdown', ev => this._editorArrastre(ev, 'jugador', i));
      rejJug.appendChild(cel);
    });

    this._pintarInventarioInfinito(rejInf);
  },

  _editorArrastre(ev, origen, ref) {
    ev.preventDefault();
    const ed = this._editorJugador;
    if (!ed) return;
    ed._arrastre = { origen, ref, movio: false, x0: ev.clientX, y0: ev.clientY, fantasma: null };
    const mover = e => this._editorMover(e);
    const soltar = e => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      this._editorSoltar(e);
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
  },

  _editorMover(ev) {
    const a = this._editorJugador?._arrastre;
    if (!a) return;
    if (!a.movio && Math.hypot(ev.clientX - a.x0, ev.clientY - a.y0) < 8) return;
    if (!a.movio) {
      a.movio = true;
      let icono = '📦';
      if (a.origen === 'infinito' || a.origen === 'catalogo') icono = Items.seguro(a.ref).icono;
      else if (a.origen === 'nota') icono = '📝';
      else if (a.origen === 'jugador' && this._editorJugador.partida.mochila[a.ref]) {
        icono = Items.seguro(this._editorJugador.partida.mochila[a.ref].id).icono;
      }
      a.fantasma = document.createElement('div');
      a.fantasma.id = 'item-fantasma';
      a.fantasma.textContent = icono;
      document.body.appendChild(a.fantasma);
    }
    a.fantasma.style.left = ev.clientX + 'px';
    a.fantasma.style.top = ev.clientY + 'px';
    document.querySelectorAll('.admin-slot-jugador.destino').forEach(el => el.classList.remove('destino'));
    const bajo = document.elementFromPoint(ev.clientX, ev.clientY);
    if (bajo?.classList.contains('admin-slot-jugador')) bajo.classList.add('destino');
  },

  _editorSoltar(ev) {
    const ed = this._editorJugador;
    const a = ed?._arrastre;
    if (a?.fantasma) a.fantasma.remove();
    if (!ed || !a) return;
    ed._arrastre = null;

    const bajo = document.elementFromPoint(ev.clientX, ev.clientY);
    const slotEl = bajo?.closest?.('.admin-slot-jugador');
    if (!slotEl) {
      if (a.origen === 'jugador' && a.movio) ed.partida.mochila[a.ref] = null;
      if (ed._creando) this._pintarCrearJugador();
      else this._pintarEditorJugador();
      return;
    }
    const dest = parseInt(slotEl.dataset.indice, 10);

    if (a.origen === 'infinito' || a.origen === 'catalogo') {
      const id = a.ref;
      if (!this._apilarEnMochilaAdmin(ed.partida.mochila, dest, id, 1)) {
        Notificaciones.mostrar('Casilla llena o pila al máximo (' + this._maxPila(id) + ')', 'alerta', 3000);
      }
    } else if (a.origen === 'nota') {
      const texto = this._notaPendiente;
      if (!texto) return;
      if (ed.partida.mochila[dest]) {
        Notificaciones.mostrar('Casilla ocupada', 'alerta', 2500);
      } else {
        ed.partida.mochila[dest] = { id: 'nota_escrita', cantidad: 1, texto };
        this._notaPendiente = null;
      }
    } else if (a.origen === 'jugador') {
      if (!a.movio) return;
      const origen = a.ref;
      if (origen === dest) return;
      this._moverSlotAdmin(ed.partida.mochila, origen, dest);
    }
    if (ed._creando) this._pintarCrearJugador();
    else this._pintarEditorJugador();
  },

  async _guardarEditorJugador() {
    const ed = this._editorJugador;
    if (!ed) return;
    const oro = parseInt(document.getElementById('admin-editor-oro').value, 10);
    const vida = parseInt(document.getElementById('admin-editor-vida').value, 10);
    const nombre = (document.getElementById('admin-editor-nombre')?.value || '').trim();
    const telefono = (document.getElementById('admin-editor-telefono')?.value || '').trim().replace(/[\s-]/g, '');
    const claveNueva = document.getElementById('admin-editor-clave')?.value || '';
    if (isNaN(oro) || oro < 0) { this._adminAviso('Oro inválido'); return; }
    if (isNaN(vida) || vida < 0) { this._adminAviso('Vida inválida'); return; }
    const maxVida = (typeof Vida !== 'undefined' && Vida.vidaMaxima)
      ? Vida.vidaMaxima(ed.partida.nivel || 1) : CONFIG.vidaMaxima;
    if (vida > maxVida) { this._adminAviso('Vida máxima para ese nivel: ' + maxVida); return; }
    if (nombre.length < 2) { this._adminAviso('Nombre mínimo 2 letras'); return; }
    if (telefono && !Usuarios.telefonoValido(telefono)) { this._adminAviso('Teléfono inválido'); return; }
    const errNom = this.validarRegistro(nombre, telefono, ed.perfil.id);
    if (errNom) { this._adminAviso(errNom); return; }
    if (claveNueva) {
      const errClave = Utilidades.claveCuentaValida(claveNueva);
      if (errClave) { this._adminAviso(errClave); return; }
    } else if (!ed.perfil.pinHash) {
      this._adminAviso('Pon una contraseña para que el jugador pueda entrar'); return;
    }
    ed.partida.dinero = ed.partida.dinero || { saldo: 0 };
    ed.partida.dinero.saldo = oro;
    ed.partida.vida = vida;
    ed.partida.muerto = vida <= 0;
    ed.perfil.nombre = nombre;
    ed.perfil.telefono = telefono;
    if (claveNueva) {
      ed.perfil.pinHash = await Utilidades.sha256('pin-perfil|' + claveNueva);
      this._pinAdminSet(ed.perfil.id, claveNueva);
    }
    const local = Usuarios.datos.lista.find(p => p.id === ed.perfil.id);
    if (local) {
      local.nombre = nombre;
      local.telefono = telefono;
      if (claveNueva) local.pinHash = ed.perfil.pinHash;
      if (Usuarios.perfilActivo && Usuarios.perfilActivo.id === local.id) {
        Usuarios.perfilActivo.nombre = nombre;
        Usuarios.perfilActivo.telefono = telefono;
      }
      Usuarios._guardarLista();
    }
    this.registrarJugador(ed.perfil, true);
    await this._guardarPartidaJugador(ed.perfil, ed.partida);
    this._adminAviso('✅ Datos de ' + nombre + ' guardados', 'exito');
    this._editorJugador = null;
    this.listarCuentas();
  },

  async _entrarComoJugador() {
    const ed = this._editorJugador;
    if (!ed) return;
    const clave = document.getElementById('admin-editor-clave')?.value || '';
    let perfil = Object.assign({}, ed.perfil);
    if (clave) {
      perfil.pinHash = await Utilidades.sha256('pin-perfil|' + clave);
      this._pinAdminSet(perfil.id, clave);
      this.guardar();
    }
    if (!perfil.pinHash) {
      this._adminAviso('Este jugador no tiene contraseña. Escríbela y guarda primero.');
      return;
    }

    const oro = parseInt(document.getElementById('admin-editor-oro')?.value, 10);
    const vidaEd = parseInt(document.getElementById('admin-editor-vida')?.value, 10);
    if (!isNaN(oro)) {
      ed.partida.dinero = ed.partida.dinero || { saldo: 0 };
      ed.partida.dinero.saldo = oro;
    }
    if (!isNaN(vidaEd)) {
      ed.partida.vida = vidaEd;
      ed.partida.muerto = vidaEd <= 0;
    }
    const claveSave = CONFIG.claveGuardado + '::' + perfil.id;
    try {
      const prev = JSON.parse(localStorage.getItem(claveSave));
      if (prev?.datos?.posicionJugador?.length >= 2 && !ed.partida.posicionJugador) {
        ed.partida.posicionJugador = prev.datos.posicionJugador.slice();
      }
      if (prev?.datos?.hambre != null && ed.partida.hambre == null) {
        ed.partida.hambre = prev.datos.hambre;
      }
    } catch (e) {}

    if (typeof Guardado !== 'undefined' && Usuarios.perfilActivo) {
      await Guardado.guardarAhora();
    }
    await this._guardarPartidaJugador(perfil, ed.partida);

    const local = Usuarios.datos.lista.find(p => p.id === perfil.id);
    const entrada = {
      id: perfil.id,
      nombre: perfil.nombre,
      telefono: perfil.telefono || '',
      telefonoCambiadoEn: local?.telefonoCambiadoEn || 0,
      pinHash: perfil.pinHash,
      creado: perfil.creado || Date.now()
    };
    const idx = Usuarios.datos.lista.findIndex(p => p.id === entrada.id);
    if (idx >= 0) Usuarios.datos.lista[idx] = Object.assign(Usuarios.datos.lista[idx], entrada);
    else Usuarios.datos.lista.push(entrada);
    entrada.sesionToken = Usuarios._generarTokenSesion();
    entrada.sesionT = Date.now();
    if (idx >= 0) {
      Usuarios.datos.lista[idx].sesionToken = entrada.sesionToken;
      Usuarios.datos.lista[idx].sesionT = entrada.sesionT;
    }
    Usuarios.datos.activo = entrada.id;
    Usuarios.datos.sesionId = entrada.id;
    Usuarios._guardarLista();
    this.registrarJugador(entrada, true);
    Usuarios._publicarSesionEnFondo(entrada, entrada.sesionToken);
    this._editorJugador = null;
    document.getElementById('ventana-admin')?.classList.add('oculto');
    sessionStorage.setItem('mariel_cambio_sesion', entrada.id);
    sessionStorage.setItem('mariel_forzar_mundo', '1');
    if (window.MarielBoot) MarielBoot.mostrar('Entrando como ' + entrada.nombre + '…');
    location.reload();
  },

  _abrirBanJugador(j) {
    this._banObjetivo = j;
    document.getElementById('admin-ban-nombre').textContent = j.nombre;
    this._mostrarPanelDerecho('admin-vista-ban', '🚫 Banear jugador');
  },

  _aplicarBan(ms) {
    const j = this._banObjetivo;
    if (!j) return;
    if (ms === null) {
      const ids = [j.id, j.telefono].filter(Boolean);
      this.datos.baneados = (this.datos.baneados || []).filter(b => !ids.includes(b.id));
      this.publicado.baneados = (this.publicado.baneados || []).filter(b => !ids.includes(b.id));
      this.guardar();
      Notificaciones.mostrar('🟢 Ban quitado a ' + j.nombre, 'exito');
    } else {
      const motivo = document.getElementById('admin-ban-motivo').value.trim() || 'Incumplimiento de reglas';
      const entrada = { id: j.id, motivo, t: Date.now(), hasta: ms > 0 ? Date.now() + ms : null };
      this.datos.baneados = (this.datos.baneados || []).filter(b => b.id !== j.id && b.id !== j.telefono);
      this.datos.baneados.push(entrada);
      if (j.telefono) this.datos.baneados.push({ id: j.telefono, motivo, t: Date.now(), hasta: entrada.hasta });
      this.guardar();
      this._publicarParaTodos();
      Notificaciones.mostrar('🚫 ' + j.nombre + ' baneado', 'alerta', 6000);
    }
    this._banObjetivo = null;
    this.listarCuentas();
  },

  async _editarCuenta(perfil) {
    this._abrirEditorJugador(perfil);
  },

  // ----- Motor para editar la partida guardada de cualquier jugador -----
  async _editarSave(perfil, editor) {
    const clave = CONFIG.claveGuardado + '::' + perfil.id;
    let paquete;
    try { paquete = JSON.parse(localStorage.getItem(clave)); } catch (e) { paquete = null; }
    if (!paquete || !paquete.datos) { alert('Ese jugador aún no tiene partida guardada'); return; }
    await editor(paquete.datos);
    paquete.firma = await Utilidades.sha256(JSON.stringify(paquete.datos) + Guardado.SAL);
    localStorage.setItem(clave, JSON.stringify(paquete));
  },

  async _anotarHistorialSave(datosSave, tipo, detalle, monto, saldo) {
    const lista = tipo === 'dinero' ? datosSave.historialDinero : datosSave.historialObjetos;
    const anterior = lista.length ? lista[lista.length - 1].hash : 'GENESIS';
    const e = { t: Date.now(), detalle, monto, saldo: saldo ?? null,
      lugar: 'Ajuste del administrador', pos: null, hashAnterior: anterior };
    e.hash = await Utilidades.sha256(
      Guardado.SAL + '|' + e.t + '|' + e.detalle + '|' + e.monto + '|' + e.saldo + '|' +
      (e.lugar ?? '') + '|' + (e.pos ? e.pos.join(',') : '') + '|' + e.hashAnterior);
    lista.push(e);
  },

  _eliminarJugador(perfil) {
    if (perfil.id === Usuarios.perfilActivo.id) { alert('No puedes eliminar al jugador activo (cambia de jugador primero)'); return; }
    if (!confirm('¿Eliminar a ' + perfil.nombre + ' y TODA su partida de este teléfono?')) return;
    Usuarios.datos.lista = Usuarios.datos.lista.filter(p => p.id !== perfil.id);
    Usuarios._guardarLista();
    localStorage.removeItem(CONFIG.claveGuardado + '::' + perfil.id);
    Notificaciones.mostrar('🗑️ Jugador ' + perfil.nombre + ' eliminado', 'alerta');
    this.listarJugadores();
  },

  // ---------- CLAVE GITHUB (solo en el teléfono del admin) ----------
  _tokenEnTelefono() {
    return !!(this.datos && this.datos.tokenPublicar);
  },

  _aplicarTokenTelefono() {
    if (this.datos && this.datos.tokenPublicar) {
      MundoPublico._tokenDesdeMundo = this.datos.tokenPublicar;
    }
    this._actualizarEtiquetaClave();
  },

  _actualizarEtiquetaClave() {
    const etiq = document.getElementById('admin-clave-etiqueta');
    if (!etiq) return;
    etiq.textContent = this._tokenEnTelefono()
      ? 'Token GitHub ✅'
      : 'Token GitHub (configurar)';
  },

  abrirConfiguracionClave() {
    const panelGitHub = document.getElementById('admin-github-token');
    if (panelGitHub) panelGitHub.classList.remove('oculto');
    const input = document.getElementById('admin-clave-token');
    const estado = document.getElementById('admin-clave-estado');
    const previo = document.getElementById('admin-clave-previo');
    if (!input || !estado) return;
    input.value = '';
    const token = this.datos && this.datos.tokenPublicar;
    if (token) {
      estado.textContent = '✅ Token guardado en este teléfono.';
      estado.className = 'admin-clave-estado ok';
      if (previo) {
        previo.textContent = 'Token actual: ••••' + token.slice(-6) + ' (pega uno nuevo solo si quieres cambiarlo)';
        previo.classList.remove('oculto');
      }
    } else {
      estado.textContent = '⚠️ Aún no hay token en este teléfono.';
      estado.className = 'admin-clave-estado';
      if (previo) previo.classList.add('oculto');
    }
    this._mostrarPanelDerecho('admin-vista-clave', '🔑 Token GitHub');
    setTimeout(() => input.focus(), 200);
  },

  async _probarTokenGitHub(token) {
    if (!token || !CONFIG.repoPublicacion) return false;
    try {
      const url = 'https://api.github.com/repos/' + CONFIG.repoPublicacion +
        '/contents/datos/mundo.json?ref=' + CONFIG.ramaPublicacion;
      const r = await fetch(url, {
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }
      });
      return r.ok;
    } catch (e) { return false; }
  },

  _urlCrearTokenGitHub() {
    return 'https://github.com/settings/tokens/new?scopes=repo&description=MarielExplorer';
  },

  abrirCrearTokenGitHub() {
    window.open(this._urlCrearTokenGitHub(), '_blank', 'noopener');
    Notificaciones.mostrar(
      '1) Crea el token en GitHub · 2) Cópialo · 3) Pégalo aquí y pulsa Guardar',
      'info', 12000
    );
  },

  async _guardarClaveTelefono() {
    const input = document.getElementById('admin-clave-token');
    const btn = document.getElementById('btn-admin-clave-guardar');
    const token = (input && input.value || '').trim();
    if (!token) {
      alert('Pega tu token de GitHub en el campo de arriba, o pulsa «Crear token en GitHub».');
      return;
    }
    if (token.length < 20) {
      alert('Ese token parece muy corto. Revisa que lo hayas copiado completo.');
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Comprobando…'; }
    const valido = await this._probarTokenGitHub(token);
    if (!valido) {
      if (btn) { btn.disabled = false; btn.textContent = 'Guardar token'; }
      alert('Token inválida o sin permiso de escritura en randyraulbr1/github-pages.');
      return;
    }
    this.datos.tokenPublicar = token;
    localStorage.setItem(this.CLAVE, JSON.stringify(this.datos,
      (clave, valor) => clave.startsWith('_') ? undefined : valor));
    this._aplicarTokenTelefono();
    input.value = '';
    const estado = document.getElementById('admin-clave-estado');
    if (estado) {
      estado.textContent = '✅ Token guardada en este teléfono. Sincronizando…';
      estado.className = 'admin-clave-estado ok';
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar token'; }
    this._volverAlPanel();
    this._publicarParaTodos(false).then(ok => {
      if (ok) this._avisoSyncManual('🔑 Token activa · cuentas y mundo en GitHub');
      else Notificaciones.mostrar('Token guardada aquí. Pulsa Sincronizar en Admin.', 'alerta', 8000);
    });
    this._dispararSyncIndiceAccion().catch(() => {});
  },

  async _dispararSyncIndiceAccion() {
    const token = this._tokenPublicacion();
    if (!token || !CONFIG.repoPublicacion) return false;
    try {
      const r = await fetch('https://api.github.com/repos/' + CONFIG.repoPublicacion +
        '/actions/workflows/mariel-sync-cuentas.yml/dispatches', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ref: CONFIG.ramaPublicacion })
      });
      return r.ok || r.status === 204;
    } catch (e) { return false; }
  },

  _borrarClaveTelefono() {
    if (!this._tokenEnTelefono()) {
      Notificaciones.mostrar('No hay clave guardada en este teléfono', 'info');
      return;
    }
    if (!confirm('¿Borrar la clave de GitHub de este teléfono?')) return;
    this.datos.tokenPublicar = '';
    localStorage.setItem(this.CLAVE, JSON.stringify(this.datos,
      (clave, valor) => clave.startsWith('_') ? undefined : valor));
    MundoPublico._tokenDesdeMundo = null;
    this._actualizarEtiquetaClave();
    const estado = document.getElementById('admin-clave-estado');
    if (estado) {
      estado.textContent = 'Clave borrada de este teléfono.';
      estado.className = 'admin-clave-estado';
    }
    Notificaciones.mostrar('🗑️ Clave borrada de este teléfono', 'alerta');
  },

  configurarPublicacion() {
    this.abrirConfiguracionClave();
  },

  // Fusiona el mundo del admin con el remoto (evita pisar jugadores/partidas más nuevas)
  _aplicarAdminEnMundo(remoto, admin) {
    remoto.misiones = admin.misiones || [];
    remoto.tesoros = admin.tesoros || [];
    remoto.objetos = admin.objetos || [];
    remoto.posiciones = admin.posiciones || {};
    remoto.eliminados = admin.eliminados || [];
    remoto.precios = admin.precios || {};
    remoto.itemsNuevos = admin.itemsNuevos || [];
    remoto.mantenimiento = admin.mantenimiento || { activo: false, mensaje: '' };
    remoto.baneados = admin.baneados || [];
    remoto.mensajes = admin.mensajes || [];
    remoto.cofres = admin.cofres || [];
    remoto.correoReclamados = admin.correoReclamados || [];
    remoto.correoTienda = admin.correoTienda || [];
    remoto.enemigos = admin.enemigos || [];
    remoto.tiendasAdmin = admin.tiendasAdmin || [];
    remoto.tiendasStock = admin.tiendasStock || remoto.tiendasStock || {};
    remoto.combate = admin.combate || remoto.combate;
    if (admin.moverPinJugador !== undefined) remoto.moverPinJugador = !!admin.moverPinJugador;
    if (admin.enemigosEstado) remoto.enemigosEstado = admin.enemigosEstado;
    else if (!remoto.enemigosEstado) remoto.enemigosEstado = {};
    delete remoto.claveSyncNube;
    delete remoto._syncToken;

    const porJugador = new Map();
    for (const j of (remoto.jugadores || [])) {
      if (j && j.id) porJugador.set(j.id, Object.assign({}, j));
    }
    for (const j of (admin.jugadores || [])) {
      if (!j || !j.id) continue;
      const prev = porJugador.get(j.id) || {};
      const sesionRemota = (prev.sesionT || 0) >= (j.sesionT || 0);
      porJugador.set(j.id, Object.assign({}, j, prev, {
        pinHash: j.pinHash || prev.pinHash,
        nombre: j.nombre || prev.nombre,
        telefono: j.telefono || prev.telefono,
        sesionToken: sesionRemota ? prev.sesionToken : j.sesionToken,
        sesionT: Math.max(prev.sesionT || 0, j.sesionT || 0)
      }));
    }
    remoto.jugadores = [...porJugador.values()];

    if (!remoto.partidas) remoto.partidas = {};
    for (const [id, p] of Object.entries(admin.partidas || {})) {
      const actual = remoto.partidas[id];
      if (!actual || !actual.t || (p.t || 0) >= actual.t) remoto.partidas[id] = p;
    }
  },

  _avisoSyncManual(texto) {
    const ahora = Date.now();
    if (this._ultimoAvisoSyncManual && ahora - this._ultimoAvisoSyncManual < 90000) return;
    this._ultimoAvisoSyncManual = ahora;
    Notificaciones.mostrar(texto, 'exito', 4000);
  },

  async publicarMundo(silencioso) {
    if (!this._mundoCargado) return false;
    if (!this.esAdminJugador()) return false;
    let adminLocal;
    try {
      adminLocal = JSON.parse(this._jsonMundo());
    } catch (e) {
      return false;
    }
    const firma = this._firmaMundo(JSON.stringify(adminLocal));
    if (firma === this._ultimoFirmaPublicada && !this._pubPendiente) return true;

    adminLocal.actualizadoEn = Date.now();
    const json = JSON.stringify(adminLocal, (clave, valor) =>
      clave.startsWith('_') ? undefined : valor, 2);

    let okGitHub = false;
    let okServidor = false;

    // Opción A: Firebase (automático, sin token en el teléfono)
    if (CONFIG.firebaseMundoUrl) {
      try {
        okGitHub = await MundoPublico.publicar(json);
        if (okGitHub) {
          if (!silencioso) this._avisoSyncManual('☁️ Mundo publicado en Firebase');
        } else if (!silencioso) {
          Notificaciones.mostrar('❌ No se pudo subir a Firebase. Revisa firebaseMundoUrl', 'error', 7000);
        }
      } catch (e) {
        if (!silencioso) Notificaciones.mostrar('❌ Sin conexión. Intenta con WiFi', 'error', 6000);
      }
    } else {
      const token = this._tokenPublicacion();
      if (token) {
        const mensaje = silencioso
          ? 'Actualización automática desde el juego'
          : 'Publicar mundo desde el juego (admin)';
        okGitHub = await MundoPublico.actualizarMundo(
          remoto => this._aplicarAdminEnMundo(remoto, adminLocal),
          mensaje
        );
        if (okGitHub && !silencioso) {
          this._avisoSyncManual('🌍 Mundo publicado en GitHub');
        } else if (!okGitHub && !silencioso) {
          Notificaciones.mostrar(
            '❌ No se pudo subir a GitHub. Revisa el token o pulsa Sincronizar',
            'error', 8000
          );
        } else if (!okGitHub) {
          clearTimeout(this._tempReintento409);
          this._tempReintento409 = setTimeout(() => this._encolarPublicacion(true), 8000);
        }
      }
    }

    // Servidor en vivo (Render): todos conectados ven el cambio al instante
    if (typeof SyncServidor !== 'undefined' && SyncServidor.puedePublicar()) {
      okServidor = await SyncServidor.publicar(json);
      if (okServidor && !silencioso) {
        this._avisoSyncManual('📡 Mundo enviado a todos en vivo');
      }
    }

    if (okGitHub || okServidor) {
      this._sincronizarEstadoTrasPublicar(adminLocal, json);
      this._aplicarMundoRemoto(json);
      return true;
    }

    if (!CONFIG.firebaseMundoUrl && !this._tokenPublicacion() && !okServidor && !silencioso) {
      Notificaciones.mostrar('🔑 Inicia sesión en el juego para publicar en vivo, o configura clave GitHub', 'alerta', 8000);
      this.abrirConfiguracionClave();
    }
    return false;
  },

  // ---------- EXPORTAR ----------
  // Contenido COMPLETO para datos/mundo.json (publicado + cambios locales)
  _itemsConPosicion(lista) {
    return (lista || []).map(item => {
      if (!item) return item;
      const pos = this._posItem(item);
      if (!pos) return Object.assign({}, item);
      return Object.assign({}, item, { pos: pos.slice() });
    }).filter(item => item && item.pos && item.pos.length >= 2);
  },

  _jsonMundo() {
    const quitarTemporales = (clave, valor) => clave.startsWith('_') ? undefined : valor;
    const nuevosPorId = new Map();
    for (const it of this.publicado.itemsNuevos) nuevosPorId.set(it.id, it);
    for (const it of this.datos.itemsNuevos) nuevosPorId.set(it.id, it);
    return JSON.stringify({
      actualizadoEn: this.publicado.actualizadoEn || 0,
      misiones: this._itemsConPosicion(this.misionesTodas()),
      tesoros: this._itemsConPosicion(this.tesorosTodos()),
      objetos: this._itemsConPosicion(this.objetosTodos()),
      posiciones: Object.assign({}, this.publicado.posiciones, this.datos.posiciones),
      eliminados: [...new Set([...this.publicado.eliminados, ...this.datos.eliminados])]
        .filter(id => !id.startsWith('admx_')),
      precios: Object.assign({}, this.publicado.precios, this.datos.precios),
      itemsNuevos: [...nuevosPorId.values()],
      mantenimiento: this.datos.mantenimiento || this.publicado.mantenimiento,
      baneados: (() => {
        const porId = new Map();
        for (const b of this.publicado.baneados) porId.set(b.id, b);
        for (const b of this.datos.baneados) porId.set(b.id, b);
        return [...porId.values()];
      })(),
      mensajes: (() => {
        const porId = new Map();
        for (const m of this.publicado.mensajes) porId.set(m.id, m);
        for (const m of this.datos.mensajes) porId.set(m.id, m);
        return [...porId.values()].slice(-20);
      })(),
      jugadores: this._jugadoresParaPublicar(),
      cofres: this._cofresParaPublicar(),
      correoReclamados: (() => {
        const porCod = new Map();
        for (const r of (this.publicado.correoReclamados || [])) porCod.set(r.codigo, r);
        for (const r of (this.datos.correoReclamadosExtra || [])) porCod.set(r.codigo, r);
        return [...porCod.values()];
      })(),
      correoTienda: (() => {
        const porId = new Map();
        for (const t of (this.publicado.correoTienda || [])) porId.set(t.id, t);
        for (const t of ((typeof Guardado !== 'undefined' && Guardado.datos && Guardado.datos.correoTiendaLocal) || [])) {
          porId.set(t.id, t);
        }
        return [...porId.values()].filter(t => t.cantidad > 0);
      })(),
      partidas: (() => {
        const porId = {};
        for (const [id, p] of Object.entries(this.publicado.partidas || {})) {
          porId[id] = p;
        }
        for (const [id, p] of Object.entries(this.datos.partidasExtra || {})) {
          if (!porId[id] || (p.t && p.t > (porId[id].t || 0))) porId[id] = p;
        }
        return porId;
      })(),
      enemigos: this._itemsConPosicion(this.enemigosTodos()),
      enemigosEstado: Object.assign({}, this.publicado.enemigosEstado || {}),
      tiendasAdmin: this._itemsConPosicion(this.tiendasAdminTodas()),
      tiendasStock: Object.assign({}, this.publicado.tiendasStock || {}),
      tesorosEstado: Object.assign({}, this.publicado.tesorosEstado || {}),
      tesoroIconoMapa: this.tesoroIconoMapa(),
      combate: this.combateConfig(),
      moverPinJugador: !!this.datos.moverPinJugador
    }, quitarTemporales, 2);
  },

  _cofresParaPublicar() {
    const porId = new Map();
    for (const c of (this.publicado.cofres || [])) porId.set(c.id, c);
    for (const c of (this.datos.cofresExtra || [])) porId.set(c.id, c);
    if (typeof Guardado !== 'undefined' && Guardado.datos && Guardado.datos.cofresLocales) {
      for (const c of Guardado.datos.cofresLocales) porId.set(c.id, c);
    }
    return [...porId.values()];
  },

  exportar() {
    const json = this._jsonMundo();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json)
        .then(() => Notificaciones.mostrar('📋 Copiado. Pégalo en datos/mundo.json en GitHub (o mándamelo)', 'exito', 7000))
        .catch(() => prompt('Copia este texto y pégalo en datos/mundo.json en GitHub:', json));
    } else {
      prompt('Copia este texto y pégalo en datos/mundo.json en GitHub:', json);
    }
  },

  // ---------- MISIONES: rejilla de recompensas ----------
  _pintarMisionRecompensas() {
    const rej = document.getElementById('admin-mision-recompensas');
    if (!rej) return;
    if (!this._misionRecompensas) this._misionRecompensas = [];
    while (this._misionRecompensas.length < 6) this._misionRecompensas.push(null);
    rej.innerHTML = '';
    this._misionRecompensas.forEach((sl, i) => {
      const cel = document.createElement('div');
      cel.className = 'slot admin-slot-jugador mision-recompensa-slot';
      cel.dataset.indice = i;
      if (sl) {
        const item = Items.seguro(sl.id);
        cel.textContent = item.icono;
        const cant = document.createElement('span');
        cant.className = 'cantidad';
        cant.textContent = sl.cantidad;
        cel.appendChild(cant);
        cel.title = item.nombre;
      }
      cel.addEventListener('pointerdown', ev => this._misionSlotArrastre(ev, i));
      rej.appendChild(cel);
    });
  },

  _misionArrastre(ev, itemId) {
    ev.preventDefault();
    this._misionArrastreActivo = { itemId, x0: ev.clientX, y0: ev.clientY, movio: false };
    const mover = e => {
      const a = this._misionArrastreActivo;
      if (!a || Math.hypot(e.clientX - a.x0, e.clientY - a.y0) < 8) return;
      a.movio = true;
    };
    const soltar = e => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      const a = this._misionArrastreActivo;
      this._misionArrastreActivo = null;
      if (!a || !a.movio) return;
      const bajo = document.elementFromPoint(e.clientX, e.clientY);
      const slot = bajo?.closest?.('.mision-recompensa-slot');
      if (!slot) {
        const vacio = this._misionRecompensas.findIndex(s => !s);
        const idx = vacio >= 0 ? vacio : this._misionRecompensas.length;
        if (idx >= this._misionRecompensas.length) this._misionRecompensas.push({ id: a.itemId, cantidad: 1 });
        else this._misionRecompensas[idx] = { id: a.itemId, cantidad: 1 };
      } else {
        const idx = parseInt(slot.dataset.indice, 10);
        this._misionRecompensas[idx] = { id: a.itemId, cantidad: 1 };
      }
      this._pintarMisionRecompensas();
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
  },

  _misionSlotArrastre(ev, i) {
    const sl = this._misionRecompensas[i];
    if (!sl) return;
    ev.preventDefault();
    const soltar = e => {
      window.removeEventListener('pointerup', soltar);
      const bajo = document.elementFromPoint(e.clientX, e.clientY);
      if (!bajo?.closest?.('.mision-recompensa-slot')) this._misionRecompensas[i] = null;
      this._pintarMisionRecompensas();
    };
    window.addEventListener('pointerup', soltar);
  },

  // ---------- TIENDA ADMIN ----------
  _arrastreAdmATienda(ev, itemId) {
    const icono = Items.seguro(itemId).icono;
    this._iniciarArrastreFantasma(ev, {
      icono,
      selectorDestino: '.tienda-slot',
      onTap: () => this._agregarATiendaRejilla(itemId),
      onSoltar: (bajo) => {
        if (bajo?.closest?.('.tienda-slot')) this._agregarATiendaRejilla(itemId);
      }
    });
  },

  _agregarATiendaRejilla(itemId) {
    if (!this._tiendaAdminSlots) this._tiendaAdminSlots = [null];
    const vacio = this._tiendaAdminSlots.findIndex(s => !s);
    const idx = vacio >= 0 ? vacio : this._tiendaAdminSlots.length;
    if (vacio < 0) this._tiendaAdminSlots.push(null);
    this._tiendaAdminSlots[idx] = {
      id: itemId,
      precio: Items.seguro(itemId).precio,
      stock: 10,
      infinito: true
    };
    if (!this._tiendaAdminSlots.some(s => !s)) this._tiendaAdminSlots.push(null);
    this._pintarTiendaRejillaDinamica();
  },

  _pintarTiendaRejillaDinamica() {
    const rej = document.getElementById('admin-tienda-rejilla');
    const det = document.getElementById('admin-tienda-detalle');
    if (!rej || !this._tiendaAdminSlots) return;
    if (!this._tiendaAdminSlots.some(s => !s)) this._tiendaAdminSlots.push(null);
    rej.innerHTML = '';
    this._tiendaAdminSlots.forEach((sl, i) => {
      const cel = document.createElement('div');
      cel.className = 'slot admin-slot-jugador tienda-slot' + (sl ? '' : ' vacia');
      cel.dataset.indice = i;
      if (sl) {
        cel.textContent = Items.seguro(sl.id).icono;
        cel.title = Items.seguro(sl.id).nombre;
      }
      rej.appendChild(cel);
    });
    if (!det) return;
    det.innerHTML = '';
    this._tiendaAdminSlots.filter(Boolean).forEach((it, i) => {
      const item = Items.seguro(it.id);
      const fila = document.createElement('div');
      fila.className = 'tienda-admin-fila';
      fila.innerHTML =
        '<span class="ti-icono">' + item.icono + '</span>' +
        '<span class="ti-nombre">' + item.nombre + '</span>' +
        '<input type="number" class="ti-precio" data-i="' + i + '" value="' + it.precio + '" min="5" max="5000">' +
        '<label class="ti-inf"><input type="checkbox" class="ti-infinito" data-i="' + i + '"' +
          (it.infinito ? ' checked' : '') + '> ∞</label>' +
        '<input type="number" class="ti-stock" data-i="' + i + '" value="' + (it.stock || 1) + '"' +
          (it.infinito ? ' disabled' : '') + ' min="1">' +
        '<button type="button" class="ti-quitar" data-i="' + i + '">✕</button>';
      det.appendChild(fila);
    });
    const slots = this._tiendaAdminSlots.filter(Boolean);
    det.querySelectorAll('.ti-precio').forEach(inp => {
      inp.addEventListener('change', () => {
        const i = +inp.dataset.i;
        if (slots[i]) slots[i].precio = Items._limitarPrecio(+inp.value || 5);
      });
    });
    det.querySelectorAll('.ti-infinito').forEach(chk => {
      chk.addEventListener('change', () => {
        const i = +chk.dataset.i;
        if (!slots[i]) return;
        slots[i].infinito = chk.checked;
        const stockInp = det.querySelector('.ti-stock[data-i="' + i + '"]');
        if (stockInp) stockInp.disabled = chk.checked;
      });
    });
    det.querySelectorAll('.ti-stock').forEach(inp => {
      inp.addEventListener('change', () => {
        const i = +inp.dataset.i;
        if (!slots[i]) return;
        slots[i].stock = Math.max(1, parseInt(inp.value, 10) || 1);
        slots[i].infinito = false;
      });
    });
    det.querySelectorAll('.ti-quitar').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = +btn.dataset.i;
        const id = slots[i]?.id;
        this._tiendaAdminSlots = this._tiendaAdminSlots.filter(s => !s || s.id !== id);
        if (!this._tiendaAdminSlots.length) this._tiendaAdminSlots = [null];
        this._pintarTiendaRejillaDinamica();
      });
    });
  },

  // ---------- COFRE EN PANEL (sin cerrar admin) ----------
  abrirCofreEnPanel() {
    this._cofreSlots = new Array(6).fill(null);
    const vis = document.getElementById('admin-cofre-visible');
    if (vis) vis.checked = true;
    const pinPanel = document.getElementById('cofre-pin-panel');
    if (pinPanel) pinPanel.classList.add('oculto');
    const pin = document.getElementById('admin-cofre-pin');
    if (pin) pin.value = '';
    this._mostrarPanelDerecho('admin-vista-cofre', '🧰 Colocar cofre');
    setTimeout(() => {
      this._pintarRejillaGenerica('admin-cofre-rejilla', this._cofreSlots, 'cofre-slot');
      this._enlazarAdmRejilla('admin-cofre-infinito', this._cofreSlots, 'admin-cofre-rejilla', 'cofre-slot');
    }, 0);
  },

  _continuarCofrePanel() {
    const visible = document.getElementById('admin-cofre-visible')?.checked !== false;
    let pin = null;
    if (!visible) {
      pin = (document.getElementById('admin-cofre-pin')?.value || '').trim();
      if (!Utilidades.pinCofreValido(pin)) { alert('PIN de 4 números'); return; }
    }
    this._cofrePanelDatos = {
      visible,
      pin,
      slots: (this._cofreSlots || []).filter(Boolean)
    };
    this._ocultarPanelDerecho();
    if (typeof Cofres !== 'undefined') Cofres.iniciarColocacionAdmin(this._cofrePanelDatos);
  },

  // ---------- COMBATE GLOBAL ----------
  abrirCombateConfig() {
    const cfg = this.combateConfig();
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('admin-combate-dano-min', cfg.danoMin);
    set('admin-combate-dano-max', cfg.danoMax);
    set('admin-combate-nivel-ref', cfg.nivelReferencia || 1);
    set('admin-combate-radio-zona', cfg.radioZona);
    set('admin-combate-radio-persec', cfg.radioPersecucion);
    set('admin-combate-curacion', Math.round(cfg.curacionMs / 1000));
    this._pintarGraficaCombate();
    const inputs = ['admin-combate-dano-min', 'admin-combate-dano-max', 'admin-combate-nivel-ref'];
    inputs.forEach(id => {
      const el = document.getElementById(id);
      if (el && !el._graficaEnlazada) {
        el._graficaEnlazada = true;
        el.addEventListener('input', () => this._pintarGraficaCombate());
      }
    });
    this._mostrarPanelDerecho('admin-vista-combate', '⚔️ Combate global');
  },

  _guardarCombateConfig() {
    this.datos.combate = {
      danoMin: Math.max(1, this._numero('admin-combate-dano-min') || 5),
      danoMax: Math.max(1, this._numero('admin-combate-dano-max') || 8),
      nivelReferencia: Math.max(1, this._numero('admin-combate-nivel-ref') || 1),
      radioZona: Math.max(10, this._numero('admin-combate-radio-zona') || 40),
      radioPersecucion: Math.max(5, this._numero('admin-combate-radio-persec') || 20),
      curacionMs: Math.max(30000, this._numero('admin-combate-curacion') * 1000 || 120000)
    };
    if (this.datos.combate.danoMax < this.datos.combate.danoMin) {
      this.datos.combate.danoMax = this.datos.combate.danoMin;
    }
    this.guardar();
    this._publicarParaTodos(true);
    Notificaciones.mostrar('⚔️ Reglas de combate actualizadas para todos', 'exito');
    this._volverAlPanel();
  },

  _crearNotaAdmin() {
    const texto = prompt('Texto de la nota (máx. 200 caracteres):', '');
    if (!texto || !texto.trim()) return;
    this._notaPendiente = texto.trim().slice(0, 200);
    if (this._editorJugador) {
      if (this._editorJugador._creando) this._pintarCrearJugador();
      else this._pintarEditorJugador();
    }
    Notificaciones.mostrar('📝 Nota lista — arrástrala al inventario del jugador', 'info', 4000);
  }
};
