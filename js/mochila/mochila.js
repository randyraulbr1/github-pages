// ============================================================
// MOCHILA — 25 casillas
//  - Los items se pueden arrastrar entre casillas (táctil y ratón)
//  - La posición de cada item se guarda tal cual la dejes
//  - Muestra la cantidad de cada item apilado
//  - Se pueden intercambiar, mover y eliminar (papelera)
//  - Tocar un item muestra sus datos y permite Usar / Eliminar
// ============================================================
const Mochila = {
  TOTAL_SLOTS: 25,
  slots: [],            // cada slot: null o { id: 'sardina', cantidad: 3 }
  slotSeleccionado: -1,
  _arrastre: null,

  iniciar() {
    if (!Guardado.datos.mochila) {
      Guardado.datos.mochila = new Array(this.TOTAL_SLOTS).fill(null);
      // Objetos con los que empieza el jugador
      Guardado.datos.mochila[0] = { id: 'agua', cantidad: 2 };
      Guardado.datos.mochila[1] = { id: 'pan', cantidad: 1 };
    }
    this.slots = Guardado.datos.mochila;

    document.getElementById('btn-mochila').addEventListener('click', () => this.abrir());
    document.getElementById('btn-usar-item').addEventListener('click', () => this.usarSeleccionado());
    document.getElementById('btn-eliminar-item').addEventListener('click', () => this.eliminarSeleccionado());
    this.pintar();
  },

  abrir() {
    document.getElementById('ventana-mochila').classList.remove('oculto');
    this.ocultarDetalle();
    this.pintar();
  },

  guardar() {
    Guardado.datos.mochila = this.slots;
    Guardado.guardar();
    // El buscador de tesoros puede haber entrado o salido de la mochila
    if (typeof Tesoros !== 'undefined' && Tesoros.activos.length) Tesoros.refrescarBanner();
  },

  // ---------- CONSULTAS ----------
  contar(id) {
    return this.slots.reduce((s, sl) => s + (sl && sl.id === id ? sl.cantidad : 0), 0);
  },
  tieneItem(id) { return this.contar(id) > 0; },
  slotsLibres() { return this.slots.filter(s => !s).length; },

  // ---------- AGREGAR / QUITAR ----------
  // Devuelve true si cupo. Registra en el historial de objetos.
  agregar(id, cantidad = 1, opciones = {}) {
    const item = Items.obtener(id);
    if (!item) return false;

    let restante = cantidad;
    // Primero apilar sobre casillas que ya tengan el mismo item
    for (const sl of this.slots) {
      if (restante <= 0) break;
      if (sl && sl.id === id) { sl.cantidad += restante; restante = 0; }
    }
    // Luego usar casillas vacías
    for (let i = 0; i < this.slots.length && restante > 0; i++) {
      if (!this.slots[i]) { this.slots[i] = { id, cantidad: restante }; restante = 0; }
    }
    if (restante > 0) {
      Notificaciones.mostrar('🎒 Mochila llena, no cabe: ' + item.nombre, 'error');
      return false;
    }

    this.guardar();
    this.pintar();
    Historial.registrar('objetos', { detalle: 'Obtenido: ' + item.nombre, monto: cantidad });
    if (!opciones.silencioso) {
      Notificaciones.mostrar(item.icono + ' Obtuviste ' + item.nombre + ' x' + cantidad, 'exito');
    }
    return true;
  },

  // Devuelve true si había suficiente y se quitó
  quitar(id, cantidad = 1, motivo = 'Usado') {
    if (this.contar(id) < cantidad) return false;
    let restante = cantidad;
    for (let i = 0; i < this.slots.length && restante > 0; i++) {
      const sl = this.slots[i];
      if (sl && sl.id === id) {
        const q = Math.min(sl.cantidad, restante);
        sl.cantidad -= q; restante -= q;
        if (sl.cantidad <= 0) this.slots[i] = null;
      }
    }
    this.guardar();
    this.pintar();
    const item = Items.obtener(id);
    Historial.registrar('objetos', { detalle: motivo + ': ' + item.nombre, monto: -cantidad });
    return true;
  },

  // ---------- PINTADO ----------
  pintar() {
    const rejilla = document.getElementById('rejilla-mochila');
    rejilla.innerHTML = '';
    this.slots.forEach((sl, i) => {
      const celda = document.createElement('div');
      celda.className = 'slot';
      celda.dataset.indice = i;
      if (sl) {
        const item = Items.obtener(sl.id);
        celda.textContent = item.icono;
        const cant = document.createElement('span');
        cant.className = 'cantidad';
        cant.textContent = sl.cantidad;
        celda.appendChild(cant);
        celda.addEventListener('pointerdown', ev => this._empezarArrastre(ev, i));
      }
      rejilla.appendChild(celda);
    });
  },

  // ---------- ARRASTRAR Y SOLTAR (funciona con dedo y ratón) ----------
  _empezarArrastre(ev, indice) {
    ev.preventDefault();
    const sl = this.slots[indice];
    if (!sl) return;
    this._arrastre = {
      origen: indice,
      movio: false,
      x0: ev.clientX, y0: ev.clientY,
      fantasma: null
    };
    const mover = e => this._moverArrastre(e);
    const soltar = e => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      this._soltarArrastre(e);
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
  },

  _moverArrastre(ev) {
    const a = this._arrastre;
    if (!a) return;
    if (!a.movio && Math.hypot(ev.clientX - a.x0, ev.clientY - a.y0) < 8) return;
    if (!a.movio) {
      a.movio = true;
      const item = Items.obtener(this.slots[a.origen].id);
      a.fantasma = document.createElement('div');
      a.fantasma.id = 'item-fantasma';
      a.fantasma.textContent = item.icono;
      document.body.appendChild(a.fantasma);
    }
    a.fantasma.style.left = ev.clientX + 'px';
    a.fantasma.style.top = ev.clientY + 'px';

    // Resaltar la casilla o papelera bajo el dedo
    document.querySelectorAll('.slot.destino, #papelera.destino')
      .forEach(el => el.classList.remove('destino'));
    const bajo = this._elementoBajo(ev.clientX, ev.clientY);
    if (bajo) bajo.classList.add('destino');
  },

  _elementoBajo(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    return el.closest('.slot') || el.closest('#papelera');
  },

  _soltarArrastre(ev) {
    const a = this._arrastre;
    this._arrastre = null;
    if (!a) return;
    if (a.fantasma) a.fantasma.remove();
    document.querySelectorAll('.slot.destino, #papelera.destino')
      .forEach(el => el.classList.remove('destino'));

    if (!a.movio) {
      // Fue un toque simple: mostrar detalle del item
      this.mostrarDetalle(a.origen);
      return;
    }

    const bajo = this._elementoBajo(ev.clientX, ev.clientY);
    if (!bajo) return;

    if (bajo.id === 'papelera') {
      this._eliminarSlot(a.origen);
      return;
    }

    const destino = parseInt(bajo.dataset.indice, 10);
    if (isNaN(destino) || destino === a.origen) return;
    this.moverSlot(a.origen, destino);
  },

  // Mover / intercambiar / apilar entre dos casillas
  moverSlot(origen, destino) {
    const o = this.slots[origen];
    const d = this.slots[destino];
    if (!o) return;
    if (d && d.id === o.id) {
      d.cantidad += o.cantidad;            // apilar iguales
      this.slots[origen] = null;
    } else {
      this.slots[destino] = o;             // mover o intercambiar
      this.slots[origen] = d || null;
    }
    this.guardar();
    this.pintar();
  },

  _eliminarSlot(indice) {
    const sl = this.slots[indice];
    if (!sl) return;
    const item = Items.obtener(sl.id);
    if (!confirm('¿Eliminar ' + item.nombre + ' x' + sl.cantidad + '?')) { this.pintar(); return; }
    this.slots[indice] = null;
    this.guardar();
    this.pintar();
    this.ocultarDetalle();
    Historial.registrar('objetos', { detalle: 'Eliminado: ' + item.nombre, monto: -sl.cantidad });
    Notificaciones.mostrar('🗑️ ' + item.nombre + ' eliminado', 'alerta');
  },

  // ---------- PANEL DE DETALLE ----------
  mostrarDetalle(indice) {
    const sl = this.slots[indice];
    if (!sl) return;
    const item = Items.obtener(sl.id);
    this.slotSeleccionado = indice;
    document.getElementById('detalle-item').classList.remove('oculto');
    document.getElementById('detalle-icono').textContent = item.icono;
    document.getElementById('detalle-nombre').textContent = item.nombre;
    document.getElementById('detalle-desc').textContent = item.desc || '';
    document.getElementById('detalle-cantidad').textContent = 'Cantidad: ' + sl.cantidad;
    document.getElementById('btn-usar-item').style.display = item.cura ? '' : 'none';
  },

  ocultarDetalle() {
    this.slotSeleccionado = -1;
    document.getElementById('detalle-item').classList.add('oculto');
  },

  usarSeleccionado() {
    const sl = this.slots[this.slotSeleccionado];
    if (!sl) return;
    const item = Items.obtener(sl.id);
    if (!item.cura) return;
    if (Vida.actual >= CONFIG.vidaMaxima) {
      Notificaciones.mostrar('Ya tienes la vida al máximo', 'alerta');
      return;
    }
    this.quitar(sl.id, 1, 'Consumido');
    Vida.cambiar(item.cura, item.nombre);
    if (this.slots[this.slotSeleccionado]) this.mostrarDetalle(this.slotSeleccionado);
    else this.ocultarDetalle();
  },

  eliminarSeleccionado() {
    if (this.slotSeleccionado >= 0) this._eliminarSlot(this.slotSeleccionado);
  }
};
