// ============================================================
// GUARDADO Y CARGA DE LA PARTIDA (localStorage + nube)
// ============================================================
const Guardado = {
  SAL: 'mariel-explorer::sal-de-integridad::2026',
  datos: null,
  integridadRota: false,
  _temporizador: null,
  _syncNubeTimer: null,
  _syncStatsTimer: null,
  _syncEnCurso: false,
  _syncFallos: 0,
  _syncIntervalo: null,

  _syncPartidaMs: 90000,

  iniciarSyncPeriodico() {
    if (this._syncIntervalo) return;
    this._syncIntervalo = setInterval(() => {
      if (typeof Usuarios !== 'undefined' && Usuarios.perfilActivo) {
        this.sincronizarNube(true).catch(() => {});
      }
    }, this._syncPartidaMs);
  },

  _clave() {
    const perfil = (typeof Usuarios !== 'undefined' && Usuarios.perfilActivo)
      ? Usuarios.perfilActivo.id : 'anonimo';
    return CONFIG.claveGuardado + '::' + perfil;
  },

  async iniciar() {
    if (!localStorage.getItem(this._clave()) && localStorage.getItem(CONFIG.claveGuardado)) {
      localStorage.setItem(this._clave(), localStorage.getItem(CONFIG.claveGuardado));
      localStorage.removeItem(CONFIG.claveGuardado);
    }

    const crudo = localStorage.getItem(this._clave());
    let partidaNuevaLocal = false;

    if (!crudo) {
      this.datos = this._estadoNuevo();
      partidaNuevaLocal = true;
    } else {
      try {
        const paquete = JSON.parse(crudo);
        const firmaEsperada = await Utilidades.sha256(JSON.stringify(paquete.datos) + this.SAL);
        if (firmaEsperada !== paquete.firma) this.integridadRota = true;
        this.datos = Object.assign(this._estadoNuevo(), paquete.datos);
      } catch (e) {
        this.integridadRota = true;
        this.datos = this._estadoNuevo();
        partidaNuevaLocal = true;
      }
    }

    await this._fusionarDesdeNube(partidaNuevaLocal);
    await this.guardarAhora();
    if (MundoPublico.puedeEscribir()) {
      this.sincronizarNube(true).catch(() => {});
    } else if (typeof Usuarios !== 'undefined' && Usuarios.esAdministrador()) {
      this._avisarSinSyncNube().catch(() => {});
    }
    this.iniciarSyncPeriodico();
  },

  _estadoNuevo() {
    return {
      mochila: null,
      dinero: null,
      vida: CONFIG.vidaMaxima,
      hambre: CONFIG.hambreInicial,
      xp: 0,
      nivel: 1,
      historialDinero: [],
      historialObjetos: [],
      tesorosRecogidos: [],
      misiones: {},
      misionesEstado: {},
      posicionJugador: null,
      correoEnviados: [],
      correoRecibidos: [],
      correoTiendaLocal: [],
      mensajesVistos: [],
      muerto: false,
      proteccionRevivirHasta: 0,
      invisibleHasta: 0,
      armaEquipada: null,
      equipoEquipado: { casco: null, chaleco: null, botas: null, ropa: null },
      admin: { misiones: [], tesoros: [], objetos: [] },
      preferencias: { notifChat: true, notifAmigos: true, vibracionCombate: true, posBtnAtacar: 'izq' },
      objetosSuelto: [],
      bolsasDrop: [],
      nubeT: 0,
      statsT: 0
    };
  },

  _camposStats() {
    return ['vida', 'hambre', 'xp', 'nivel', 'muerto', 'muertePos', 'revividoEn', 'muertoAt', 'muerteInventario'];
  },

  _camposNube() {
    return [
      'mochila', 'dinero', 'vida', 'hambre', 'xp', 'nivel', 'posicionJugador',
      'tesorosRecogidos', 'misiones', 'misionesEstado',
      'correoEnviados', 'correoRecibidos', 'correoTiendaLocal',
      'historialDinero', 'historialObjetos', 'mensajesVistos', 'muerto', 'muertePos', 'revividoEn', 'armaEquipada', 'equipoEquipado',
      'preferencias', 'preferenciasT'
    ];
  },

  _snapshotNube() {
    const datos = {};
    for (const k of this._camposNube()) {
      if (this.datos[k] !== undefined) {
        datos[k] = JSON.parse(JSON.stringify(this.datos[k]));
      }
    }
    const t = Date.now();
    const statsT = this.datos.statsT || t;
    return { datos, t, statsT };
  },

  _marcarStatsLocales() {
    if (!this.datos) return;
    this.datos.statsT = Date.now();
    this.guardar();
    this._programarSyncStats();
  },

  _programarSyncStats() {
    if (typeof Usuarios === 'undefined' || !Usuarios.perfilActivo) return;
    const online = CONFIG.servidorOnline &&
      typeof Multijugador !== 'undefined' &&
      localStorage.getItem(Multijugador.TOKEN_KEY);
    if (!online && !MundoPublico.puedeEscribir()) return;
    clearTimeout(this._syncStatsTimer);
    this._syncStatsTimer = setTimeout(() => {
      this.sincronizarNube(true).catch(() => {});
      if (typeof Multijugador !== 'undefined') Multijugador.enviarStats(true);
    }, 400);
  },

  _aplicarSnapshot(snap, opciones) {
    if (!snap) return;
    const opts = opciones || {};
    const stats = new Set(this._camposStats());
    const prefsLocales = this.datos.preferencias
      ? JSON.parse(JSON.stringify(this.datos.preferencias))
      : null;
    const prefsTLocal = this.datos.preferenciasT || 0;
    for (const k of this._camposNube()) {
      if (snap[k] === undefined) continue;
      if (opts.sinStats && stats.has(k)) continue;
      if (opts.soloStats && !stats.has(k)) continue;
      // No pisar posición local con null de la nube (evita volver al centro del mapa)
      if (k === 'posicionJugador') {
        if (!snap[k] || !Array.isArray(snap[k]) || snap[k].length < 2) continue;
      }
      if (k === 'preferencias') {
        const remotaT = snap.preferenciasT || opts.preferenciasT || 0;
        if (!snap[k] || remotaT < prefsTLocal) continue;
      }
      if (k === 'preferenciasT') {
        const remotaT = snap.preferenciasT || 0;
        if (remotaT < prefsTLocal) continue;
      }
      if (k === 'armaEquipada' || snap[k] !== null) {
        this.datos[k] = JSON.parse(JSON.stringify(snap[k]));
      }
    }
    if (prefsLocales && (!snap.preferencias || (snap.preferenciasT || 0) < prefsTLocal)) {
      this.datos.preferencias = prefsLocales;
      if (prefsTLocal) this.datos.preferenciasT = prefsTLocal;
    }
  },

  _partidaServidorActiva() {
    if (typeof Usuarios === 'undefined' || !Usuarios.perfilActivo) return null;
    const id = Usuarios.perfilActivo.id;
    if (typeof Admin !== 'undefined' && Admin.publicado?.partidas?.[id]) {
      return Admin.publicado.partidas[id];
    }
    return null;
  },

  _asegurarPosicionJugador() {
    const pos = this.datos?.posicionJugador;
    if (Array.isArray(pos) && pos.length >= 2) return true;
    const partida = this._partidaServidorActiva();
    const remota = partida?.datos?.posicionJugador;
    if (!Array.isArray(remota) || remota.length < 2) return false;
    this.datos.posicionJugador = remota.slice();
    return true;
  },

  async _fusionarDesdeNube(partidaNuevaLocal) {
    if (typeof Usuarios === 'undefined' || !Usuarios.perfilActivo) return;
    let nube = await MundoPublico.leerPartida(Usuarios.perfilActivo.id);
    if ((!nube || !nube.datos) && typeof Admin !== 'undefined') {
      const local = this._partidaServidorActiva();
      if (local?.datos) nube = local;
    }
    if (!nube || !nube.datos) {
      this._asegurarPosicionJugador();
      return;
    }

    const localT = this.datos.nubeT || 0;
    const remoteStatsT = nube.statsT || nube.t || 0;
    const localStatsT = this.datos.statsT || 0;
    const aplicarStats = remoteStatsT >= localStatsT;
    const debeFusionar = nube.t > localT || (partidaNuevaLocal && nube.t > 0);
    if (debeFusionar) {
      this._aplicarSnapshot(nube.datos, { sinStats: !aplicarStats });
      if (aplicarStats) this.datos.statsT = remoteStatsT;
      this.datos.nubeT = nube.t || Date.now();
      this.datos.nubeFusionada = true;
      if (typeof Mochila !== 'undefined') {
        Mochila._refrescarTrasGuardado();
        Mochila.pintar();
      }
    }
    this._asegurarPosicionJugador();
  },

  guardar() {
    clearTimeout(this._temporizador);
    this._temporizador = setTimeout(() => this.guardarAhora(), 400);
  },

  async guardarAhora() {
    const firma = await Utilidades.sha256(JSON.stringify(this.datos) + this.SAL);
    localStorage.setItem(this._clave(), JSON.stringify({ datos: this.datos, firma }));
    this._programarSyncNube();
  },

  _programarSyncNube() {
    if (typeof Usuarios === 'undefined' || !Usuarios.perfilActivo) return;
    if (!MundoPublico.puedeEscribir()) return;
    clearTimeout(this._syncNubeTimer);
    this._syncNubeTimer = setTimeout(() => this.sincronizarNube(true), 2500);
  },

  /** Inventario cambió: subir pronto para que el servidor no pise con stats viejos. */
  _programarSyncInventario() {
    if (typeof Usuarios === 'undefined' || !Usuarios.perfilActivo) return;
    const online = CONFIG.servidorOnline &&
      typeof Multijugador !== 'undefined' &&
      localStorage.getItem(Multijugador.TOKEN_KEY);
    if (!online && !MundoPublico.puedeEscribir()) return;
    clearTimeout(this._syncInventarioTimer);
    this._syncInventarioTimer = setTimeout(() => {
      this.sincronizarNube(true).then((ok) => {
        if (ok && this.datos) delete this.datos._invPendienteSync;
      });
    }, 400);
  },

  async _avisarSinSyncNube() {
    if (this._avisoSinNube) return;
    if (typeof SyncServidor !== 'undefined') {
      if (SyncServidor.puedePublicar()) return;
      const ok = await SyncServidor.asegurarSesionServidor();
      if (ok) return;
    }
    if (MundoPublico.usaFirebase()) return;
    if (typeof Usuarios === 'undefined' || !Usuarios.esAdministrador()) return;
    if (MundoPublico.puedeEscribir()) return;
    this._avisoSinNube = true;
    if (typeof Notificaciones !== 'undefined') {
      Notificaciones.mostrar(
        '⚠️ Pulsa Guardar mapa en Admin para conectar al servidor.',
        'alerta', 10000
      );
    }
  },

  async sincronizarNube(silencioso) {
    if (this._syncEnCurso) return false;
    if (typeof Usuarios === 'undefined' || !Usuarios.perfilActivo) return false;

    const snapshot = this._snapshotNube();
    if (CONFIG.servidorOnline && typeof SyncServidor !== 'undefined' &&
        localStorage.getItem(Multijugador.TOKEN_KEY)) {
      this._syncEnCurso = true;
      try {
        const ok = await SyncServidor.subirPartida(Usuarios.perfilActivo.id, snapshot);
        if (ok) {
          this._syncFallos = 0;
          this.datos.nubeT = snapshot.t;
          if (snapshot.statsT) this.datos.statsT = snapshot.statsT;
          delete this.datos._invPendienteSync;
          const firma = await Utilidades.sha256(JSON.stringify(this.datos) + this.SAL);
          localStorage.setItem(this._clave(), JSON.stringify({ datos: this.datos, firma }));
        } else {
          this._syncFallos++;
        }
        return ok;
      } catch (e) {
        this._syncFallos++;
        return false;
      } finally {
        this._syncEnCurso = false;
      }
    }

    if (!MundoPublico.puedeEscribir()) {
      if (Usuarios.esAdministrador()) this._avisarSinSyncNube().catch(() => {});
      return false;
    }

    this._syncEnCurso = true;
    try {
      const snapshot = this._snapshotNube();
      const ok = await MundoPublico.subirPartidaCuenta(Usuarios.perfilActivo, snapshot);
      if (ok) {
        this._syncFallos = 0;
        this.datos.nubeT = snapshot.t;
        if (snapshot.statsT) this.datos.statsT = snapshot.statsT;
        delete this.datos._invPendienteSync;
        const firma = await Utilidades.sha256(JSON.stringify(this.datos) + this.SAL);
        localStorage.setItem(this._clave(), JSON.stringify({ datos: this.datos, firma }));
      } else {
        this._syncFallos++;
        if (this._syncFallos >= 3 && !silencioso && typeof Notificaciones !== 'undefined') {
          Notificaciones.mostrar('⚠️ No se pudo subir tu progreso a GitHub. Se reintentará solo.', 'alerta', 5000);
        }
        if (this._syncFallos < 8) {
          clearTimeout(this._syncNubeTimer);
          this._syncNubeTimer = setTimeout(() => this.sincronizarNube(true), 5000 + this._syncFallos * 3000);
        }
      }
      return ok;
    } catch (e) {
      this._syncFallos++;
      return false;
    } finally {
      this._syncEnCurso = false;
    }
  },

  borrarPartidaActual() {
    localStorage.removeItem(this._clave());
    location.reload();
  }
};
