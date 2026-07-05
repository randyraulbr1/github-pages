/**
 * Objetos del mapa compartidos por el servidor (todos ven lo mismo).
 */
const MundoOnline = {
  objetos: {},
  marcadores: {},
  activo: false,

  iniciar(lista) {
    if (!Mapa.mapa) return;
    this.activo = true;
    this._limpiar();
    for (const obj of (lista || [])) {
      this.objetos[obj.id] = obj;
      this._dibujar(obj);
    }
  },

  detener() {
    this.activo = false;
    this._limpiar();
    this.objetos = {};
  },

  _limpiar() {
    for (const id of Object.keys(this.marcadores)) {
      const m = this.marcadores[id];
      if (m && Mapa.mapa) Mapa.mapa.removeLayer(m);
    }
    this.marcadores = {};
  },

  _icono(obj) {
    const d = obj.data || {};
    const icon = d.icon || (obj.type === 'enemy' ? '👹' : obj.type === 'tree' ? '🌴' : '📦');
    if (obj.type === 'enemy') {
      const pct = Math.max(0, Math.min(100, Math.round((d.hp || 30) / (d.hpMax || d.hp || 30) * 100)));
      return L.divIcon({
        className: '',
        html: '<div class="marcador-enemigo-online">' +
          '<div class="meo-nombre">' + (d.nombre || 'Enemigo') + '</div>' +
          '<div class="meo-barra"><div class="meo-barra-fill" style="width:' + pct + '%"></div></div>' +
          '<span class="meo-icono">' + icon + '</span></div>',
        iconSize: [70, 52],
        iconAnchor: [35, 40]
      });
    }
    return L.divIcon({
      className: '',
      html: '<span class="icono-mapa icono-mundo-online">' + icon + '</span>',
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
  },

  _dibujar(obj) {
    if (!Mapa.mapa || obj.state === 'removed') return;
    let m = this.marcadores[obj.id];
    if (m) {
      m.setLatLng([obj.x, obj.y]);
      m.setIcon(this._icono(obj));
      return;
    }
    m = L.marker([obj.x, obj.y], {
      icon: this._icono(obj),
      interactive: obj.type !== 'tree',
      zIndexOffset: obj.type === 'enemy' ? 850 : 700
    }).addTo(Mapa.mapa);
    this.marcadores[obj.id] = m;
    this.objetos[obj.id] = obj;
  },

  actualizar(obj) {
    if (!obj || !obj.id) return;
    if (obj.state === 'removed') {
      this.quitar(obj.id);
      return;
    }
    this.objetos[obj.id] = obj;
    this._dibujar(obj);
  },

  quitar(id) {
    const m = this.marcadores[id];
    if (m && Mapa.mapa) Mapa.mapa.removeLayer(m);
    delete this.marcadores[id];
    delete this.objetos[id];
  },

  enemigosServidorActivos() {
    return this.activo && Object.values(this.objetos).some(o => o.type === 'enemy');
  }
};
