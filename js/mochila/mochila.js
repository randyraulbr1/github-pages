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
  _eliminarActivo: false,

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
    this.pintarArmaHud();
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
    this.guardar();
    this.pintar();
    return true;
  },

  desequiparArma() {
    Guardado.datos.armaEquipada = null;
    this.guardar();
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
  pintarArmaHud() {
    const id = this.armaEquipadaId();
    const tiene = id && this.tieneItem(id);
    const item = tiene ? Items.seguro(id) : null;
    const icon = item ? (item.icono || '🗡️') : null;
    const nombre = item ? item.nombre : 'Sin arma';
    const dano = item ? (item.dano || 0) : 0;
    const titulo = dano > 0 ? nombre + ' (+' + dano + ' daño)' : (tiene ? nombre : 'Sin arma');
    const hud = document.getElementById('hud-arma-equipada');
    const slot = document.getElementById('slot-arma-equipada');
    const status = document.getElementById('inv-weapon-status');
    if (hud) {
      hud.textContent = tiene ? (icon || '🗡️') : '✋';
      hud.title = tiene ? ('Arma: ' + titulo) : 'Sin arma equipada';
      hud.classList.toggle('equipada', !!tiene);
      hud.setAttribute('aria-hidden', tiene ? 'false' : 'true');
    }
    if (status) {
      status.textContent = tiene ? ('⚔️ ' + nombre + ' equipada') : '⚔️ Sin arma';
    }
    if (slot) {
      slot.classList.toggle('equipada', !!tiene);
      slot.innerHTML = tiene
        ? this._htmlItemDrag(item.icono, 1, false)
        : '<span class="inv-arma-placeholder">🗡️</span>';
      const dragEl = slot.querySelector('.inv-item-drag');
      if (dragEl) this._enlazarItemDrag(dragEl, 'equip');
      slot.title = titulo;
    }
  },

  _htmlItemDrag(icono, cantidad, conQty) {
    let h = '<div class="inv-item-drag"><span>' + (icono || '📦') + '</span>';
    if (conQty && cantidad > 1) h += '<span class="qty">' + cantidad + '</span>';
    h += '</div>';
    return h;
  },

  pintar() {
    const rejilla = document.getElementById('rejilla-mochila');
    if (!rejilla) return;
    const usados = this.slots.filter(Boolean).length;
    const cap = document.getElementById('inv-capacidad');
    if (cap) cap.textContent = usados + ' / ' + this.TOTAL_SLOTS;
    const dinInv = document.getElementById('inv-dinero-cantidad');
    if (dinInv && typeof Dinero !== 'undefined') dinInv.textContent = Dinero.saldo;
    rejilla.innerHTML = '';
    this.slots.forEach((sl, i) => {
      const celda = document.createElement('div');
      celda.className = 'slot';
      celda.dataset.indice = i;
      if (sl) {
        const item = Items.seguro(sl.id);
        celda.innerHTML = this._htmlItemDrag(item.icono, sl.cantidad, true);
        if (this.armaEquipadaId() === sl.id) celda.classList.add('slot-equipado');
        const dragEl = celda.querySelector('.inv-item-drag');
        if (dragEl) this._enlazarItemDrag(dragEl, i);
      }
      rejilla.appendChild(celda);
    });
    this.pintarArmaHud();
  },

  _enlazarItemDrag(el, origen) {
    if (!el || el._invDragOk) return;
    el._invDragOk = true;
    el.addEventListener('pointerdown', (ev) => this._prepararArrastre(ev, origen));
  },

  _prepararArrastre(ev, origen) {
    ev.preventDefault();
    const idxReal = origen === 'equip'
      ? this.slots.findIndex(s => s && s.id === this.armaEquipadaId())
      : origen;
    const sl = origen === 'equip'
      ? (this.armaEquipadaId() ? { id: this.armaEquipadaId(), cantidad: 1 } : null)
      : this.slots[idxReal];
    if (!sl || (origen !== 'equip' && idxReal < 0)) return;
    const item = Items.seguro(sl.id);
    const deleteZone = document.getElementById('inv-delete-zone');
    let dragStarted = false;
    let ghost = null;
    let lastEv = ev;
    const holdTimer = setTimeout(() => {
      if (dragStarted) return;
      dragStarted = true;
      this._eliminarActivo = false;
      this._arrastre = { activo: true, origen: idxReal, desdeEquip: origen === 'equip', item: sl };
      ghost = document.createElement('div');
      ghost.className = 'inv-ghost-item';
      ghost.textContent = item.icono;
      document.body.appendChild(ghost);
      if (deleteZone) deleteZone.classList.add('show');
      this._moverGhost(lastEv, ghost, deleteZone);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
    }, 350);

    const onMove = (e) => {
      e.preventDefault();
      lastEv = e;
      if (dragStarted) this._moverGhost(e, ghost, deleteZone);
    };

    const onUp = (e) => {
      clearTimeout(holdTimer);
      window.removeEventListener('pointermove', onMove);
      if (!dragStarted) {
        if (origen === 'equip') {
          if (this.armaEquipadaId()) this.desequiparArma();
          return;
        }
        if (origen !== 'equip') this.mostrarDetalle(origen);
        return;
      }
      this._finalizarArrastre(e, idxReal, ghost, deleteZone);
    };

    const cancelHold = () => {
      clearTimeout(holdTimer);
      if (!dragStarted) window.removeEventListener('pointermove', savePtr);
    };
    const savePtr = (e) => { e.preventDefault(); lastEv = e; };
    window.addEventListener('pointermove', savePtr);
    window.addEventListener('pointerup', cancelHold, { once: true });
  },

  _sobreZonaEliminar(ev, deleteZone) {
    if (!deleteZone || !deleteZone.classList.contains('show')) return false;
    const r = deleteZone.getBoundingClientRect();
    const pad = 8;
    return ev.clientX >= r.left - pad && ev.clientX <= r.right + pad &&
      ev.clientY >= r.top - pad && ev.clientY <= r.bottom + pad;
  },

  _moverGhost(ev, ghost, deleteZone) {
    if (!ghost) return;
    ghost.style.left = ev.clientX + 'px';
    ghost.style.top = ev.clientY + 'px';
    document.querySelectorAll('.slot.drag-over, .inv-equip-slot.drag-over')
      .forEach(s => s.classList.remove('drag-over'));
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const slot = el?.closest?.('.slot');
    if (slot) slot.classList.add('drag-over');
    const sobreEliminar = this._sobreZonaEliminar(ev, deleteZone);
    this._eliminarActivo = sobreEliminar;
    if (deleteZone) deleteZone.classList.toggle('active', sobreEliminar);
  },

  _finalizarArrastre(ev, origen, ghost, deleteZone) {
    const desdeEquip = this._arrastre?.desdeEquip;
    if (ghost) ghost.remove();
    if (deleteZone) deleteZone.classList.remove('show', 'active');
    document.querySelectorAll('.slot.drag-over, .inv-equip-slot.drag-over')
      .forEach(s => s.classList.remove('drag-over'));
    const eliminar = this._eliminarActivo || this._sobreZonaEliminar(ev, deleteZone);
    this._eliminarActivo = false;
    this._arrastre = null;

    if (eliminar) {
      if (desdeEquip) {
        if (origen >= 0 && this.slots[origen]) this._eliminarSlot(origen);
        else this.desequiparArma();
      } else if (origen >= 0) {
        this._eliminarSlot(origen);
      }
      this.pintar();
      return;
    }

    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const targetSlot = el?.closest('.slot');
    if (!targetSlot) {
      this.pintar();
      return;
    }
    if (targetSlot.classList.contains('inv-equip-slot') || targetSlot.dataset.type === 'weapon') {
      if (desdeEquip) {
        this.pintar();
        return;
      }
      const sl = this.slots[origen];
      if (sl && Items.seguro(sl.id).tipo === 'arma') this.equiparArma(sl.id);
      else this.pintar();
      return;
    }
    const destino = parseInt(targetSlot.dataset.indice, 10);
    if (!isNaN(destino) && destino !== origen) this.moverSlot(origen, destino);
    else this.pintar();
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
    if (this.armaEquipadaId() === sl.id) this.desequiparArma();
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
    else if (typeof Notificaciones !== 'undefined') {
      Notificaciones.mostrar('Toca un objeto de la mochila primero', 'alerta', 2500);
    }
  }
};
