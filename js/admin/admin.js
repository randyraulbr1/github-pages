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
  _organizandoArrastreActivo: false,
  _adminNavPila: [],
  _adminVistaActual: null,
  _listarCuentasGen: 0,
  _jugadoresTab: 'vivos',
  _colocacion: null,  // { tipo, valores, marcador }
  _fantasmas: [],     // marcadores temporales de tesoros base en modo admin
  _marcadoresObjeto: {}, // id → marcador Leaflet (evita duplicados al sincronizar)
  _marcadoresTesoro: {}, // id → marcador Leaflet (tesoros admin)

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
    if (!this.datos.jugadoresBorrados) this.datos.jugadoresBorrados = [];
    if (localStorage.getItem('mariel_cuentas_reset_v') !== '56') {
      localStorage.setItem('mariel_cuentas_reset_v', '56');
    }
    if (this.datos.verCofresOcultos === undefined) this.datos.verCofresOcultos = false;
    if (!this.datos.enemigos) this.datos.enemigos = [];
    if (!this.datos.tiendasAdmin) this.datos.tiendasAdmin = [];
    if (this.datos.mantenimiento === undefined) this.datos.mantenimiento = null;

    try {
      const nDatos = this._contarElementosMapa(this.datos);
      if (nDatos < 2) {
        const bak = localStorage.getItem('mariel_admin_backup_v1');
        if (bak) {
          const b = JSON.parse(bak);
          if (this._contarElementosMapa(b) > nDatos) {
            this.datos = Object.assign(this.datos, b);
          }
        }
      }
    } catch (e) { /* */ }

    // El mundo oficial: GitHub Pages + servidor en vivo (el más reciente gana)
    this.publicado = { misiones: [], tesoros: [], objetos: [], posiciones: {}, eliminados: [], precios: {}, itemsNuevos: [], jugadores: [] };
    const mundoYaDescargado = this._crudoPublicado ||
      (typeof MundoPublico !== 'undefined' && MundoPublico._mundoCache) || null;
    try {
      const texto = mundoYaDescargado || await this._descargarMejorMundo();
      if (texto) {
        this._crudoPublicado = texto;
        if (typeof MundoPublico !== 'undefined') MundoPublico._mundoCache = texto;
        this.publicado = Object.assign(this.publicado, JSON.parse(texto));
      }
    } catch (e) { /* sin conexión: se sigue con lo guardado */ }
    try {
      const { indice } = await MundoPublico.refrescarCuentasServidor({ omitirMundo: !!mundoYaDescargado });
      if (indice?.length) {
        const porId = new Map();
        for (const j of (this.publicado.jugadores || [])) {
          if (j?.id) porId.set(j.id, j);
        }
        for (const j of indice) {
          porId.set(j.id, Object.assign({}, porId.get(j.id), j));
        }
        this.publicado.jugadores = this._filtrarJugadoresBorrados([...porId.values()]);
      }
    } catch (e) { /* sin indice remoto */ }
    if (!this.publicado.precios) this.publicado.precios = {};
    if (!this.publicado.itemsNuevos) this.publicado.itemsNuevos = [];
    if (!this.publicado.baneados) this.publicado.baneados = [];
    if (!this.publicado.mensajes) this.publicado.mensajes = [];
    if (!this.publicado.mantenimiento) this.publicado.mantenimiento = { activo: false, mensaje: '' };
    if (!this.publicado.jugadores) this.publicado.jugadores = [];
    if (!this.publicado.cofres) this.publicado.cofres = [];
    if (!this.publicado.cuerposMuertos) this.publicado.cuerposMuertos = {};
    if (!this.publicado.correoReclamados) this.publicado.correoReclamados = [];
    if (!this.publicado.correoTienda) this.publicado.correoTienda = [];
    if (!this.publicado.partidas) this.publicado.partidas = {};
    if (!this.publicado.enemigos) this.publicado.enemigos = [];
    if (!this.publicado.enemigosEstado) this.publicado.enemigosEstado = {};
    if (!this.publicado.botinesEnemigo) this.publicado.botinesEnemigo = {};
    if (!this.publicado.tiendasAdmin) this.publicado.tiendasAdmin = [];
    if (!this.publicado.tiendasStock) this.publicado.tiendasStock = {};
    if (!this.publicado.combate) {
      this.publicado.combate = {
        danoMin: 5, danoMax: 8, nivelReferencia: 1,
        vidaBase: CONFIG.vidaMaxima || 100,
        vidaExtraPorNivel: CONFIG.vidaExtraPorNivel || 4,
        radioZona: 40, radioPersecucion: 20, curacionMs: 120000
      };
    }
    if (!this.publicado.tesorosEstado) this.publicado.tesorosEstado = {};
    if (!this.datos.tesoroIconoMapa && this.publicado.tesoroIconoMapa) {
      this.datos.tesoroIconoMapa = this.publicado.tesoroIconoMapa;
    }
    this._asegurarObjetoIconoTesoro(this.tesoroIconoMapa());

    if (!Array.isArray(this.publicado.misiones)) this.publicado.misiones = [];
    if (!Array.isArray(this.publicado.tesoros)) this.publicado.tesoros = [];
    if (!Array.isArray(this.publicado.objetos)) this.publicado.objetos = [];
    if (!this.publicado.posiciones) this.publicado.posiciones = {};
    if (!Array.isArray(this.publicado.eliminados)) this.publicado.eliminados = [];

    if (this.publicado.adminPinClaves) {
      this.datos.jugadoresPinAdmin = Object.assign(
        {}, this.publicado.adminPinClaves, this.datos.jugadoresPinAdmin || {}
      );
    }
    if (this.datos.moverPinJugador === undefined) {
      this.datos.moverPinJugador = this.publicado.moverPinJugador !== undefined
        ? !!this.publicado.moverPinJugador
        : true;
    } else {
      this.datos.moverPinJugador = !!this.datos.moverPinJugador;
    }
    if (this.datos.optimizarVisibilidad === undefined) {
      this.datos.optimizarVisibilidad = this.publicado.optimizarVisibilidad !== false;
    }
    this.guardar();

    // Posiciones únicas del mundo: lo publicado es la verdad, el local solo añade lo no publicado aún
    this._aplicarPosicionesMundo();

    // Aplicar al catálogo los objetos nuevos y precios globales
    const nuevosPorId = new Map();
    for (const it of this.publicado.itemsNuevos) nuevosPorId.set(it.id, it);
    for (const it of this.datos.itemsNuevos) nuevosPorId.set(it.id, it);
    Items.aplicarMundo([...nuevosPorId.values()],
      Object.assign({}, this.publicado.precios, this.datos.precios));

    // Todos los jugadores vigilan el mundo desde que arranca el juego
    this.iniciarVigilancia();

    // Admin: si hay borradores locales no publicados, subirlos en segundo plano
    if (typeof Usuarios !== 'undefined' && Usuarios.esAdministrador()) {
      const puedePub = typeof SyncServidor !== 'undefined' && SyncServidor.puedePublicar();
      if (puedePub) {
      const localN = (this.datos.objetos || []).length + (this.datos.tesoros || []).length +
        (this.datos.misiones || []).length + (this.datos.enemigos || []).length;
      const pubN = (this.publicado.objetos || []).length + (this.publicado.tesoros || []).length +
        (this.publicado.misiones || []).length + (this.publicado.enemigos || []).length;
      const posLocal = Object.keys(this.datos.posiciones || {}).length;
      const posPub = Object.keys(this.publicado.posiciones || {}).length;
      if (localN > pubN || posLocal > posPub) {
        setTimeout(() => this._publicarParaTodos(true), 3500);
      } else if (pubN === 0 && localN === 0 && typeof Notificaciones !== 'undefined') {
        setTimeout(() => {
          Notificaciones.mostrar(
            '🗺️ El mapa del servidor está vacío. Coloca objetos y pulsa Guardar mapa para que todos los vean.',
            'alerta', 10000
          );
        }, 2000);
      }
      }
    }
    this._mundoCargado = true;
    this._ultimoPublicado = this._crudoPublicado;
    if (this._crudoPublicado) this._ultimoFirmaPublicada = this._firmaMundo(this._crudoPublicado);
    this._detectarCambiosLocalesSinPublicar();
    if (typeof Multijugador !== 'undefined' && Multijugador.aplicarMundoPendiente) {
      Multijugador.aplicarMundoPendiente();
    }
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

  _contarElementosMapa(m) {
    if (!m || typeof m !== 'object') return 0;
    let n = Object.keys(m.posiciones || {}).length;
    for (const campo of ['objetos', 'tesoros', 'enemigos', 'tiendasAdmin', 'misiones', 'cofres']) {
      if (Array.isArray(m[campo])) n += m[campo].length;
    }
    return n;
  },

  /** Mapa publicado + borradores locales del admin (lo que realmente hay en pantalla). */
  _contarMapaAdminCompleto() {
    const pub = this._contarElementosMapa(this.publicado || {});
    if (!this.esAdminJugador()) return pub;
    const loc = this._contarElementosMapa({
      misiones: this.datos?.misiones,
      tesoros: this.datos?.tesoros,
      objetos: this.datos?.objetos,
      enemigos: this.datos?.enemigos,
      tiendasAdmin: this.datos?.tiendasAdmin,
      posiciones: this.datos?.posiciones
    });
    return Math.max(pub, loc);
  },

  _mapaLocalCargado() {
    if (this._contarElementosMapa(this.publicado || {}) > 0) return true;
    if (!this.esAdminJugador()) return false;
    return this._contarElementosMapa({
      misiones: this.datos?.misiones,
      tesoros: this.datos?.tesoros,
      objetos: this.datos?.objetos,
      enemigos: this.datos?.enemigos,
      tiendasAdmin: this.datos?.tiendasAdmin,
      posiciones: this.datos?.posiciones
    }) > 0;
  },

  async asegurarMundoMapaCargado() {
    if (CONFIG.servidorOnline && typeof Multijugador !== 'undefined' && Multijugador.obtenerMundoServidor) {
      try { await Multijugador.obtenerMundoServidor(); } catch (e) { /* */ }
    }
    if (this._mapaLocalCargado()) {
      this.pintarMapaCompleto();
      return true;
    }
    if (typeof Multijugador !== 'undefined' && Multijugador.obtenerMundoServidor) {
      await Multijugador.obtenerMundoServidor();
      if (this._mapaLocalCargado()) {
        this.pintarMapaCompleto();
        return true;
      }
    }
    if (typeof MundoPublico !== 'undefined' && MundoPublico._descargarDesdeGitHub) {
      const gh = await MundoPublico._descargarDesdeGitHub();
      if (gh?.texto) {
        try {
          const m = JSON.parse(gh.texto);
          if (MundoPublico.mundoTieneMapa(m)) {
            this._aplicarMundoRemoto(gh.texto, { soloMapa: true });
            this.pintarMapaCompleto();
            return true;
          }
        } catch (e) { /* */ }
      }
    }
    this.pintarMapaCompleto();
    return false;
  },

  pintarMapaCompleto() {
    this._sincronizarMapaRemoto(new Set(), new Set(), new Set(), new Set());
    if (typeof Enemigos !== 'undefined' && Enemigos._recargar) Enemigos._recargar();
    if (typeof Tiendas !== 'undefined' && Tiendas.refrescarAdmin) Tiendas.refrescarAdmin();
    if (typeof Cofres !== 'undefined' && Cofres._pintarTodos) Cofres._pintarTodos();
    this.refrescarVisibles();
    if (typeof Enemigos !== 'undefined' && Enemigos.refrescarVisibilidadDistancia) {
      Enemigos.refrescarVisibilidadDistancia();
    }
    if (typeof Multijugador !== 'undefined' && Multijugador.refrescarMarcadoresDistancia) {
      Multijugador.refrescarMarcadoresDistancia();
    }
  },

  _esPublicacionDestructiva(nuevo, referencia) {
    const a = this._contarElementosMapa(nuevo);
    const r = this._contarElementosMapa(referencia);
    if (r < 3) return false;
    return a < Math.max(1, Math.floor(r * 0.25));
  },

  _resumirReduccionPublicacion(nuevo, referencia) {
    const nj = (nuevo.jugadores || []).length;
    const rj = (referencia.jugadores || []).length;
    const no = (nuevo.objetos || []).length;
    const ro = (referencia.objetos || []).length;
    const ne = (nuevo.enemigos || []).length;
    const re = (referencia.enemigos || []).length;
    const partes = [];
    if (nj < rj) partes.push((rj - nj) + ' jugador(es)');
    if (no < ro) partes.push((ro - no) + ' objeto(s)');
    if (ne < re) partes.push((re - ne) + ' enemigo(s)');
    return partes;
  },

  _confirmarReduccionPublicacion(nuevo, referencia) {
    const partes = this._resumirReduccionPublicacion(nuevo, referencia);
    if (!partes.length) return true;
    return confirm(
      '⚠️ Esta publicación reduciría: ' + partes.join(', ') +
      '.\n\n¿Confirmar de todos modos?'
    );
  },

  async _refrescarPublicadoSiVacio() {
    const n = this._contarElementosMapa(this.publicado);
    if (n >= 3) return true;
    try {
      const texto = await this._descargarMejorMundo();
      if (!texto) return n > 0;
      const m = JSON.parse(texto);
      if (this._contarElementosMapa(m) > n) {
        this.publicado = Object.assign(this.publicado || {}, m);
        this._aplicarPosicionesMundo();
        this._crudoPublicado = texto;
        return true;
      }
    } catch (e) { /* sin conexión */ }
    return n > 0;
  },

  async _fusionarMapaConServidor(adminLocal) {
    let snap = null;
    try {
      if (typeof SyncServidor !== 'undefined' && SyncServidor.obtenerMundo) {
        const data = await SyncServidor.obtenerMundo();
        snap = data?.mundo;
      }
      if (!snap) {
        const texto = await this._descargarMejorMundo();
        if (texto) snap = JSON.parse(texto);
      }
    } catch (e) { return adminLocal; }
    if (!snap) return adminLocal;

    const campos = ['objetos', 'tesoros', 'enemigos', 'tiendasAdmin', 'misiones', 'cofres'];
    for (const campo of campos) {
      const local = adminLocal[campo] || [];
      const rem = snap[campo] || [];
      if (!local.length && rem.length) {
        adminLocal[campo] = rem.slice();
      } else if (local.length && rem.length > local.length) {
        const porId = new Map();
        for (const it of rem) if (it?.id) porId.set(it.id, it);
        for (const it of local) {
          if (!it?.id) continue;
          porId.set(it.id, Object.assign({}, porId.get(it.id), it));
        }
        adminLocal[campo] = [...porId.values()];
      }
    }
    adminLocal.posiciones = Object.assign({}, snap.posiciones || {}, adminLocal.posiciones || {});
    adminLocal.enemigosEstado = Object.assign({}, snap.enemigosEstado || {}, adminLocal.enemigosEstado || {});
    adminLocal.tesorosEstado = this._fusionarEstadosMapa(snap.tesorosEstado, adminLocal.tesorosEstado);
    adminLocal.objetosEstado = this._fusionarEstadosMapa(snap.objetosEstado, adminLocal.objetosEstado);
    adminLocal.tiendasStock = Object.assign({}, snap.tiendasStock || {}, adminLocal.tiendasStock || {});
    return adminLocal;
  },

  /** Conserva recogidas locales si el snapshot del servidor llega desactualizado. */
  _fusionarEstadosMapa(remoto, local) {
    const out = Object.assign({}, remoto || {});
    for (const [id, st] of Object.entries(local || {})) {
      if (!st?.recogidoAt) continue;
      const prev = out[id];
      if (!prev?.recogidoAt || st.recogidoAt >= prev.recogidoAt) out[id] = st;
    }
    return out;
  },

  /** Carga el mundo solo desde el servidor Render (SQLite). */
  async _descargarMejorMundo() {
    if (!CONFIG.servidorOnline) return null;
    try {
      const texto = await MundoPublico.descargar();
      return texto || null;
    } catch (e) {
      return null;
    }
  },

  /** Fusiona partidas/jugadores del servidor sin tocar el mapa publicado. */
  _fusionarPartidasServidor(m) {
    if (!m || typeof m !== 'object') return false;
    if (!this.publicado) this.publicado = {};
    const partidas = Object.assign({}, this.publicado.partidas || {}, m.partidas || {});
    if (Object.keys(partidas).length) this.publicado.partidas = partidas;
    if ((m.jugadores || []).length) {
      const porId = new Map();
      for (const j of (this.publicado.jugadores || [])) {
        if (j?.id) porId.set(j.id, j);
      }
      for (const j of m.jugadores) {
        if (j?.id) porId.set(j.id, Object.assign({}, porId.get(j.id), j));
      }
      this.publicado.jugadores = [...porId.values()];
    }
    const tsRemoto = m.actualizadoEn || 0;
    if (tsRemoto > (this.publicado.actualizadoEn || 0)) {
      this.publicado.actualizadoEn = tsRemoto;
    }
    return true;
  },

  /** Tras iniciar sesión, vuelve a cargar el mundo del servidor si es más nuevo. */
  async refrescarMundoTrasLogin() {
    if (!CONFIG.servidorOnline || !this._mundoCargado) return false;
    this._asegurarMoverPinAdminDefault();
    try {
      if (typeof SyncServidor !== 'undefined' && SyncServidor.despertarServidor) {
        await SyncServidor.despertarServidor();
      }
      let data = null;
      if (typeof SyncServidor !== 'undefined' && SyncServidor.obtenerMundo) {
        data = await SyncServidor.obtenerMundo();
      }
      if (!data?.mundo) return false;
      const m = data.mundo;
      const tsRemoto = data.actualizadoEn || m.actualizadoEn || 0;
      const tsLocal = this.publicado?.actualizadoEn || 0;
      const nRemoto = this._contarElementosMapa(m);
      const nLocal = this._contarMapaAdminCompleto();
      const hayPartidas = Object.keys(m.partidas || {}).length > 0;

      // No sustituir un mapa con más contenido por uno del servidor más vacío
      if (nRemoto < nLocal) {
        if (this.esAdminJugador()) {
          setTimeout(() => this._publicarParaTodos(true), 2500);
        }
        return false;
      }

      // Servidor sin objetos: solo fusionar partidas/jugadores, no vaciar borradores locales
      if (nRemoto === 0) {
        if (hayPartidas && tsRemoto > tsLocal) {
          this._fusionarPartidasServidor(m);
          if (typeof Guardado !== 'undefined') Guardado._asegurarPosicionJugador?.();
          if (typeof GPS !== 'undefined') GPS.aplicarPosicionGuardada?.();
          if (typeof Multijugador !== 'undefined' && Multijugador._sincronizarPinesPartida) {
            Multijugador._sincronizarPinesPartida();
          }
          return true;
        }
        return false;
      }

      if (nRemoto === nLocal && tsRemoto <= tsLocal && !hayPartidas) return false;

      const json = JSON.stringify(m);
      this._crudoPublicado = json;
      this._ultimoFirmaPublicada = this._firmaMundo(json);
      if (typeof Multijugador !== 'undefined') {
        Multijugador.mundoServidorTs = Math.max(Multijugador.mundoServidorTs || 0, tsRemoto);
      }
      this._aplicarMundoRemoto(json, { forzar: false, soloMapa: nRemoto > nLocal });
      this.pintarMapaCompleto();
      if (typeof Multijugador !== 'undefined' && Multijugador._sincronizarPinesPartida) {
        Multijugador._sincronizarPinesPartida();
      }
      return true;
    } catch (e) {
      return false;
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
    if (adminLocal && adminLocal.posiciones) {
      this.datos.posiciones = Object.assign({}, adminLocal.posiciones);
      localStorage.setItem(this.CLAVE, JSON.stringify(this.datos,
        (clave, valor) => clave.startsWith('_') ? undefined : valor));
    }
  },

  /** Snapshot del último estado sincronizado con el servidor (base para deltas). */
  _obtenerBaseSync() {
    const raw = this._ultimoPublicado || this._crudoPublicado;
    if (raw) {
      try {
        return typeof raw === 'string' ? JSON.parse(raw) : Object.assign({}, raw);
      } catch (e) { /* */ }
    }
    try {
      return JSON.parse(this._jsonMundo());
    } catch (e) {
      return null;
    }
  },

  /** Fase 3.5 — publica cambios de mapa/config por objeto (sin mundo entero). */
  async _publicarMapaDelta(silencioso) {
    if (typeof SyncServidor === 'undefined' || !SyncServidor.sincronizarMapaDelta) {
      return { ok: false, fallbackCompleto: true };
    }
    const base = this._obtenerBaseSync();
    let actual;
    try {
      actual = JSON.parse(this._jsonMundo());
    } catch (e) {
      return { ok: false, error: 'JSON del mundo inválido' };
    }
    if (!base || !actual) {
      return { ok: false, error: 'Mundo no listo' };
    }

    const firma = this._firmaMundo(JSON.stringify(actual));
    if (firma === this._ultimoFirmaPublicada && !this._pubPendiente) {
      return { ok: true, sinCambios: true };
    }

    const resultado = await SyncServidor.sincronizarMapaDelta(base, actual);
    if (!resultado.ok) return resultado;

    actual.actualizadoEn = resultado.actualizadoEn || resultado.data?.actualizadoEn || Date.now();
    const json = JSON.stringify(actual, (clave, valor) =>
      clave.startsWith('_') ? undefined : valor, 2);
    this._sincronizarEstadoTrasPublicar(actual, json);
    this._aplicarMundoRemoto(json);
    if (typeof Multijugador !== 'undefined') {
      Multijugador.mundoServidorTs = actual.actualizadoEn;
    }
    if (!silencioso) {
      this._avisoSyncManual('📡 Mapa sincronizado — todos lo ven en vivo');
    }
    return { ok: true, ops: resultado.ops || 0 };
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

  _aplicarPosicionesMundo() {
    if (!this.datos.posiciones) this.datos.posiciones = {};
    const pub = this.publicado.posiciones || {};
    for (const [id, pos] of Object.entries(pub)) {
      if (Array.isArray(pos) && pos.length >= 2) {
        this.datos.posiciones[id] = [Number(pos[0]), Number(pos[1])];
      }
    }
  },

  _detectarCambiosLocalesSinPublicar() {
    if (!this.esAdminJugador()) return;
    const puedePub = MundoPublico.puedePublicar() ||
      (typeof SyncServidor !== 'undefined' && SyncServidor.puedePublicar());
    if (!puedePub) return;
    const json = this._jsonMundo();
    if (this._ultimoFirmaPublicada && this._firmaMundo(json) === this._ultimoFirmaPublicada) return;
    this._encolarPublicacion(true);
  },

  // ---------- VISTA COMBINADA: publicado en GitHub + borradores locales ----------
  _liberarMarcadorObjeto(id) {
    this._liberarMarcadorBolsa(id);
    if (!id) return;
    const m = this._marcadoresObjeto[id];
    if (m) {
      try { m.remove(); } catch (e) { /* */ }
      delete this._marcadoresObjeto[id];
    }
    for (const o of [...(this.publicado?.objetos || []), ...(this.datos?.objetos || [])]) {
      if (o && o.id === id) o._marcador = null;
    }
    if (typeof Mapa !== 'undefined') {
      const p = Mapa.puntosInteractivos.find(x => x.id === id);
      if (p) p.marcador = null;
    }
  },

  _vincularMarcadorObjeto(o, marcador) {
    if (!o?.id || !marcador) return;
    o._marcador = marcador;
    this._marcadoresObjeto[o.id] = marcador;
    if (typeof Mapa !== 'undefined') {
      const p = Mapa.puntosInteractivos.find(x => x.id === o.id);
      if (p) p.marcador = marcador;
    }
  },

  _liberarMarcadorTesoro(id) {
    if (!id) return;
    const m = this._marcadoresTesoro[id];
    if (m) {
      try { m.remove(); } catch (e) { /* */ }
      delete this._marcadoresTesoro[id];
    }
    for (const t of this.tesorosTodos()) {
      if (t && t.id === id) t._marcador = null;
    }
    if (typeof Mapa !== 'undefined') {
      const p = Mapa.puntosInteractivos.find(x => x.id === id);
      if (p) p.marcador = null;
    }
  },

  _vincularMarcadorTesoro(t, marcador) {
    if (!t?.id || !marcador) return;
    t._marcador = marcador;
    this._marcadoresTesoro[t.id] = marcador;
    if (typeof Mapa !== 'undefined') {
      const p = Mapa.puntosInteractivos.find(x => x.id === t.id);
      if (p) p.marcador = marcador;
    }
  },

  _quitarPuntosInteractivos(id) {
    if (!id || typeof Mapa === 'undefined') return;
    Mapa.puntosInteractivos = Mapa.puntosInteractivos.filter(p => p.id !== id);
  },

  _reaplicarArrastreOrganizar() {
    if (this.modo !== 'organizar' || !this.esAdminJugador()) return;
    if (this._organizandoArrastreActivo) return;
    if (typeof GPS !== 'undefined' && GPS.marcador && this.puedeMoverPinJugador()) {
      this._habilitarArrastreMarcador(GPS.marcador, () => {
        const p = GPS.marcador.getLatLng();
        GPS._actualizar([+p.lat.toFixed(6), +p.lng.toFixed(6)], false);
      });
    }
    for (const p of Mapa.puntosInteractivos) {
      if (!p.marcador || p.marcador === GPS.marcador) continue;
      if (typeof Enemigos !== 'undefined' && Enemigos._marcadores[p.id]) continue;
      this._arrastreOrganizarMarcador(p.marcador, p, (m) => {
        const nueva = m.getLatLng();
        const pos = this._guardarPosicionOrganizar(p.id, nueva.lat, nueva.lng);
        if (pos) {
          p.posicion[0] = pos[0];
          p.posicion[1] = pos[1];
        }
        this.guardar();
        this._publicarParaTodos(true);
      });
    }
    for (const o of this.objetosTodos()) {
      if (this.eliminado(o.id)) continue;
      if (this._objetoDisponible(o) && !o._marcador) this._revisarObjeto(o);
      if (!o._marcador) continue;
      this._arrastreOrganizarMarcador(o._marcador, { id: o.id, marcador: o._marcador }, (m) => {
        const p = m.getLatLng();
        const pos = this._guardarPosicionOrganizar(o.id, p.lat, p.lng);
        if (pos) {
          o.pos[0] = pos[0];
          o.pos[1] = pos[1];
        }
        this.guardar();
        this._publicarParaTodos(true);
      });
    }
    if (typeof Enemigos !== 'undefined') {
      for (const e of Enemigos.lista) {
        this._arrastreOrganizarEnemigo(e);
      }
    }
    if (typeof Misiones !== 'undefined') {
      for (const [id, m] of Object.entries(Misiones._marcadores)) {
        this._arrastreOrganizarMarcador(m, { id, marcador: m }, (marc) => {
          const p = marc.getLatLng();
          const pos = this._guardarPosicionOrganizar(id, p.lat, p.lng);
          if (pos) {
            const exist = Misiones.lista.find(x => x.id === id);
            if (exist) exist.pos = pos.slice();
          }
          this.guardar();
          this._publicarParaTodos(true);
        });
      }
    }
    if (typeof Cofres !== 'undefined' && Cofres._marcadores) {
      for (const [id, m] of Object.entries(Cofres._marcadores)) {
        this._arrastreOrganizarMarcador(m, { id, marcador: m }, (marc) => {
          const p = marc.getLatLng();
          this._guardarPosicionOrganizar(id, p.lat, p.lng);
          this.guardar();
          this._publicarParaTodos(true);
        });
      }
    }
    if (typeof Tiendas !== 'undefined' && Tiendas._marcadoresAdmin) {
      for (const [id, m] of Object.entries(Tiendas._marcadoresAdmin)) {
        const t = Tiendas._listaAdmin.find(x => x.id === id);
        this._arrastreOrganizarMarcador(m, { id, marcador: m }, (marc) => {
          const p = marc.getLatLng();
          const pos = this._guardarPosicionOrganizar(id, p.lat, p.lng);
          if (pos && t) { t.pos = pos.slice(); t.posicion = pos.slice(); }
          this.guardar();
          this._publicarParaTodos(true);
        });
      }
    }
    if (typeof Multijugador !== 'undefined') {
      for (const [id, m] of Object.entries(Multijugador.cuerposMarcadores || {})) {
        const playerId = Number(id);
        if (!playerId) continue;
        this._arrastreOrganizarMarcador(m, {
          id: 'cuerpo_' + id,
          marcador: m,
          _cuerpoPlayerId: playerId,
          nombre: (Multijugador.cuerpos?.[id]?.name) || 'Ataúd'
        }, (marc) => {
          const p = marc.getLatLng();
          this._moverCuerpoAdmin(playerId, +p.lat.toFixed(6), +p.lng.toFixed(6));
        });
      }
      for (const p of (Multijugador.online || [])) {
        if (!Multijugador._estaMuerto(p)) continue;
        const m = Multijugador.marcadores[p.playerId];
        if (!m) continue;
        this._arrastreOrganizarMarcador(m, {
          id: 'cuerpo_on_' + p.playerId,
          marcador: m,
          _cuerpoPlayerId: p.playerId,
          nombre: p.name || 'Ataúd'
        }, (marc) => {
          const ll = marc.getLatLng();
          this._moverCuerpoAdmin(p.playerId, +ll.lat.toFixed(6), +ll.lng.toFixed(6));
        });
      }
      for (const p of (Multijugador.online || [])) {
        if (Multijugador._estaMuerto(p)) continue;
        const m = Multijugador.marcadores[p.playerId];
        if (!m) continue;
        this._arrastreOrganizarMarcador(m, {
          id: 'jugador_' + p.playerId,
          marcador: m,
          _jugadorPlayerId: p.playerId,
          nombre: p.name || 'Jugador'
        }, (marc) => {
          const ll = marc.getLatLng();
          this._moverJugadorAdmin(p.playerId, +ll.lat.toFixed(6), +ll.lng.toFixed(6));
        });
      }
    }
  },

  _eliminarCuerpoAdmin(playerId) {
    const key = String(playerId);
    if (this.publicado.cuerposMuertos) delete this.publicado.cuerposMuertos[key];
    if (typeof Multijugador !== 'undefined') {
      delete Multijugador.cuerpos[key];
      Multijugador._quitarMarcadorCuerpo(key);
      const i = Multijugador.online.findIndex(x => Number(x.playerId) === Number(playerId));
      if (i >= 0) {
        Multijugador._quitarMarcador(playerId);
        Multijugador.online.splice(i, 1);
      }
    }
    this.guardar();
    this._publicarParaTodos(true);
    Notificaciones.mostrar('🗑️ Ataúd eliminado del mapa', 'alerta');
  },

  _combinar(publicados, locales) {
    const porId = new Map();
    for (const e of (publicados || [])) {
      if (e?.id) porId.set(e.id, e);
    }
    for (const e of (locales || [])) {
      if (!e?.id) continue;
      const prev = porId.get(e.id);
      const marcador = e._marcador || prev?._marcador || this._marcadoresObjeto[e.id];
      const merged = Object.assign({}, prev || {}, e);
      if (marcador) {
        merged._marcador = marcador;
        this._marcadoresObjeto[e.id] = marcador;
      }
      porId.set(e.id, merged);
    }
    return [...porId.values()].filter(e => e && e.id && !this.eliminado(e.id));
  },

  misionesTodas() {
    if (typeof ContenidoMundo !== 'undefined' && ContenidoMundo.usarDeltas()) {
      const lista = ContenidoMundo.listaMisiones();
      if (this.esAdminJugador()) {
        return this._combinar(lista, this.datos.misiones || []);
      }
      return lista;
    }
    if (this.esAdminJugador()) {
      return this._combinar(this.publicado.misiones || [], this.datos.misiones || []);
    }
    return (this.publicado.misiones || []).filter(e => !this.eliminado(e.id));
  },
  tesorosTodos() {
    if (typeof ContenidoMundo !== 'undefined' && ContenidoMundo.usarDeltas()) {
      const lista = ContenidoMundo.listaTesoros();
      if (this.esAdminJugador()) {
        return this._combinar(lista, this.datos.tesoros || []);
      }
      return lista;
    }
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
    if (typeof ContenidoMundo !== 'undefined' && ContenidoMundo.usarDeltas()) {
      const lista = ContenidoMundo.listaTiendas();
      if (this.esAdminJugador()) {
        return this._combinar(lista, this.datos.tiendasAdmin || []);
      }
      return lista;
    }
    if (this.esAdminJugador()) {
      return this._combinar(this.publicado.tiendasAdmin || [], this.datos.tiendasAdmin || []);
    }
    return (this.publicado.tiendasAdmin || []).filter(e => !this.eliminado(e.id));
  },
  combateConfig() {
    return Object.assign({
      danoMin: 5, danoMax: 8, nivelReferencia: 1,
      vidaBase: CONFIG.vidaMaxima || 100,
      vidaExtraPorNivel: CONFIG.vidaExtraPorNivel || 4,
      radioZona: 40, radioPersecucion: 20, curacionMs: 120000
    }, this.publicado.combate || {}, this.datos.combate || {});
  },
  combateEnemigosConfig() {
    return Object.assign({
      danoMin: 5, danoMax: 8, nivelReferencia: 1,
      factorPorNivel: 0.06,
      vidaBase: 60,
      vidaFactorPorNivel: 0.06,
      xpBase: 30,
      xpFactorPorNivel: 0.06
    }, this.publicado.combateEnemigos || {}, this.datos.combateEnemigos || {});
  },

  /** Vida máxima de un enemigo según nivel (tabla Daño enemigos). Nv1 = vidaBase. */
  vidaEnemigoPorNivel(nivel) {
    const cfg = this.combateEnemigosConfig();
    const n = Math.max(1, Math.min(CONFIG.nivelMaximo || 100, nivel || 1));
    const base = Math.max(10, cfg.vidaBase ?? 60);
    const factor = cfg.vidaFactorPorNivel ?? cfg.factorPorNivel ?? 0.06;
    const f = 1 + (n - 1) * factor;
    return Math.max(10, Math.round(base * f));
  },

  /** Daño min/max de enemigo según nivel (tabla Daño enemigos). */
  danoEnemigoPorNivel(nivel) {
    const cfg = this.combateEnemigosConfig();
    const nv = Math.max(1, Math.min(CONFIG.nivelMaximo || 100, nivel || 1));
    const f = 1 + (nv - 1) * (cfg.factorPorNivel || 0.06);
    const lo = Math.max(1, Math.round((cfg.danoMin || 5) * f));
    const hi = Math.max(lo, Math.round((cfg.danoMax || 8) * f));
    return { lo, hi };
  },

  /** XP al derrotar enemigo según su nivel (tabla global). */
  xpEnemigoPorNivel(nivel) {
    const cfg = this.combateEnemigosConfig();
    const n = Math.max(1, Math.min(CONFIG.nivelMaximo || 100, nivel || 1));
    const base = Math.max(1, cfg.xpBase ?? 30);
    const factor = cfg.xpFactorPorNivel ?? cfg.factorPorNivel ?? 0.06;
    return Math.max(1, Math.round(base * (1 + (n - 1) * factor)));
  },

  /** Vida máxima de jugador según nivel (reglas globales). */
  vidaJugadorPorNivel(nivel) {
    const cfg = this.combateConfig();
    const n = Math.max(1, Math.min(CONFIG.nivelMaximo || 100, nivel || 1));
    const base = Math.max(10, cfg.vidaBase ?? CONFIG.vidaMaxima ?? 100);
    const extra = cfg.vidaExtraPorNivel ?? CONFIG.vidaExtraPorNivel ?? 4;
    return base + Math.floor((n - 1) * extra);
  },

  _aplicarStatsEnemigoDesdeNivel(nivel) {
    const nv = Math.max(1, Math.min(100, nivel || 1));
    const vidaInp = document.getElementById('af-vida');
    const dMinInp = document.getElementById('af-dano-min');
    const dMaxInp = document.getElementById('af-dano-max');
    if (vidaInp) vidaInp.value = this.vidaEnemigoPorNivel(nv);
    const r = this.danoEnemigoPorNivel(nv);
    if (dMinInp) dMinInp.value = r.lo;
    if (dMaxInp) dMaxInp.value = r.hi;
    const xpInp = document.getElementById('af-xp');
    if (xpInp) xpInp.value = this.xpEnemigoPorNivel(nv);
  },
  objetosTodos() {
    let lista;
    if (this.esAdminJugador()) {
      lista = this._combinar(this.publicado.objetos || [], this.datos.objetos || []);
    } else {
      lista = (this.publicado.objetos || []).filter(e => !this.eliminado(e.id));
    }
    const sueltos = (typeof Guardado !== 'undefined' && Guardado.datos?.objetosSuelto) || [];
    return this._combinar(lista, sueltos);
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
    if (typeof SyncServidor !== 'undefined' && !SyncServidor.puedePublicar()) {
      this._asegurarTokenServidor(false).then((ok) => {
        if (ok) this._encolarPublicacion(true);
      });
      return;
    }
    const puedeServidor = typeof SyncServidor !== 'undefined' && SyncServidor.puedePublicar();
    if (!puedeServidor) return;
    this._encolarPublicacion(true);
  },

  _encolarPublicacion(silencioso) {
    this._pubSilencioso = silencioso;
    this._pubPendiente = true;
    clearTimeout(this._tempPublicar);
    const rapido = typeof SyncServidor !== 'undefined' && SyncServidor.puedePublicar();
    const espera = silencioso ? (rapido ? 500 : 2000) : 400;
    this._tempPublicar = setTimeout(() => this._procesarColaPublicacion(), espera);
  },

  async _procesarColaPublicacion() {
    if (!this._pubPendiente || this._publicando) return;
    if (!this.esAdminJugador()) return;
    const puedeServidor = typeof SyncServidor !== 'undefined' && SyncServidor.puedePublicar();
    if (!puedeServidor) {
      const okToken = await this._asegurarTokenServidor(false);
      if (!okToken) return;
    }
    this._pubPendiente = false;
    this._publicando = true;
    try {
      const ok = await this.publicarMundo(this._pubSilencioso !== false, this._optsSubidaMapa());
      if (!ok) {
        this._intentosPub = (this._intentosPub || 0) + 1;
        if (this._intentosPub < 10) {
          this._pubPendiente = true;
          const espera = Math.min(30000, 2000 + this._intentosPub * 2500);
          clearTimeout(this._tempPublicar);
          this._tempPublicar = setTimeout(() => this._procesarColaPublicacion(), espera);
        }
      } else {
        this._intentosPub = 0;
      }
    } finally {
      this._publicando = false;
    }
  },

  _optsSubidaMapa(extra) {
    return Object.assign({ soloSync: true, forzar: true, confiarLocal: true }, extra || {});
  },

  async _asegurarTokenServidor(pedirClave) {
    if (typeof SyncServidor === 'undefined') return false;
    if (SyncServidor.puedePublicar()) {
      if (await SyncServidor.verificarToken()) return true;
    }
    return SyncServidor.asegurarSesionServidor(pedirClave ? { pedirClave: true } : {});
  },

  // Sube el mapa al servidor Render para que todos lo vean en vivo
  async _syncMapaServidor(silencioso, opts) {
    if (!this._mundoCargado || !this.esAdminJugador()) return false;
    const okToken = await this._asegurarTokenServidor(!silencioso);
    if (!okToken) {
      if (!silencioso) {
        Notificaciones.mostrar(
          '⚠️ Sin sesión en el servidor. Vuelve a entrar con tu contraseña.',
          'alerta', 8000
        );
      }
      return false;
    }
    clearTimeout(this._tempPublicar);
    const ok = await this.publicarMundo(!!silencioso, this._optsSubidaMapa(opts));
    if (ok && !silencioso) {
      Notificaciones.mostrar('📡 Mapa en el servidor — todos lo ven en vivo', 'exito', 4000);
    } else if (!ok && !silencioso) {
      Notificaciones.mostrar(
        '❌ No se subió al servidor: ' + (this._ultimoErrorPub || 'revisa conexión'),
        'error', 8000
      );
    }
    return ok;
  },

  // Sube el mapa para que TODOS los jugadores lo vean (servidor en vivo)
  async _publicarParaTodos(silencioso, opts) {
    return this._syncMapaServidor(silencioso !== false, opts);
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

  _esCuentaProtegida(perfil) {
    if (!perfil) return false;
    // (No llamar a Usuarios.esAdministrador() aquí: causaba recursión
    //  infinita porque esa función también llama a _esCuentaProtegida.
    //  Las comprobaciones por nombre/alias/id de abajo son suficientes.)
    const n = String(perfil.nombre || '').trim().toLowerCase();
    const adm = (CONFIG.adminNombre || 'soycaos').toLowerCase();
    const alias = (CONFIG.adminAlias || []).map(a => String(a).toLowerCase());
    if (n === adm || alias.includes(n)) return true;
    if (this.datos?.jugadoresPinAdmin?.[perfil.id]) return true;
    return perfil.id === (CONFIG.adminId || 'pmr7x4zhznzw5o');
  },

  _asegurarAdminEnListaJugadores(porId) {
    const adm = (CONFIG.adminNombre || 'soycaos').toLowerCase();
    const alias = (CONFIG.adminAlias || []).map(a => String(a).toLowerCase());
    let admin = null;
    for (const j of porId.values()) {
      const n = String(j.nombre || '').toLowerCase();
      if (n === adm || alias.includes(n) || j.id === 'pmr7x4zhznzw5o') {
        admin = j;
        break;
      }
    }
    if (!admin && typeof Usuarios !== 'undefined' && Usuarios.esAdministrador?.() && Usuarios.perfilActivo) {
      admin = Usuarios.perfilActivo;
    }
    if (!admin) {
      admin = (this.publicado?.jugadores || []).find(j => this._esCuentaProtegida(j));
    }
    if (admin?.id) {
      porId.set(admin.id, Object.assign({}, porId.get(admin.id), admin, {
        nombre: admin.nombre || 'randy',
        pinHash: admin.pinHash || (porId.get(admin.id) && porId.get(admin.id).pinHash)
      }));
    }
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
        porId.set(p.id, this._fusionarSesionJugador(prev, {
          id: p.id,
          nombre: p.nombre || prev.nombre,
          telefono: p.telefono || prev.telefono || '',
          creado: p.creado || prev.creado,
          pinHash: p.pinHash || prev.pinHash,
          sesionToken: p.sesionToken,
          sesionT: p.sesionT
        }));
      }
    }
    this._inferirJugadoresDesdePartidasYCuerpos(porId);
    const dedupe = this._deduplicarJugadoresPorNombre([...porId.values()]);
    this._aliasJugadoresIds = dedupe.aliasIds;
    return this._filtrarJugadoresBorrados(dedupe.jugadores);
  },

  _inferirJugadoresDesdePartidasYCuerpos(porId) {
    const partidas = this.publicado?.partidas || {};
    for (const perfilId of Object.keys(partidas)) {
      if (porId.has(perfilId)) continue;
      const nombre = this._nombreInferidoPerfil(perfilId);
      if (!nombre) continue;
      porId.set(perfilId, {
        id: perfilId,
        nombre,
        telefono: '',
        creado: partidas[perfilId]?.t || Date.now()
      });
    }
    const cuerpos = this.publicado?.cuerposMuertos || {};
    for (const c of Object.values(cuerpos)) {
      if (!c?.name) continue;
      const key = String(c.name).trim().toLowerCase();
      const ya = [...porId.values()].some(j =>
        String(j.nombre || '').trim().toLowerCase() === key
      );
      if (ya) continue;
      const srvId = 'srv_' + Number(c.playerId);
      if (!porId.has(srvId)) {
        porId.set(srvId, {
          id: srvId,
          nombre: String(c.name).trim(),
          telefono: '',
          creado: c.muertoAt || Date.now()
        });
      }
    }
  },

  _nombreInferidoPerfil(perfilId) {
    const extra = (this.datos?.partidasExtra || {})[perfilId];
    const nube = (this.publicado?.partidas || {})[perfilId];
    const cuerpos = this.publicado?.cuerposMuertos || {};
    if (String(perfilId).startsWith('srv_')) {
      const c = cuerpos[String(perfilId).replace('srv_', '')] || cuerpos[perfilId.slice(4)];
      if (c?.name) return String(c.name).trim();
    }
    for (const c of Object.values(cuerpos)) {
      const srvId = 'srv_' + Number(c.playerId);
      if (srvId === perfilId && c.name) return String(c.name).trim();
    }
    for (const j of [
      ...(this.datos?.jugadoresExtra || []),
      ...(this.publicado?.jugadores || []),
      ...(typeof Usuarios !== 'undefined' ? (Usuarios.datos?.lista || []) : [])
    ]) {
      if (j?.id === perfilId && j.nombre) return String(j.nombre).trim();
    }
    return null;
  },

  _cuerpoPorNombre(nombre) {
    const key = String(nombre || '').trim().toLowerCase();
    if (!key) return null;
    if (typeof Multijugador !== 'undefined' && Multijugador.cuerpos) {
      for (const c of Object.values(Multijugador.cuerpos)) {
        if (c && String(c.name || '').trim().toLowerCase() === key) return c;
      }
    }
    const cm = this.publicado?.cuerposMuertos || {};
    for (const c of Object.values(cm)) {
      if (c && String(c.name || '').trim().toLowerCase() === key) return c;
    }
    return null;
  },

  _setJugadoresBorrados() {
    if (!this.datos?.jugadoresBorrados) return new Set();
    return new Set(this.datos.jugadoresBorrados.map(x => String(x).toLowerCase()));
  },

  _esJugadorBorrado(j) {
    if (!j) return false;
    const borrados = this._setJugadoresBorrados();
    if (j.id && borrados.has(String(j.id).toLowerCase())) return true;
    const n = String(j.nombre || '').trim().toLowerCase();
    return !!(n && borrados.has(n));
  },

  _desmarcarJugadorBorrado(perfil) {
    if (!this.datos?.jugadoresBorrados?.length || !perfil) return;
    const nombreKey = String(perfil.nombre || '').trim().toLowerCase();
    const ids = this._idsJugadorMismaCuenta(perfil);
    const quitar = new Set([nombreKey, ...[...ids].map(id => String(id).toLowerCase())].filter(Boolean));
    this.datos.jugadoresBorrados = this.datos.jugadoresBorrados.filter(
      x => x && !quitar.has(String(x).toLowerCase())
    );
    this.guardar();
  },

  _marcarJugadorBorrado(perfil) {
    if (!this.datos) this.datos = {};
    if (!this.datos.jugadoresBorrados) this.datos.jugadoresBorrados = [];
    const borrados = this._setJugadoresBorrados();
    const nombreKey = String(perfil?.nombre || '').trim().toLowerCase();
    if (nombreKey && !borrados.has(nombreKey)) {
      this.datos.jugadoresBorrados.push(nombreKey);
      borrados.add(nombreKey);
    }
    const fuentes = [
      ...(this.publicado?.jugadores || []),
      ...(this.datos?.jugadoresExtra || []),
      ...(typeof Usuarios !== 'undefined' ? (Usuarios.datos?.lista || []) : []),
      perfil
    ].filter(Boolean);
    for (const x of fuentes) {
      const nk = String(x.nombre || '').trim().toLowerCase();
      if (nombreKey && nk !== nombreKey) continue;
      if (x.id && !borrados.has(String(x.id).toLowerCase())) {
        this.datos.jugadoresBorrados.push(x.id);
      }
    }
  },

  _filtrarJugadoresBorrados(lista) {
    if (!Array.isArray(lista)) return [];
    const borrados = this._setJugadoresBorrados();
    if (!borrados.size) return lista;
    return lista.filter(j => {
      if (!j) return false;
      if (j.id && borrados.has(String(j.id).toLowerCase())) return false;
      const n = String(j.nombre || '').trim().toLowerCase();
      return !(n && borrados.has(n));
    });
  },

  _idsJugadorMismaCuenta(perfil) {
    const nombreKey = String(perfil?.nombre || '').trim().toLowerCase();
    const tel = String(perfil?.telefono || '').replace(/[\s-]/g, '');
    const ids = new Set();
    if (perfil?.id) ids.add(perfil.id);
    for (const x of [
      ...(this.publicado?.jugadores || []),
      ...(this.datos?.jugadoresExtra || []),
      ...(typeof Usuarios !== 'undefined' ? (Usuarios.datos?.lista || []) : [])
    ]) {
      if (!x?.id) continue;
      const nk = String(x.nombre || '').trim().toLowerCase();
      const xt = String(x.telefono || '').replace(/[\s-]/g, '');
      if ((nombreKey && nk === nombreKey) || (tel && xt && xt === tel)) ids.add(x.id);
    }
    return ids;
  },

  _prioridadJugador(j) {
    let s = 0;
    if (j?.telefono) s += 20;
    if (j?.pinHash) s += 10;
    const id = String(j?.id || '');
    if (id && !id.startsWith('srv_')) s += 15;
    if (id.startsWith('pmr') || (id.startsWith('p') && id.length > 4)) s += 5;
    return s;
  },

  _idCanonicoJugador(id) {
    if (!id) return id;
    const mapa = this._aliasJugadoresIds;
    if (!mapa || !mapa.size) return id;
    let cur = String(id);
    const visto = new Set();
    while (mapa.has(cur) && !visto.has(cur)) {
      visto.add(cur);
      cur = String(mapa.get(cur));
    }
    return cur;
  },

  _mismaCuentaJugador(idA, idB) {
    if (!idA || !idB) return false;
    if (String(idA) === String(idB)) return true;
    return this._idCanonicoJugador(idA) === this._idCanonicoJugador(idB);
  },

  /** Una cuenta por nombre; prioriza id PWA y teléfono sobre srv_N duplicados. */
  _deduplicarJugadoresPorNombre(lista) {
    if (!Array.isArray(lista)) return { jugadores: [], aliasIds: new Map() };
    const sinNombre = lista.filter(j => j?.id && !String(j.nombre || '').trim());
    const grupos = new Map();
    for (const j of lista) {
      if (!j?.id || !String(j.nombre || '').trim()) continue;
      const key = String(j.nombre).trim().toLowerCase();
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key).push(j);
    }
    const resultado = [...sinNombre];
    const aliasIds = new Map();
    for (const [, dupes] of grupos) {
      const ordenados = dupes.slice().sort((a, b) => this._prioridadJugador(b) - this._prioridadJugador(a));
      let canon = Object.assign({}, ordenados[0]);
      for (let i = 1; i < ordenados.length; i++) {
        const o = ordenados[i];
        canon = this._fusionarSesionJugador(canon, o);
        if (!canon.telefono && o.telefono) canon.telefono = o.telefono;
        if (!canon.pinHash && o.pinHash) canon.pinHash = o.pinHash;
        if (!canon.creado && o.creado) canon.creado = o.creado;
        aliasIds.set(o.id, canon.id);
      }
      resultado.push(canon);
    }
    resultado.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    return { jugadores: resultado, aliasIds };
  },

  _fusionarSesionJugador(base, extra) {
    const a = Object.assign({}, base || {}, extra || {});
    const tBase = (base && base.sesionT) || 0;
    const tExtra = (extra && extra.sesionT) || 0;
    if (tBase > tExtra) {
      a.sesionToken = base.sesionToken;
      a.sesionT = tBase;
    } else if (tExtra > tBase) {
      a.sesionToken = extra.sesionToken;
      a.sesionT = tExtra;
    } else if (extra?.sesionToken) {
      a.sesionToken = extra.sesionToken;
      a.sesionT = tExtra;
    } else if (base?.sesionToken) {
      a.sesionToken = base.sesionToken;
      a.sesionT = tBase;
    }
    return a;
  },

  async actualizarJugadoresGlobales() {
    if (!this.publicado) this.publicado = { jugadores: [], baneados: [] };
    if (!this.datos) {
      try { this.datos = JSON.parse(localStorage.getItem(this.CLAVE) || 'null'); } catch (e) {}
    }
    if (!this.datos) this.datos = { jugadoresExtra: [] };

    let listaServidor = null;
    try {
      const { indice } = await MundoPublico.refrescarCuentasServidor();
      if (Array.isArray(indice)) listaServidor = indice;
    } catch (e) { /* sin servidor */ }

    if (listaServidor) {
      const porId = new Map();
      for (const j of listaServidor) {
        if (j?.id) porId.set(j.id, j);
      }
      for (const j of (this.datos.jugadoresExtra || [])) {
        if (j?.id) porId.set(j.id, this._fusionarSesionJugador(porId.get(j.id), j));
      }
      if (typeof Usuarios !== 'undefined' && Usuarios.datos?.lista) {
        for (const p of Usuarios.datos.lista) {
          if (!p?.id) continue;
          const prev = porId.get(p.id) || {};
          porId.set(p.id, this._fusionarSesionJugador(prev, {
            id: p.id,
            nombre: p.nombre || prev.nombre,
            telefono: p.telefono || prev.telefono || '',
            creado: p.creado || prev.creado,
            pinHash: p.pinHash || prev.pinHash,
            sesionToken: p.sesionToken,
            sesionT: p.sesionT
          }));
        }
      }
      this.publicado.jugadores = this._filtrarJugadoresBorrados(
        this._deduplicarJugadoresPorNombre([...porId.values()]).jugadores
      );
      this._inferirJugadoresDesdePartidasYCuerpos(porId);
      const dedupeFinal = this._deduplicarJugadoresPorNombre([...porId.values()]);
      this._aliasJugadoresIds = dedupeFinal.aliasIds;
      this.publicado.jugadores = this._filtrarJugadoresBorrados(dedupeFinal.jugadores);
      this._jugadoresListaCache = this.publicado.jugadores.slice();
      this._jugadoresListaCacheTs = Date.now();
      return;
    }

    const fusionarJugadores = (lista) => {
      if (!Array.isArray(lista) || !lista.length) return;
      const porId = new Map();
      for (const j of (this.publicado.jugadores || [])) {
        if (j?.id) porId.set(j.id, j);
      }
      for (const j of lista) {
        if (!j?.id) continue;
        porId.set(j.id, this._fusionarSesionJugador(porId.get(j.id), j));
      }
      this.publicado.jugadores = this._filtrarJugadoresBorrados([...porId.values()]);
    };
    try {
      const texto = await MundoPublico.descargar();
      if (texto) {
        const p = JSON.parse(texto);
        fusionarJugadores(p.jugadores);
      }
    } catch (e) { /* sin conexión */ }
    this._jugadoresListaCache = this.jugadoresGlobales().slice();
    this._jugadoresListaCacheTs = Date.now();
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
    this._desmarcarJugadorBorrado(perfil);
    const pinClave = perfil.pinClave || this._pinAdminGet(perfil.id) || '';
    const entrada = {
      id: perfil.id,
      nombre: perfil.nombre,
      telefono: perfil.telefono || '',
      creado: perfil.creado || Date.now(),
      pinHash: perfil.pinHash,
      pinClave: pinClave || undefined,
      sesionToken: perfil.sesionToken,
      sesionT: perfil.sesionT
    };
    const idx = this.datos.jugadoresExtra.findIndex(j => j.id === perfil.id);
    if (idx >= 0) this.datos.jugadoresExtra[idx] = entrada;
    else this.datos.jugadoresExtra.push(entrada);
    localStorage.setItem(this.CLAVE, JSON.stringify(this.datos,
      (clave, valor) => clave.startsWith('_') ? undefined : valor));
    if (!silencioso && this.esAdminJugador()) {
      const puede = (typeof SyncServidor !== 'undefined' && SyncServidor.puedePublicar()) ||
        (typeof MundoPublico !== 'undefined' && MundoPublico.puedeEscribir && MundoPublico.puedeEscribir());
      if (puede) this._encolarPublicacion(true);
    }
  },

  _pinAdminGet(id) {
    const local = (this.datos.jugadoresPinAdmin || {})[id];
    if (local) return local;
    const extra = (this.datos.jugadoresExtra || []).find(j => j && j.id === id);
    if (extra?.pinClave) return extra.pinClave;
    const global = this.jugadoresGlobales().find(j => j && j.id === id);
    return global?.pinClave || '';
  },

  _pinAdminSet(id, clave) {
    if (!this.datos.jugadoresPinAdmin) this.datos.jugadoresPinAdmin = {};
    if (clave) this.datos.jugadoresPinAdmin[id] = clave;
    else delete this.datos.jugadoresPinAdmin[id];
    const extra = (this.datos.jugadoresExtra || []).find(j => j && j.id === id);
    if (extra) {
      if (clave) extra.pinClave = clave;
      else delete extra.pinClave;
    }
    this.guardar();
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
        if (!p?.id) continue;
        porId.set(p.id, this._fusionarSesionJugador(porId.get(p.id), {
          id: p.id,
          nombre: p.nombre,
          telefono: p.telefono || '',
          creado: p.creado || Date.now(),
          pinHash: p.pinHash || (porId.get(p.id) && porId.get(p.id).pinHash),
          sesionToken: p.sesionToken,
          sesionT: p.sesionT
        }));
      }
    }
    this._asegurarAdminEnListaJugadores(porId);
    const { jugadores, aliasIds } = this._deduplicarJugadoresPorNombre(
      this._filtrarJugadoresBorrados([...porId.values()])
    );
    this._aliasJugadoresPublicar = aliasIds;
    return jugadores.map(j => {
      const copia = Object.assign({}, j);
      delete copia.pinClave;
      return copia;
    });
  },

  _partidasParaPublicar() {
    const porId = {};
    for (const [id, p] of Object.entries(this.publicado.partidas || {})) {
      porId[id] = p;
    }
    for (const [id, p] of Object.entries(this.datos.partidasExtra || {})) {
      if (!porId[id] || (p.t && p.t > (porId[id].t || 0))) porId[id] = p;
    }
    const alias = this._aliasJugadoresPublicar;
    if (alias && alias.size) {
      for (const [viejo, canon] of alias) {
        const p = porId[viejo];
        if (!p) continue;
        if (!porId[canon] || (p.t && p.t > (porId[canon].t || 0))) porId[canon] = p;
        delete porId[viejo];
      }
    }
    return porId;
  },

  // Posición corregida de un pin (si el admin lo movió). Muta la base en sitio
  // para que todas las referencias del módulo queden sincronizadas.
  pos(id, base) {
    if (!base || !Array.isArray(base)) return base;
    const o = (this.datos.posiciones || {})[id] || (this.publicado.posiciones || {})[id];
    if (o) { base[0] = o[0]; base[1] = o[1]; }
    return base;
  },

  _guardarPosicionOrganizar(id, lat, lng) {
    if (!id) return null;
    const p = [+Number(lat).toFixed(6), +Number(lng).toFixed(6)];
    if (!this.datos.posiciones) this.datos.posiciones = {};
    if (!this.publicado.posiciones) this.publicado.posiciones = {};
    this.datos.posiciones[id] = p.slice();
    this.publicado.posiciones[id] = p.slice();
    return p;
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

  /** Fija posición de spawn de un enemigo (mapa + datos + servidor). */
  _fijarPosicionEnemigo(id, pos, publicar) {
    if (!id || !pos || pos.length < 2) return;
    const p = [+pos[0], +pos[1]];
    if (!this.datos.posiciones) this.datos.posiciones = {};
    if (!this.publicado.posiciones) this.publicado.posiciones = {};
    this.datos.posiciones[id] = p.slice();
    this.publicado.posiciones[id] = p.slice();
    const patch = (arr) => {
      if (!Array.isArray(arr)) return;
      const i = arr.findIndex(x => x && x.id === id);
      if (i >= 0) {
        arr[i].pos = p.slice();
        arr[i].posOrigen = p.slice();
      }
    };
    patch(this.datos.enemigos);
    patch(this.publicado.enemigos);
    const e = typeof Enemigos !== 'undefined'
      ? Enemigos.lista.find(x => x.id === id) : null;
    if (e && typeof Enemigos.fijarPosicion === 'function') {
      Enemigos.fijarPosicion(e, p);
    }
    this.guardar();
    if (publicar !== false) this._publicarParaTodos(true);
  },

  eliminado(id) {
    if (typeof ContenidoMundo !== 'undefined' && ContenidoMundo.usarDeltas() &&
        ContenidoMundo.estaEliminado(id)) return true;
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
    if (typeof Multijugador !== 'undefined' && Multijugador.aplicarMundoPendiente) {
      Multijugador.aplicarMundoPendiente();
    }
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
    enlazar('admin-combate-enemigos', () => this.abrirCombateEnemigosConfig());
    enlazar('admin-bdd-global', () => this.abrirBddGlobal());
    enlazar('admin-bdd-jugadores', () => this.abrirCombateConfig());
    enlazar('admin-bdd-enemigos', () => this.abrirCombateEnemigosConfig());
    enlazar('admin-catalogo', () => this.abrirCatalogoHub());
    enlazar('admin-cat-precios', () => this.abrirFormulario('precio'));
    enlazar('admin-cat-item', () => this.abrirFormulario('item_nuevo'));
    enlazar('btn-admin-combate-guardar', () => this._guardarCombateConfig());
    enlazar('btn-admin-combate-enemigos-guardar', () => this._guardarCombateEnemigosConfig());
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
    enlazar('admin-mantenimiento', () => this.abrirMantenimiento());
    enlazar('admin-sync-github', () => this.abrirSyncGitHub());
    enlazar('btn-admin-sync-github', () => this._forzarSyncGitHubUi());
    enlazar('admin-mensaje', () => this.abrirMensaje());
    enlazar('admin-organizar', () => this.entrarModo('organizar'));
    enlazar('admin-mover-pin', () => this.toggleMoverPinJugador());
    enlazar('admin-opt-visibilidad', () => this.toggleOptimizacionVisibilidad());
    enlazar('admin-jugadores', () => this._listarCuentasAsync({ abrirPanel: true }));
    enlazar('admin-crear-jugador', () => this._abrirCrearJugador());
    enlazar('admin-limpiar-cuentas', () => this._limpiarCuentasUi());
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
    enlazar('admin-publicar', () => this._sincronizarManual());
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
    this._actualizarEtiquetaOptimizacionVisibilidad();
    this._actualizarEtiquetaVerCofresOcultos();
    this._actualizarEtiquetaMantenimientoNav();
    if (typeof Cofres !== 'undefined') {
      Cofres.verOcultos = !!this.datos.verCofresOcultos;
      Cofres._pintarTodos();
    }
    if (typeof GPS !== 'undefined') GPS._actualizarArrastre();
    if (typeof AdminCatalogo !== 'undefined') AdminCatalogo.iniciar(this);
  },

  puedeMoverPinJugador() {
    this._asegurarMoverPinAdminDefault();
    return this.esAdminJugador() && !!this.datos.moverPinJugador;
  },

  _asegurarMoverPinAdminDefault() {
    if (!this.esAdminJugador()) return;
    if (this.datos.moverPinJugador === undefined) {
      this.datos.moverPinJugador = true;
      this.guardar();
      this._actualizarEtiquetaMoverPin();
      if (typeof GPS !== 'undefined') GPS._actualizarArrastre();
    }
  },

  optimizacionVisibilidadActiva() {
    if (this.esAdminJugador() && this.datos?.optimizarVisibilidad !== undefined) {
      return !!this.datos.optimizarVisibilidad;
    }
    if (this.publicado?.optimizarVisibilidad === false) return false;
    return CONFIG.optimizarVisibilidad !== false;
  },

  /** Jugadores/enemigos visibles según distancia (admin ve todo si la optimización está ON). */
  entidadVisibleEnRango(distancia) {
    if (!this.optimizacionVisibilidadActiva()) return true;
    if (this.esAdminJugador()) return true;
    return distancia <= (CONFIG.distanciaVerEntidades || 500);
  },

  toggleOptimizacionVisibilidad() {
    if (!this.esAdminJugador()) return;
    const activa = this.optimizacionVisibilidadActiva();
    this.datos.optimizarVisibilidad = !activa;
    this.guardar();
    this._encolarPublicacion(true);
    this._actualizarEtiquetaOptimizacionVisibilidad();
    if (typeof Multijugador !== 'undefined') Multijugador.refrescarMarcadoresDistancia();
    if (typeof Enemigos !== 'undefined') Enemigos.refrescarVisibilidadDistancia();
    Notificaciones.mostrar(
      this.datos.optimizarVisibilidad
        ? '👁️ Optimización 500 m activada (tú ves todo el mapa)'
        : '👁️ Optimización desactivada: todos ven jugadores y enemigos lejanos',
      'info', 4500
    );
  },

  _actualizarEtiquetaOptimizacionVisibilidad() {
    const el = document.getElementById('admin-opt-visibilidad-texto');
    if (!el) return;
    const on = this.optimizacionVisibilidadActiva();
    el.textContent = 'Optimización 500 m: ' + (on ? 'ON' : 'OFF');
    const btn = document.getElementById('admin-opt-visibilidad');
    if (btn) btn.classList.toggle('admin-toggle-on', on);
  },

  toggleMoverPinJugador() {
    if (!this.esAdminJugador()) return;
    this.datos.moverPinJugador = !this.datos.moverPinJugador;
    this.guardar();
    this._encolarPublicacion(true);
    this._actualizarEtiquetaMoverPin();
    if (typeof GPS !== 'undefined') GPS._actualizarArrastre();
    Notificaciones.mostrar(
      this.datos.moverPinJugador
        ? '🎯 Puedes arrastrar tu pin y el de otros jugadores (modo Organizar)'
        : '🎯 Pin del jugador bloqueado (solo GPS 📍)',
      'info', 4000
    );
  },

  _actualizarEtiquetaMoverPin() {
    const el = document.getElementById('admin-mover-pin-texto');
    if (!el) return;
    const on = !!this.datos.moverPinJugador;
    el.textContent = 'Arrastrar pin (admin): ' + (on ? 'ON' : 'OFF');
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
    const intervalo = CONFIG.servidorOnline ? 12000 : 8000;
    setInterval(() => this._revisarActualizacion(), intervalo);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this._revisarActualizacion();
    });
  },

  async _revisarActualizacion() {
    try {
      if (this.modo === 'organizar' || this._organizandoArrastreActivo) return;
      if (!CONFIG.servidorOnline) return;
      const socketActivo = typeof Multijugador !== 'undefined' && Multijugador.activo;
      if (socketActivo && Multijugador._pullMundoVersion) {
        await Multijugador._pullMundoVersion();
      } else if (typeof Multijugador !== 'undefined' && Multijugador.obtenerMundoServidor) {
        await Multijugador.obtenerMundoServidor();
      } else if (typeof SyncServidor !== 'undefined' && SyncServidor.obtenerMundo) {
        const data = await SyncServidor.obtenerMundo();
        if (data?.mundo && typeof this._aplicarMundoRemoto === 'function') {
          const ts = data.actualizadoEn || data.mundo.actualizadoEn || 0;
          const localTs = this.publicado?.actualizadoEn || 0;
          const remotoMapa = typeof MundoPublico !== 'undefined' && MundoPublico.mundoTieneMapa
            ? MundoPublico.mundoTieneMapa(data.mundo) : false;
          const localMapa = this._contarElementosMapa(this.publicado || {}) > 0;
          if (ts >= localTs && (remotoMapa || !localMapa)) {
            this._aplicarMundoRemoto(JSON.stringify(data.mundo), { soloMapa: true });
          }
        }
      }
      const panelJug = document.getElementById('admin-vista-jugadores');
      const jugadoresAbierto = panelJug && !panelJug.classList.contains('oculto');
      if (this.esAdminJugador() && jugadoresAbierto) {
        await this.actualizarJugadoresGlobales();
        this._listarCuentasAsync({ soloRefrescar: true, sinPartidas: true });
      }
      if (typeof Usuarios !== 'undefined') Usuarios.verificarSesionRemota();
      if (typeof Guardado !== 'undefined' && Usuarios?.perfilActivo) {
        Guardado.sincronizarNube(true).catch(() => {});
      }
    } catch (e) { /* sin conexión */ }
  },

  // Aplica el mundo publicado sin recargar toda la página
  _aplicarMundoRemoto(texto, opciones) {
    const opts = opciones || {};
    if (this.modo === 'organizar' || this._organizandoArrastreActivo) return;
    let remoto = null;
    try { remoto = JSON.parse(texto); } catch (e) { return; }
    const localMapa = this._contarMapaAdminCompleto();
    const remotoMapa = this._contarElementosMapa(remoto);
    const esAdmin = this.esAdminJugador();
    if (!opts.permitirReduccion && remotoMapa < localMapa && esAdmin) return;
    if (!opts.forzar && esAdmin && localMapa > 0 && remotoMapa === 0) return;
    if (!esAdmin && remotoMapa === 0 && localMapa > 0) return;

    const jugadoresGuardados = (this.publicado?.jugadores || []).slice();
    const partidasGuardadas = Object.assign({}, this.publicado?.partidas || {});
    const tesorosEstadoPrev = Object.assign({}, this.publicado?.tesorosEstado || {});
    const objetosEstadoPrev = Object.assign({}, this.publicado?.objetosEstado || {});
    const botinesEnemigoPrev = Object.assign({}, this.publicado?.botinesEnemigo || {});
    const idsObjetosAntes = new Set(this.objetosTodos().map(o => o.id));
    const idsTesorosAntes = new Set(this.tesorosTodos().map(t => t.id));
    const idsMisionesAntes = new Set(this.misionesTodas().map(m => m.id));
    const eliminadosAntes = new Set(this.publicado.eliminados || []);
    const prefsAdmin = {
      moverPinJugador: this.datos.moverPinJugador,
      optimizarVisibilidad: this.datos.optimizarVisibilidad,
      verCofresOcultos: this.datos.verCofresOcultos
    };

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
        objetosEstado: {},
        tiendasAdmin: [],
        mantenimiento: { activo: false, mensaje: '' }
      }, remoto);
    } catch (e) { return; }

    if (opts.soloMapa) {
      const porId = new Map();
      for (const j of jugadoresGuardados) {
        if (j?.id) porId.set(j.id, j);
      }
      for (const j of (remoto.jugadores || [])) {
        if (j?.id) porId.set(j.id, Object.assign({}, porId.get(j.id), j));
      }
      if (porId.size) this.publicado.jugadores = [...porId.values()];
      this.publicado.partidas = Object.assign({}, partidasGuardadas, this.publicado.partidas || {});
    } else if (!(this.publicado.jugadores || []).length && jugadoresGuardados.length) {
      this.publicado.jugadores = jugadoresGuardados;
    }
    if (!this.publicado.partidas) this.publicado.partidas = partidasGuardadas;

    if (!this.publicado.precios) this.publicado.precios = {};
    if (!this.publicado.itemsNuevos) this.publicado.itemsNuevos = [];
    if (!this.publicado.baneados) this.publicado.baneados = [];
    if (!this.publicado.mensajes) this.publicado.mensajes = [];
    if (!this.publicado.mantenimiento) this.publicado.mantenimiento = { activo: false, mensaje: '' };
    if (!this.publicado.tesorosEstado) this.publicado.tesorosEstado = {};
    this.publicado.tesorosEstado = this._fusionarEstadosMapa(
      this.publicado.tesorosEstado, tesorosEstadoPrev
    );
    if (!this.publicado.objetosEstado) this.publicado.objetosEstado = {};
    this.publicado.objetosEstado = this._fusionarEstadosMapa(
      this.publicado.objetosEstado, objetosEstadoPrev
    );
    if (!this.publicado.tiendasStock) this.publicado.tiendasStock = {};
    if (!this.publicado.enemigos) this.publicado.enemigos = [];
    if (!this.publicado.enemigosEstado) this.publicado.enemigosEstado = {};
    if (!this.publicado.objetosEstado) this.publicado.objetosEstado = {};
    if (!this.publicado.tiendasAdmin) this.publicado.tiendasAdmin = [];
    if (!this.publicado.bolsasDrop) this.publicado.bolsasDrop = [];
    const botinesRemotos = this.publicado.botinesEnemigo || {};
    const botinesFusionados = Object.assign({}, botinesEnemigoPrev, botinesRemotos);
    const ahoraBotin = Date.now();
    for (const [id, b] of Object.entries(botinesFusionados)) {
      if (!b || ahoraBotin > (b.expiraEn || 0)) delete botinesFusionados[id];
    }
    this.publicado.botinesEnemigo = botinesFusionados;

    for (const en of (this.publicado.enemigos || [])) {
      if (!en?.id) continue;
      const sp = (en.posOrigen && en.posOrigen.length >= 2) ? en.posOrigen : en.pos;
      if (!sp || sp.length < 2) continue;
      if (!this.publicado.posiciones) this.publicado.posiciones = {};
      this.publicado.posiciones[en.id] = [Number(sp[0]), Number(sp[1])];
    }

    this._aplicarPosicionesMundo();

    const nuevosPorId = new Map();
    for (const it of this.publicado.itemsNuevos) nuevosPorId.set(it.id, it);
    for (const it of this.datos.itemsNuevos) nuevosPorId.set(it.id, it);
    Items.aplicarMundo([...nuevosPorId.values()],
      Object.assign({}, this.publicado.precios, this.datos.precios));

    this._sincronizarMapaRemoto(idsObjetosAntes, idsTesorosAntes, idsMisionesAntes, eliminadosAntes);
    this._refrescarObjetosMapa();
    for (const [id, st] of Object.entries(this.publicado.objetosEstado || {})) {
      if (st?.recogidoAt) this.aplicarRecogidaCompartida(id, st.recogidoAt, st.playerId);
    }
    for (const [id, st] of Object.entries(this.publicado.tesorosEstado || {})) {
      if (st?.recogidoAt) this.aplicarRecogidaTesoro(id, st.recogidoAt);
    }

    if (typeof Cofres !== 'undefined') Cofres._pintarTodos();
    if (typeof Enemigos !== 'undefined' && this.modo !== 'organizar') Enemigos._recargar();
    if (typeof Tiendas !== 'undefined' && Tiendas.refrescarAdmin) Tiendas.refrescarAdmin();
    if (typeof Usuarios !== 'undefined') Usuarios.verificarSesionRemota();
    if (this.publicado.adminPinClaves) {
      this.datos.jugadoresPinAdmin = Object.assign(
        {}, this.publicado.adminPinClaves, this.datos.jugadoresPinAdmin || {}
      );
      this.guardar();
    }
    if (prefsAdmin.moverPinJugador !== undefined) {
      this.datos.moverPinJugador = !!prefsAdmin.moverPinJugador;
    }
    if (prefsAdmin.optimizarVisibilidad !== undefined) {
      this.datos.optimizarVisibilidad = !!prefsAdmin.optimizarVisibilidad;
    }
    if (prefsAdmin.verCofresOcultos !== undefined) {
      this.datos.verCofresOcultos = !!prefsAdmin.verCofresOcultos;
      if (typeof Cofres !== 'undefined') Cofres.verOcultos = !!prefsAdmin.verCofresOcultos;
    }
    if (prefsAdmin.moverPinJugador !== undefined ||
        prefsAdmin.optimizarVisibilidad !== undefined ||
        prefsAdmin.verCofresOcultos !== undefined) {
      this.guardar();
    }
    if (this.datos.moverPinJugador === undefined && this.publicado.moverPinJugador !== undefined) {
      this.datos.moverPinJugador = !!this.publicado.moverPinJugador;
      this.guardar();
    } else if (this.publicado.moverPinJugador !== undefined && this.datos.moverPinJugador) {
      this.publicado.moverPinJugador = true;
    }
    this._actualizarEtiquetaMoverPin();
    this._actualizarEtiquetaOptimizacionVisibilidad();
    if (typeof GPS !== 'undefined') GPS._actualizarArrastre();

    this.refrescarVisibles();
    if (typeof BotinEnemigo !== 'undefined') BotinEnemigo.refrescarMapa();
    this.mostrarMensajes();
    if (typeof Notificaciones !== 'undefined') Notificaciones._actualizarBadge();
    this._aplicarRevivirDesdeNube();
    if (this.modo === 'organizar') this._reaplicarArrastreOrganizar();
    this._refrescarListaJugadoresSiAbierta();
    if (typeof Multijugador !== 'undefined' && Multijugador._sincronizarPinesPartida) {
      Multijugador._sincronizarPinesPartida();
    }
  },

  _jugadorEstaMuerto(pd, vida) {
    if (pd && pd.muerto) return true;
    return vida != null && vida <= 0;
  },

  _estadoOnlinePorNombre(nombre) {
    if (typeof Multijugador === 'undefined' || !Multijugador.online) return null;
    const n = (nombre || '').trim().toLowerCase();
    return Multijugador.online.find(p => (p.name || '').trim().toLowerCase() === n) || null;
  },

  _vidaJugadorLista(j, pd) {
    let vida = pd?.vida ?? CONFIG.vidaMaxima;
    let muerto = this._jugadorEstaMuerto(pd, vida);
    const cuerpo = this._cuerpoPorNombre(j.nombre);
    if (cuerpo) {
      muerto = true;
      vida = 0;
    }
    const online = this._estadoOnlinePorNombre(j.nombre);
    if (online && typeof Multijugador !== 'undefined') {
      const onlineMuerto = Multijugador._estaMuerto(online);
      if (onlineMuerto || cuerpo) {
        muerto = true;
        vida = 0;
      } else {
        muerto = false;
        vida = online.hp ?? vida;
      }
    }
    const remota = (this.publicado.partidas || {})[j.id];
    if (remota?.datos && !cuerpo) {
      const rd = remota.datos;
      const localT = (this.datos.partidasExtra || {})[j.id]?.t || 0;
      if ((remota.t || 0) >= localT) {
        const remMuerto = this._jugadorEstaMuerto(rd, rd.vida);
        if (remMuerto || !online) {
          muerto = remMuerto;
          vida = remMuerto ? 0 : (rd.vida ?? vida);
        }
      }
    }
    return { vida, muerto, nivel: pd?.nivel ?? remota?.datos?.nivel ?? 1 };
  },

  async _actualizarPartidasDesdeServidor() {
    if (!CONFIG.servidorOnline || typeof Multijugador === 'undefined') return;
    const token = localStorage.getItem(Multijugador.TOKEN_KEY);
    if (!token) return;
    try {
      const base = CONFIG.servidorOnline.replace(/\/$/, '');
      const r = await fetch(base + '/api/player/mundo', {
        headers: { Authorization: 'Bearer ' + token }
      });
      const data = await r.json().catch(() => ({}));
      if (!data.ok || !data.mundo?.partidas) return;
      if (!this.publicado.partidas) this.publicado.partidas = {};
      for (const [id, p] of Object.entries(data.mundo.partidas)) {
        const prev = this.publicado.partidas[id];
        if (!prev || (p.t || 0) >= (prev.t || 0)) this.publicado.partidas[id] = p;
      }
    } catch (e) { /* sin conexión */ }
  },

  _revivirJugadorOnline(perfil, hp) {
    return new Promise((resolve) => {
      if (typeof Multijugador === 'undefined' || !Multijugador.socket || !Multijugador.activo) {
        resolve({ ok: false, error: 'Sin conexión multijugador' });
        return;
      }
      const online = this._estadoOnlinePorNombre(perfil.nombre);
      let targetPlayerId = online?.playerId;
      if (!targetPlayerId && perfil.id && String(perfil.id).startsWith('srv_')) {
        const n = parseInt(String(perfil.id).slice(4), 10);
        if (Number.isFinite(n) && n > 0) targetPlayerId = n;
      }
      const maxV = online?.hpMax || this._vidaMaximaJugador({
        nivel: online?.level || online?.deadLevel || 1
      });
      const cura = hp != null ? hp : (typeof Vida !== 'undefined' && Vida.vidaAlRevivir
        ? Vida.vidaAlRevivir(maxV) : Math.round(maxV * 0.4));
      Multijugador.socket.emit('admin:revivePlayer', {
        targetPlayerId: targetPlayerId || undefined,
        reviveHp: cura,
        hpMax: maxV,
        perfilId: perfil.id
      }, (res) => resolve(res || { ok: false }));
    });
  },

  _vidaMaximaJugador(partida) {
    const nivel = partida?.nivel ?? 1;
    return (typeof Vida !== 'undefined' && Vida.vidaMaxima)
      ? Vida.vidaMaxima(nivel) : CONFIG.vidaMaxima;
  },

  _revividoRecienteEnPartida(datos) {
    const rev = datos?.revividoEn;
    if (!rev || !Number.isFinite(rev)) return false;
    const muertoAt = (typeof Guardado !== 'undefined' && Guardado.datos?.muertoAt) || 0;
    return rev > muertoAt;
  },

  _aplicarRevivirDesdeNube() {
    if (typeof Usuarios === 'undefined' || !Usuarios.perfilActivo) return;
    if (typeof Guardado === 'undefined' || !Guardado.datos) return;
    const muertoLocal = Guardado.datos.muerto ||
      (typeof Vida !== 'undefined' && Vida.estaMuerto && Vida.estaMuerto());
    if (!muertoLocal) return;

    const snap = (this.publicado.partidas || {})[Usuarios.perfilActivo.id];
    if (!snap?.datos) return;
    if (snap.datos.muerto || (snap.datos.vida != null && snap.datos.vida <= 0)) return;
    if (!this._revividoRecienteEnPartida(snap.datos)) return;
    if ((snap.t || 0) < (Guardado.datos.nubeT || 0)) return;

    Guardado._aplicarSnapshot(snap.datos);
    Guardado.datos.nubeT = snap.t;
    Guardado.guardarAhora();
    if (typeof Vida !== 'undefined' && typeof Vida.revivir === 'function') {
      Vida.revivir(snap.datos.vida, '❤️ El administrador te revivió. ¡Ya puedes seguir jugando!');
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

    const maxV = this._vidaMaximaJugador(partida);
    partida.vida = typeof Vida !== 'undefined' && Vida.vidaAlRevivir
      ? Vida.vidaAlRevivir(maxV) : Math.max(1, Math.round(maxV * 0.4));
    partida.muerto = false;
    if (partida.hambre == null || partida.hambre < CONFIG.hambreInicial) {
      partida.hambre = CONFIG.hambreInicial;
    }

    await this._revivirJugadorOnline(j, partida.vida);
    await this._guardarPartidaJugador(j, partida);
    Notificaciones.mostrar('❤️ ' + j.nombre + ' revivido', 'exito', 5000);
    this._refrescarListaJugadoresSiAbierta();
  },

  async _eliminarJugadorMuerto(perfil) {
    const j = typeof perfil === 'string'
      ? this.jugadoresGlobales().find(x => x.id === perfil)
      : perfil;
    if (!j) return;
    if (j.id === Usuarios.perfilActivo?.id) {
      this._adminAviso('No puedes eliminar al jugador activo');
      return;
    }
    const partida = await this._obtenerPartidaJugador(j);
    if (!this._jugadorEstaMuerto(partida, partida.vida)) {
      this._adminAviso(j.nombre + ' no está muerto');
      return;
    }
    if (!confirm('¿Eliminar a ' + j.nombre + ' y su partida del servidor?')) return;

    Usuarios.datos.lista = Usuarios.datos.lista.filter(p => p.id !== j.id);
    Usuarios._guardarLista();
    localStorage.removeItem(CONFIG.claveGuardado + '::' + j.id);

    if (this.publicado.jugadores) {
      this.publicado.jugadores = this.publicado.jugadores.filter(x => x.id !== j.id);
    }
    if (this.datos.jugadoresExtra) {
      this.datos.jugadoresExtra = this.datos.jugadoresExtra.filter(x => x.id !== j.id);
    }
    delete (this.publicado.partidas || {})[j.id];
    delete (this.datos.partidasExtra || {})[j.id];
    this.guardar();
    await this._publicarParaTodos(false);
    Notificaciones.mostrar('🗑️ ' + j.nombre + ' eliminado', 'alerta', 5000);
    this._refrescarListaJugadoresSiAbierta();
  },

  _sincronizarMapaRemoto(idsObjetosAntes, idsTesorosAntes, idsMisionesAntes, eliminadosAntes) {
    if (this.modo === 'organizar' || this._organizandoArrastreActivo) return;
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
        const mTes = this._marcadoresTesoro[t.id] || t._marcador;
        if (mTes) mTes.setLatLng(t.pos);
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

    if (typeof Tiendas !== 'undefined') {
      for (const t of this.tiendasAdminTodas()) {
        if (this.eliminado(t.id)) continue;
        const pos = this._posItem(t) || t.pos || t.posicion;
        if (!pos) continue;
        this.pos(t.id, pos);
        if (Tiendas._marcadoresAdmin[t.id]) {
          Tiendas._marcadoresAdmin[t.id].setLatLng(pos);
        }
        this._actualizarPuntoEnMapa(t.id, pos);
      }
      if (Tiendas.refrescarAdmin) Tiendas.refrescarAdmin();
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
    this._liberarMarcadorObjeto(id);
    this._liberarMarcadorTesoro(id);
    this._quitarPuntosInteractivos(id);
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
    if (this._adminAbierto()) return;
    this._marcarPanelDesbloqueado();
    document.body.classList.add('admin-panel-abierto');
    if (typeof UIManager !== 'undefined') UIManager.abrir('ventana-admin', { cerrarPares: false });
    else document.getElementById('ventana-admin').classList.remove('oculto');
    this._actualizarEtiquetaMantenimientoNav();
  },

  _adminAbierto() {
    const v = document.getElementById('ventana-admin');
    return !!(v && !v.classList.contains('oculto'));
  },

  cerrarPanel() {
    if (typeof UIManager !== 'undefined') UIManager.cerrar('ventana-admin');
    else document.getElementById('ventana-admin')?.classList.add('oculto');
    document.body.classList.remove('admin-panel-abierto');
  },

  _bindAdminBtn(btn, fn) {
    if (!btn || btn._adminBindOk) return;
    btn._adminBindOk = true;
    const run = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.type === 'pointerup' && ev.pointerType === 'touch') {
        setTimeout(fn, 40);
      } else {
        fn();
      }
    };
    btn.addEventListener('pointerup', run);
    btn.addEventListener('click', (ev) => {
      if (ev.pointerType === 'touch') return;
      run(ev);
    });
  },

  _refrescarListaJugadoresSiAbierta() {
    if (!this._adminAbierto()) return;
    const vistaJug = document.getElementById('admin-vista-jugadores');
    if (!vistaJug || vistaJug.classList.contains('oculto')) return;
    this._listarCuentasAsync({ soloRefrescar: true, sinPartidas: true });
  },

  _mostrarPanelDerecho(vistaId, titulo, opciones) {
    const opts = opciones || {};
    if (!opts.sinHistorial && this._adminVistaActual && this._adminVistaActual !== vistaId) {
      this._adminNavPila.push({ id: this._adminVistaActual, titulo: this._adminVistaTitulo || '' });
    }
    this._adminVistaActual = vistaId;
    this._adminVistaTitulo = titulo || '';
    document.querySelectorAll('.admin-vista').forEach(v => v.classList.add('oculto'));
    const vista = document.getElementById(vistaId);
    if (vista) {
      vista.classList.remove('oculto');
      vista.scrollTop = 0;
    }
    const tit = document.getElementById('admin-panel-titulo');
    if (tit) tit.textContent = titulo || '';
    const panelDer = document.getElementById('admin-panel-derecho');
    if (panelDer) panelDer.classList.remove('oculto');
    const layout = document.querySelector('.admin-layout');
    if (layout) {
      const editorAbierto = vistaId === 'admin-vista-editor' || vistaId === 'admin-vista-crear-jugador';
      layout.classList.toggle('admin-panel-editor-abierto', editorAbierto);
    }
    if (!opts.sinAbrirVentana) {
      if (typeof UIManager !== 'undefined') UIManager.abrir('ventana-admin', { cerrarPares: false });
      else document.getElementById('ventana-admin')?.classList.remove('oculto');
    }
  },

  _ocultarPanelDerecho() {
    document.getElementById('admin-panel-derecho')?.classList.add('oculto');
    document.querySelectorAll('.admin-vista').forEach(v => v.classList.add('oculto'));
    document.querySelector('.admin-layout')?.classList.remove('admin-panel-editor-abierto');
    this._adminVistaActual = null;
    this._adminVistaTitulo = '';
  },

  _volverAlPanel() {
    if (this._editorJugador?._sinGuardar && !confirm('Tienes cambios sin guardar en el inventario. ¿Salir sin guardar?')) {
      return;
    }
    if (this._editorJugador?._creando) this._editorJugador = null;
    if (this._editorJugador && !this._editorJugador._creando) this._editorJugador = null;
    const prev = this._adminNavPila.pop();
    document.getElementById('btn-admin-guardar').style.display = '';
    if (prev?.id) {
      this._mostrarPanelDerecho(prev.id, prev.titulo, { sinHistorial: true });
      if (prev.id === 'admin-vista-jugadores') {
        this._listarCuentasAsync({ soloRefrescar: true, sinPartidas: true });
      }
      return;
    }
    this._ocultarPanelDerecho();
    if (typeof UIManager !== 'undefined') UIManager.abrir('ventana-admin', { cerrarPares: false });
    else document.getElementById('ventana-admin').classList.remove('oculto');
    this._actualizarEtiquetaMantenimientoNav();
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

  abrirFormulario(tipo, datosPrefill) {
    const campos = document.getElementById('admin-form-campos');
    let titulo = 'Crear';
    this._colocacion = { tipo, valores: datosPrefill || null, marcador: null };

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
        const nivelInp = document.getElementById('af-nivel-enemigo');
        if (nivelInp) {
          nivelInp.addEventListener('input', () => {
            this._aplicarStatsEnemigoDesdeNivel(this._numero('af-nivel-enemigo') || 1);
          });
          this._aplicarStatsEnemigoDesdeNivel(1);
        }
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
    } else if (tipo === 'item_nuevo' || tipo === 'item_editar') {
      const editando = tipo === 'item_editar';
      const d = datosPrefill || this._colocacion.valores || {};
      titulo = editando ? '✏️ Editar objeto' : '➕ Crear objeto nuevo';
      campos.innerHTML =
        this._campoTexto('af-nombre', 'Nombre del objeto', 'Ej: Ron añejo') +
        '<div class="campo-admin"><label>Icono — elige un emoji</label>' +
        '<input id="af-icono" maxlength="4" placeholder="Ej: 🍹" readonly>' +
        this._rejillaEmojisHtml() + '</div>' +
        '<div class="campo-doble">' +
          this._campoNumero('af-precio', 'Precio (5 a 5000)', d.precio || 50) +
          this._campoSelect('af-tipo-item', 'Tipo',
            '<option value="comida">🍽️ Consumible (comer/beber)</option>' +
            '<option value="arma">⚔️ Arma</option>' +
            '<option value="casco">⛑️ Casco</option>' +
            '<option value="chaleco">🎽 Chaleco</option>' +
            '<option value="botas">🥾 Botas</option>' +
            '<option value="ropa">👕 Ropa</option>' +
            '<option value="herramienta">🔧 Herramienta</option>' +
            '<option value="pez">🐟 Animal / pez</option>' +
            '<option value="tesoro">💎 Tesoro</option>' +
            '<option value="material">📦 Material</option>' +
            '<option value="especial">✨ Especial</option>') +
        '</div>' +
        '<div class="campo-doble">' +
          this._campoNumero('af-cura-hambre', 'Cura hambre (legacy fijo)', d.cura || 0) +
          this._campoNumero('af-cura-vida', 'Cura vida (legacy fijo)', d.curaVida || 0) +
        '</div>' +
        '<div class="campo-doble" id="af-efecto-campos">' +
          this._campoSelect('af-efecto', 'Efecto (Fase 13)',
            '<option value="">— Usar legacy arriba —</option>' +
            '<option value="hambre">Hambre</option>' +
            '<option value="vida">Vida</option>' +
            '<option value="energia">Energía</option>' +
            '<option value="veneno">Veneno</option>') +
          this._campoSelect('af-efecto-modo', 'Modo',
            '<option value="porcentaje">Porcentaje (%)</option>' +
            '<option value="fijo">Valor fijo</option>') +
        '</div>' +
        this._campoNumero('af-efecto-valor', 'Valor del efecto', d.efectoValor || 0) +
        '<div class="campo-doble" id="af-pez-crudo" style="display:none">' +
          this._campoNumero('af-prob-crudo', 'Prob. efecto negativo crudo %', d.probCrudoNegativo ?? 60) +
          '<div class="campo-caja">Los peces se pueden comer crudos con riesgo de perder vida</div>' +
        '</div>' +
        '<div class="campo-doble" id="af-arma-campos" style="display:none">' +
          this._campoNumero('af-dano', 'Daño arma', d.dano || 5) +
          this._campoNumero('af-nivel-min', 'Nivel mín', d.nivelMin || 1) +
        '</div>' +
        '<div class="campo-doble" id="af-equipo-campos" style="display:none">' +
          this._campoNumero('af-defensa', 'Defensa', d.defensa || 0) +
          this._campoNumero('af-bonus-vida', 'Bonus vida', d.bonusVida || 0) +
        '</div>' +
        '<div class="campo-doble" id="af-equipo-campos2" style="display:none">' +
          this._campoSelect('af-bonus-vida-modo', 'Modo bonus vida',
            '<option value="porcentaje">Porcentaje (%)</option>' +
            '<option value="fijo">Valor fijo</option>') +
          this._campoNumero('af-bonus-dano', 'Bonus daño', d.bonusDano || 0) +
        '</div>' +
        '<div class="campo-doble" id="af-equipo-campos3" style="display:none">' +
          this._campoNumero('af-nivel-min-eq', 'Nivel mín', d.nivelMin || 1) +
          this._campoNumero('af-nivel-max-eq', 'Nivel máx', d.nivelMax || ((d.nivelMin || 1) + 9)) +
        '</div>' +
        this._campoTexto('af-resistencia', 'Resistencia especial (opcional)', d.resistencia || '') +
        this._campoTexto('af-desc', 'Descripción', 'Ej: Reserva especial del puerto') +
        this._campoArea('af-desc-larga', 'Descripción larga (opcional)', 'Texto extra para el catálogo…');
      document.getElementById('btn-admin-guardar').textContent = editando ? 'Guardar cambios' : 'Crear objeto';
      setTimeout(() => {
        if (d.nombre) document.getElementById('af-nombre').value = d.nombre;
        if (d.icono) document.getElementById('af-icono').value = d.icono;
        if (d.desc) document.getElementById('af-desc').value = d.desc;
        if (d.descLarga) document.getElementById('af-desc-larga').value = d.descLarga;
        const selTipo = document.getElementById('af-tipo-item');
        if (d.tipo && selTipo) selTipo.value = d.tipo;
        if (d.efecto) {
          const ef = document.getElementById('af-efecto');
          if (ef) ef.value = d.efecto;
        }
        if (d.efectoModo) {
          const em = document.getElementById('af-efecto-modo');
          if (em) em.value = d.efectoModo;
        }
        if (d.efectoValor != null) {
          const ev = document.getElementById('af-efecto-valor');
          if (ev) ev.value = d.efectoValor;
        }
        this._enlazarEmojisObjeto();
        const armaBox = document.getElementById('af-arma-campos');
        const pezBox = document.getElementById('af-pez-crudo');
        const eqBoxes = ['af-equipo-campos', 'af-equipo-campos2', 'af-equipo-campos3'].map((id) => document.getElementById(id));
        const tiposEq = ['casco', 'chaleco', 'botas', 'ropa'];
        if (d.bonusVidaModo) {
          const bvm = document.getElementById('af-bonus-vida-modo');
          if (bvm) bvm.value = d.bonusVidaModo;
        }
        if (d.defensa != null) {
          const df = document.getElementById('af-defensa');
          if (df) df.value = d.defensa;
        }
        if (d.bonusVida != null) {
          const bv = document.getElementById('af-bonus-vida');
          if (bv) bv.value = d.bonusVida;
        }
        if (d.bonusDano != null) {
          const bd = document.getElementById('af-bonus-dano');
          if (bd) bd.value = d.bonusDano;
        }
        if (d.nivelMin != null && tiposEq.includes(d.tipo)) {
          const nmi = document.getElementById('af-nivel-min-eq');
          if (nmi) nmi.value = d.nivelMin;
        }
        if (d.nivelMax != null && tiposEq.includes(d.tipo)) {
          const nma = document.getElementById('af-nivel-max-eq');
          if (nma) nma.value = d.nivelMax;
        }
        if (d.resistencia) {
          const rs = document.getElementById('af-resistencia');
          if (rs) rs.value = d.resistencia;
        }
        const toggleTipo = () => {
          const t = selTipo?.value || '';
          if (armaBox) armaBox.style.display = t === 'arma' ? '' : 'none';
          if (pezBox) pezBox.style.display = t === 'pez' ? '' : 'none';
          const esEq = tiposEq.includes(t);
          eqBoxes.forEach((box) => { if (box) box.style.display = esEq ? '' : 'none'; });
        };
        selTipo?.addEventListener('change', toggleTipo);
        toggleTipo();
      }, 0);
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
    if (tipo === 'item_nuevo' || tipo === 'item_editar') {
      const editando = tipo === 'item_editar';
      const idExistente = editando ? this._colocacion.valores?.id : null;
      const nombre = this._valor('af-nombre').trim();
      const icono = this._valor('af-icono').trim() || '📦';
      if (nombre.length < 2) { alert('Ponle un nombre al objeto'); return; }
      if (!icono) { alert('Elige un emoji para el objeto'); return; }
      const tipoItem = this._valor('af-tipo-item') || 'especial';
      const curaH = this._numero('af-cura-hambre') || 0;
      const curaV = this._numero('af-cura-vida') || 0;
      const efecto = this._valor('af-efecto').trim();
      const efectoValor = this._numero('af-efecto-valor') || 0;
      const efectoModo = this._valor('af-efecto-modo') || 'porcentaje';
      const nuevo = {
        id: idExistente || ('obj_' + nombre.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '').slice(0, 16) +
          '_' + Date.now().toString(36).slice(-4)),
        nombre, icono,
        precio: Items._limitarPrecio(this._numero('af-precio')),
        tipo: tipoItem,
        desc: this._valor('af-desc').trim(),
        descLarga: this._valor('af-desc-larga').trim(),
        estado: 'activo'
      };
      if (curaH > 0) nuevo.cura = curaH;
      if (curaV > 0) nuevo.curaVida = curaV;
      if (efecto && efectoValor > 0) {
        nuevo.efecto = efecto;
        nuevo.efectoValor = efectoValor;
        nuevo.efectoModo = efectoModo === 'fijo' ? 'fijo' : 'porcentaje';
      }
      if (tipoItem === 'pez') {
        nuevo.crudo = true;
        nuevo.probCrudoNegativo = Math.min(100, Math.max(0, this._numero('af-prob-crudo') ?? 60));
      }
      if (tipoItem === 'arma') {
        nuevo.dano = Math.max(1, this._numero('af-dano') || 5);
        nuevo.nivelMin = Math.max(1, this._numero('af-nivel-min') || 1);
        nuevo.nivelMax = Math.min(100, (nuevo.nivelMin || 1) + 9);
      }
      if (['casco', 'chaleco', 'botas', 'ropa'].includes(tipoItem)) {
        nuevo.defensa = Math.max(0, this._numero('af-defensa') || 0);
        nuevo.nivelMin = Math.max(1, this._numero('af-nivel-min-eq') || 1);
        nuevo.nivelMax = Math.min(100, this._numero('af-nivel-max-eq') || ((nuevo.nivelMin || 1) + 9));
        const bonusVida = this._numero('af-bonus-vida') || 0;
        if (bonusVida > 0) {
          nuevo.bonusVida = bonusVida;
          nuevo.bonusVidaModo = this._valor('af-bonus-vida-modo') === 'fijo' ? 'fijo' : 'porcentaje';
        }
        const bonusDano = this._numero('af-bonus-dano') || 0;
        if (bonusDano > 0) nuevo.bonusDano = bonusDano;
        const resistencia = this._valor('af-resistencia').trim();
        if (resistencia) nuevo.resistencia = resistencia;
        nuevo.puedeEquipar = true;
      }
      const norm = Items._normalizarDef(nuevo);
      Object.assign(nuevo, norm);
      if (editando) {
        const idx = this.datos.itemsNuevos.findIndex(x => x.id === idExistente);
        if (idx < 0) { alert('Objeto no encontrado'); return; }
        const prev = this.datos.itemsNuevos[idx];
        nuevo.creadoEn = prev.creadoEn;
        nuevo.creadoPor = prev.creadoPor;
        nuevo.modificadoEn = Date.now();
        this.datos.itemsNuevos[idx] = nuevo;
      } else {
        nuevo.creadoEn = Date.now();
        nuevo.modificadoEn = Date.now();
        nuevo.creadoPor = (typeof Usuarios !== 'undefined' && Usuarios.perfilActivo)
          ? Usuarios.perfilActivo.nombre : 'admin';
        this.datos.itemsNuevos.push(nuevo);
      }
      this._reaplicarCatalogoItems();
      this.guardar();
      this._colocacion = null;
      this._ocultarPanelDerecho();
      Notificaciones.mostrar((editando ? '✏️ Objeto actualizado: ' : '➕ Objeto creado: ') +
        icono + ' ' + nombre, 'exito', 6000);
      this._publicarParaTodos(true);
      if (typeof AdminCatalogo !== 'undefined') AdminCatalogo.refrescarSiAbierto();
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
      const nivel = Math.max(1, Math.min(100, this._numero('af-nivel-enemigo') || 1));
      const vidaCfg = this.vidaEnemigoPorNivel(nivel);
      const vida = Math.max(10, this._numero('af-vida') || vidaCfg);
      const dR = this.danoEnemigoPorNivel(nivel);
      const dMin = Math.max(1, this._numero('af-dano-min') || dR.lo);
      const dMax = Math.max(dMin, this._numero('af-dano-max') || dR.hi);
      valores = {
        nombre, icono, vida, vidaMax: vida,
        nivel,
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
      if (nombre.length < 2) { this._adminAviso('Ponle nombre a la tienda'); return; }
      const vende = (this._tiendaAdminSlots || []).filter(Boolean);
      if (!vende.length) { this._adminAviso('Añade al menos un artículo (toca ADM ∞)'); return; }
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
    if (typeof Cofres !== 'undefined') Cofres.cancelarPin(true);
    document.body.classList.remove('admin-organizar');
    document.body.classList.remove('admin-panel-abierto');
    document.body.classList.add('admin-colocando');
    if (typeof UIManager !== 'undefined') UIManager.cerrar('ventana-admin');
    else document.getElementById('ventana-admin').classList.add('oculto');
    this.modo = 'colocar';
    const centro = Mapa.mapa.getCenter();
    const icono = (this._colocacion?.tipo === 'tienda_admin')
      ? (this._colocacion.valores?.icono || '🏪')
      : (this._colocacion?.tipo === 'enemigo')
        ? (this._colocacion.valores?.icono || '👹')
        : (this._colocacion?.tipo === 'mision')
          ? '📜'
          : (this._colocacion?.tipo === 'tesoro')
            ? (this._colocacion.valores?.iconoMapa || this.tesoroIconoMapa() || '🎁')
            : '📌';
    const marcador = L.marker([centro.lat, centro.lng], {
      draggable: true,
      zIndexOffset: 2000,
      icon: L.divIcon({
        className: '',
        html: '<div class="icono-admin-pin">' + icono + '</div>',
        iconSize: [34, 34],
        iconAnchor: [17, 30]
      })
    }).addTo(Mapa.mapa);
    this._colocacion.marcador = marcador;
    this._mostrarControles('Arrastra el pin a su lugar y pulsa Confirmar', true);
  },

  async confirmarColocacion() {
    if (this.modo === 'colocar_cofre' && typeof Cofres !== 'undefined' && Cofres._colocarPin) {
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
    this.guardar();
    this._colocacion = null;
    this.salirModo();
    this._encolarPublicacion(true);
  },

  // ---------- MISIONES DEL ADMIN ----------





  // ---------- TESOROS DEL ADMIN ----------
  _tesorosEstadoGlobal() {
    if (!this.publicado.tesorosEstado) this.publicado.tesorosEstado = {};
    return this.publicado.tesorosEstado;
  },

  _tesoroDisponible(t) {
    return this._tesoroDisponiblePorId(t.id, t.respawnMin);
  },

  _tesoroDisponiblePorId(id, respawnMin) {
    const st = this._tesorosEstadoGlobal()[id];
    if (!st || !st.recogidoAt) return true;
    if (!respawnMin) return false;
    return Date.now() - st.recogidoAt > respawnMin * 60000;
  },

  aplicarRecogidaTesoro(tesoroId, recogidoAt) {
    if (!tesoroId) return;
    this._tesorosEstadoGlobal()[tesoroId] = { recogidoAt: recogidoAt || Date.now() };
    this._liberarMarcadorTesoro(tesoroId);
    this._quitarPuntosInteractivos(tesoroId);
    if (typeof Tesoros !== 'undefined') {
      const idx = Tesoros.activos.findIndex(x => x.datos.id === tesoroId);
      if (idx >= 0) {
        const estado = Tesoros.activos[idx];
        if (estado.marcador) {
          try { estado.marcador.remove(); } catch (e) { /* */ }
          estado.marcador = null;
        }
        Tesoros.activos.splice(idx, 1);
        if (Tesoros.refrescarBanner) Tesoros.refrescarBanner();
      }
    }
    if (GPS.posicion) this.refrescarVisibles();
  },

  _itemsDeTesoro(t) {
    if (t.recItems && t.recItems.length) return t.recItems;
    if (t.recItem) return [{ id: t.recItem, cantidad: t.recCant || 1 }];
    return [];
  },

  _prepararTesoro(t) {
    if (!t?.id || !t.pos) return;
    if (!this._tesoroDisponible(t)) {
      this._liberarMarcadorTesoro(t.id);
      return;
    }
    const existente = this._marcadoresTesoro[t.id];
    if (existente) t._marcador = existente;
    if (typeof Mapa !== 'undefined' && !Mapa.puntosInteractivos.find(x => x.id === t.id)) {
      Mapa.registrarPunto({
        id: t.id,
        posicion: t.pos,
        radio: CONFIG.distanciaInteraccion,
        marcador: existente || null,
        alCambiarDistancia: d => this._revisarTesoro(t, d)
      });
    }
    this._revisarTesoro(t, Utilidades.distanciaMetros(GPS.posicion ? GPS.posicion : CONFIG.centro, t.pos));
  },

  _puedeDetectar(t) {
    return !t.itemParaVer || Mochila.tieneItem(t.itemParaVer);
  },

  _revisarTesoro(t, distancia) {
    if (!t?.id) return;
    if (!this._tesoroDisponible(t)) {
      this._liberarMarcadorTesoro(t.id);
      return;
    }
    const detecta = this._puedeDetectar(t);
    const icono = t.iconoMapa || this.tesoroIconoMapa();
    const debeVerse = detecta && (!t.invisible || distancia <= CONFIG.distanciaVerTesoro);
    const marcadorActual = this._marcadoresTesoro[t.id] || t._marcador;

    if (debeVerse && !marcadorActual) {
      this._liberarMarcadorTesoro(t.id);
      const marcador = L.marker(t.pos, {
        icon: L.divIcon({
          className: '',
          html: '<div class="icono-tesoro">' + icono + '</div>',
          iconSize: [34, 34], iconAnchor: [17, 17]
        })
      }).addTo(Mapa.mapa);
      this._vincularMarcadorTesoro(t, marcador);
      marcador.on('click', () => {
        if (this.manejarClickPunto({ id: t.id, esTesoroAdmin: t })) return;
        this._recogerTesoro(t);
      });
    } else if (!debeVerse && marcadorActual) {
      this._liberarMarcadorTesoro(t.id);
    } else if (marcadorActual && t.pos) {
      marcadorActual.setLatLng(t.pos);
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
    if (GPS.posicion) {
      for (const t of this.tesorosTodos()) {
        this._revisarTesoro(t, Utilidades.distanciaMetros(GPS.posicion, t.pos));
      }
    }
    this._refrescarObjetosMapa();
    if (GPS.posicion) this._refrescarBolsasMapa();
    this._refrescarBotinesMapa();
    if (typeof Multijugador !== 'undefined' && Multijugador._sincronizarPinesPartida) {
      Multijugador._sincronizarPinesPartida();
    }
  },

  _refrescarBolsasMapa() {
    if (typeof Bolsas === 'undefined' || !GPS.posicion) return;
    for (const b of Bolsas.todas()) {
      if (!b?.pos) continue;
      const d = Utilidades.distanciaMetros(GPS.posicion, b.pos);
      if (!b._marcador && Bolsas.visibleCerca(b, d)) this._crearMarcadorBolsa(b, d);
      else if (b._marcador) {
        b._marcador.setLatLng(b.pos);
        this._revisarBolsa(b, d);
      } else {
        this._revisarBolsa(b, d);
      }
    }
  },

  _liberarMarcadorBolsa(id) {
    if (!id) return;
    const m = this._marcadoresBolsa?.[id];
    if (m) {
      try { m.remove(); } catch (e) { /* */ }
      delete this._marcadoresBolsa[id];
    }
    if (typeof Bolsas !== 'undefined') {
      for (const b of Bolsas.todas()) {
        if (b && b.id === id) b._marcador = null;
      }
    }
    if (typeof Mapa !== 'undefined') {
      const p = Mapa.puntosInteractivos.find(x => x.id === id);
      if (p) p.marcador = null;
    }
  },

  _vincularMarcadorBolsa(b, marcador) {
    if (!b?.id || !marcador) return;
    if (!this._marcadoresBolsa) this._marcadoresBolsa = {};
    b._marcador = marcador;
    this._marcadoresBolsa[b.id] = marcador;
    if (typeof Mapa !== 'undefined') {
      const p = Mapa.puntosInteractivos.find(x => x.id === b.id);
      if (p) p.marcador = marcador;
    }
  },

  _crearMarcadorBolsa(b, distancia) {
    if (!b?.items?.length || !b.pos) return;
    const d = typeof distancia === 'number'
      ? distancia
      : Utilidades.distanciaMetros(GPS.posicion ? GPS.posicion : CONFIG.centro, b.pos);
    if (!Mapa.puntosInteractivos.find(x => x.id === b.id)) {
      Mapa.registrarPunto({
        id: b.id,
        posicion: b.pos,
        radio: CONFIG.distanciaInteraccion,
        marcador: null,
        alCambiarDistancia: (dist) => this._revisarBolsa(b, dist)
      });
    }
    this._revisarBolsa(b, d);
  },

  _revisarBolsa(b, distancia) {
    if (!b?.items?.length) return;
    const d = typeof distancia === 'number'
      ? distancia
      : (GPS.posicion ? Utilidades.distanciaMetros(GPS.posicion, b.pos) : Infinity);
    const debeVerse = typeof Bolsas !== 'undefined' && Bolsas.visibleCerca(b, d);

    if (debeVerse && !b._marcador) {
      this._liberarMarcadorBolsa(b.id);
      b._marcador = Mapa.crearMarcadorEmoji(b.pos, '🎒', 28);
      this._claseIconoMapa(b._marcador, 'marcador-bolsa-drop');
      this._vincularMarcadorBolsa(b, b._marcador);
      b._marcador.on('click', () => {
        if (typeof Bolsas !== 'undefined') void Bolsas.recoger(b);
      });
    } else if (!debeVerse) {
      this._liberarMarcadorBolsa(b.id);
    }
  },

  _refrescarBotinesMapa() {
    if (typeof BotinEnemigo === 'undefined') return;
    for (const b of BotinEnemigo.todas()) {
      if (!b?.pos) continue;
      if (b._marcador) {
        b._marcador.setLatLng(b.pos);
      }
      this._revisarBotin(b);
    }
  },

  _liberarMarcadorBotin(id) {
    if (!id) return;
    const m = this._marcadoresBotin?.[id];
    if (m) {
      try { m.remove(); } catch (e) { /* */ }
      delete this._marcadoresBotin[id];
    }
    if (typeof BotinEnemigo !== 'undefined') {
      for (const b of BotinEnemigo.todas()) {
        if (b && b.id === id) b._marcador = null;
      }
    }
    if (typeof Mapa !== 'undefined') {
      const p = Mapa.puntosInteractivos.find(x => x.id === id);
      if (p) p.marcador = null;
    }
  },

  _vincularMarcadorBotin(b, marcador) {
    if (!b?.id || !marcador) return;
    if (!this._marcadoresBotin) this._marcadoresBotin = {};
    b._marcador = marcador;
    this._marcadoresBotin[b.id] = marcador;
    if (typeof Mapa !== 'undefined') {
      const p = Mapa.puntosInteractivos.find(x => x.id === b.id);
      if (p) p.marcador = marcador;
    }
  },

  _claseIconoMapa(marcador, clase) {
    const inner = marcador?.getElement?.()?.querySelector('.icono-mapa');
    if (inner) inner.classList.add(clase);
  },

  _crearMarcadorBotin(b) {
    if (!b?.pos || typeof BotinEnemigo === 'undefined') return;
    if (!BotinEnemigo.visibleParaMi(b)) return;
    if (!Mapa.puntosInteractivos.find(x => x.id === b.id)) {
      Mapa.registrarPunto({
        id: b.id,
        posicion: b.pos,
        radio: CONFIG.distanciaInteraccion,
        marcador: null,
        alCambiarDistancia: () => this._revisarBotin(b)
      });
    }
    this._revisarBotin(b);
  },

  _revisarBotin(b) {
    if (!b?.pos || typeof BotinEnemigo === 'undefined') return;
    const debeVerse = BotinEnemigo.visibleParaMi(b);

    if (debeVerse && !b._marcador) {
      this._liberarMarcadorBotin(b.id);
      const pos = Mapa._normalizarLatLng ? Mapa._normalizarLatLng(b.pos) : b.pos;
      if (!pos) return;
      b.pos = pos;
      b._marcador = typeof Mapa.crearMarcadorBotin === 'function'
        ? Mapa.crearMarcadorBotin(pos)
        : Mapa.crearMarcadorEmoji(pos, '📦', 36, { wrapClass: 'marcador-botin-wrap' });
      if (!b._marcador) return;
      this._vincularMarcadorBotin(b, b._marcador);
      b._marcador.on('click', () => BotinEnemigo.abrirMenu(b.id));
    } else if (!debeVerse) {
      this._liberarMarcadorBotin(b.id);
    }
  },

  _refrescarObjetosMapa() {
    if (this.modo === 'organizar' || this._organizandoArrastreActivo) return;
    for (const o of this.objetosTodos()) {
      if (!o || !o.pos || this.eliminado(o.id)) continue;
      this.pos(o.id, o.pos);
      if (!o._marcador) this._crearMarcadorObjeto(o);
      else {
        o._marcador.setLatLng(o.pos);
        this._revisarObjeto(o);
      }
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
    const pos = typeof GPS !== 'undefined' ? GPS.posicion : null;
    if (typeof Multijugador !== 'undefined' && Multijugador.activo && CONFIG.servidorOnline) {
      const res = await Multijugador.recogerTesoroCompartido(t.id, pos);
      if (!res?.ok) {
        Notificaciones.mostrar('❌ ' + Utilidades.mensajeAmigable(res?.error, 'No se pudo recoger el tesoro'), 'error', 4500);
        return;
      }
    } else {
      for (const it of items) {
        if (!Mochila.agregar(it.id, it.cantidad || 1, { silencioso: true })) {
          Notificaciones.mostrar('🎒 No tienes espacio para todo el tesoro', 'error');
          return;
        }
      }
      const est = this._tesorosEstadoGlobal();
      est[t.id] = { recogidoAt: Date.now() };
      this.aplicarRecogidaTesoro(t.id, Date.now());
    }
    const est = this._tesorosEstadoGlobal();
    if (!est[t.id]) est[t.id] = { recogidoAt: Date.now() };
    if (!this._progreso().tesoros.includes(t.id)) this._progreso().tesoros.push(t.id);
    Guardado.guardar();
    this.guardar();
    this._publicarParaTodos(true);

    const punto = Mapa.mapa.latLngToContainerPoint(t.pos);
    Utilidades.volarHaciaMochila(t.iconoMapa || this.tesoroIconoMapa(), punto.x, punto.y);
    this._liberarMarcadorTesoro(t.id);

    const nombres = items.map(it => Items.seguro(it.id).icono + ' x' + (it.cantidad || 1)).join(', ');
    setTimeout(async () => {
      const online = typeof Multijugador !== 'undefined' && Multijugador.activo && CONFIG.servidorOnline;
      if (!online && t.dinero) await Dinero.ganar(t.dinero, 'Tesoro encontrado');
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
    const global = (this.publicado.objetosEstado || {})[o.id];
    if (global && global.recogidoAt) {
      if ((o.reaparece || 0) > 0 && Date.now() - global.recogidoAt > o.reaparece * 60000) {
        return true;
      }
      return false;
    }
    const t = this._objetosRecogidos()[o.id];
    if (!t) return true;
    return (o.reaparece || 0) > 0 && Date.now() - t > o.reaparece * 60000;
  },

  /** Recogida compartida vía servidor (todos ven el objeto desaparecer). */
  aplicarRecogidaCompartida(origenId, recogidoAt, playerId) {
    if (!origenId) return;
    if (!this.publicado.objetosEstado) this.publicado.objetosEstado = {};
    this.publicado.objetosEstado[origenId] = {
      recogidoAt: recogidoAt || Date.now(),
      playerId: playerId != null ? playerId : null
    };
    this._liberarMarcadorObjeto(origenId);
    for (const o of this.objetosTodos()) {
      if (o.id !== origenId) continue;
      this._revisarObjeto(o);
      break;
    }
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
    if (!Mapa.puntosInteractivos.find(x => x.id === o.id)) {
      Mapa.registrarPunto({
        id: o.id,
        posicion: o.pos,
        radio: CONFIG.distanciaInteraccion,
        marcador: null,
        alCambiarDistancia: () => this._revisarObjeto(o)
      });
    }
    this._revisarObjeto(o);
  },

  _revisarObjeto(o) {
    const items = this._itemsDeObjeto(o);
    if (!items.length) return;
    const principal = Items.obtener(items[0].id);
    if (!principal) return;
    const disponible = this._objetoDisponible(o);
    if (disponible && !o._marcador) {
      this._liberarMarcadorObjeto(o.id);
      o._marcador = Mapa.crearMarcadorEmoji(o.pos, principal.icono, 26);
      this._vincularMarcadorObjeto(o, o._marcador);
      if (items.length > 1) {
        const el = o._marcador.getElement?.();
        if (el) el.classList.add('marcador-obj-multi');
      }
      o._marcador.on('click', () => {
        const punto = Mapa.puntosInteractivos.find(x => x.id === o.id);
        if (punto && this.manejarClickPunto(punto)) return;
        if (this.manejarClickPunto({ id: o.id, marcador: o._marcador })) return;
        this._recogerObjeto(o);
      });
      if (this.modo === 'organizar') {
        this._arrastreOrganizarMarcador(o._marcador, { id: o.id, marcador: o._marcador }, (m) => {
          const p = m.getLatLng();
          const pos = this._guardarPosicionOrganizar(o.id, p.lat, p.lng);
          if (pos) {
            o.pos[0] = pos[0];
            o.pos[1] = pos[1];
          }
          this.guardar();
          this._publicarParaTodos(true);
        });
      }
    } else if (!disponible) {
      this._liberarMarcadorObjeto(o.id);
    }
  },

  async _recogerObjeto(o) {
    if (typeof Bolsas !== 'undefined' && Bolsas._esBolsa(o)) {
      return Bolsas.recoger(o);
    }
    if (!this._objetoDisponible(o)) return;
    const d = Utilidades.distanciaMetros(GPS.posicion, o.pos);
    if (d > CONFIG.distanciaInteraccion) {
      Notificaciones.mostrar('📍 Acércate más para recoger (' + Math.round(d) + ' m)', 'info', 3500);
      return;
    }
    const items = this._itemsDeObjeto(o);
    if (typeof Multijugador !== 'undefined' && Multijugador.activo && CONFIG.servidorOnline) {
      const res = await Multijugador.recogerObjetoCompartido(o.id, GPS.posicion);
      if (!res?.ok) {
        Notificaciones.mostrar('❌ ' + Utilidades.mensajeAmigable(res?.error, 'No se pudo recoger'), 'error', 4500);
        return;
      }
    } else {
      for (const it of items) {
        if (!Mochila.agregar(it.id, it.cantidad || 1, { silencioso: true })) {
          Notificaciones.mostrar('🎒 No tienes espacio para todo', 'error');
          return;
        }
      }
      this.aplicarRecogidaCompartida(o.id, Date.now(), null);
    }
    Guardado.guardar();
    const principal = Items.obtener(items[0].id);
    const punto = Mapa.mapa.latLngToContainerPoint(o.pos);
    Utilidades.volarHaciaMochila(principal.icono, punto.x, punto.y);
    const nombres = items.map(it => Items.seguro(it.id).nombre + ' x' + (it.cantidad || 1)).join(', ');
    Notificaciones.mostrar('📦 Recogiste: ' + nombres +
      ((o.reaparece || 0) > 0 ? ' (vuelve en ' + o.reaparece + ' min)' : ''), 'exito');
    this._revisarObjeto(o);
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

  _quitarLineaOrganizar(punto) {
    if (punto?._orgLinea && typeof Mapa !== 'undefined' && Mapa.mapa) {
      try { Mapa.mapa.removeLayer(punto._orgLinea); } catch (e) { /* */ }
    }
    if (punto) {
      punto._orgLinea = null;
      punto._orgLineaOrigen = null;
    }
  },

  _limpiarPinOrganizar(marcador, punto) {
    if (!marcador || !punto) return;
    if (punto._orgDragStart) marcador.off('dragstart', punto._orgDragStart);
    if (punto._movOrg) marcador.off('drag', punto._movOrg);
    if (punto._finOrg) marcador.off('dragend', punto._finOrg);
    this._quitarLineaOrganizar(punto);
    punto._orgDragStart = punto._movOrg = punto._finOrg = null;
    marcador.options.draggable = false;
    if (marcador.dragging) marcador.dragging.disable();
    const el = marcador.getElement?.();
    if (el) {
      el.classList.remove('admin-pin-armado', 'admin-pin-moviendo', 'admin-pin-organizar');
      el.querySelector('.admin-pin-x')?.remove();
      el.querySelector('.admin-pin-grip')?.remove();
    }
    if (marcador._muertoPlayerId != null && typeof Multijugador !== 'undefined') {
      Multijugador._restaurarToqueAtaud(marcador);
    }
  },

  _moverCuerpoAdmin(playerId, lat, lng) {
    const key = String(playerId);
    if (!this.publicado.cuerposMuertos) this.publicado.cuerposMuertos = {};
    const c = (typeof Multijugador !== 'undefined' && Multijugador.cuerpos?.[key]) ||
      this.publicado.cuerposMuertos[key] || {};
    const updated = Object.assign({}, c, {
      playerId: Number(playerId),
      deathX: lat,
      deathY: lng,
      name: c.name || '?',
      muertoAt: c.muertoAt || Date.now()
    });
    this.publicado.cuerposMuertos[key] = updated;
    if (typeof Multijugador !== 'undefined') {
      if (!Multijugador.cuerpos) Multijugador.cuerpos = {};
      Multijugador.cuerpos[key] = Object.assign({}, Multijugador.cuerpos[key] || {}, updated);
      const p = Multijugador.online?.find(x => Number(x.playerId) === Number(playerId));
      if (p) {
        p.deathX = lat;
        p.deathY = lng;
      }
    }
    this.guardar();
    this._publicarParaTodos(true);
  },

  _moverJugadorAdmin(playerId, lat, lng) {
    const pid = Number(playerId);
    if (!pid || !Number.isFinite(lat) || !Number.isFinite(lng)) return;

    if (typeof Multijugador !== 'undefined') {
      const p = Multijugador.online.find(x => Number(x.playerId) === pid);
      if (p) {
        p.x = lat;
        p.y = lng;
        const m = Multijugador.marcadores[pid];
        if (m) m.setLatLng([lat, lng]);
      }
      const perfil = p
        ? this.jugadoresGlobales().find(j =>
          (j.nombre || '').trim().toLowerCase() === (p.name || '').trim().toLowerCase())
        : null;
      Multijugador.adminMoverJugador(pid, lat, lng, perfil?.id || null);
    }

    if (typeof Notificaciones !== 'undefined') {
      Notificaciones.mostrar('📍 Jugador movido en el mapa', 'exito', 2000);
    }
    if (this.modo === 'organizar') {
      requestAnimationFrame(() => this._reaplicarArrastreOrganizar());
    }
  },

  _arrastreOrganizarMarcador(marcador, punto, alMoverPos, alArrastrar) {
    if (!marcador) return;
    this._limpiarPinOrganizar(marcador, punto);

    marcador.setZIndexOffset(13000);
    marcador.options.draggable = true;
    if (marcador.dragging) marcador.dragging.enable();

    const actualizarLinea = () => {
      if (!Mapa.mapa || !punto._orgLineaOrigen) return;
      const dest = marcador.getLatLng();
      const coords = [punto._orgLineaOrigen, [dest.lat, dest.lng]];
      if (!punto._orgLinea) {
        punto._orgLinea = L.polyline(coords, {
          color: '#38c6ff',
          weight: 4,
          opacity: 0.88,
          dashArray: '10, 12',
          interactive: false,
          className: 'admin-org-linea'
        }).addTo(Mapa.mapa);
      } else {
        punto._orgLinea.setLatLngs(coords);
      }
    };

    const asegurarControlesPin = () => {
      const el = marcador.getElement?.();
      if (!el) return;
      el.classList.add('admin-pin-organizar');
      if (el.querySelector('.admin-pin-x')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'admin-pin-x';
      btn.title = 'Eliminar pin';
      btn.textContent = '✕';
      btn.addEventListener('mousedown', (ev) => L.DomEvent.stopPropagation(ev));
      btn.addEventListener('touchstart', (ev) => L.DomEvent.stopPropagation(ev), { passive: true });
      btn.addEventListener('click', (ev) => {
        L.DomEvent.stopPropagation(ev);
        ev.preventDefault();
        if (punto._cuerpoPlayerId) {
          this._eliminarCuerpoAdmin(punto._cuerpoPlayerId);
          return;
        }
        if (punto._jugadorPlayerId) return;
        this._eliminarPin(punto, true);
      });
      el.appendChild(btn);
    };

    punto._orgDragStart = () => {
      this._organizandoArrastreActivo = true;
      const ll = marcador.getLatLng();
      punto._orgLineaOrigen = [ll.lat, ll.lng];
      const el = marcador.getElement?.();
      if (el) el.classList.add('admin-pin-moviendo');
      actualizarLinea();
    };

    punto._movOrg = () => {
      actualizarLinea();
      if (alArrastrar) alArrastrar(marcador);
    };

    punto._finOrg = () => {
      this._organizandoArrastreActivo = false;
      const el = marcador.getElement?.();
      if (el) el.classList.remove('admin-pin-moviendo');
      if (alMoverPos) alMoverPos(marcador);
      this._quitarLineaOrganizar(punto);
    };

    marcador.on('dragstart', punto._orgDragStart);
    marcador.on('drag', punto._movOrg);
    marcador.on('dragend', punto._finOrg);

    requestAnimationFrame(() => asegurarControlesPin());
  },

  _arrastreOrganizarEnemigo(e) {
    if (!e?.id || typeof Enemigos === 'undefined') return;
    const m = Enemigos._marcadores[e.id];
    if (!m) return;
    const alSoltar = (marc) => {
      const p = marc.getLatLng();
      this._fijarPosicionEnemigo(e.id, [+p.lat.toFixed(6), +p.lng.toFixed(6)]);
      if (this.modo === 'organizar') {
        requestAnimationFrame(() => this._arrastreOrganizarEnemigo(e));
      }
    };
    const alArrastrar = (marc) => {
      const p = marc.getLatLng();
      Enemigos._moverEnemigo(e, +p.lat.toFixed(6), +p.lng.toFixed(6));
    };
    this._arrastreOrganizarMarcador(m, { id: e.id, marcador: m }, alSoltar, alArrastrar);
  },

  _habilitarArrastreMarcador(marcador, alSoltar) {
    if (!marcador || marcador === GPS.marcador) return;
    if (this.modo === 'organizar') {
      this._arrastreOrganizarMarcador(marcador, { marcador, id: marcador._adminPinId || 'jugador' }, alSoltar);
      return;
    }
    marcador.options.draggable = true;
    if (marcador.dragging) marcador.dragging.enable();
    if (alSoltar) {
      marcador.off('dragend', alSoltar);
      marcador.on('dragend', alSoltar);
    }
  },

  // ---------- MODOS ORGANIZAR / ELIMINAR ----------
  entrarModo(modo) {
    this._ocultarPanelDerecho();
    if (typeof UIManager !== 'undefined') UIManager.cerrar('ventana-admin');
    else document.getElementById('ventana-admin').classList.add('oculto');
    this.modo = modo;
    document.body.classList.add('admin-organizar');
    const cesto = document.getElementById('admin-cesto-borrar');
    if (cesto) {
      cesto.classList.add('oculto');
      cesto.classList.remove('activo', 'cesto-hover');
    }
    this._mostrarControles(
      'Arrastra el icono a su lugar · ✕ borra el pin',
      false
    );
    this._refrescarObjetosMapa();
    if (typeof Enemigos !== 'undefined' && Enemigos._actualizarZonasOrganizar) {
      Enemigos._actualizarZonasOrganizar();
      Enemigos._actualizarPrioridadAdmin(true);
    }

    // Mostrar pines fantasma de los tesoros base (normalmente invisibles)
    for (const t of DATOS_TESOROS) {
      if (this.eliminado(t.id)) continue;
      const fantasma = L.marker(t.posicion, {
        draggable: false,
        opacity: 0.75,
        icon: L.divIcon({ className: '', html: '<div class="icono-tesoro">✨</div>', iconSize: [30, 30], iconAnchor: [15, 15] })
      }).addTo(Mapa.mapa);
      this._arrastreOrganizarMarcador(fantasma, { id: t.id, marcador: fantasma, nombre: 'Tesoro oculto' }, (m) => {
        const p = m.getLatLng();
        t.posicion[0] = +p.lat.toFixed(6);
        t.posicion[1] = +p.lng.toFixed(6);
        this.datos.posiciones[t.id] = [t.posicion[0], t.posicion[1]];
        this.guardar();
        this._encolarPublicacion(true);
      });
      this._fantasmas.push(fantasma);
    }

    // Igual con los tesoros invisibles del admin
    for (const t of this.tesorosTodos()) {
      if (t._marcador) continue;
      const fantasma = L.marker(t.pos, {
        draggable: false,
        opacity: 0.75,
        icon: L.divIcon({ className: '', html: '<div class="icono-tesoro">🎁</div>', iconSize: [30, 30], iconAnchor: [15, 15] })
      }).addTo(Mapa.mapa);
      this._arrastreOrganizarMarcador(fantasma, { id: t.id, marcador: fantasma, nombre: 'Tesoro del admin' }, (m) => {
        const p = m.getLatLng();
        t.pos[0] = +p.lat.toFixed(6); t.pos[1] = +p.lng.toFixed(6);
        this.datos.posiciones[t.id] = [t.pos[0], t.pos[1]];
        this.guardar();
        this._encolarPublicacion(true);
      });
      this._fantasmas.push(fantasma);
    }

    if (modo === 'organizar') {
      this._reaplicarArrastreOrganizar();
    }
    if (typeof GPS !== 'undefined') GPS._actualizarArrastre();
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
      this.datos.enemigos = (this.datos.enemigos || []).filter(x => x.id !== punto.id);
      this.datos.tiendasAdmin = (this.datos.tiendasAdmin || []).filter(x => x.id !== punto.id);
      if (!this.datos.eliminados.includes(punto.id)) this.datos.eliminados.push(punto.id);
    }
    delete (this.datos.posiciones || {})[punto.id];
    delete (this.publicado.posiciones || {})[punto.id];
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
    this._organizandoArrastreActivo = false;
    document.body.classList.remove('admin-colocando', 'admin-panel-abierto');
    // Cancelar colocación pendiente
    if (this._colocacion && this._colocacion.marcador) this._colocacion.marcador.remove();
    this._colocacion = null;

    // Quitar fantasmas y desactivar arrastres
    for (const f of this._fantasmas) {
      this._limpiarPinOrganizar(f, { marcador: f });
      f.remove();
    }
    this._fantasmas = [];
    document.body.classList.remove('admin-organizar');
    const cesto = document.getElementById('admin-cesto-borrar');
    if (cesto) {
      cesto.classList.add('oculto');
      cesto.classList.remove('activo', 'cesto-hover');
    }
    if (typeof Cofres !== 'undefined') Cofres.cancelarPin(true);
    for (const p of Mapa.puntosInteractivos) {
      if (p.marcador) this._limpiarPinOrganizar(p.marcador, p);
    }
    if (typeof Enemigos !== 'undefined') {
      for (const e of Enemigos.lista) {
        const m = Enemigos._marcadores[e.id];
        if (m) this._limpiarPinOrganizar(m, { id: e.id, marcador: m });
      }
      if (Enemigos._actualizarZonasOrganizar) Enemigos._actualizarZonasOrganizar();
    }
    if (typeof Misiones !== 'undefined' && Misiones._marcadores) {
      for (const [id, m] of Object.entries(Misiones._marcadores)) {
        this._limpiarPinOrganizar(m, { id, marcador: m });
      }
    }
    if (typeof Cofres !== 'undefined' && Cofres._marcadores) {
      for (const [id, m] of Object.entries(Cofres._marcadores)) {
        this._limpiarPinOrganizar(m, { id, marcador: m });
      }
    }
    if (typeof Tiendas !== 'undefined' && Tiendas._marcadoresAdmin) {
      for (const [id, m] of Object.entries(Tiendas._marcadoresAdmin)) {
        this._limpiarPinOrganizar(m, { id, marcador: m });
      }
    }
    if (typeof Multijugador !== 'undefined') {
      for (const [id, m] of Object.entries(Multijugador.cuerposMarcadores || {})) {
        this._limpiarPinOrganizar(m, { id: 'cuerpo_' + id, marcador: m });
      }
      for (const p of (Multijugador.online || [])) {
        if (!Multijugador._estaMuerto(p)) continue;
        const m = Multijugador.marcadores[p.playerId];
        if (m) this._limpiarPinOrganizar(m, { id: 'cuerpo_on_' + p.playerId, marcador: m });
      }
      for (const p of (Multijugador.online || [])) {
        if (Multijugador._estaMuerto(p)) continue;
        const m = Multijugador.marcadores[p.playerId];
        if (!m) continue;
        this._limpiarPinOrganizar(m, {
          id: 'jugador_' + p.playerId,
          marcador: m,
          _jugadorPlayerId: p.playerId
        });
      }
    }
    for (const o of this.objetosTodos()) {
      if (o._marcador) this._limpiarPinOrganizar(o._marcador, { id: o.id, marcador: o._marcador });
    }
    this.modo = null;
    document.getElementById('admin-controles').classList.add('oculto');
    document.body.classList.remove('ui-mapa-confirm');
    if (typeof UIManager !== 'undefined') UIManager.refrescar();
    if (typeof Enemigos !== 'undefined' && Enemigos._recargar) Enemigos._recargar();
    if (typeof GPS !== 'undefined') GPS._actualizarArrastre();
    if (typeof Multijugador !== 'undefined' && Multijugador._redibujarCuerpos) {
      Multijugador._redibujarCuerpos();
    }
    if (this._pubPendiente && this.esAdminJugador()) {
      this._procesarColaPublicacion();
    }
  },

  _mostrarControles(texto, conConfirmar) {
    document.getElementById('admin-modo-texto').textContent = texto;
    document.getElementById('btn-admin-confirmar').style.display = conConfirmar ? '' : 'none';
    document.getElementById('admin-controles').classList.remove('oculto');
    document.body.classList.add('ui-mapa-confirm');
    if (typeof UIManager !== 'undefined') UIManager.refrescar();
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

  mostrarPantallaBloqueoSiCorresponde() {
    const bloqueo = this.estadoBloqueo();
    if (!bloqueo) return false;
    const pantalla = document.getElementById('pantalla-bloqueo');
    if (!pantalla) return true;
    pantalla.classList.remove('oculto');
    const icono = document.getElementById('bloqueo-icono');
    const titulo = document.getElementById('bloqueo-titulo');
    const mensaje = document.getElementById('bloqueo-mensaje');
    if (bloqueo.tipo === 'ban') {
      if (icono) icono.textContent = '🚫';
      if (titulo) titulo.textContent = 'Cuenta suspendida';
      if (mensaje) mensaje.textContent = bloqueo.mensaje;
    } else {
      if (icono) icono.textContent = '🚧';
      if (titulo) titulo.textContent = 'Juego en mantenimiento';
      if (mensaje) mensaje.textContent = bloqueo.mensaje;
      const boton = document.getElementById('btn-bloqueo-admin');
      if (boton && this.datos && Usuarios.esAdministrador() && Usuarios.perfilActivo?.pinHash) {
        boton.classList.remove('oculto');
      }
    }
    return true;
  },

  _actualizarEtiquetaMantenimientoNav() {
    const el = document.getElementById('admin-mant-nav-texto');
    if (!el) return;
    const mant = this.datos.mantenimiento || this.publicado.mantenimiento || {};
    const on = !!mant.activo;
    el.textContent = on ? 'ON' : 'OFF';
    const btn = document.getElementById('admin-mantenimiento');
    if (btn) btn.classList.toggle('admin-toggle-on', on);
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
    this._actualizarEtiquetaMantenimientoNav();
    Notificaciones.mostrar('🚧 Mantenimiento activado (tú como admin puedes seguir jugando)', 'alerta', 6000);
    this._publicarParaTodos(true);
    this._volverAlPanel();
  },

  _quitarMantenimientoUi() {
    this.datos.mantenimiento = { activo: false, mensaje: '' };
    this.guardar();
    this._actualizarEtiquetaMantenimientoNav();
    Notificaciones.mostrar('🟢 Mantenimiento desactivado', 'exito', 5000);
    this._publicarParaTodos(true);
    this._volverAlPanel();
  },

  async abrirSyncGitHub() {
    this._mostrarPanelDerecho('admin-vista-sync-github', '☁️ Respaldo GitHub');
    await this._pintarEstadoSyncGitHub();
  },

  async _pintarEstadoSyncGitHub() {
    const est = document.getElementById('admin-sync-estado');
    const det = document.getElementById('admin-sync-detalle');
    if (!est) return;
    if (typeof SyncServidor === 'undefined') {
      est.textContent = '⚠️ Servidor no configurado.';
      est.className = 'admin-clave-estado';
      if (det) det.textContent = '';
      return;
    }
    if (!SyncServidor.puedePublicar()) {
      est.textContent = 'Conectando con el servidor…';
      est.className = 'admin-clave-estado';
      const ok = await SyncServidor.asegurarSesionServidor();
      if (!ok) {
        est.textContent = '⚠️ Pulsa Guardar mapa e introduce la contraseña de randy.';
        est.className = 'admin-clave-estado';
        if (det) det.textContent = 'En PC hace falta el token del servidor (entra con contraseña una vez).';
        return;
      }
    }
    est.textContent = 'Consultando servidor…';
    const data = await SyncServidor.obtenerEstadoSync();
    if (!data?.status) {
      est.textContent = '⚠️ No se pudo leer el estado del servidor.';
      est.className = 'admin-clave-estado';
      if (det) det.textContent = '';
      return;
    }
    const s = data.status;
    const ok = s.ultimaSyncOk;
    if (ok) {
      const hace = Math.round((Date.now() - ok.at) / 60000);
      est.textContent = '✅ Última sync GitHub: hace ' + hace + ' min';
      est.className = 'admin-clave-estado ok';
    } else {
      est.textContent = '⚠️ Aún no hay sync exitosa registrada';
      est.className = 'admin-clave-estado';
    }
    const lineas = [
      'Jugadores en servidor: ' + (s.jugadores ?? '?'),
      'Objetos: ' + (s.objetos ?? '?') + ' · Enemigos: ' + (s.enemigos ?? '?'),
      'Token GitHub: ' + (s.tokenValido === true ? '✅' : s.tokenValido === false ? '❌' : '?')
    ];
    if (s.ultimoError) {
      lineas.push('Último error: ' + s.ultimoError.error);
    }
    if (det) det.textContent = lineas.join('\n');
  },

  async _forzarSyncGitHubUi() {
    const btn = document.getElementById('btn-admin-sync-github');
    if (typeof SyncServidor === 'undefined') {
      this._adminAviso('Servidor no disponible.', 'error');
      return;
    }
    if (!SyncServidor.puedePublicar()) {
      const ok = await SyncServidor.asegurarSesionServidor({ pedirClave: true });
      if (!ok) {
        this._adminAviso('No se pudo conectar al servidor. Comprueba la contraseña.', 'error');
        return;
      }
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Sincronizando…'; }
    try {
      const r = await SyncServidor.sincronizarGitHub();
      if (r.ok) {
        Notificaciones.mostrar('☁️ Respaldo en GitHub actualizado', 'exito', 6000);
        await this._pintarEstadoSyncGitHub();
      } else {
        this._adminAviso('No se pudo sincronizar: ' + (r.error || r.reason || 'error'), 'error');
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '☁️ Sincronizar con GitHub ahora'; }
    }
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
    const msg = {
      id: 'msg_' + Date.now().toString(36),
      para, texto, t: Date.now()
    };
    if (!this.publicado.mensajes) this.publicado.mensajes = [];
    if (!this.datos.mensajes) this.datos.mensajes = [];
    this.publicado.mensajes.push(msg);
    this.datos.mensajes.push(msg);
    this.guardar();
    void this._publicarParaTodos(true).then(() => {
      this._adminAvisoMensaje('✉️ Mensaje enviado a los jugadores', 'exito');
      setTimeout(() => this._volverAlPanel(), 1200);
    }).catch(() => {
      this._adminAvisoMensaje('Mensaje guardado localmente; publica el mapa para que lo vean todos', 'alerta');
    });
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
    this._listarCuentasAsync({ abrirPanel: true });
  },

  async _limpiarCuentasUi() {
    if (!this.esAdminJugador()) return;
    if (!confirm('¿Borrar TODAS las cuentas excepto randy?\n\nNo se puede deshacer. Luego creas jugadores nuevos desde aquí o desde el teléfono.')) return;
    if (typeof SyncServidor === 'undefined') {
      this._adminAviso('Servidor no disponible.', 'error');
      return;
    }
    if (!SyncServidor.puedePublicar()) {
      const ok = await SyncServidor.asegurarSesionServidor({ pedirClave: true });
      if (!ok) {
        this._adminAviso('No se pudo conectar al servidor.', 'error');
        return;
      }
    }
    const r = await SyncServidor.limpiarCuentas();
    if (r.ok) {
      const n = (r.eliminados || []).length;
      Notificaciones.mostrar(
        '🗑️ Cuentas eliminadas' + (n ? ': ' + r.eliminados.join(', ') : '') + ' — solo queda randy',
        'exito', 8000
      );
      this._listarCuentasAsync({ soloRefrescar: true, sinServidor: true });
    } else {
      this._adminAviso('No se pudo limpiar: ' + (r.error || 'error'), 'error');
    }
  },

  async _listarCuentasAsync(opciones) {
    const opts = opciones || {};
    const gen = ++this._listarCuentasGen;
    const cont = document.getElementById('admin-lista-jugadores');
    const buscar = document.getElementById('admin-buscar-jugador');
    if (!opts.soloRefrescar && buscar) buscar.value = '';

    const abrirEditor = (perfil, soloGlobal) => {
      void this._abrirEditorJugador(perfil, soloGlobal);
    };

    const pintarFila = (j, destino) => {
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
      const estado = this._vidaJugadorLista(j, pd);
      const nivel = estado.nivel;
      const maxVida = (typeof Vida !== 'undefined' && Vida.vidaMaxima)
        ? Vida.vidaMaxima(nivel) : CONFIG.vidaMaxima;
      const vida = estado.vida;
      const muerto = estado.muerto;
      const ban = [...(this.publicado.baneados || []), ...(this.datos.baneados || [])]
        .find(b => b.id === j.id || b.id === j.telefono);
      const pctV = muerto ? 0 : Math.max(0, Math.min(100, Math.round((vida / maxVida) * 100)));
      const claseV = pctV > 70 ? 'alta' : pctV > 30 ? 'media' : 'baja';
      const fila = document.createElement('div');
      fila.className = 'fila-jugador-admin' + (muerto ? ' jugador-muerto-admin' : '');
      const inicial = (j.nombre || '?').trim()[0].toUpperCase();
      const telTxt = j.telefono || 'sin tel.';
      let chips = '';
      if (ban && this._banActivo(ban)) chips += '<span class="stat-chip ban">🚫</span>';
      if (muerto) chips += '<span class="stat-chip muerto">💀</span>';
      if (oro != null) chips += '<span class="stat-chip">💰' + oro + '</span>';
      fila.innerHTML =
        '<div class="jugador-card-cabecera">' +
        '<div class="avatar">' + inicial + '</div>' +
        '<div class="jugador-card-titulo">' +
        '<div class="nombre">' + j.nombre + '</div>' +
        '<div class="meta">📱 ' + telTxt + '</div>' +
        (chips ? '<div class="stats">' + chips + '</div>' : '') +
        '</div></div>' +
        '<div class="jugador-barra-vida ' + claseV + '" title="Vida ' + (muerto ? 0 : vida) + '/' + maxVida + '">' +
        '<div class="jugador-barra-relleno" style="width:' + pctV + '%"></div>' +
        '<span class="jugador-barra-texto">❤️ ' + (muerto ? '0' : vida) + '/' + maxVida + '</span></div>';
      const acciones = document.createElement('div');
      acciones.className = 'acciones acciones-grid';
      const mk = (t, fn, title, cls) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = t;
        if (title) b.title = title;
        if (cls) b.className = cls;
        this._bindAdminBtn(b, fn);
        acciones.appendChild(b);
      };
      mk('✏️', () => abrirEditor(local || j, !local), 'Editar', 'btn-editar-jugador');
      mk('✉️', () => this.abrirMensaje(j.id), 'Mensaje');
      mk('🚫', () => this._abrirBanJugador(j), 'Banear', 'btn-ban-jugador');
      if (muerto) {
        mk('❤️', () => this._revivirJugador(j), 'Revivir', 'btn-revivir-jugador');
      } else if (!this._esCuentaProtegida(j)) {
        mk('🗑️', () => this._eliminarJugadorCuenta(j), 'Eliminar', 'btn-eliminar-jugador');
      }
      fila.appendChild(acciones);
      destino.appendChild(fila);
    };

    const pintar = (filtro) => {
      if (!cont) return;
      cont.innerHTML = '';
      const f = (filtro || '').trim().toLowerCase();
      const globales = this.jugadoresGlobales().filter(j => {
        if (!f) return true;
        return (j.nombre || '').toLowerCase().includes(f) ||
          (j.telefono || '').includes(f) ||
          (j.id || '').toLowerCase().includes(f);
      });
      const muertos = [];
      const vivos = [];
      for (const j of globales) {
        const partida = (this.publicado.partidas || {})[j.id] || (this.datos.partidasExtra || {})[j.id];
        let pd = partida ? (partida.datos || partida) : null;
        if (Usuarios.perfilActivo && j.id === Usuarios.perfilActivo.id && typeof Guardado !== 'undefined') {
          pd = {
            vida: Guardado.datos.vida,
            muerto: Guardado.datos.muerto,
            nivel: Guardado.datos.nivel
          };
        }
        const estado = this._vidaJugadorLista(j, pd);
        if (estado.muerto) muertos.push(j); else vivos.push(j);
      }
      const lista = this._jugadoresTab === 'muertos' ? muertos : vivos;
      for (const j of lista) pintarFila(j, cont);
      const tabV = document.getElementById('admin-tab-vivos');
      const tabM = document.getElementById('admin-tab-muertos');
      if (tabV) tabV.textContent = '🟢 Vivos (' + vivos.length + ')';
      if (tabM) tabM.textContent = '💀 Muertos (' + muertos.length + ')';
      if (!lista.length) {
        const msg = f
          ? 'No hay jugadores que coincidan con "' + (filtro || '').trim() + '"'
          : (this._jugadoresTab === 'muertos' ? 'No hay jugadores muertos' : 'No hay jugadores registrados');
        cont.innerHTML = '<div class="campo-caja" style="padding:14px;">' + msg + '</div>';
      }
    };

    if (buscar && !buscar._jugadoresOk) {
      buscar._jugadoresOk = true;
      buscar.oninput = () => pintar(buscar.value);
    }
    const tabV = document.getElementById('admin-tab-vivos');
    const tabM = document.getElementById('admin-tab-muertos');
    if (tabV && !tabV._jugadoresOk) {
      tabV._jugadoresOk = true;
      tabV.addEventListener('click', () => {
        this._jugadoresTab = 'vivos';
        tabV.classList.add('activa');
        tabM?.classList.remove('activa');
        pintar(buscar?.value || '');
      });
    }
    if (tabM && !tabM._jugadoresOk) {
      tabM._jugadoresOk = true;
      tabM.addEventListener('click', () => {
        this._jugadoresTab = 'muertos';
        tabM.classList.add('activa');
        tabV?.classList.remove('activa');
        pintar(buscar?.value || '');
      });
    }
    pintar(buscar?.value || '');
    this._colocacion = null;
    const vistaEditor = this._adminVistaActual === 'admin-vista-editor' ||
      this._adminVistaActual === 'admin-vista-crear-jugador';
    if (opts.abrirPanel && !opts.soloRefrescar && !vistaEditor) {
      this._mostrarPanelDerecho('admin-vista-jugadores', '👥 Jugadores');
    }
    if (opts.sinServidor && opts.sinPartidas) return;
    try {
      if (!opts.sinServidor) await this.actualizarJugadoresGlobales();
      if (gen !== this._listarCuentasGen) return;
      if (!opts.sinPartidas) await this._actualizarPartidasDesdeServidor();
      if (gen !== this._listarCuentasGen) return;
      pintar(buscar?.value || '');
    } catch (e) { /* sin red */ }
  },

  async _eliminarJugadorCuenta(perfil) {
    const j = typeof perfil === 'string'
      ? this.jugadoresGlobales().find(x => x.id === perfil)
      : perfil;
    if (!j) return;
    if (this._esCuentaProtegida(j)) {
      this._adminAviso('La cuenta de administrador (randy) no se puede eliminar');
      return;
    }
    if (j.id === Usuarios.perfilActivo?.id) {
      this._adminAviso('No puedes eliminar al jugador activo');
      return;
    }
    const partida = await this._obtenerPartidaJugador(j);
    const muerto = this._jugadorEstaMuerto(partida, partida?.vida);
    const aviso = muerto
      ? '¿Eliminar a ' + j.nombre + ' y su partida del servidor?'
      : '¿Eliminar a ' + j.nombre + '? Está VIVO — se borrará su cuenta y partida.';
    if (!confirm(aviso)) return;

    const idsEliminar = this._idsJugadorMismaCuenta(j);
    const nombreKey = String(j.nombre || '').trim().toLowerCase();

    Usuarios.datos.lista = Usuarios.datos.lista.filter(p => !idsEliminar.has(p.id));
    Usuarios._guardarLista();
    for (const id of idsEliminar) {
      localStorage.removeItem(CONFIG.claveGuardado + '::' + id);
    }

    if (this.publicado.jugadores) {
      this.publicado.jugadores = this.publicado.jugadores.filter(x => {
        if (x?.id && idsEliminar.has(x.id)) return false;
        return String(x?.nombre || '').trim().toLowerCase() !== nombreKey;
      });
    }
    if (this.datos.jugadoresExtra) {
      this.datos.jugadoresExtra = this.datos.jugadoresExtra.filter(x => {
        if (x?.id && idsEliminar.has(x.id)) return false;
        return String(x?.nombre || '').trim().toLowerCase() !== nombreKey;
      });
    }
    for (const id of idsEliminar) {
      delete (this.publicado.partidas || {})[id];
      delete (this.datos.partidasExtra || {})[id];
    }
    this._marcarJugadorBorrado(j);
    this.guardar();
    await this._publicarParaTodos(false, { confiarLocal: true, purgarJugadores: true });
    Notificaciones.mostrar('🗑️ ' + j.nombre + ' eliminado', 'alerta', 5000);
    this._listarCuentasAsync({ soloRefrescar: true, sinServidor: true });
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
    const chk = document.getElementById('admin-nuevo-inventario-default');
    if (nom) nom.value = '';
    if (tel) tel.value = '';
    if (c1) c1.value = '';
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
    const clave = (document.getElementById('admin-nuevo-clave').value || '').trim();
    const usarDefault = document.getElementById('admin-nuevo-inventario-default').checked;

    if (nombre.length < 2) { alert('Ponle un nombre al jugador'); return; }
    if (clave.length < 4) { alert('La contraseña debe tener al menos 4 caracteres'); return; }
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
      pinClave: clave,
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

    const ok = await MundoPublico.guardarCuenta(perfil, snap, clave);
    await this._publicarParaTodos(true);

    this._editorJugador = null;
    Notificaciones.mostrar(
      (ok ? '✅' : '⚠️') + ' Cuenta de ' + nombre + ' en el servidor. Entra con nombre y contraseña.',
      ok ? 'exito' : 'alerta', 9000);
    this._refrescarListaJugadoresSiAbierta();
  },

  async _obtenerPartidaJugador(perfil, opts) {
    const opciones = opts || {};
    const base = (d) => ({
      mochila: d.mochila || new Array(25).fill(null),
      dinero: d.dinero || { saldo: CONFIG.dineroInicial },
      vida: d.vida ?? CONFIG.vidaMaxima,
      hambre: d.hambre ?? CONFIG.hambreInicial,
      muerto: d.vida === 0 || !!d.muerto,
      armaEquipada: d.armaEquipada || null,
      equipoEquipado: d.equipoEquipado || { casco: null, chaleco: null, botas: null, ropa: null },
      posicionJugador: d.posicionJugador || null,
      xp: d.xp ?? 0,
      nivel: d.nivel ?? 1
    });
    if (perfil.id === Usuarios.perfilActivo?.id) {
      return JSON.parse(JSON.stringify(base(Guardado.datos)));
    }

    const candidatos = [];
    const extra = (this.datos.partidasExtra || {})[perfil.id];
    if (extra?.datos || extra?.mochila) candidatos.push({ datos: extra.datos || extra, t: extra.t || 0 });
    const nube = (this.publicado.partidas || {})[perfil.id];
    if (nube?.datos || nube?.mochila) candidatos.push({ datos: nube.datos || nube, t: nube.t || 0 });
    const clave = CONFIG.claveGuardado + '::' + perfil.id;
    try {
      const p = JSON.parse(localStorage.getItem(clave));
      if (p?.datos) candidatos.push({ datos: p.datos, t: p.datos.nubeT || p.t || 0 });
    } catch (e) { /* */ }

    const mejorLocal = () => {
      if (!candidatos.length) return null;
      candidatos.sort((a, b) => (b.t || 0) - (a.t || 0));
      return JSON.parse(JSON.stringify(base(candidatos[0].datos)));
    };

    const localReciente = candidatos.some((c) => (Date.now() - (c.t || 0)) < 120000);
    if (!opciones.forzarRed && localReciente) return mejorLocal();

    if (typeof MundoPublico !== 'undefined' && MundoPublico.cargarCuenta) {
      try {
        const cuenta = await Promise.race([
          MundoPublico.cargarCuenta(perfil.id),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
        ]);
        if (cuenta?.partida?.datos) {
          candidatos.push({ datos: cuenta.partida.datos, t: cuenta.partida.t || 0 });
        }
      } catch (e) { /* sin red o timeout */ }
    }
    if (candidatos.length) return mejorLocal();
    return Object.assign(this._partidaDefault(), { vida: CONFIG.vidaMaxima, muerto: false });
  },

  async _guardarPartidaJugador(perfil, partida, opciones) {
    const opts = opciones || {};
    if (!partida.mochila) partida.mochila = new Array(25).fill(null);
    if (!partida.dinero) partida.dinero = { saldo: 0 };
    partida.dinero.control = await Utilidades.sha256(Guardado.SAL + '|saldo|' + partida.dinero.saldo);
    if (partida.vida == null) partida.vida = CONFIG.vidaMaxima;
    if (partida.nivel != null) {
      const maxV = this.vidaJugadorPorNivel(partida.nivel);
      if (partida.vida > maxV) partida.vida = maxV;
    }
    partida.muerto = partida.vida <= 0;
    if (!partida.muerto) partida.muertePos = null;

    const esActivo = perfil.id === Usuarios.perfilActivo?.id;
    if (esActivo) {
      Guardado.datos.mochila = partida.mochila;
      Guardado.datos.dinero = partida.dinero;
      Guardado.datos.vida = partida.vida;
      Guardado.datos.muerto = partida.muerto;
      if (partida.nivel != null) {
        Guardado.datos.nivel = partida.nivel;
        if (typeof Vida !== 'undefined') Vida.nivel = partida.nivel;
      }
      if (partida.xp != null) {
        Guardado.datos.xp = partida.xp;
        if (typeof Vida !== 'undefined') Vida.xp = partida.xp;
      }
      if (partida.hambre != null) {
        Guardado.datos.hambre = partida.hambre;
        if (typeof Vida !== 'undefined') Vida.hambre = partida.hambre;
      }
      if (partida.armaEquipada !== undefined) Guardado.datos.armaEquipada = partida.armaEquipada;
      if (partida.equipoEquipado) Guardado.datos.equipoEquipado = partida.equipoEquipado;
      await Guardado.guardarAhora();
      Mochila.slots = Guardado.datos.mochila;
      Mochila.pintar();
      Dinero.saldo = partida.dinero.saldo;
      Dinero.pintar();
      if (partida.muerto) Vida._activarMuerte();
      else if (typeof Vida.revivir === 'function' && (Guardado.datos.muerto || Vida.estaMuerto())) {
        Vida.revivir(null, '❤️ El administrador te revivió. ¡Ya puedes seguir jugando!');
      } else {
        Vida.actual = partida.vida;
        if (partida.hambre != null) {
          Vida.hambre = partida.hambre;
          Guardado.datos.hambre = partida.hambre;
        }
        Vida.pintar();
      }
    } else {
      const clave = CONFIG.claveGuardado + '::' + perfil.id;
      let paquete;
      try { paquete = JSON.parse(localStorage.getItem(clave)); } catch (e) { paquete = null; }
      if (!paquete?.datos) paquete = { datos: Guardado._estadoNuevo() };
      paquete.datos.mochila = partida.mochila;
      paquete.datos.dinero = partida.dinero;
      paquete.datos.vida = partida.vida;
      paquete.datos.muerto = partida.muerto;
      if (partida.armaEquipada !== undefined) paquete.datos.armaEquipada = partida.armaEquipada;
      if (partida.equipoEquipado) paquete.datos.equipoEquipado = partida.equipoEquipado;
      if (partida.hambre != null) paquete.datos.hambre = partida.hambre;
      if (partida.posicionJugador && partida.posicionJugador.length >= 2) {
        paquete.datos.posicionJugador = partida.posicionJugador.slice();
      }
      if (partida.xp != null) paquete.datos.xp = partida.xp;
      if (partida.nivel != null) paquete.datos.nivel = partida.nivel;
      paquete.firma = await Utilidades.sha256(JSON.stringify(paquete.datos) + Guardado.SAL);
      localStorage.setItem(clave, JSON.stringify(paquete));
    }

    if (!this.datos.partidasExtra) this.datos.partidasExtra = {};
    const prevDatos = (this.publicado.partidas || {})[perfil.id]?.datos || {};
    const estabaMuerto = this._jugadorEstaMuerto(prevDatos, prevDatos.vida);
    let revividoEn = prevDatos.revividoEn || null;
    if (partida.muerto) revividoEn = null;
    else if (estabaMuerto) revividoEn = Date.now();

    const ahora = Date.now();
    const snap = {
      datos: {
        mochila: partida.mochila,
        dinero: partida.dinero,
        hambre: partida.hambre ?? CONFIG.hambreInicial,
        muerto: partida.muerto,
        muertePos: partida.muerto ? (partida.muertePos || null) : null,
        revividoEn,
        xp: partida.xp,
        nivel: partida.nivel,
        armaEquipada: partida.armaEquipada || null,
        equipoEquipado: partida.equipoEquipado || { casco: null, chaleco: null, botas: null, ropa: null }
      },
      t: ahora,
      statsT: ahora
    };
    snap.datos.vida = partida.vida;
    this.datos.partidasExtra[perfil.id] = snap;
    if (!this.publicado.partidas) this.publicado.partidas = {};
    this.publicado.partidas[perfil.id] = snap;
    this.guardar();

    const onlineOk = await this._sincronizarJugadorEditadoOnline(perfil, partida, snap);
    let okPartida = onlineOk;
    if (!onlineOk && typeof SyncServidor !== 'undefined' && SyncServidor.subirPartida) {
      okPartida = await SyncServidor.subirPartida(perfil.id, snap);
    }
    let okCuenta = true;
    if (opts.cuentaChanged && MundoPublico.puedeEscribir()) {
      okCuenta = await MundoPublico.guardarCuenta(perfil, snap);
    }
    if (esActivo && typeof Multijugador !== 'undefined') Multijugador.enviarStats(true);
    return { ok: !!(okPartida || okCuenta), okCuenta, okPartida, onlineOk };
  },

  async _sincronizarJugadorEditadoOnline(perfil, partida, snap) {
    const online = this._estadoOnlinePorNombre(perfil.nombre);
    if (!online || typeof Multijugador === 'undefined' || !Multijugador.socket) return false;
    const maxV = this.vidaJugadorPorNivel(partida.nivel ?? 1);
    const hp = partida.muerto ? 0 : (partida.vida ?? maxV);
    return new Promise((resolve) => {
      Multijugador.socket.emit('admin:updatePlayerPartida', {
        targetPlayerId: online.playerId,
        perfilId: perfil.id,
        hp,
        hpMax: maxV,
        level: partida.nivel ?? 1,
        xp: partida.xp ?? 0,
        dead: !!partida.muerto,
        partidaSnap: snap
      }, (res) => resolve(!!res?.ok));
    });
  },

  async _abrirEditorJugador(perfil, soloGlobal) {
    if (!perfil?.id) {
      this._adminAviso('Jugador no válido', 'error');
      return;
    }
    this._listarCuentasGen++;
    let p = perfil;
    if (soloGlobal) {
      const g = this.jugadoresGlobales().find(j => j.id === perfil.id);
      if (g) p = Object.assign({}, g);
    }
    this._mostrarPanelDerecho('admin-vista-editor', '✏️ ' + (p.nombre || 'Jugador'));

    const rejInf = document.getElementById('admin-rejilla-infinito');
    const rejJug = document.getElementById('admin-rejilla-jugador');
    if (rejInf) rejInf._catalogoListo = false;
    if (rejJug) rejJug.innerHTML = '<div class="admin-cargando">Cargando inventario…</div>';

    try {
      const partidaInicial = await this._obtenerPartidaJugador(p);
      if (this._adminVistaActual !== 'admin-vista-editor') return;

      this._editorJugador = {
        perfil: p,
        partida: partidaInicial,
        _arrastre: null,
        _nivelInicial: partidaInicial.nivel ?? 1,
        _nombreInicial: p.nombre || '',
        _telefonoInicial: p.telefono || '',
        _sinGuardar: false
      };
      if (!this._editorJugador.partida.mochila) {
        this._editorJugador.partida.mochila = new Array(25).fill(null);
      }
      const oroEl = document.getElementById('admin-editor-oro');
      if (oroEl) oroEl.value = this._editorJugador.partida.dinero?.saldo ?? 0;
      const nv = this._editorJugador.partida.nivel ?? 1;
      const xp = this._editorJugador.partida.xp ?? 0;
      const nvEl = document.getElementById('admin-editor-nivel');
      const xpEl = document.getElementById('admin-editor-xp');
      if (nvEl) nvEl.value = nv;
      if (xpEl) xpEl.value = xp;
      const vidaEl = document.getElementById('admin-editor-vida');
      if (vidaEl) vidaEl.value = this._editorJugador.partida.vida ?? this.vidaJugadorPorNivel(nv);
      this._actualizarHintVidaEditor();
      if (nvEl && !nvEl._nivelEditorOk) {
        nvEl._nivelEditorOk = true;
        nvEl.addEventListener('input', () => this._aplicarVidaJugadorDesdeNivel(parseInt(nvEl.value, 10) || 1));
      }
      const nom = document.getElementById('admin-editor-nombre');
      const tel = document.getElementById('admin-editor-telefono');
      const clv = document.getElementById('admin-editor-clave');
      if (nom) nom.value = this._editorJugador.perfil.nombre || '';
      if (tel) tel.value = this._editorJugador.perfil.telefono || '';
      if (clv) clv.value = this._pinAdminGet(this._editorJugador.perfil.id) || '';
      this._pintarEditorJugador(false);
    } catch (e) {
      this._adminAviso('No se pudo abrir el editor: ' + (e?.message || 'error'), 'error');
    }
  },

  _marcarEditorSucio() {
    if (this._editorJugador) this._editorJugador._sinGuardar = true;
  },

  _maxPila(id) {
    return Items.seguro(id).unico ? 1 : (CONFIG.maxPila || 10);
  },

  _idsCatalogoCompleto() {
    const ids = new Set(Object.keys(CATALOGO_ITEMS));
    for (const it of (this.datos.itemsNuevos || [])) if (it?.id) ids.add(it.id);
    for (const it of (this.publicado.itemsNuevos || [])) if (it?.id) ids.add(it.id);
    return [...ids]
      .filter(id => Items.estadoDe(this.datos.itemsNuevos, id) !== 'oculto')
      .sort((a, b) => Items.seguro(a).nombre.localeCompare(Items.seguro(b).nombre));
  },

  _reaplicarCatalogoItems() {
    for (const id of Object.keys(CATALOGO_ITEMS)) {
      if (!Items.esBase(id)) delete CATALOGO_ITEMS[id];
    }
    const nuevosPorId = new Map();
    for (const it of (this.publicado.itemsNuevos || [])) if (it?.id) nuevosPorId.set(it.id, it);
    for (const it of (this.datos.itemsNuevos || [])) if (it?.id) nuevosPorId.set(it.id, it);
    Items.aplicarMundo([...nuevosPorId.values()], this.datos.precios || {});
  },

  abrirFormularioItemEditar(id) {
    const meta = Items.metaDe(this.datos.itemsNuevos, id);
    if (!meta) {
      Notificaciones.mostrar('Solo puedes editar objetos personalizados del ADM', 'alerta', 4000);
      return;
    }
    this.abrirFormulario('item_editar', Object.assign({}, meta));
  },

  duplicarCatalogoItem(id) {
    const src = Object.assign({}, Items.seguro(id), Items.metaDe(this.datos.itemsNuevos, id) || {});
    const borrador = Object.assign({}, src);
    delete borrador.id;
    delete borrador.creadoEn;
    delete borrador.modificadoEn;
    delete borrador.creadoPor;
    borrador.nombre = (borrador.nombre || 'Copia') + ' (copia)';
    this.abrirFormulario('item_nuevo', borrador);
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
        let hint = Items.resumenInventario(item, id);
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

  _pintarEditorJugador(soloMochila) {
    const ed = this._editorJugador;
    if (!ed) return;
    const rejJug = document.getElementById('admin-rejilla-jugador');
    const rejInf = document.getElementById('admin-rejilla-infinito');
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

    if (!soloMochila && rejInf) {
      if (!rejInf._catalogoListo) {
        this._pintarInventarioInfinito(rejInf);
        rejInf._catalogoListo = true;
      }
    }
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

    if (!slotEl && !a.movio && (a.origen === 'infinito' || a.origen === 'catalogo')) {
      const id = a.ref;
      let puesto = false;
      for (let i = 0; i < ed.partida.mochila.length; i++) {
        if (this._apilarEnMochilaAdmin(ed.partida.mochila, i, id, 1)) {
          puesto = true;
          break;
        }
      }
      if (!puesto) {
        Notificaciones.mostrar('Mochila llena o pilas al máximo', 'alerta', 3000);
      } else {
        this._marcarEditorSucio();
      }
      this._pintarEditorJugador(true);
      return;
    }

    if (!slotEl) {
      if (a.origen === 'jugador' && a.movio) ed.partida.mochila[a.ref] = null;
      if (ed._creando) this._pintarCrearJugador();
      else this._pintarEditorJugador(true);
      return;
    }
    const dest = parseInt(slotEl.dataset.indice, 10);

    if (a.origen === 'infinito' || a.origen === 'catalogo') {
      const id = a.ref;
      if (!this._apilarEnMochilaAdmin(ed.partida.mochila, dest, id, 1)) {
        Notificaciones.mostrar('Casilla llena o pila al máximo (' + this._maxPila(id) + ')', 'alerta', 3000);
      } else {
        this._marcarEditorSucio();
      }
    } else if (a.origen === 'nota') {
      const texto = this._notaPendiente;
      if (!texto) return;
      if (ed.partida.mochila[dest]) {
        Notificaciones.mostrar('Casilla ocupada', 'alerta', 2500);
      } else {
        ed.partida.mochila[dest] = { id: 'nota_escrita', cantidad: 1, texto };
        this._notaPendiente = null;
        this._marcarEditorSucio();
      }
    } else if (a.origen === 'jugador') {
      if (!a.movio) return;
      const origen = a.ref;
      if (origen === dest) return;
      this._moverSlotAdmin(ed.partida.mochila, origen, dest);
      this._marcarEditorSucio();
    }
    if (ed._creando) this._pintarCrearJugador();
    else this._pintarEditorJugador(true);
  },

  _aplicarVidaJugadorDesdeNivel(nivel) {
    const nv = Math.max(1, Math.min(100, nivel || 1));
    const max = this.vidaJugadorPorNivel(nv);
    const hint = document.getElementById('admin-editor-vida-max');
    const vidaInp = document.getElementById('admin-editor-vida');
    if (hint) hint.textContent = '(máx ' + max + ')';
    if (vidaInp) {
      vidaInp.max = max;
      vidaInp.value = max;
    }
  },

  _actualizarHintVidaEditor() {
    const nvEl = document.getElementById('admin-editor-nivel');
    const nv = Math.max(1, Math.min(100, parseInt(nvEl?.value, 10) || 1));
    const max = this.vidaJugadorPorNivel(nv);
    const hint = document.getElementById('admin-editor-vida-max');
    const vidaInp = document.getElementById('admin-editor-vida');
    if (hint) hint.textContent = '(máx ' + max + ')';
    if (vidaInp) vidaInp.max = max;
  },

  async _guardarEditorJugador() {
    const ed = this._editorJugador;
    if (!ed) return;
    const oro = parseInt(document.getElementById('admin-editor-oro').value, 10);
    const vida = parseInt(document.getElementById('admin-editor-vida').value, 10);
    const nivel = Math.max(1, Math.min(100, parseInt(document.getElementById('admin-editor-nivel')?.value, 10) || 1));
    const xp = Math.max(0, parseInt(document.getElementById('admin-editor-xp')?.value, 10) || 0);
    const nombre = (document.getElementById('admin-editor-nombre')?.value || '').trim();
    const telefono = (document.getElementById('admin-editor-telefono')?.value || '').trim().replace(/[\s-]/g, '');
    const claveNueva = (document.getElementById('admin-editor-clave')?.value || '').trim();
    const claveAnterior = this._pinAdminGet(ed.perfil.id);
    if (isNaN(oro) || oro < 0) { this._adminAviso('Oro inválido'); return; }
    const maxVida = this.vidaJugadorPorNivel(nivel);
    const nivelInicial = ed._nivelInicial ?? (ed.partida.nivel ?? 1);
    const vidaFinal = nivel !== nivelInicial
      ? maxVida
      : Math.min(isNaN(vida) ? maxVida : vida, maxVida);
    if (isNaN(vida) || vida < 0) { this._adminAviso('Vida inválida'); return; }
    if (nombre.length < 2) { this._adminAviso('Nombre mínimo 2 letras'); return; }
    if (telefono && !Usuarios.telefonoValido(telefono)) { this._adminAviso('Teléfono inválido'); return; }
    const errNom = this.validarRegistro(nombre, telefono, ed.perfil.id);
    if (errNom) { this._adminAviso(errNom); return; }
    if (claveNueva) {
      if (claveNueva.length < 4) {
        this._adminAviso('La contraseña debe tener al menos 4 caracteres'); return;
      }
    } else if (!ed.perfil.pinHash && !claveNueva && !claveAnterior) {
      this._adminAviso('Pon una contraseña para que el jugador pueda entrar'); return;
    }
    ed.partida.dinero = ed.partida.dinero || { saldo: 0 };
    ed.partida.dinero.saldo = oro;
    ed.partida.vida = vidaFinal;
    ed.partida.nivel = nivel;
    ed.partida.xp = xp;
    ed.partida.muerto = vidaFinal <= 0;
    ed.perfil.nombre = nombre;
    ed.perfil.telefono = telefono;
    if (claveNueva) {
      if (claveNueva !== claveAnterior) {
        ed.perfil.pinHash = await Utilidades.sha256('pin-perfil|' + claveNueva);
      }
      ed.perfil.pinClave = claveNueva;
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
    const nombreInicial = ed._nombreInicial ?? ed.perfil.nombre;
    const telefonoInicial = ed._telefonoInicial ?? (ed.perfil.telefono || '');
    const cuentaChanged = nombre !== nombreInicial || telefono !== telefonoInicial || !!claveNueva;
    this.registrarJugador(ed.perfil, true);
    const btnGuardar = document.getElementById('btn-admin-editor-guardar');
    if (btnGuardar) { btnGuardar.disabled = true; btnGuardar.textContent = 'Guardando…'; }
    let sync;
    try {
      sync = await this._guardarPartidaJugador(ed.perfil, ed.partida, { cuentaChanged });
    } finally {
      if (btnGuardar) { btnGuardar.disabled = false; btnGuardar.textContent = 'Guardar cambios'; }
    }
    if (sync && !sync.ok) {
      this._adminAviso('Guardado local OK, pero no llegó al servidor. Revisa conexión y vuelve a guardar.', 'error');
    } else {
      this._adminAviso('✅ Datos de ' + nombre + ' guardados', 'exito');
    }
    this._editorJugador = null;
    this._mostrarPanelDerecho('admin-vista-jugadores', '👥 Jugadores');
    this._listarCuentasAsync({ soloRefrescar: true, sinPartidas: true });
  },

  async _entrarComoJugador() {
    const ed = this._editorJugador;
    if (!ed) return;
    const clave = (document.getElementById('admin-editor-clave')?.value || '').trim();
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

    const claveLogin = clave || this._pinAdminGet(perfil.id);
    if (typeof SyncServidor !== 'undefined') {
      SyncServidor.limpiarSesionOnline();
    }
    if (CONFIG.servidorOnline && claveLogin) {
      if (typeof SyncServidor !== 'undefined') {
        SyncServidor.guardarClavePerfil(perfil.id, claveLogin);
      }
      const srv = await Usuarios._loginServidor(perfil.nombre, claveLogin, 0);
      if (srv?.error) {
        this._adminAviso('No se pudo conectar como ' + perfil.nombre + ': ' + srv.error);
        return;
      }
    }

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
    if (typeof UIManager !== 'undefined') UIManager.cerrar('ventana-admin');
    else document.getElementById('ventana-admin')?.classList.add('oculto');
    sessionStorage.setItem('mariel_cambio_sesion', entrada.id);
    sessionStorage.setItem('mariel_forzar_mundo', '1');
    sessionStorage.setItem('mariel_forzar_relogin', entrada.id);
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
      else Notificaciones.mostrar('Token guardada aquí. Pulsa Guardar mapa en Admin.', 'alerta', 8000);
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
    if (admin.optimizarVisibilidad !== undefined) {
      remoto.optimizarVisibilidad = !!admin.optimizarVisibilidad;
    }
    if (admin.adminPinClaves) {
      remoto.adminPinClaves = Object.assign({}, remoto.adminPinClaves, admin.adminPinClaves);
    }
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

  _indicadorSyncEl() {
    return document.getElementById('indicador-sincronizar');
  },

  _mostrarIndicadorSync(estado, mensaje) {
    const el = this._indicadorSyncEl();
    if (!el) return;
    const txt = el.querySelector('.indicador-sincronizar-texto');
    if (this._syncIndicadorTimer) {
      clearTimeout(this._syncIndicadorTimer);
      this._syncIndicadorTimer = null;
    }
    el.classList.remove('oculto', 'estado-sync', 'estado-ok', 'estado-error');
    if (estado === 'oculto') {
      el.classList.add('oculto');
      return;
    }
    if (estado === 'sync') el.classList.add('estado-sync');
    else if (estado === 'ok') el.classList.add('estado-ok');
    else if (estado === 'error') el.classList.add('estado-error');
    if (txt && mensaje) txt.textContent = mensaje;
    if (estado === 'ok' || estado === 'error') {
      this._syncIndicadorTimer = setTimeout(() => this._mostrarIndicadorSync('oculto'), 2800);
    }
  },

  _iniciarIndicadorSync() {
    const btn = document.getElementById('admin-publicar');
    if (btn) btn.disabled = true;
    this._mostrarIndicadorSync('sync', 'Guardando mapa…');
  },

  _finalizarIndicadorSync(ok, mensajeError) {
    const btn = document.getElementById('admin-publicar');
    if (btn) btn.disabled = false;
    if (ok) {
      this._mostrarIndicadorSync('ok', 'Mapa guardado ✓');
    } else if (mensajeError) {
      this._mostrarIndicadorSync('error', mensajeError);
    } else {
      this._mostrarIndicadorSync('oculto');
    }
  },

  async _sincronizarManual() {
    if (this._syncManualEnCurso) return;
    this._syncManualEnCurso = true;
    this._iniciarIndicadorSync();
    let ok = false;
    let errorMsg = '';
    try {
      if (typeof SyncServidor !== 'undefined') {
        await SyncServidor.despertarServidor();
      }
      if (typeof SyncServidor !== 'undefined') {
        const okSesion = await SyncServidor.asegurarSesionServidor({ pedirClave: true });
        if (!okSesion) {
          errorMsg = 'Sin sesión en el servidor — escribe tu contraseña';
          return;
        }
      }
      ok = await this.publicarMundo(false, { soloSync: true, forzar: true });
      if (!ok && this._pubCancelada) errorMsg = '';
      else if (!ok) errorMsg = this._ultimoErrorPub || 'No se pudo guardar el mapa';
    } catch (e) {
      ok = false;
      errorMsg = 'Error al guardar el mapa';
    } finally {
      this._syncManualEnCurso = false;
      this._finalizarIndicadorSync(ok, ok ? '' : errorMsg);
    }
  },

  async publicarMundo(silencioso, opts) {
    this._pubCancelada = false;
    this._ultimoErrorPub = '';
    if (!this._mundoCargado) {
      this._ultimoErrorPub = 'Mundo no cargado';
      return false;
    }
    if (typeof MarielVersion !== 'undefined' && !MarielVersion.exigirActualizado()) {
      this._ultimoErrorPub = 'Actualiza el juego primero';
      if (!silencioso) {
        Notificaciones.mostrar('⬆️ Actualiza el juego antes de publicar', 'alerta', 7000);
      }
      return false;
    }
    if (!this.esAdminJugador()) {
      this._ultimoErrorPub = 'Solo el administrador puede guardar el mapa';
      return false;
    }
    if (typeof SyncServidor !== 'undefined') {
      const pedirClave = !silencioso;
      const okSesion = await SyncServidor.asegurarSesionServidor(
        pedirClave ? { pedirClave: true } : {}
      );
      if (!okSesion) {
        this._ultimoErrorPub = pedirClave
          ? 'Sin sesión en el servidor — escribe tu contraseña'
          : 'Sin sesión en el servidor';
        return false;
      }
    }
    if (!opts?.confiarLocal) {
      try {
        await this._refrescarPublicadoSiVacio();
        await this.actualizarJugadoresGlobales();
        const { indice } = await MundoPublico.refrescarCuentasServidor();
        if (indice?.length) {
          const porId = new Map();
          for (const j of this._jugadoresParaPublicar()) porId.set(j.id, j);
          for (const j of indice) porId.set(j.id, Object.assign({}, porId.get(j.id), j));
          this.publicado.jugadores = this._filtrarJugadoresBorrados([...porId.values()]);
        }
      } catch (e) { /* seguir con jugadores locales */ }
    }
    let adminLocal;
    try {
      adminLocal = JSON.parse(this._jsonMundo());
    } catch (e) {
      return false;
    }

    const referencia = this.publicado || {};
    const saltarConfirmacion = !!(opts?.forzar || opts?.soloSync);
    if (!saltarConfirmacion && !this._confirmarReduccionPublicacion(adminLocal, referencia)) {
      this._pubCancelada = true;
      this._ultimoErrorPub = 'Publicación cancelada';
      return false;
    }
    if (!opts?.forzar && this._esPublicacionDestructiva(adminLocal, referencia)) {
      adminLocal = await this._fusionarMapaConServidor(adminLocal);
      if (this._esPublicacionDestructiva(adminLocal, referencia)) {
        if (!silencioso) {
          Notificaciones.mostrar(
            '⚠️ Publicación bloqueada: el mapa no cargó bien. Recarga o pulsa Guardar mapa antes de publicar.',
            'alerta', 10000
          );
        }
        this._ultimoErrorPub = 'Mapa incompleto';
        return false;
      }
    }

    const firma = this._firmaMundo(JSON.stringify(adminLocal));
    if (firma === this._ultimoFirmaPublicada && !this._pubPendiente && !opts?.forzar) return true;

    adminLocal.actualizadoEn = Date.now();
    if (opts?.purgarJugadores) adminLocal.purgarJugadores = true;
    const json = JSON.stringify(adminLocal, (clave, valor) =>
      clave.startsWith('_') ? undefined : valor, 2);

    if (!CONFIG.servidorOnline || typeof SyncServidor === 'undefined') {
      this._ultimoErrorPub = 'Servidor no configurado';
      return false;
    }
    if (!SyncServidor.puedePublicar()) {
      const okSesion = await SyncServidor.asegurarSesionServidor({ pedirClave: !silencioso });
      if (!okSesion) {
        this._ultimoErrorPub = 'Sin sesión en el servidor — escribe tu contraseña';
        return false;
      }
    }

    const usarDelta = !opts?.purgarJugadores && !opts?.mundoCompleto;
    if (usarDelta && SyncServidor.sincronizarMapaDelta) {
      const delta = await this._publicarMapaDelta(silencioso);
      if (delta.ok) return true;
      if (!delta.fallbackCompleto) {
        this._ultimoErrorPub = delta.error || 'No se pudo sincronizar el mapa';
        if (!silencioso && !opts?.soloSync) {
          Notificaciones.mostrar(
            '❌ No se pudo sincronizar: ' + this._ultimoErrorPub,
            'error', 9000
          );
        }
        return false;
      }
      /* servidor sin endpoints world/* — caer a sync-mundo completo */
    }

    const resultado = await SyncServidor.publicar(json);
    if (!resultado.ok) {
      this._ultimoErrorPub = resultado.error || 'Error del servidor';
      if (!silencioso && !opts?.soloSync) {
        Notificaciones.mostrar(
          '❌ No se pudo publicar: ' + this._ultimoErrorPub,
          'error', 9000
        );
      }
      return false;
    }

    const enviados = this._contarElementosMapa(adminLocal);
    const guardados = (resultado.data?.objetos || 0) + (resultado.data?.misiones || 0);
    if (enviados > 0 && guardados === 0 && this.esAdminJugador()) {
      this._ultimoErrorPub = 'El servidor no guardó los pins del mapa';
      Notificaciones.mostrar(
        '⚠️ El servidor no guardó el mapa. Comprueba que entras como Randy y pulsa Guardar mapa.',
        'error', 10000
      );
      return false;
    }

    this._sincronizarEstadoTrasPublicar(adminLocal, json);
    this._aplicarMundoRemoto(json);
    if (typeof Multijugador !== 'undefined') {
      Multijugador.mundoServidorTs = adminLocal.actualizadoEn || Date.now();
    }
    if (!silencioso) {
      this._avisoSyncManual('📡 Mundo publicado — todos lo ven en vivo');
    }
    return true;
  },

  // ---------- EXPORTAR ----------
  // Contenido COMPLETO para datos/mundo.json (publicado + cambios locales)
  _itemsConPosicion(lista) {
    return (lista || []).map(item => {
      if (!item) return item;
      const pos = this._posItem(item);
      if (!pos) return Object.assign({}, item);
      return Object.assign({}, item, { pos: pos.slice(), posOrigen: pos.slice() });
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
      posiciones: (() => {
        const idsActivos = new Set();
        for (const lista of [
          this.misionesTodas(), this.tesorosTodos(), this.objetosTodos(),
          this.enemigosTodos(), this.tiendasAdminTodas()
        ]) {
          for (const it of lista) if (it?.id) idsActivos.add(it.id);
        }
        const pos = Object.assign({}, this.publicado.posiciones, this.datos.posiciones);
        const filtradas = {};
        for (const [id, p] of Object.entries(pos)) {
          if (idsActivos.has(id)) filtradas[id] = p;
        }
        return filtradas;
      })(),
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
      cuerposMuertos: (() => {
        const out = Object.assign({}, this.publicado.cuerposMuertos || {});
        if (typeof Multijugador !== 'undefined' && Multijugador.cuerpos) {
          for (const [k, c] of Object.entries(Multijugador.cuerpos)) {
            if (c) out[k] = Object.assign({}, out[k] || {}, c);
          }
        }
        return out;
      })(),
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
      partidas: this._partidasParaPublicar(),
      enemigos: this._itemsConPosicion(this.enemigosTodos()),
      enemigosEstado: Object.assign({}, this.publicado.enemigosEstado || {}),
      objetosEstado: Object.assign({}, this.publicado.objetosEstado || {}),
      tiendasAdmin: this._itemsConPosicion(this.tiendasAdminTodas()),
      tiendasStock: Object.assign({}, this.publicado.tiendasStock || {}),
      tesorosEstado: Object.assign({}, this.publicado.tesorosEstado || {}),
      tesoroIconoMapa: this.tesoroIconoMapa(),
      combate: this.combateConfig(),
      combateEnemigos: this.combateEnemigosConfig(),
      moverPinJugador: !!this.datos.moverPinJugador,
      optimizarVisibilidad: this.datos.optimizarVisibilidad !== undefined
        ? !!this.datos.optimizarVisibilidad
        : this.optimizacionVisibilidadActiva(),
      adminPinClaves: Object.assign(
        {}, this.publicado.adminPinClaves || {}, this.datos.jugadoresPinAdmin || {}
      )
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
    this._actualizarEtiquetaVerCofresOcultos();
    this._mostrarPanelDerecho('admin-vista-cofre', '🧰 Colocar cofre');
    setTimeout(() => {
      this._pintarRejillaGenerica('admin-cofre-rejilla', this._cofreSlots, 'cofre-slot');
      this._enlazarAdmRejilla('admin-cofre-infinito', this._cofreSlots, 'admin-cofre-rejilla', 'cofre-slot');
      const btnOcultos = document.getElementById('admin-ver-cofres-ocultos');
      if (btnOcultos && !btnOcultos._cofreOk) {
        btnOcultos._cofreOk = true;
        btnOcultos.addEventListener('click', () => this.toggleVerCofresOcultos());
      }
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
  abrirBddGlobal() {
    this._mostrarPanelDerecho('admin-vista-bdd-global', '🗄️ Base de datos global');
  },

  abrirCatalogoHub() {
    this._mostrarPanelDerecho('admin-vista-catalogo', '⚙️ Catálogo del juego');
  },

  abrirCombateConfig() {
    const cfg = this.combateConfig();
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('admin-combate-dano-min', cfg.danoMin);
    set('admin-combate-dano-max', cfg.danoMax);
    set('admin-combate-nivel-ref', cfg.nivelReferencia || 1);
    set('admin-combate-vida-base', cfg.vidaBase ?? CONFIG.vidaMaxima ?? 100);
    set('admin-combate-vida-extra', cfg.vidaExtraPorNivel ?? CONFIG.vidaExtraPorNivel ?? 4);
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
    this._mostrarPanelDerecho('admin-vista-combate', '⚔️ Reglas de jugadores');
  },

  _guardarCombateConfig() {
    this.datos.combate = {
      danoMin: Math.max(1, this._numero('admin-combate-dano-min') || 5),
      danoMax: Math.max(1, this._numero('admin-combate-dano-max') || 8),
      nivelReferencia: Math.max(1, this._numero('admin-combate-nivel-ref') || 1),
      vidaBase: Math.max(10, this._numero('admin-combate-vida-base') || 100),
      vidaExtraPorNivel: Math.max(0, this._numero('admin-combate-vida-extra') ?? 4),
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

  abrirCombateEnemigosConfig() {
    const cfg = this.combateEnemigosConfig();
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('admin-enemigo-dano-min', cfg.danoMin);
    set('admin-enemigo-dano-max', cfg.danoMax);
    set('admin-enemigo-nivel-ref', cfg.nivelReferencia || 1);
    set('admin-enemigo-factor', Math.round((cfg.factorPorNivel || 0.06) * 100));
    set('admin-enemigo-vida-base', cfg.vidaBase ?? 60);
    set('admin-enemigo-vida-factor', Math.round((cfg.vidaFactorPorNivel ?? cfg.factorPorNivel ?? 0.06) * 100));
    set('admin-enemigo-xp-base', cfg.xpBase ?? 30);
    set('admin-enemigo-xp-factor', Math.round((cfg.xpFactorPorNivel ?? cfg.factorPorNivel ?? 0.06) * 100));
    this._pintarGraficaCombateEnemigos();
    ['admin-enemigo-dano-min', 'admin-enemigo-dano-max', 'admin-enemigo-nivel-ref',
      'admin-enemigo-factor', 'admin-enemigo-vida-base', 'admin-enemigo-vida-factor',
      'admin-enemigo-xp-base', 'admin-enemigo-xp-factor'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el._graficaEnemigoOk) {
        el._graficaEnemigoOk = true;
        el.addEventListener('input', () => this._pintarGraficaCombateEnemigos());
      }
    });
    this._mostrarPanelDerecho('admin-vista-combate-enemigos', '👹 Enemigos y XP');
  },

  _pintarGraficaCombateEnemigos() {
    const cont = document.getElementById('admin-enemigo-grafica');
    if (!cont) return;
    const min = Math.max(1, this._numero('admin-enemigo-dano-min') || 5);
    const max = Math.max(min, this._numero('admin-enemigo-dano-max') || 8);
    const ref = Math.max(1, this._numero('admin-enemigo-nivel-ref') || 1);
    const factor = Math.max(0.01, (this._numero('admin-enemigo-factor') || 6) / 100);
    const vidaBase = Math.max(10, this._numero('admin-enemigo-vida-base') || 60);
    const vidaFactor = Math.max(0.01, (this._numero('admin-enemigo-vida-factor') || 6) / 100);
    const xpBase = Math.max(1, this._numero('admin-enemigo-xp-base') || 30);
    const xpFactor = Math.max(0.01, (this._numero('admin-enemigo-xp-factor') || 6) / 100);
    const vidaNv = (n) => {
      const f = 1 + (n - 1) * vidaFactor;
      return Math.max(10, Math.round(vidaBase * f));
    };
    const danoNv = (n) => {
      const f = 1 + (n - 1) * factor;
      return {
        lo: Math.round(min * f),
        hi: Math.round(max * f)
      };
    };
    const xpNv = (n) => Math.max(1, Math.round(xpBase * (1 + (n - 1) * xpFactor)));
    let html = '<div class="admin-combate-grafica-titulo">Referencia nv enemigo: ' + ref + '</div>';
    html += '<div class="admin-combate-grafica-titulo">Vida, daño y XP por nivel</div>';
    for (let n = 1; n <= Math.min(20, CONFIG.nivelMaximo || 100); n += (n < 10 ? 1 : 5)) {
      const d = danoNv(n);
      html += '<div class="admin-combate-fila">Nv ' + n + ': ❤️ ' + vidaNv(n) +
        ' · ⚔️ ' + d.lo + '–' + Math.max(d.lo, d.hi) +
        ' · ✨ ' + xpNv(n) + ' XP</div>';
    }
    cont.innerHTML = html;
  },

  _guardarCombateEnemigosConfig() {
    this.datos.combateEnemigos = {
      danoMin: Math.max(1, this._numero('admin-enemigo-dano-min') || 5),
      danoMax: Math.max(1, this._numero('admin-enemigo-dano-max') || 8),
      nivelReferencia: Math.max(1, this._numero('admin-enemigo-nivel-ref') || 1),
      factorPorNivel: Math.max(0.01, (this._numero('admin-enemigo-factor') || 6) / 100),
      vidaBase: Math.max(10, this._numero('admin-enemigo-vida-base') || 60),
      vidaFactorPorNivel: Math.max(0.01, (this._numero('admin-enemigo-vida-factor') || 6) / 100),
      xpBase: Math.max(1, this._numero('admin-enemigo-xp-base') || 30),
      xpFactorPorNivel: Math.max(0.01, (this._numero('admin-enemigo-xp-factor') || 6) / 100)
    };
    if (this.datos.combateEnemigos.danoMax < this.datos.combateEnemigos.danoMin) {
      this.datos.combateEnemigos.danoMax = this.datos.combateEnemigos.danoMin;
    }
    this.guardar();
    this._publicarParaTodos(true);
    Notificaciones.mostrar('👹 Reglas de daño enemigo actualizadas', 'exito');
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
