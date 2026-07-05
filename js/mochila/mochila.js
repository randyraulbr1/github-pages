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
    document.getElementById('btn-escribir-item').addEventListener('click', () => this.escribirNota());
    document.getElementById('btn-eliminar-item').addEventListener('click', () => this.eliminarSeleccionado());
    const btnEq = document.getElementById('btn-equipar-item');
    if (btnEq) btnEq.addEventListener('click', () => this.equiparSeleccionado());
    this.pintar();
  },

  abrir() {
    document.getElementById('ventana-mochila').classList.remove('oculto');
    this.ocultarDetalle();
    if (typeof Dinero !== 'undefined') Dinero.pintar();
    this.pintar();
  },

  guardar() {
    Guardado.datos.mochila = this.slots;
    Guardado.guardar();
    // El buscador de tesoros (u otro objeto detector) pudo entrar o salir
    if (typeof Tesoros !== 'undefined' && Tesoros.activos) Tesoros.refrescarBanner();
    if (typeof Admin !== 'undefined' && Admin.datos) Admin.refrescarVisibles();
    // Las misiones de entrega revisan si ya tienes los objetos
    if (typeof Misiones !== 'undefined' && Misiones.lista.length) Misiones.refrescar();
  },

  // ---------- CONSULTAS ----------
  contar(id) {
    return this.slots.reduce((s, sl) => s + (sl && sl.id === id ? sl.cantidad : 0), 0);
  },
  tieneItem(id) { return this.contar(id) > 0; },
  slotsLibres() { return this.slots.filter(s => !s).length; },

  /** Simula si caben todos los ítems de una recompensa sin modificar la mochila */
  puedeRecibirRecompensa(items) {
    if (!items || !items.length) return true;
    const sim = this.slots.map(s => (s ? { id: s.id, cantidad: s.cantidad } : null));
    for (const it of items) {
      const item = Items.obtener(it.id);
      if (!item) return false;
      let restante = it.cantidad || 1;
      const maxPila = item.unico ? 1 : (CONFIG.maxPila || 10);
      if (item.unico) {
        for (let i = 0; i < sim.length && restante > 0; i++) {
          if (!sim[i]) { sim[i] = { id: it.id, cantidad: 1 }; restante--; }
        }
      } else {
        for (const sl of sim) {
          if (restante <= 0) break;
          if (sl && sl.id === it.id && sl.cantidad < maxPila) {
            const cabe = Math.min(restante, maxPila - sl.cantidad);
            sl.cantidad += cabe;
            restante -= cabe;
          }
        }
        for (let i = 0; i < sim.length && restante > 0; i++) {
          if (!sim[i]) {
            const poner = Math.min(restante, maxPila);
            sim[i] = { id: it.id, cantidad: poner };
            restante -= poner;
          }
        }
      }
      if (restante > 0) return false;
    }
    return true;
  },

  armaEquipadaId() { return Guardado.datos.armaEquipada || null; },

  danoArmaEquipada() {
    const id = this.armaEquipadaId();
    if (!id || !this.tieneItem(id)) return 0;
    const item = Items.obtener(id);
    if (!item || item.tipo !== 'arma') return 0;
    if (!Items.armaAptaParaNivel(id, Vida.nivel)) return 0;
    return item.dano || 0;
  },

  equiparArma(id) {
    const item = Items.obtener(id);
    if (!item || item.tipo !== 'arma') return false;
    if (!this.tieneItem(id)) return false;
    if (!Items.armaAptaParaNivel(id, Vida.nivel)) {
      Notificaciones.mostrar('Nivel ' + (item.nivelMin || 1) + '–' + (item.nivelMax || 100) + ' para esta arma', 'alerta');
      return false;
    }
    Guardado.datos.armaEquipada = id;
    Guardado.guardar();
    this.pintar();
    return true;
  },

  desequiparArma() {
    Guardado.datos.armaEquipada = null;
    Guardado.guardar();
    this.pintar();
  },

  equiparSeleccionado() {
    const sl = this.slots[this.slotSeleccionado];
    if (!sl) return;
    if (this.armaEquipadaId() === sl.id) this.desequiparArma();
    else this.equiparArma(sl.id);
    this.mostrarDetalle(this.slotSeleccionado);
  },

  // ---------- AGREGAR / QUITAR ----------
  // Devuelve true si cupo. Registra en el historial de objetos.
  agregar(id, cantidad = 1, opciones = {}) {
    const item = Items.obtener(id);
    if (!item) return false;
    const maxPila = item.unico ? 1 : (CONFIG.maxPila || 10);

    let restante = cantidad;
    if (item.unico) {
      for (let i = 0; i < this.slots.length && restante > 0; i++) {
        if (!this.slots[i]) {
          this.slots[i] = { id, cantidad: 1 };
          if (opciones.texto) this.slots[i].texto = opciones.texto;
          restante--;
        }
      }
    } else {
      for (const sl of this.slots) {
        if (restante <= 0) break;
        if (sl && sl.id === id && sl.cantidad < maxPila) {
          const cabe = Math.min(restante, maxPila - sl.cantidad);
          sl.cantidad += cabe;
          restante -= cabe;
        }
      }
      for (let i = 0; i < this.slots.length && restante > 0; i++) {
        if (!this.slots[i]) {
          const poner = Math.min(restante, maxPila);
          this.slots[i] = { id, cantidad: poner };
          restante -= poner;
        }
      }
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
    if (this.armaEquipadaId() === id && !this.tieneItem(id)) this.desequiparArma();
    this.guardar();
    this.pintar();
    const item = Items.seguro(id);
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
        const item = Items.seguro(sl.id);
        celda.textContent = item.icono;
        if (this.armaEquipadaId() === sl.id) celda.classList.add('slot-equipado');
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
      const item = Items.seguro(this.slots[a.origen].id);
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
    const maxPila = CONFIG.maxPila || 10;
    if (d && d.id === o.id && !Items.seguro(o.id).unico) {
      const espacio = maxPila - d.cantidad;
      if (espacio <= 0) {
        this.slots[destino] = o;
        this.slots[origen] = d;
      } else {
        const mover = Math.min(o.cantidad, espacio);
        d.cantidad += mover;
        o.cantidad -= mover;
        if (o.cantidad <= 0) this.slots[origen] = null;
      }
    } else {
      this.slots[destino] = o;
      this.slots[origen] = d || null;
    }
    this.guardar();
    this.pintar();
  },

  _eliminarSlot(indice) {
    const sl = this.slots[indice];
    if (!sl) return;
    const item = Items.seguro(sl.id);
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
    const item = Items.seguro(sl.id);
    this.slotSeleccionado = indice;
    document.getElementById('detalle-item').classList.remove('oculto');
    document.getElementById('detalle-icono').textContent = item.icono;
    document.getElementById('detalle-nombre').textContent = item.nombre;
    // Las notas escritas muestran su texto al tocarlas (leer)
    document.getElementById('detalle-desc').textContent = sl.texto
      ? '«' + sl.texto + '»' : (item.desc || '');
    document.getElementById('detalle-cantidad').textContent = 'Cantidad: ' + sl.cantidad;
    const btnUsar = document.getElementById('btn-usar-item');
    const btnEq = document.getElementById('btn-equipar-item');
    btnUsar.style.display =
      (item.cura || item.curaVida || sl.id === 'cofre' || sl.id === 'llave_maestra') ? '' : 'none';
    if (btnEq) {
      if (item.tipo === 'arma') {
        btnEq.style.display = '';
        const eq = this.armaEquipadaId() === sl.id;
        btnEq.textContent = eq ? 'Quitar arma' : 'Equipar';
        const apta = Items.armaAptaParaNivel(sl.id, Vida.nivel);
        document.getElementById('detalle-desc').textContent = (sl.texto ? '«' + sl.texto + '»' : (item.desc || '')) +
          (item.dano ? ' · +' + item.dano + ' daño (nv ' + (item.nivelMin || 1) + '–' + (item.nivelMax || 100) + ')' : '') +
          (!apta ? ' · Nivel insuficiente' : '');
      } else {
        btnEq.style.display = 'none';
      }
    }
    // Escribir: solo con papel en la mano y un lápiz en la mochila
    document.getElementById('btn-escribir-item').style.display =
      (sl.id === 'papel' && this.tieneItem('lapiz')) ? '' : 'none';
  },

  // Escribir una nota: gasta 1 papel (el lápiz no se gasta)
  escribirNota() {
    const sl = this.slots[this.slotSeleccionado];
    if (!sl || sl.id !== 'papel' || !this.tieneItem('lapiz')) return;
    const texto = prompt('✏️ Escribe tu nota (máximo 200 letras):');
    if (texto === null || !texto.trim()) return;
    if (this.slotsLibres() === 0 && sl.cantidad > 1) {
      Notificaciones.mostrar('🎒 Necesitas una casilla libre para la nota', 'error');
      return;
    }
    this.quitar('papel', 1, 'Usado para escribir');
    this.agregar('nota_escrita', 1, { texto: texto.trim().slice(0, 200), silencioso: true });
    Notificaciones.mostrar('📝 Nota escrita y guardada en tu mochila', 'exito');
    this.ocultarDetalle();
  },

  ocultarDetalle() {
    this.slotSeleccionado = -1;
    document.getElementById('detalle-item').classList.add('oculto');
  },

  usarSeleccionado() {
    const sl = this.slots[this.slotSeleccionado];
    if (!sl) return;
    const item = Items.seguro(sl.id);
    if (sl.id === 'cofre') {
      this.ocultarDetalle();
      document.getElementById('ventana-mochila').classList.add('oculto');
      Cofres.usarCofreInventario();
      return;
    }
    if (sl.id === 'llave_maestra') {
      this.ocultarDetalle();
      document.getElementById('ventana-mochila').classList.add('oculto');
      Cofres.usarLlaveMaestra();
      return;
    }
    if (item.tipo === 'comida' && item.cura && !item.curaVida) {
      if (Vida.hambre >= CONFIG.hambreMaxima) {
        Notificaciones.mostrar('No tienes hambre', 'alerta');
        return;
      }
      this.quitar(sl.id, 1, 'Consumido');
      Vida.alimentar(item.cura, item.nombre);
      Vida.ganarXp(5, 'Comer');
    } else if (item.curaVida || (item.cura && item.tipo !== 'comida')) {
      if (Vida.actual >= CONFIG.vidaMaxima) {
        Notificaciones.mostrar('Ya tienes la vida al máximo', 'alerta');
        return;
      }
      this.quitar(sl.id, 1, 'Consumido');
      Vida.cambiar(item.curaVida || item.cura, item.nombre);
    } else if (item.cura) {
      if (Vida.actual >= CONFIG.vidaMaxima) {
        Notificaciones.mostrar('Ya tienes la vida al máximo', 'alerta');
        return;
      }
      this.quitar(sl.id, 1, 'Consumido');
      Vida.cambiar(item.cura, item.nombre);
    }
    if (this.slots[this.slotSeleccionado]) this.mostrarDetalle(this.slotSeleccionado);
    else this.ocultarDetalle();
  },

  eliminarSeleccionado() {
    if (this.slotSeleccionado >= 0) this._eliminarSlot(this.slotSeleccionado);
  }
};
