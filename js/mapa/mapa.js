// ============================================================
// MAPA — Mariel, Cuba
// Mapa limpio SIN nombres ni iconos (teselas de CARTO sin
// etiquetas). Encerrado en un cuadrado: fuera de la zona todo
// se cubre con una máscara y no se puede desplazar el mapa.
// ============================================================
const Mapa = {
  mapa: null,
  puntosInteractivos: [],
  CLAVE_VISTA: 'mariel_vista_mapa_v1',
  _mapaMovidoPorUsuario: false,
  _tempRecuperarZoom: null,
  _toqueActivo: false,
  _capaPrincipal: null,
  _capaReserva: null,
  _usandoReserva: false,

  _claveVista() {
    const id = (typeof Usuarios !== 'undefined' && Usuarios.perfilActivo?.id) || 'global';
    return this.CLAVE_VISTA + '::' + id;
  },

  iniciar() {
    if (typeof L === 'undefined') return false;
    const cont = document.getElementById('mapa');
    if (!cont) return false;
    if (this.mapa) {
      this.refrescarTamano();
      return true;
    }

    this.mapa = L.map('mapa', {
      center: CONFIG.centro,
      zoom: CONFIG.zoomInicial,
      minZoom: CONFIG.zoomMinimo,
      maxZoom: CONFIG.zoomMaximo,
      maxBounds: CONFIG.limites,
      maxBoundsViscosity: 1.0,
      zoomControl: false,
      attributionControl: true
    });

    // Teselas SIN etiquetas (sin nombres de calles ni lugares)
    this._capaPrincipal = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',
      {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: CONFIG.zoomMaximo
      }
    );
    this._capaReserva = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: CONFIG.zoomMaximo
    });
    this._capaPrincipal.on('tileerror', () => this._activarCapaReserva());
    this._capaPrincipal.addTo(this.mapa);

    // Máscara: cubre todo el mundo excepto el cuadrado jugable
    const [so, ne] = CONFIG.limites;
    const mundo = [[-89, -179], [-89, 179], [89, 179], [89, -179]];
    const zona = [[so[0], so[1]], [so[0], ne[1]], [ne[0], ne[1]], [ne[0], so[1]]];
    L.polygon([mundo, zona], {
      color: '#22293d', weight: 3, fillColor: '#141926', fillOpacity: 1, interactive: false
    }).addTo(this.mapa);

    this.mapa.on('moveend zoomend', () => this._guardarVista());
    window.addEventListener('pagehide', () => this._guardarVista());
    window.addEventListener('resize', () => this.refrescarTamano());
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.refrescarTamano(), 300);
    });
    this._enlazarRecuperacionZoom();
    this.refrescarTamano();
    setTimeout(() => this.refrescarTamano(), 400);
    return true;
  },

  _activarCapaReserva() {
    if (!this.mapa || this._usandoReserva || !this._capaReserva) return;
    this._usandoReserva = true;
    if (this._capaPrincipal && this.mapa.hasLayer(this._capaPrincipal)) {
      this.mapa.removeLayer(this._capaPrincipal);
    }
    if (!this.mapa.hasLayer(this._capaReserva)) this._capaReserva.addTo(this.mapa);
    this.refrescarTamano();
  },

  refrescarTamano() {
    if (!this.mapa) return;
    try {
      this.mapa.invalidateSize({ animate: false, pan: false });
    } catch (e) { /* */ }
  },

  async asegurarIniciado() {
    if (this.mapa) {
      this.refrescarTamano();
      return true;
    }
    if (typeof L === 'undefined') return false;
    const ok = this.iniciar();
    if (!ok || !this.mapa) return false;
    await new Promise(resolve => {
      const limite = setTimeout(resolve, 4000);
      this.mapa.whenReady(() => {
        this.refrescarTamano();
        clearTimeout(limite);
        setTimeout(resolve, 120);
      });
    });
    return !!this.mapa;
  },

  _enlazarRecuperacionZoom() {
    const m = this.mapa;
    const cont = m.getContainer();
    const esAdminMapa = () => typeof Admin !== 'undefined' && Admin.modo;

    const usuarioInteractua = () => {
      if (esAdminMapa()) return;
      this._mapaMovidoPorUsuario = true;
      this._cancelarRecuperacionZoom();
    };

    const alSoltarMapa = () => {
      if (esAdminMapa() || this._toqueActivo) return;
      this._programarRecuperacionZoom();
    };

    m.on('dragstart', usuarioInteractua);
    m.on('zoomstart', usuarioInteractua);
    m.on('dragend', alSoltarMapa);
    m.on('zoomend', alSoltarMapa);

    cont.addEventListener('touchstart', () => {
      this._toqueActivo = true;
      usuarioInteractua();
    }, { passive: true });
    cont.addEventListener('touchend', () => {
      this._toqueActivo = false;
      alSoltarMapa();
    }, { passive: true });
    cont.addEventListener('touchcancel', () => {
      this._toqueActivo = false;
      alSoltarMapa();
    }, { passive: true });
  },

  _programarRecuperacionZoom() {
    this._cancelarRecuperacionZoom();
    const ms = Math.max(2, (CONFIG.zoomRecuperarSegundos || 4)) * 1000;
    this._tempRecuperarZoom = setTimeout(() => {
      this._tempRecuperarZoom = null;
      if (typeof Admin !== 'undefined' && Admin.modo) return;
      if (this._toqueActivo) return;
      this._mapaMovidoPorUsuario = false;
      this.centrarEnJugador(true);
    }, ms);
  },

  _cancelarRecuperacionZoom() {
    if (this._tempRecuperarZoom) clearTimeout(this._tempRecuperarZoom);
    this._tempRecuperarZoom = null;
  },

  _guardarVista() {
    if (!this.mapa) return;
    try {
      const c = this.mapa.getCenter();
      const z = this.mapa.getZoom();
      const payload = JSON.stringify({
        lat: +c.lat.toFixed(6),
        lng: +c.lng.toFixed(6),
        zoom: z
      });
      localStorage.setItem(this._claveVista(), payload);
      localStorage.setItem(this.CLAVE_VISTA, payload);
    } catch (e) { /* almacenamiento lleno */ }
  },

  _leerVistaGuardada() {
    for (const clave of [this._claveVista(), this.CLAVE_VISTA]) {
      try {
        const raw = localStorage.getItem(clave);
        if (!raw) continue;
        const v = JSON.parse(raw);
        if (v && typeof v.lat === 'number' && typeof v.lng === 'number' && v.zoom) return v;
      } catch (e) { /* ignorar */ }
    }
    return null;
  },

  restaurarVista() {
    if (!this.mapa) return;
    if (typeof GPS !== 'undefined' && GPS.posicion) {
      this.centrarEnJugador(false);
      return;
    }
    this.mapa.setView(CONFIG.centro, CONFIG.zoomInicial, { animate: false });
  },

  centrarEnJugador(animar) {
    if (!this.mapa || !GPS.posicion) return;
    if (typeof Admin !== 'undefined' && Admin.modo) return;
    this._mapaMovidoPorUsuario = false;
    this._cancelarRecuperacionZoom();
    const zoomObj = CONFIG.zoomSeguimientoJugador ?? CONFIG.zoomMaximo;
    const zoom = Math.min(this.mapa.getMaxZoom(), zoomObj);
    this.mapa.setView(GPS.posicion, zoom, { animate: animar !== false });
  },

  // Crea un marcador con un emoji
  crearMarcadorEmoji(posicion, emoji, tamano = 30) {
    return L.marker(posicion, {
      icon: L.divIcon({
        className: '',
        html: '<div class="icono-mapa">' + emoji + '</div>',
        iconSize: [tamano, tamano],
        iconAnchor: [tamano / 2, tamano / 2]
      })
    }).addTo(this.mapa);
  },

  // Registra un punto que reacciona a la cercanía del jugador.
  // alTocar solo funciona si el jugador está a menos de 'radio' metros.
  registrarPunto(punto) {
    this.puntosInteractivos.push(punto);
    if (punto.marcador && punto.alTocar) {
      punto.marcador.on('click', () => {
        // En modo administrador (eliminar/organizar) el toque lo maneja el admin
        if (typeof Admin !== 'undefined' && Admin.manejarClickPunto(punto)) return;
        const d = Utilidades.distanciaMetros(GPS.posicion, punto.posicion);
        if (d <= (punto.radio || CONFIG.distanciaInteraccion)) {
          punto.alTocar();
        } else {
          Notificaciones.mostrar('📍 Estás muy lejos (' + Math.round(d) + ' m). Acércate a menos de ' +
            (punto.radio || CONFIG.distanciaInteraccion) + ' m', 'alerta');
        }
      });
    }
  },

  // Llamado por el GPS cada vez que el jugador se mueve
  jugadorSeMovio(posicion) {
    for (const p of this.puntosInteractivos) {
      const d = Utilidades.distanciaMetros(posicion, p.posicion);
      if (p.marcador) {
        const el = p.marcador.getElement();
        if (el) {
          const icono = el.querySelector('.icono-mapa');
          if (icono) icono.classList.toggle('cerca', d <= (p.radio || CONFIG.distanciaInteraccion));
        }
      }
      if (p.alCambiarDistancia) p.alCambiarDistancia(d);
    }
    if (typeof Misiones !== 'undefined' && Misiones.actualizarLineas) Misiones.actualizarLineas();
    if (!this._mapaMovidoPorUsuario) this.centrarEnJugador(true);
  }
};
