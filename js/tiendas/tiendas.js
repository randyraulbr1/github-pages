// ============================================================
// TIENDAS
// Aparecen en el mapa. Solo se pueden abrir estando a menos de
// 20 metros. Permiten COMPRAR (precio completo) y VENDER
// (mitad de precio). Todo pasa por el sistema de dinero y
// queda registrado en los historiales.
// ============================================================
const Tiendas = {
  tiendaAbierta: null,
  pestana: 'comprar',

  iniciar() {
    for (const t of DATOS_TIENDAS) {
      const marcador = Mapa.crearMarcadorEmoji(t.posicion, t.icono);
      Mapa.registrarPunto({
        id: t.id,
        posicion: t.posicion,
        radio: CONFIG.distanciaInteraccion,
        marcador,
        alTocar: () => this.abrir(t)
      });
    }
    document.getElementById('pestana-comprar').addEventListener('click', () => this.cambiarPestana('comprar'));
    document.getElementById('pestana-vender').addEventListener('click', () => this.cambiarPestana('vender'));
  },

  abrir(tienda) {
    this.tiendaAbierta = tienda;
    this.pestana = 'comprar';
    document.getElementById('tienda-nombre').textContent = tienda.nombre;
    document.getElementById('ventana-tienda').classList.remove('oculto');
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
      for (const idItem of this.tiendaAbierta.vende) {
        const item = Items.obtener(idItem);
        cont.appendChild(this._fila(item, item.precio, 'Comprar',
          () => this.comprar(idItem), !Dinero.puedePagar(item.precio)));
      }
    } else {
      // Vender: todo lo que hay en la mochila (a mitad de precio)
      const vistos = new Set();
      let hayAlgo = false;
      for (const sl of Mochila.slots) {
        if (!sl || vistos.has(sl.id)) continue;
        vistos.add(sl.id);
        hayAlgo = true;
        const item = Items.obtener(sl.id);
        const precioVenta = Math.max(1, Math.floor(item.precio / 2));
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
      '<div class="precio">🪙 ' + precio + '</div></div>';
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

  async vender(idItem) {
    const item = Items.obtener(idItem);
    const precioVenta = Math.max(1, Math.floor(item.precio / 2));
    if (!Mochila.quitar(idItem, 1, 'Vendido')) return;
    await Dinero.ganar(precioVenta, 'Venta: ' + item.nombre + ' (' + this.tiendaAbierta.nombre + ')');
    Notificaciones.mostrar('🪙 Vendiste ' + item.nombre + ' por ' + precioVenta, 'exito');
    this.pintar();
  }
};
