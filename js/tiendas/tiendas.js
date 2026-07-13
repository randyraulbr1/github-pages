// ============================================================
// TIENDAS
// Aparecen en el mapa. Solo se pueden abrir estando a menos de
// 20 metros. Permiten COMPRAR (precio completo) y VENDER
// (mitad de precio; tiendas admin: 30% del precio de tienda).
// Todo pasa por el sistema de dinero y
// queda registrado en los historiales.
// ============================================================
const Tiendas = {
  tiendaAbierta: null,
  pestana: 'comprar',
  _marcadoresAdmin: {},
  _listaAdmin: [],

  iniciar() {
    for (const t of DATOS_TIENDAS) {
      if (Admin.eliminado(t.id)) continue;
      Admin.pos(t.id, t.posicion);
      const marcador = Mapa.crearMarcadorEmoji(t.posicion, t.icono);
      Mapa.registrarPunto({
        id: t.id,
        posicion: t.posicion,
        radio: CONFIG.distanciaInteraccion,
        marcador,
        alTocar: () => this.abrir(t)
      });
    }
    this._cargarAdmin();
    document.getElementById('pestana-comprar').addEventListener('click', () => this.cambiarPestana('comprar'));
    document.getElementById('pestana-vender').addEventListener('click', () => this.cambiarPestana('vender'));
  },

  _esTiendaAdmin(t) {
    return !!(t && Array.isArray(t.vende) && t.vende.length && typeof t.vende[0] === 'object');
  },

  _estadoStock() {
    if (!Admin.publicado.tiendasStock) Admin.publicado.tiendasStock = {};
    return Admin.publicado.tiendasStock;
  },

  _stockDisponible(tiendaId, entry) {
    if (entry.infinito) return Infinity;
    const st = this._estadoStock();
    const key = tiendaId + '|' + entry.id;
    if (st[key] !== undefined) return st[key];
    return entry.stock || 0;
  },

  _precioVenta(itemId) {
    const item = Items.seguro(itemId);
    if (!this.tiendaAbierta || !this._esTiendaAdmin(this.tiendaAbierta)) {
      return Math.max(1, Math.floor(item.precio / 2));
    }
    const entry = this.tiendaAbierta.vende.find(e => e.id === itemId);
    const base = entry ? entry.precio : item.precio;
    return Math.max(1, Math.floor(base * 0.3));
  },

  // Radio de interacción de la tienda: usa el propio si viene del editor,
  // si no el global del juego.
  _radioTienda(t) {
    return (typeof t.radio === 'number' && t.radio > 0) ? t.radio : CONFIG.distanciaInteraccion;
  },

  // Una tienda desactivada desde el editor (activo === false) no se muestra.
  _tiendaVisible(t) {
    return !Admin.eliminado(t.id) && t.activo !== false;
  },

  _cargarAdmin() {
    if (typeof Admin === 'undefined' || !Admin.tiendasAdminTodas) return;
    const nuevas = Admin.tiendasAdminTodas();
    const activas = nuevas.filter(t => this._tiendaVisible(t));
    const idsNuevos = new Set(activas.map(t => t.id));
    // Quita marcadores de tiendas eliminadas o desactivadas.
    for (const id of Object.keys(this._marcadoresAdmin)) {
      if (!idsNuevos.has(id)) {
        if (this._marcadoresAdmin[id].remove) this._marcadoresAdmin[id].remove();
        delete this._marcadoresAdmin[id];
        const idx = Mapa.puntosInteractivos.findIndex(x => x.id === id);
        if (idx >= 0) Mapa.puntosInteractivos.splice(idx, 1);
      }
    }
    this._listaAdmin = activas;
    for (const t of this._listaAdmin) {
      const pos = t.posicion || t.pos;
      if (!pos) continue;
      Admin.pos(t.id, pos);
      if (this._marcadoresAdmin[t.id]) {
        this._marcadoresAdmin[t.id].setLatLng(pos);
        const p = Mapa.puntosInteractivos.find(x => x.id === t.id);
        if (p) {
          p.posicion[0] = pos[0];
          p.posicion[1] = pos[1];
          p.radio = this._radioTienda(t);
        }
        continue;
      }
      const marcador = Mapa.crearMarcadorEmoji(pos, t.icono || '🏪');
      this._marcadoresAdmin[t.id] = marcador;
      Mapa.registrarPunto({
        id: t.id,
        posicion: pos,
        radio: this._radioTienda(t),
        marcador,
        alTocar: () => this.abrir(t)
      });
    }
  },

  agregarAdmin(t) {
    const pos = t.posicion || t.pos;
    if (!pos) return;
    // Si llega desactivada, tratarla como recarga (quita marcador si existía).
    if (!this._tiendaVisible(t)) { this._cargarAdmin(); return; }
    Admin.pos(t.id, pos);
    if (!this._listaAdmin.find(x => x.id === t.id)) this._listaAdmin.push(t);
    if (this._marcadoresAdmin[t.id]) return;
    const marcador = Mapa.crearMarcadorEmoji(pos, t.icono || '🏪');
    this._marcadoresAdmin[t.id] = marcador;
    Mapa.registrarPunto({
      id: t.id,
      posicion: pos,
      radio: this._radioTienda(t),
      marcador,
      alTocar: () => this.abrir(t)
    });
  },

  refrescarAdmin() {
    this._cargarAdmin();
    if (this.tiendaAbierta && this._esTiendaAdmin(this.tiendaAbierta)) this.pintar();
  },

  abrir(tienda) {
    this.tiendaAbierta = tienda;
    this.pestana = 'comprar';
    const nombre = (tienda.icono ? tienda.icono + ' ' : '') + (tienda.nombre || 'Tienda');
    document.getElementById('tienda-nombre').textContent = nombre;
    if (typeof UIManager !== 'undefined') UIManager.abrir('ventana-tienda');
    else document.getElementById('ventana-tienda').classList.remove('oculto');
    this.cambiarPestana('comprar');
  },

  cambiarPestana(cual) {
    this.pestana = cual;
    document.getElementById('pestana-comprar').classList.toggle('activa', cual === 'comprar');
    document.getElementById('pestana-vender').classList.toggle('activa', cual === 'vender');
    this.pintar();
  },

  pintar() {
    const cont = document.getElementById('tienda-lista');
    cont.innerHTML = '';
    if (!this.tiendaAbierta) return;

    if (this.pestana === 'comprar') {
      if (this._esTiendaAdmin(this.tiendaAbierta)) {
        for (const entry of this.tiendaAbierta.vende) {
          const item = Items.seguro(entry.id);
          const stock = this._stockDisponible(this.tiendaAbierta.id, entry);
          const agotado = !entry.infinito && stock <= 0;
          const etiqueta = agotado ? 'Agotado' : (entry.infinito ? 'Comprar' : 'Comprar (' + stock + ')');
          cont.appendChild(this._fila(item, entry.precio, etiqueta,
            () => this.comprarAdmin(entry), !Dinero.puedePagar(entry.precio) || agotado));
        }
        return;
      }
      for (const idItem of this.tiendaAbierta.vende) {
        const item = Items.obtener(idItem);
        cont.appendChild(this._fila(item, item.precio, 'Comprar',
          () => this.comprar(idItem), !Dinero.puedePagar(item.precio)));
      }
    } else {
      const vistos = new Set();
      let hayAlgo = false;
      for (const sl of Mochila.slots) {
        if (!sl || vistos.has(sl.id)) continue;
        vistos.add(sl.id);
        hayAlgo = true;
        const item = Items.seguro(sl.id);
        const precioVenta = this._precioVenta(sl.id);
        cont.appendChild(this._fila(item, precioVenta, 'Vender (' + Mochila.contar(sl.id) + ')',
          () => this.vender(sl.id), false));
      }
      if (!hayAlgo) cont.innerHTML = '<div class="tienda-vacia">Tu mochila está vacía</div>';
    }
  },

  _fila(item, precio, textoBoton, accion, deshabilitado) {
    const fila = document.createElement('div');
    fila.className = 'fila-tienda';
    fila.innerHTML =
      '<span class="icono">' + item.icono + '</span>' +
      '<div class="datos"><div class="nombre">' + item.nombre + '</div>' +
      '<div class="precio">$ ' + precio + '</div></div>';
    const boton = document.createElement('button');
    boton.textContent = textoBoton;
    boton.disabled = deshabilitado;
    boton.addEventListener('click', accion);
    fila.appendChild(boton);
    return fila;
  },

  async comprar(idItem) {
    const item = Items.obtener(idItem);
    if (Mochila.slotsLibres() === 0 && !Mochila.tieneItem(idItem)) {
      Notificaciones.mostrar('🎒 No tienes espacio en la mochila', 'error');
      return;
    }
    const pagado = await Dinero.gastar(item.precio, 'Compra: ' + item.nombre + ' (' + this.tiendaAbierta.nombre + ')');
    if (!pagado) return;
    Mochila.agregar(idItem, 1, { silencioso: true });
    Notificaciones.mostrar(item.icono + ' Compraste ' + item.nombre, 'exito');
    Misiones.evento('compra', idItem);
    this.pintar();
  },

  async comprarAdmin(entry) {
    const t = this.tiendaAbierta;
    const item = Items.seguro(entry.id);
    if (!entry.infinito && this._stockDisponible(t.id, entry) <= 0) {
      Notificaciones.mostrar('Agotado en esta tienda', 'alerta');
      return;
    }
    if (typeof Multijugador !== 'undefined' && Multijugador.activo && CONFIG.servidorOnline) {
      const pos = typeof GPS !== 'undefined' ? GPS.posicion : null;
      const res = await Multijugador.comprarEnTienda(t.id, entry.id, pos);
      if (!res?.ok) {
        Notificaciones.mostrar('❌ ' + Utilidades.mensajeAmigable(res?.error, 'No se pudo comprar'), 'error', 4000);
        return;
      }
      Notificaciones.mostrar(item.icono + ' Compraste ' + item.nombre, 'exito');
      Misiones.evento('compra', entry.id);
      this.pintar();
      return;
    }
    if (Mochila.slotsLibres() === 0 && !Mochila.tieneItem(entry.id)) {
      Notificaciones.mostrar('🎒 No tienes espacio en la mochila', 'error');
      return;
    }
    const pagado = await Dinero.gastar(entry.precio, 'Compra: ' + item.nombre + ' (' + t.nombre + ')');
    if (!pagado) return;
    Mochila.agregar(entry.id, 1, { silencioso: true });
    if (!entry.infinito) {
      const st = this._estadoStock();
      const key = t.id + '|' + entry.id;
      st[key] = Math.max(0, this._stockDisponible(t.id, entry) - 1);
      if (typeof Admin !== 'undefined') {
        Admin.guardar();
        Admin._publicarParaTodos(true);
      }
    }
    Notificaciones.mostrar(item.icono + ' Compraste ' + item.nombre, 'exito');
    Misiones.evento('compra', entry.id);
    this.pintar();
  },

  async vender(idItem) {
    const item = Items.seguro(idItem);
    const precioVenta = this._precioVenta(idItem);
    const t = this.tiendaAbierta;
    if (typeof Multijugador !== 'undefined' && Multijugador.activo && CONFIG.servidorOnline) {
      const pos = typeof GPS !== 'undefined' ? GPS.posicion : null;
      const res = await Multijugador.venderEnTienda(t?.id || '', idItem, pos);
      if (!res?.ok) {
        Notificaciones.mostrar('❌ ' + Utilidades.mensajeAmigable(res?.error, 'No se pudo vender'), 'error', 4000);
        return;
      }
      Notificaciones.mostrar('💵 Vendiste ' + item.nombre + ' por $' + (res.precio || precioVenta), 'exito');
      this.pintar();
      return;
    }
    const esAdmin = t && this._esTiendaAdmin(t);
    if (!Mochila.quitar(idItem, 1, 'Vendido')) return;
    await Dinero.ganar(precioVenta, 'Venta: ' + item.nombre + ' (' + this.tiendaAbierta.nombre + ')');
    if (esAdmin) {
      const entry = this.tiendaAbierta.vende.find(e => e.id === idItem);
      if (entry && !entry.infinito) {
        const st = this._estadoStock();
        const key = this.tiendaAbierta.id + '|' + entry.id;
        st[key] = this._stockDisponible(this.tiendaAbierta.id, entry) + 1;
        if (typeof Admin !== 'undefined') {
          Admin.guardar();
          Admin._publicarParaTodos(true);
        }
      }
    }
    Notificaciones.mostrar('💵 Vendiste ' + item.nombre + ' por $' + precioVenta, 'exito');
    this.pintar();
  }
};
