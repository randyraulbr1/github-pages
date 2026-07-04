// ============================================================
// MAPA — Mariel, Cuba
// Mapa limpio SIN nombres ni iconos (teselas de CARTO sin
// etiquetas). Encerrado en un cuadrado: fuera de la zona todo
// se cubre con una máscara y no se puede desplazar el mapa.
// ============================================================
const Mapa = {
  mapa: null,
  puntosInteractivos: [], // { id, posicion, radio, marcador, alTocar, alCambiarDistancia }

  iniciar() {
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
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: CONFIG.zoomMaximo
    }).addTo(this.mapa);

    // Máscara: cubre todo el mundo excepto el cuadrado jugable
    const [so, ne] = CONFIG.limites;
    const mundo = [[-89, -179], [-89, 179], [89, 179], [89, -179]];
    const zona = [[so[0], so[1]], [so[0], ne[1]], [ne[0], ne[1]], [ne[0], so[1]]];
    L.polygon([mundo, zona], {
      color: '#22293d', weight: 3, fillColor: '#141926', fillOpacity: 1, interactive: false
    }).addTo(this.mapa);
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
    // Las líneas guía de misiones siguen al jugador
    if (typeof Misiones !== 'undefined' && Misiones.actualizarLineas) Misiones.actualizarLineas();
  }
};
