// ============================================================
// GPS DEL JUGADOR
//  - El punto azul es el jugador
//  - Solo el admin (con opción activada) puede arrastrar el pin
//  - El botón 📍 activa el GPS real del teléfono
//  - Cada movimiento centra el mapa en el jugador
// ============================================================
const GPS = {
  posicion: null,
  marcador: null,
  siguiendoGpsReal: false,
  _idVigilancia: null,

  iniciar() {
    this.posicion = Guardado.datos.posicionJugador || CONFIG.centro.slice();

    this.marcador = L.marker(this.posicion, {
      draggable: false,
      zIndexOffset: 1000,
      icon: L.divIcon({
        className: '',
        html: '<div class="punto-jugador"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      })
    }).addTo(Mapa.mapa);

    this.marcador.on('drag', () => {
      const p = this.marcador.getLatLng();
      this._actualizar([p.lat, p.lng], false);
    });
    this.marcador.on('dragstart', () => this.dejarDeSeguir());

    this._actualizarArrastre();

    document.getElementById('btn-gps').addEventListener('click', () => this.alternarGpsReal());

    setTimeout(() => {
      Mapa.jugadorSeMovio(this.posicion);
      if (typeof Mapa !== 'undefined' && Mapa.centrarEnJugador) Mapa.centrarEnJugador(false);
    }, 300);
  },

  puedeArrastrar() {
    return typeof Admin !== 'undefined' && Admin.puedeMoverPinJugador && Admin.puedeMoverPinJugador();
  },

  _actualizarArrastre() {
    if (!this.marcador) return;
    const puede = this.puedeArrastrar();
    const organizando = typeof Admin !== 'undefined' && Admin.modo === 'organizar';
    const prioridad = puede || organizando;
    this.marcador.options.draggable = puede;
    this.marcador.setZIndexOffset(prioridad ? 15000 : 1000);
    if (this.marcador.dragging) {
      if (puede) this.marcador.dragging.enable();
      else this.marcador.dragging.disable();
    }
    if (typeof Enemigos !== 'undefined' && Enemigos._actualizarPrioridadAdmin) {
      Enemigos._actualizarPrioridadAdmin(prioridad);
    }
  },

  _actualizar(nuevaPosicion, moverMarcador = true) {
    const [so, ne] = CONFIG.limites;
    nuevaPosicion = [
      Math.max(so[0], Math.min(ne[0], nuevaPosicion[0])),
      Math.max(so[1], Math.min(ne[1], nuevaPosicion[1]))
    ];
    const cambioGrande = !this.posicion ||
      Math.abs(this.posicion[0] - nuevaPosicion[0]) > 0.00005 ||
      Math.abs(this.posicion[1] - nuevaPosicion[1]) > 0.00005;
    this.posicion = nuevaPosicion;
    if (moverMarcador) this.marcador.setLatLng(nuevaPosicion);
    Guardado.datos.posicionJugador = nuevaPosicion;
    Guardado.guardar();
    Mapa.jugadorSeMovio(nuevaPosicion);
    if (typeof Multijugador !== 'undefined') {
      Multijugador.enviarPosicion(nuevaPosicion[0], nuevaPosicion[1], cambioGrande);
      Multijugador.refrescarMarcadoresDistancia();
    }
  },

  alternarGpsReal() {
    if (this.siguiendoGpsReal) { this.dejarDeSeguir(); return; }
    if (!navigator.geolocation) {
      Notificaciones.mostrar('Este dispositivo no tiene GPS disponible', 'error');
      return;
    }
    this.siguiendoGpsReal = true;
    document.getElementById('btn-gps').classList.add('activo');
    Notificaciones.mostrar('📍 Siguiendo tu GPS real', 'info');

    this._idVigilancia = navigator.geolocation.watchPosition(
      pos => {
        if (!this.siguiendoGpsReal) return;
        this._actualizar([pos.coords.latitude, pos.coords.longitude]);
      },
      err => {
        Notificaciones.mostrar('No se pudo leer el GPS: ' + err.message, 'error');
        this.dejarDeSeguir();
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
  },

  dejarDeSeguir() {
    if (this._idVigilancia !== null) {
      navigator.geolocation.clearWatch(this._idVigilancia);
      this._idVigilancia = null;
    }
    if (this.siguiendoGpsReal) {
      this.siguiendoGpsReal = false;
      Notificaciones.mostrar('✋ GPS desactivado. Usa 📍 para volver a seguirte', 'info');
    }
    document.getElementById('btn-gps').classList.remove('activo');
  }
};
