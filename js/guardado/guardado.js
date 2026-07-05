// ============================================================
// GUARDADO Y CARGA DE LA PARTIDA (localStorage + nube)
// ============================================================
const Guardado = {
  SAL: 'mariel-explorer::sal-de-integridad::2026',
  datos: null,
  integridadRota: false,
  _temporizador: null,
  _syncNubeTimer: null,
  _syncEnCurso: false,

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
      admin: { misiones: [], tesoros: [], objetos: [] },
      nubeT: 0
    };
  },

  _camposNube() {
    return [
      'mochila', 'dinero', 'vida', 'hambre', 'xp', 'nivel', 'posicionJugador',
      'tesorosRecogidos', 'misiones', 'misionesEstado',
      'correoEnviados', 'correoRecibidos', 'correoTiendaLocal',
      'historialDinero', 'historialObjetos', 'mensajesVistos'
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
    return { datos, t };
  },

  _aplicarSnapshot(snap) {
    if (!snap) return;
    for (const k of this._camposNube()) {
      if (snap[k] !== undefined && snap[k] !== null) {
        this.datos[k] = JSON.parse(JSON.stringify(snap[k]));
      }
    }
  },

  async _fusionarDesdeNube(partidaNuevaLocal) {
    if (typeof Usuarios === 'undefined' || !Usuarios.perfilActivo) return;
    const nube = await MundoPublico.leerPartida(Usuarios.perfilActivo.id);
    if (!nube || !nube.datos) return;

    const localT = this.datos.nubeT || 0;
    const debeFusionar = nube.t > localT || (partidaNuevaLocal && nube.t > 0);
    if (!debeFusionar) return;

    this._aplicarSnapshot(nube.datos);
    this.datos.nubeT = nube.t;
    this.datos.nubeFusionada = true;
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
    this._syncNubeTimer = setTimeout(() => this.sincronizarNube(), 2500);
  },

  async sincronizarNube(silencioso) {
    if (this._syncEnCurso) return false;
    if (typeof Usuarios === 'undefined' || !Usuarios.perfilActivo) return false;
    if (!MundoPublico.puedeEscribir()) return false;

    this._syncEnCurso = true;
    try {
      const snapshot = this._snapshotNube();
      const ok = await MundoPublico.subirPartida(Usuarios.perfilActivo, snapshot);
      if (ok) {
        this.datos.nubeT = snapshot.t;
        const firma = await Utilidades.sha256(JSON.stringify(this.datos) + this.SAL);
        localStorage.setItem(this._clave(), JSON.stringify({ datos: this.datos, firma }));
        if (!silencioso && typeof Notificaciones !== 'undefined') {
          Notificaciones.mostrar('☁️ Progreso guardado en la nube', 'info', 2500);
        }
      }
      return ok;
    } catch (e) {
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
