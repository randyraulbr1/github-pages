// ============================================================
// MOCHILA — solo arrastrar para mover; consumibles al soltar en ✔️ / TODO
// ============================================================
const Mochila = {
  TOTAL_SLOTS: 25,
  slots: [],
  slotSeleccionado: -1,
  selected: null,
  dragging: null,
  dragFrom: null,
  ghost: null,
  isDragging: false,
  hoverTarget: null,
  _dragLastX: null,
  _dragLastY: null,

  iniciar() {
    if (!Guardado.datos.mochila) {
      Guardado.datos.mochila = new Array(this.TOTAL_SLOTS).fill(null);
      Guardado.datos.mochila[0] = { id: 'agua', cantidad: 2 };
      Guardado.datos.mochila[1] = { id: 'pan', cantidad: 1 };
    }
    this.slots = Guardado.datos.mochila;
    this._asegurarEquipoEquipado();
    this._sanearArmaEquipada();
    this._sanearEquipoEquipado();
    this._sincronizarArmaEquipada();
    this._sincronizarEquipoEquipado();

    document.getElementById('btn-mochila').addEventListener('click', () => this.abrir());
    const btnUsar = document.getElementById('btn-usar-item');
    if (btnUsar) btnUsar.addEventListener('click', () => this.usarSeleccionado());
    const btnEsc = document.getElementById('btn-escribir-item');
    if (btnEsc) btnEsc.addEventListener('click', () => this.escribirNota());
    const btnDel = document.getElementById('btn-eliminar-item');
    if (btnDel) btnDel.addEventListener('click', () => this.eliminarSeleccionado());
    const btnEq = document.getElementById('btn-equipar-item');
    if (btnEq) btnEq.addEventListener('click', () => this.equiparSeleccionado());

    document.getElementById('inv-confirm-cancel')?.addEventListener('click', () => this._resolverConfirm(false));
    document.getElementById('inv-confirm-ok')?.addEventListener('click', () => this._resolverConfirm(true));
    document.querySelectorAll('[data-cierra="ventana-mochila"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setTimeout(() => this._notificarCambioArma(), 0);
      });
    });

    window.addEventListener('pointercancel', () => this._cleanupDrag());
    window.addEventListener('blur', () => {
      if (this.isDragging) this._cleanupDrag();
    });

    this.pintar();
    this._notificarCambioArma();
  },

  _cerrarVentana() {
    if (typeof UIManager !== 'undefined') UIManager.cerrar('ventana-mochila');
    else document.getElementById('ventana-mochila')?.classList.add('oculto');
  },

  abrir() {
    if (typeof UIManager !== 'undefined') UIManager.abrir('ventana-mochila');
    else document.getElementById('ventana-mochila').classList.remove('oculto');
    this.selected = null;
    this.slotSeleccionado = -1;
    this._cleanupDrag();
    if (typeof Dinero !== 'undefined') Dinero.pintar();
    this.pintar();
  },

  guardar() {
    const cambioArma = this._sanearArmaEquipada();
    Guardado.datos.mochila = this.slots;
    if (Guardado.datos) Guardado.datos._invPendienteSync = Date.now();
    Guardado.guardar();
    if (typeof Guardado._programarSyncInventario === 'function') {
      Guardado._programarSyncInventario();
    }
    if (typeof Tesoros !== 'undefined' && Tesoros.activos) Tesoros.refrescarBanner();
    if (typeof Admin !== 'undefined' && Admin.datos) Admin.refrescarVisibles();
    if (typeof Misiones !== 'undefined' && Misiones.lista.length) Misiones.refrescar();
    if (cambioArma) this._notificarCambioArma();
  },

  _statsConsumo() {
    return {
      hambre: Vida.hambre,
      hambreMax: Vida.hambreMaxima(),
      vida: Vida.actual,
      vidaMax: Vida.vidaMaxima()
    };
  },

  _toast(texto) {
    const el = document.getElementById('inv-toast');
    if (!el) {
      if (typeof Notificaciones !== 'undefined') Notificaciones.mostrar(texto, 'exito', 1300);
      return;
    }
    el.textContent = texto;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), 1300);
  },

  contar(id) {
    let total = this.slots.reduce((s, sl) => s + (sl && sl.id === id ? sl.cantidad : 0), 0);
    if (this.armaEquipadaId() === id) total += 1;
    if (this._idsEquipoRealmenteEquipado().includes(id)) total += 1;
    return total;
  },
  tieneItem(id) { return this.contar(id) > 0; },
  slotsLibres() { return this.slots.filter(s => !s).length; },

  _primerSlotLibre() {
    return this.slots.findIndex(s => !s);
  },

  _indiceEnMochila(id) {
    return this.slots.findIndex(s => s && s.id === id);
  },

  /** Si el arma figura en la mochila, no puede estar equipada (HUD = mano). */
  _sanearArmaEquipada() {
    const id = this.armaEquipadaId();
    if (!id) return false;
    if (this._indiceEnMochila(id) >= 0) {
      Guardado.datos.armaEquipada = null;
      return true;
    }
    return false;
  },

  /** Arma equipada de verdad: flag activo y no está en ningún slot de mochila. */
  _armaRealmenteEquipada() {
    this._sanearArmaEquipada();
    const id = this.armaEquipadaId();
    if (!id) return null;
    const item = Items.seguro(id);
    if (!Items.esArma(item)) {
      Guardado.datos.armaEquipada = null;
      return null;
    }
    return id;
  },

  _refrescarTrasGuardado() {
    this.slots = Guardado.datos.mochila || this.slots;
    this._notificarCambioEquipo();
  },

  _asegurarEquipoEquipado() {
    if (!Guardado.datos.equipoEquipado || typeof Guardado.datos.equipoEquipado !== 'object') {
      Guardado.datos.equipoEquipado = { casco: null, chaleco: null, botas: null, ropa: null };
    }
    for (const r of Items.RANURAS_EQUIPO) {
      if (Guardado.datos.equipoEquipado[r] === undefined) Guardado.datos.equipoEquipado[r] = null;
    }
  },

  _ranuraDesdeSlot(slotKey) {
    return Items.SLOT_A_RANURA[slotKey] || null;
  },

  equipoEnRanura(ranura) {
    this._asegurarEquipoEquipado();
    return Guardado.datos.equipoEquipado[ranura] || null;
  },

  _idsEquipoRealmenteEquipado() {
    this._sanearEquipoEquipado();
    return Items.RANURAS_EQUIPO.map((r) => this.equipoEnRanura(r)).filter(Boolean);
  },

  _sanearEquipoEquipado() {
    this._asegurarEquipoEquipado();
    const eq = Guardado.datos.equipoEquipado;
    let cambio = false;
    for (const ranura of Items.RANURAS_EQUIPO) {
      const id = eq[ranura];
      if (!id) continue;
      if (this._indiceEnMochila(id) >= 0) {
        eq[ranura] = null;
        cambio = true;
        continue;
      }
      const item = Items.obtener(id);
      if (!item || Items.ranuraDeItem(item) !== ranura) {
        eq[ranura] = null;
        cambio = true;
      }
    }
    return cambio;
  },

  _sincronizarEquipoEquipado() {
    this._asegurarEquipoEquipado();
    for (const ranura of Items.RANURAS_EQUIPO) {
      const id = this.equipoEnRanura(ranura);
      if (!id) continue;
      const idx = this._indiceEnMochila(id);
      if (idx >= 0) this.slots[idx] = null;
    }
  },

  bonusesEquipoActivos() {
    this._sanearEquipoEquipado();
    const ids = [];
    const nv = typeof Vida !== 'undefined' ? Vida.nivel : 1;
    for (const ranura of Items.RANURAS_EQUIPO) {
      const id = this.equipoEnRanura(ranura);
      if (!id) continue;
      const item = Items.obtener(id);
      if (!item || !Items.equipoAptoParaNivel(item, nv)) continue;
      ids.push(id);
    }
    return Items.calcularBonusesEquipo(ids);
  },

  equiparPieza(id, ranura, slotOrigen) {
    const item = Items.obtener(id);
    if (!item || Items.ranuraDeItem(item) !== ranura) return false;
    if (!Items.equipoAptoParaNivel(item, Vida.nivel)) {
      this._toast('Nivel ' + (item.nivelMin || 1) + '–' + (item.nivelMax || 100) + ' para este equipo');
      return false;
    }

    let idx = typeof slotOrigen === 'number' ? slotOrigen : this._indiceEnMochila(id);
    if (idx < 0 || !this.slots[idx] || this.slots[idx].id !== id) return false;

    const prev = this.equipoEnRanura(ranura);
    if (prev && prev !== id) this.desequiparPieza(ranura);

    this.slots[idx] = null;
    Guardado.datos.equipoEquipado[ranura] = id;
    this.guardar();
    this._notificarCambioEquipo();
    return true;
  },

  desequiparPieza(ranura, slotDestino) {
    const id = this.equipoEnRanura(ranura);
    if (!id) return false;

    let dest = typeof slotDestino === 'number' ? slotDestino : this._primerSlotLibre();
    if (dest < 0) {
      this._toast('🎒 No hay espacio para guardar el equipo');
      return false;
    }

    const anterior = this.slots[dest];
    Guardado.datos.equipoEquipado[ranura] = null;
    this.slots[dest] = { id, cantidad: 1 };

    if (anterior) {
      const libre = this._primerSlotLibre();
      if (libre < 0 || libre === dest) {
        this.slots[dest] = anterior;
        Guardado.datos.equipoEquipado[ranura] = id;
        this._toast('🎒 No hay espacio en la mochila');
        return false;
      }
      this.slots[libre] = anterior;
    }

    this.guardar();
    this._notificarCambioEquipo();
    return true;
  },

  desequiparEquipoFueraDeNivel() {
    const nv = typeof Vida !== 'undefined' ? Vida.nivel : 1;
    for (const ranura of Items.RANURAS_EQUIPO) {
      const id = this.equipoEnRanura(ranura);
      if (!id) continue;
      const item = Items.obtener(id);
      if (!item || Items.equipoAptoParaNivel(item, nv)) continue;
      this.desequiparPieza(ranura);
    }
  },

  _notificarCambioEquipo() {
    const aplicar = () => {
      this._sanearArmaEquipada();
      this._sanearEquipoEquipado();
      if (typeof Vida !== 'undefined') Vida._clampStatsAlMax();
      this.pintarArmaHud();
      const ventana = document.getElementById('ventana-mochila');
      if (ventana && !ventana.classList.contains('oculto')) {
        this._pintarSlotsEquipamiento();
        this._pintarDanoAtaque();
      }
      if (typeof Vida !== 'undefined') Vida.pintar();
    };
    aplicar();
    requestAnimationFrame(aplicar);
  },

  _sincronizarArmaEquipada() {
    const id = this.armaEquipadaId();
    if (!id) return;
    const idx = this._indiceEnMochila(id);
    if (idx >= 0) this.slots[idx] = null;
  },

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
    const id = this._armaRealmenteEquipada();
    if (!id) return 0;
    const item = Items.obtener(id);
    if (!item || item.tipo !== 'arma') return 0;
    if (!Items.armaAptaParaNivel(id, Vida.nivel)) return 0;
    return item.dano || 0;
  },

  equiparArma(id, slotOrigen) {
    const item = Items.obtener(id);
    if (!item || item.tipo !== 'arma') return false;
    if (!Items.armaAptaParaNivel(id, Vida.nivel)) {
      this._toast('Nivel ' + (item.nivelMin || 1) + '–' + (item.nivelMax || 100) + ' para esta arma');
      return false;
    }

    let idx = typeof slotOrigen === 'number' ? slotOrigen : this._indiceEnMochila(id);
    if (idx < 0 || !this.slots[idx] || this.slots[idx].id !== id) return false;

    const prev = this.armaEquipadaId();
    if (prev && prev !== id) this.desequiparArma();

    this.slots[idx] = null;
    Guardado.datos.armaEquipada = id;
    this.guardar();
    this.pintar();
    this._notificarCambioArma();
    return true;
  },

  desequiparArma(slotDestino) {
    const id = this.armaEquipadaId();
    if (!id) return false;

    let dest = typeof slotDestino === 'number' ? slotDestino : this._primerSlotLibre();
    if (dest < 0) {
      this._toast('🎒 No hay espacio para guardar el arma');
      return false;
    }

    const anterior = this.slots[dest];
    Guardado.datos.armaEquipada = null;

    this.slots[dest] = { id, cantidad: 1 };

    if (anterior) {
      const libre = this._primerSlotLibre();
      if (libre < 0 || libre === dest) {
        this.slots[dest] = anterior;
        Guardado.datos.armaEquipada = id;
        this._toast('🎒 No hay espacio en la mochila');
        return false;
      }
      this.slots[libre] = anterior;
    }

    this.guardar();
    this.pintar();
    this._notificarCambioArma();
    return true;
  },

  equiparSeleccionado() {
    if (!this.selected || this.selected.place !== 'bag') return;
    const sl = this.slots[this.selected.key];
    if (!sl) return;
    const item = Items.seguro(sl.id);
    if (Items.esArma(item)) {
      if (this.armaEquipadaId() === sl.id) this.desequiparArma();
      else this.equiparArma(sl.id, this.selected.key);
      return;
    }
    const ranura = Items.ranuraDeItem(item);
    if (!ranura) return;
    if (this.equipoEnRanura(ranura) === sl.id) this.desequiparPieza(ranura);
    else this.equiparPieza(sl.id, ranura, this.selected.key);
  },

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

  /** Agrega hasta `cantidad`; devuelve cuántas entraron. */
  agregarHasta(id, cantidad = 1, opciones = {}) {
    const item = Items.obtener(id);
    if (!item) return { agregado: 0, restante: cantidad };
    const maxPila = item.unico ? 1 : (CONFIG.maxPila || 10);
    let restante = cantidad;
    let agregado = 0;

    if (item.unico) {
      for (let i = 0; i < this.slots.length && restante > 0; i++) {
        if (!this.slots[i]) {
          this.slots[i] = { id, cantidad: 1 };
          if (opciones.texto) this.slots[i].texto = opciones.texto;
          restante--;
          agregado++;
        }
      }
    } else {
      for (const sl of this.slots) {
        if (restante <= 0) break;
        if (sl && sl.id === id && sl.cantidad < maxPila) {
          const cabe = Math.min(restante, maxPila - sl.cantidad);
          sl.cantidad += cabe;
          restante -= cabe;
          agregado += cabe;
        }
      }
      for (let i = 0; i < this.slots.length && restante > 0; i++) {
        if (!this.slots[i]) {
          const poner = Math.min(restante, maxPila);
          this.slots[i] = { id, cantidad: poner };
          restante -= poner;
          agregado += poner;
        }
      }
    }

    if (agregado > 0) {
      Historial.registrar('objetos', { detalle: 'Obtenido: ' + item.nombre, monto: agregado });
    }
    return { agregado, restante };
  },

  quitar(id, cantidad = 1, motivo = 'Usado') {
    if (this.contar(id) < cantidad) return false;
    let restante = cantidad;
    let quitoEquipada = false;
    for (let i = 0; i < this.slots.length && restante > 0; i++) {
      const sl = this.slots[i];
      if (sl && sl.id === id) {
        const q = Math.min(sl.cantidad, restante);
        sl.cantidad -= q;
        restante -= q;
        if (sl.cantidad <= 0) this.slots[i] = null;
      }
    }
    if (restante > 0 && this.armaEquipadaId() === id) {
      Guardado.datos.armaEquipada = null;
      quitoEquipada = true;
      restante -= 1;
    }
    if (restante > 0) {
      for (const ranura of Items.RANURAS_EQUIPO) {
        if (restante <= 0) break;
        if (this.equipoEnRanura(ranura) === id) {
          Guardado.datos.equipoEquipado[ranura] = null;
          quitoEquipada = true;
          restante -= 1;
        }
      }
    }
    if (restante > 0) return false;
    this.guardar();
    this.pintar();
    if (quitoEquipada) this._notificarCambioEquipo();
    const item = Items.seguro(id);
    Historial.registrar('objetos', { detalle: motivo + ': ' + item.nombre, monto: -cantidad });
    return true;
  },

  _getItem(place, key) {
    if (place === 'bag') return this.slots[key] || null;
    if (place === 'equip') {
      if (key === 'weapon') {
        const id = this._armaRealmenteEquipada();
        return id ? { id, cantidad: 1 } : null;
      }
      const ranura = this._ranuraDesdeSlot(key);
      if (ranura) {
        const id = this.equipoEnRanura(ranura);
        return id ? { id, cantidad: 1 } : null;
      }
    }
    return null;
  },

  _setItem(place, key, item) {
    if (place === 'bag') {
      this.slots[key] = item;
      return;
    }
    if (place === 'equip' && key === 'weapon') {
      Guardado.datos.armaEquipada = item ? item.id : null;
      return;
    }
    const ranura = this._ranuraDesdeSlot(key);
    if (place === 'equip' && ranura) {
      Guardado.datos.equipoEquipado[ranura] = item ? item.id : null;
    }
  },

  _isSelected(place, key) {
    return this.selected && this.selected.place === place && this.selected.key === key;
  },

  _htmlItem(icono, cantidad, conQty) {
    let h = '<div class="inv-item-drag"><span>' + (icono || '📦') + '</span>';
    if (conQty && cantidad > 1) h += '<span class="qty">' + cantidad + '</span>';
    h += '</div>';
    return h;
  },

  _notificarCambioArma() {
    this._notificarCambioEquipo();
  },

  pintarArmaHud() {
    const hud = document.getElementById('hud-arma-equipada');
    if (!hud) return;

    const id = this._armaRealmenteEquipada();
    let icono = '✋';
    let titulo = 'Sin arma equipada';
    let equipada = false;

    if (id) {
      const item = Items.seguro(id);
      icono = item.icono || '🗡️';
      const dano = item.dano || 0;
      titulo = dano > 0 ? item.nombre + ' (+' + dano + ' daño)' : item.nombre;
      equipada = true;
    }

    hud.replaceChildren(document.createTextNode(icono));
    hud.title = equipada ? ('Arma: ' + titulo) : titulo;
    hud.setAttribute('aria-label', equipada ? ('Arma equipada: ' + titulo) : titulo);
    hud.classList.toggle('equipada', equipada);
    void hud.offsetHeight;

    const status = document.getElementById('inv-weapon-status');
    if (status) status.textContent = equipada ? ('⚔️ ' + Items.seguro(id).nombre) : '⚔️ Sin arma';
  },

  _pintarSlotEquip(slotKey, slotId, tituloDefecto) {
    const slot = document.getElementById(slotId);
    if (!slot) return;
    const item = this._getItem('equip', slotKey);
    slot.querySelectorAll('.inv-item-drag').forEach(x => x.remove());
    slot.classList.toggle('filled', !!item);
    slot.classList.toggle('equipada', !!item);
    if (item) {
      const def = Items.seguro(item.id);
      slot.insertAdjacentHTML('beforeend', this._htmlItem(def.icono, 1, false));
      const dragEl = slot.querySelector('.inv-item-drag');
      if (dragEl) this._enlazarSlot(dragEl, 'equip', slotKey);
      slot.title = def.nombre;
    } else {
      slot.title = tituloDefecto;
    }
    if (!slot._invSlotOk) {
      slot._invSlotOk = true;
      slot.addEventListener('pointerdown', (e) => this._onSlotPointerDown(e, 'equip', slotKey));
    }
  },

  _pintarSlotsEquipamiento() {
    this._pintarSlotEquip('weapon', 'slot-arma-equipada', 'Arma');
    document.querySelectorAll('#inv-equip-row .inv-equip-slot').forEach((slot) => {
      const key = slot.dataset.equip;
      if (!key || key === 'weapon') return;
      const item = this._getItem('equip', key);
      slot.querySelectorAll('.inv-item-drag').forEach(x => x.remove());
      slot.classList.toggle('filled', !!item);
      slot.classList.toggle('equipada', !!item);
      if (item) {
        const def = Items.seguro(item.id);
        slot.insertAdjacentHTML('beforeend', this._htmlItem(def.icono, 1, false));
        const dragEl = slot.querySelector('.inv-item-drag');
        if (dragEl) this._enlazarSlot(dragEl, 'equip', key);
        slot.title = def.nombre;
      }
      if (!slot._invSlotOk) {
        slot._invSlotOk = true;
        slot.addEventListener('pointerdown', (e) => this._onSlotPointerDown(e, 'equip', key));
      }
    });
  },

  pintar() {
    // ESCUDO: no redibujar mientras el jugador arrastra un objeto. El
    // servidor reenvía la partida constantemente y llama a pintar(); si
    // recreamos las casillas en medio del arrastre, se corta el gesto y
    // parece que el inventario "no funciona". Se repinta al soltar.
    if (this.isDragging) { this._repintarPendiente = true; return; }
    const rejilla = document.getElementById('rejilla-mochila');
    if (rejilla) {
      const usados = this.slots.filter(Boolean).length;
      const cap = document.getElementById('inv-capacidad');
      if (cap) cap.textContent = usados + ' / ' + this.TOTAL_SLOTS;
      const dinInv = document.getElementById('inv-dinero-cantidad');
      if (dinInv && typeof Dinero !== 'undefined') dinInv.textContent = Dinero.saldo;

      rejilla.innerHTML = '';
      const ocultos = new Set(this._idsEquipoRealmenteEquipado());
      if (this._armaRealmenteEquipada()) ocultos.add(this._armaRealmenteEquipada());
      this.slots.forEach((sl, i) => {
        const celda = document.createElement('div');
        celda.className = 'slot';
        celda.dataset.place = 'bag';
        celda.dataset.index = i;
        if (sl && !ocultos.has(sl.id)) {
          const item = Items.seguro(sl.id);
          celda.innerHTML = this._htmlItem(item.icono, sl.cantidad, true);
          const dragEl = celda.querySelector('.inv-item-drag');
          if (dragEl) this._enlazarSlot(dragEl, 'bag', i);
        }
        celda.addEventListener('pointerdown', (e) => this._onSlotPointerDown(e, 'bag', i));
        rejilla.appendChild(celda);
      });
    }

    this._pintarSlotsEquipamiento();
    this._pintarDanoAtaque();
    this._actualizarNombreArrastre();
  },

  _pintarDanoAtaque() {
    const el = document.getElementById('inv-ataque-resumen');
    if (!el || typeof Enemigos === 'undefined') return;
    el.textContent = Enemigos.textoAtaqueJugador();
  },

  _puedeUsarItem(item, id) {
    return Items.esUsableEnInventario(item, id);
  },

  _mostrarControlesArrastre(sl) {
    const controls = document.getElementById('inv-controls');
    const useBtn = document.getElementById('inv-use-btn');
    const useAllBtn = document.getElementById('inv-use-all-btn');
    if (!controls || !sl) return;
    const item = Items.seguro(sl.id);
    const puedeUsar = Items.esUsableEnInventario(item, sl.id);
    const esConsumible = Items.esConsumible(item, sl.id);
    controls.classList.add('show');
    useBtn?.classList.toggle('on', puedeUsar);
    const varios = puedeUsar && esConsumible && sl.cantidad > 1;
    useAllBtn?.classList.toggle('on', varios);
  },

  _actualizarNombreArrastre() {
    const el = document.getElementById('inv-selected-name');
    if (!el) return;
    if (this.isDragging && this.dragging) {
      const item = Items.seguro(this.dragging.id);
      el.textContent = Items.resumenInventario(item, this.dragging.id) +
        ' · x' + this.dragging.cantidad;
      return;
    }
    el.textContent = 'Arrastra un objeto';
  },

  _enlazarSlot(el, place, key) {
    if (!el || el._invDragOk) return;
    el._invDragOk = true;
    el.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      this._onSlotPointerDown(ev, place, key);
    });
  },

  _slotDesdePunto(clientX, clientY) {
    if (clientX == null || clientY == null) return null;
    if (this.ghost) this.ghost.style.visibility = 'hidden';
    const el = document.elementFromPoint(clientX, clientY);
    if (this.ghost) this.ghost.style.visibility = 'visible';
    return el ? el.closest('.slot, .inv-equip-slot, .inv-ctrl-btn') : null;
  },

  _enlazarArrastrePointer(e, place, key) {
    const item = this._getItem(place, key);
    if (!item) return;

    e.preventDefault();
    const origen = e.currentTarget && e.currentTarget.closest
      ? e.currentTarget.closest('.slot, .inv-equip-slot, .inv-item-drag') || e.currentTarget
      : e.target;
    try { origen?.setPointerCapture?.(e.pointerId); } catch (err) { /* */ }

    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;

    this.dragFrom = { place, key };
    this.dragging = item;
    this._dragLastX = startX;
    this._dragLastY = startY;

    const onMove = (ev) => {
      if (ev.cancelable) ev.preventDefault();
      this._dragLastX = ev.clientX;
      this._dragLastY = ev.clientY;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > 8) {
        moved = true;
        this.isDragging = true;
        this._createGhost(item);
        this._mostrarControlesArrastre(item);
        this._actualizarNombreArrastre();
      }
      if (moved) this._moveGhost(ev);
    };

    const finalizar = (ev) => {
      origen?.removeEventListener?.('pointermove', onMove);
      origen?.removeEventListener?.('pointerup', finalizar);
      origen?.removeEventListener?.('pointercancel', finalizar);
      origen?.removeEventListener?.('lostpointercapture', finalizar);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finalizar);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', finalizar);
      try { origen?.releasePointerCapture?.(e.pointerId); } catch (err) { /* */ }
      if (moved) {
        const px = ev?.clientX ?? this._dragLastX;
        const py = ev?.clientY ?? this._dragLastY;
        if (px != null && py != null) this._moveGhost({ clientX: px, clientY: py });
        this._finishDrop();
      }
      this._cleanupDrag();
    };

    origen?.addEventListener?.('pointermove', onMove);
    origen?.addEventListener?.('pointerup', finalizar);
    origen?.addEventListener?.('pointercancel', finalizar);
    origen?.addEventListener?.('lostpointercapture', finalizar);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finalizar, { once: true });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', finalizar, { once: true });
  },

  _onSlotPointerDown(e, place, key) {
    this._enlazarArrastrePointer(e, place, key);
  },

  _moveItem(fromPlace, fromKey, toPlace, toKey) {
    const fromItem = this._getItem(fromPlace, fromKey);
    const toItem = this._getItem(toPlace, toKey);
    if (!fromItem) return;

    if (toPlace === 'equip') {
      const item = Items.seguro(fromItem.id);
      if (toKey === 'weapon') {
        if (!Items.esEquipable(item, fromItem.id, 'weapon')) {
          this._toast('Eso no va ahí');
          return;
        }
        if (fromPlace === 'bag') this.equiparArma(fromItem.id, fromKey);
        return;
      }
      const ranura = this._ranuraDesdeSlot(toKey);
      if (!ranura) {
        this._toast('Ese espacio no está disponible');
        return;
      }
      if (!Items.esEquipable(item, fromItem.id, toKey)) {
        this._toast('Eso no va ahí');
        return;
      }
      if (fromPlace === 'bag') this.equiparPieza(fromItem.id, ranura, fromKey);
      return;
    }

    if (fromPlace === 'equip') {
      if (fromKey === 'weapon') {
        if (toPlace === 'bag') {
          const dest = typeof toKey === 'number' ? toKey : this._primerSlotLibre();
          this.desequiparArma(dest);
        }
        return;
      }
      const ranura = this._ranuraDesdeSlot(fromKey);
      if (ranura && toPlace === 'bag') {
        const dest = typeof toKey === 'number' ? toKey : this._primerSlotLibre();
        this.desequiparPieza(ranura, dest);
      }
      return;
    }

    if (fromPlace === 'bag' && toPlace === 'bag') {
      this.moverSlot(fromKey, toKey);
    }
  },

  moverSlot(origen, destino) {
    const oIdx = Number(origen);
    const dIdx = Number(destino);
    if (isNaN(oIdx) || isNaN(dIdx) || oIdx === dIdx) return;
    const o = this.slots[oIdx];
    const d = this.slots[dIdx];
    if (!o) return;
    const maxPila = CONFIG.maxPila || 10;
    if (d && d.id === o.id && !Items.seguro(o.id).unico) {
      const espacio = maxPila - d.cantidad;
      if (espacio <= 0) {
        this.slots[dIdx] = o;
        this.slots[oIdx] = d;
      } else {
        const mover = Math.min(o.cantidad, espacio);
        d.cantidad += mover;
        o.cantidad -= mover;
        if (o.cantidad <= 0) this.slots[oIdx] = null;
      }
    } else {
      this.slots[dIdx] = o;
      this.slots[oIdx] = d || null;
    }
    this._sanearArmaEquipada();
    this.guardar();
  },

  _createGhost(item) {
    const icon = Items.seguro(item.id).icono;
    this.ghost = document.createElement('div');
    this.ghost.className = 'inv-ghost-item';
    this.ghost.textContent = icon;
    document.body.appendChild(this.ghost);
  },

  _moveGhost(e) {
    if (!this.ghost) return;
    this.ghost.style.left = e.clientX + 'px';
    this.ghost.style.top = e.clientY + 'px';

    document.querySelectorAll('.slot.over, .inv-equip-slot.over, .inv-ctrl-btn.over')
      .forEach(s => s.classList.remove('over'));

    const target = this._slotDesdePunto(e.clientX, e.clientY);
    this.hoverTarget = target || null;
    if (target) target.classList.add('over');
  },

  _finishDrop() {
    const from = this.dragFrom;
    if (!from) return;

    let target = this.hoverTarget;
    if (!target && this._dragLastX != null) {
      target = this._slotDesdePunto(this._dragLastX, this._dragLastY);
    }
    if (!target) return;

    if (target.id === 'inv-delete-btn') {
      void this._eliminarDesde(from.place, from.key, true).then(() => this.pintar());
      return;
    }

    if (target.id === 'inv-minus-btn') {
      this._restarUno(from.place, from.key);
      this.pintar();
      return;
    }

    if (target.id === 'inv-use-btn') {
      this._usarDesde(from.place, from.key, false);
      this.pintar();
      return;
    }

    if (target.id === 'inv-use-all-btn') {
      this._usarDesde(from.place, from.key, true);
      this.pintar();
      return;
    }

    if (target.classList.contains('inv-equip-slot') && !target.classList.contains('inv-equip-future')) {
      const eq = target.dataset.equip;
      if (eq) this._moveItem(from.place, from.key, 'equip', eq);
    } else if (target.classList.contains('slot')) {
      const idx = Number(target.dataset.index);
      if (!isNaN(idx)) {
        const origen = Number(from.key);
        if (from.place === 'bag' && !isNaN(origen) && origen !== idx) {
          this._moveItem(from.place, origen, 'bag', idx);
        } else if (from.place !== 'bag' || isNaN(origen)) {
          this._moveItem(from.place, from.key, 'bag', idx);
        }
      }
    }

    this.pintar();
  },

  _cleanupDrag() {
    if (this.ghost) this.ghost.remove();
    this.ghost = null;
    this.dragging = null;
    this.dragFrom = null;
    this.isDragging = false;
    this.hoverTarget = null;
    this._dragLastX = null;
    this._dragLastY = null;
    const controls = document.getElementById('inv-controls');
    if (controls) controls.classList.remove('show');
    document.getElementById('inv-use-btn')?.classList.remove('on');
    document.getElementById('inv-use-all-btn')?.classList.remove('on');
    document.querySelectorAll('.slot.over, .inv-equip-slot.over, .inv-ctrl-btn.over')
      .forEach(s => s.classList.remove('over'));
    this._actualizarNombreArrastre();
    // Si llegó un repintado mientras arrastrábamos, hacerlo ahora
    if (this._repintarPendiente) {
      this._repintarPendiente = false;
      this.pintar();
    }
  },

  _requiereConfirmEliminar(item, id, place) {
    return Items.requiereConfirmBorrar(item, id, place === 'equip');
  },

  _confirmarEliminar(texto) {
    return new Promise((resolve) => {
      this._confirmResolve = resolve;
      const txt = document.getElementById('inv-confirm-text');
      if (txt) txt.textContent = texto;
      if (typeof UIManager !== 'undefined') {
        UIManager.abrirConfirm('inv-confirm-overlay', {
          onCancel: () => this._resolverConfirm(false)
        });
      } else {
        const ov = document.getElementById('inv-confirm-overlay');
        ov?.classList.remove('oculto');
        ov?.setAttribute('aria-hidden', 'false');
      }
    });
  },

  _resolverConfirm(ok) {
    if (typeof UIManager !== 'undefined') UIManager.cerrarConfirm('inv-confirm-overlay');
    else {
      const ov = document.getElementById('inv-confirm-overlay');
      ov?.classList.add('oculto');
      ov?.setAttribute('aria-hidden', 'true');
    }
    const r = this._confirmResolve;
    this._confirmResolve = null;
    if (r) r(!!ok);
  },

  async _eliminarDesde(place, key, confirmar) {
    const sl = this._getItem(place, key);
    if (!sl) return false;
    const item = Items.seguro(sl.id);
    if (confirmar && this._requiereConfirmEliminar(item, sl.id, place)) {
      const msg = '¿Eliminar ' + item.nombre + (sl.cantidad > 1 ? ' x' + sl.cantidad : '') + '?';
      const ok = await this._confirmarEliminar(msg);
      if (!ok) return false;
    }

    const itemsSoltar = [{ id: sl.id, cantidad: sl.cantidad || 1 }];
    if (typeof Bolsas !== 'undefined') {
      const soltado = await Bolsas.soltar(itemsSoltar, 'Eliminado del inventario');
      if (!soltado) {
        this._toast('No se pudo dejar la bolsa en el mapa');
        return false;
      }
    }

    const eraArma = Items.esArma(item);
    const eraEquipo = Items.esPiezaEquipo(item);
    if (place === 'equip') {
      if (key === 'weapon') Guardado.datos.armaEquipada = null;
      else {
        const ranura = this._ranuraDesdeSlot(key);
        if (ranura) Guardado.datos.equipoEquipado[ranura] = null;
      }
    } else {
      this.slots[key] = null;
      if (this.armaEquipadaId() === sl.id) Guardado.datos.armaEquipada = null;
    }
    if (this.selected && this.selected.place === place && this.selected.key === key) {
      this.selected = null;
      this.slotSeleccionado = -1;
    }
    this.guardar();
    Historial.registrar('objetos', { detalle: 'Eliminado: ' + item.nombre, monto: -sl.cantidad });
    this._toast('Objeto dejado en el suelo');
    if (eraArma || eraEquipo) this._notificarCambioEquipo();
    return true;
  },

  _restarUno(place, key) {
    const sl = this._getItem(place, key);
    if (!sl) return;
    const item = Items.seguro(sl.id);
    if (sl.cantidad > 1) {
      if (place === 'bag') {
        sl.cantidad--;
        this.guardar();
        this._toast('-1 ' + item.nombre);
      }
    } else {
      this._eliminarDesde(place, key, false);
    }
  },

  _usarDesde(place, key, usarTodo) {
    const sl = this._getItem(place, key);
    if (!sl) return;
    const item = Items.seguro(sl.id);

    const uso = Items.usoEspecial(sl.id);
    if (uso === 'cofre') {
      this._cerrarVentana();
      Cofres.usarCofreInventario();
      return;
    }
    if (uso === 'llave') {
      this._cerrarVentana();
      Cofres.usarLlaveMaestra();
      return;
    }
    if (uso === 'escribir') {
      if (this.tieneItem('lapiz')) {
        this.selected = { place, key };
        this.slotSeleccionado = place === 'bag' ? key : -1;
        this.escribirNota();
      } else {
        this._toast('Necesitas un lápiz');
      }
      return;
    }

    const tipo = Items.tipoConsumible(item, sl.id);
    if (!tipo || tipo === 'especial') {
      this._toast('Eso no se puede usar');
      return;
    }

    if (Vida.estaMuerto()) {
      this._toast('No puedes usar objetos estando muerto');
      return;
    }

    const stats = this._statsConsumo();
    const optimo = Items.cantidadOptimaConsumo(item, sl.id, sl.cantidad, stats);
    const cantidad = usarTodo ? optimo : 1;

    if (cantidad <= 0 || optimo <= 0) {
      if (tipo === 'hambre') this._toast('No tienes hambre');
      else if (tipo === 'crudo') this._toast('No puedes comer eso ahora');
      else this._toast('Ya tienes la vida al máximo');
      return;
    }

    const online = typeof Multijugador !== 'undefined' && Multijugador.activo &&
      CONFIG.servidorOnline && (tipo === 'hambre' || tipo === 'vida' || tipo === 'crudo');
    if (online) {
      void Multijugador.usarItemServidor(sl.id, cantidad).then((res) => {
        if (!res?.ok) {
          this._toast(Utilidades.mensajeAmigable(res?.error, 'No se pudo usar el objeto'));
          return;
        }
        this._toast('Usaste ' + cantidad + 'x ' + item.nombre);
        this.pintar();
      });
      return;
    }

    this._aplicarConsumo(item, sl.id, cantidad);
    this._quitarCantidad(place, key, cantidad);
    const tipoPost = Items.tipoConsumible(item, sl.id);
    if (tipoPost === 'crudo') this._toast('Comiste ' + cantidad + 'x ' + item.nombre + ' crudo');
    else this._toast('Usaste ' + cantidad + 'x ' + item.nombre);
  },

  _aplicarConsumo(item, id, cantidad) {
    const tipo = Items.tipoConsumible(item, id);
    if (tipo === 'hambre') {
      const total = Items.calcularEfectoUnidad(item, 'hambre') * cantidad;
      Vida.alimentar(total, null);
      Vida.ganarXp(5 * cantidad, 'Comer');
    } else if (tipo === 'vida') {
      const por = Items.calcularEfectoUnidad(item, 'vida');
      Vida.cambiar(por * cantidad, null);
      Vida.ganarXp(3 * cantidad, 'Medicina');
    } else if (tipo === 'crudo') {
      const def = Items.defEfecto(item);
      const prob = item.probCrudoNegativo ?? 60;
      const vidaMax = Vida.vidaMaxima();
      let negativo = false;
      for (let i = 0; i < cantidad; i++) {
        if (Math.random() * 100 < prob) {
          const dmg = Math.max(1, Math.round(vidaMax * (def?.valor || 10) / 100));
          Vida.cambiar(-dmg, null);
          negativo = true;
        } else {
          Vida.alimentar(Math.round(CONFIG.hambreMaxima * 0.08), null);
        }
      }
      if (!negativo) Vida.ganarXp(2 * cantidad, 'Comer crudo');
      else this._toast('¡Te hizo daño comer crudo!');
    }
  },

  _quitarCantidad(place, key, cantidad) {
    if (place === 'equip') {
      if (key === 'weapon') {
        Guardado.datos.armaEquipada = null;
      } else {
        const ranura = this._ranuraDesdeSlot(key);
        if (ranura) Guardado.datos.equipoEquipado[ranura] = null;
      }
      if (this.selected && this.selected.place === 'equip') {
        this.selected = null;
        this.slotSeleccionado = -1;
      }
      this.guardar();
      this._notificarCambioEquipo();
      return;
    }
    const sl = this.slots[key];
    if (!sl) return;
    sl.cantidad -= cantidad;
    if (sl.cantidad <= 0) {
      this.slots[key] = null;
      if (this.selected && this.selected.place === 'bag' && this.selected.key === key) {
        this.selected = null;
        this.slotSeleccionado = -1;
      }
    }
    this.guardar();
  },

  mostrarDetalle(indice) {
    this.selected = { place: 'bag', key: indice };
    this.slotSeleccionado = indice;
    this.pintar();
  },

  ocultarDetalle() {
    this.selected = null;
    this.slotSeleccionado = -1;
    this.pintar();
  },

  escribirNota() {
    const key = this.selected?.place === 'bag' ? this.selected.key : this.slotSeleccionado;
    const sl = key >= 0 ? this.slots[key] : null;
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

  usarSeleccionado() {
    if (!this.selected) return;
    this._usarDesde(this.selected.place, this.selected.key, false);
    this.pintar();
  },

  eliminarSeleccionado() {
    if (this.selected) {
      void this._eliminarDesde(this.selected.place, this.selected.key, true).then(() => this.pintar());
    } else if (this.slotSeleccionado >= 0) {
      void this._eliminarDesde('bag', this.slotSeleccionado, true).then(() => this.pintar());
    }
  },

  _eliminarSlot(indice) {
    this._eliminarDesde('bag', indice, true);
    this.pintar();
  }
};
