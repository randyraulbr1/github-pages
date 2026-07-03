// ============================================================
// GPS DEL JUGADOR
//  - El punto azul es el jugador
//  - Se puede ARRASTRAR con el dedo para moverse (modo manual)
//  - El botón 📍 activa el GPS real del teléfono (modo seguir)
//  - Cada movimiento avisa al mapa para revisar cercanías
// ============================================================
const GPS = {
  posicion: null,       // [lat, lon] actual del jugador
  marcador: null,
  siguiendoGpsReal: false,
  _idVigilancia: null,

  iniciar() {
    this.posicion = Guardado.datos.posicionJugador || CONFIG.centro.slice();

    this.marcador = L.marker(this.posicion, {
      draggable: true,
      zIndexOffset: 1000,
      icon: L.divIcon({
        className: '',
        html: '<div class="punto-jugador"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      })
    }).addTo(Mapa.mapa);

    // Arrastrar el punto = moverse manualmente
    this.marcador.on('drag', () => {
      const p = this.marcador.getLatLng();
      this._actualizar([p.lat, p.lng], false);
    });
    this.marcador.on('dragstart', () => this.dejarDeSeguir());

    document.getElementById('btn-gps').addEventListener('click', () => this.alternarGpsReal());

    // Primera revisión de cercanías al arrancar
    setTimeout(() => Mapa.jugadorSeMovio(this.posicion), 300);
  },

  _actualizar(nuevaPosicion, moverMarcador = true) {
    // Mantener al jugador dentro del cuadrado jugable
    const [so, ne] = CONFIG.limites;
    nuevaPosicion = [
      Math.max(so[0], Math.min(ne[0], nuevaPosicion[0])),
      Math.max(so[1], Math.min(ne[1], nuevaPosicion[1]))
    ];
    this.posicion = nuevaPosicion;
    if (moverMarcador) this.marcador.setLatLng(nuevaPosicion);
    Guardado.datos.posicionJugador = nuevaPosicion;
    Guardado.guardar();
    Mapa.jugadorSeMovio(nuevaPosicion);
  },

  // ---------- GPS REAL DEL DISPOSITIVO ----------
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
        Mapa.mapa.panTo(this.posicion);
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
      Notificaciones.mostrar('✋ Modo manual: arrastra el punto azul', 'info');
    }
    document.getElementById('btn-gps').classList.remove('activo');
  }
};
