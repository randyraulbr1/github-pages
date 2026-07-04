// ============================================================
// GUARDADO Y CARGA DE LA PARTIDA (localStorage)
// Todo el estado se firma con un hash: si alguien edita los
// datos a mano, la firma no coincide y el juego lo detecta.
// ============================================================
const Guardado = {
  SAL: 'mariel-explorer::sal-de-integridad::2026',
  datos: null,            // estado completo del juego en memoria
  integridadRota: false,  // true si el guardado fue modificado a mano
  _temporizador: null,

  // Clave de guardado propia de cada jugador registrado
  _clave() {
    const perfil = (typeof Usuarios !== 'undefined' && Usuarios.perfilActivo)
      ? Usuarios.perfilActivo.id : 'anonimo';
    return CONFIG.claveGuardado + '::' + perfil;
  },

  async iniciar() {
    // Migración: partidas guardadas antes de existir los perfiles
    if (!localStorage.getItem(this._clave()) && localStorage.getItem(CONFIG.claveGuardado)) {
      localStorage.setItem(this._clave(), localStorage.getItem(CONFIG.claveGuardado));
      localStorage.removeItem(CONFIG.claveGuardado);
    }

    const crudo = localStorage.getItem(this._clave());
    if (!crudo) {
      this.datos = this._estadoNuevo();
      await this.guardarAhora();
      return;
    }
    try {
      const paquete = JSON.parse(crudo);
      const firmaEsperada = await Utilidades.sha256(JSON.stringify(paquete.datos) + this.SAL);
      if (firmaEsperada !== paquete.firma) {
        this.integridadRota = true;
      }
      this.datos = Object.assign(this._estadoNuevo(), paquete.datos);
    } catch (e) {
      this.integridadRota = true;
      this.datos = this._estadoNuevo();
    }
  },

  _estadoNuevo() {
    return {
      mochila: null,          // lo llena el módulo Mochila
      dinero: null,           // lo llena el módulo Dinero
      vida: CONFIG.vidaMaxima,
      historialDinero: [],
      historialObjetos: [],
      tesorosRecogidos: [],
      misiones: {},
      posicionJugador: null
    };
  },

  // Guardar con pequeña espera para agrupar muchos cambios seguidos
  guardar() {
    clearTimeout(this._temporizador);
    this._temporizador = setTimeout(() => this.guardarAhora(), 400);
  },

  async guardarAhora() {
    const firma = await Utilidades.sha256(JSON.stringify(this.datos) + this.SAL);
    localStorage.setItem(this._clave(), JSON.stringify({ datos: this.datos, firma }));
  },

  // Borra solo la partida del jugador activo
  borrarPartidaActual() {
    localStorage.removeItem(this._clave());
    location.reload();
  }
};
