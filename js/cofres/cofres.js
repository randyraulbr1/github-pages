// ============================================================
// COFRES — visibles (libres) u ocultos (PIN 4 dígitos / llave maestra)
// ============================================================
const Cofres = {
  TOTAL_SLOTS: 6,
  PROB_LLAVE: 0.15,
  _marcadores: {},
  _circuloColocar: null,
  _modoColocar: null,
  _modoAdminSinItem: false,
  _cofrePinPendiente: null,
  _tipoVisible: true,
  verOcultos: false,

  iniciar() {
    if (!Guardado.datos.cofresAbiertos) Guardado.datos.cofresAbiertos = [];
    this._pintarTodos();
    this._enlazarUi();
  },

  _enlazarUi() {
    const enlazar = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };
    enlazar('cofre-tipo-visible', () => this._elegirTipoCofre(true));
    enlazar('cofre-tipo-oculto', () => this._elegirTipoCofre(false));
    enlazar('btn-cofre-colocar-continuar', () => this._continuarColocacion());
    enlazar('btn-cofre-abrir-pin', () => this._confirmarAbrirPin());
    const pinAbrir = document.getElementById('cofre-abrir-pin');
    if (pinAbrir) {
      pinAbrir.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') this._confirmarAbrirPin();
      });
    }
  },

  _elegirTipoCofre(visible) {
    this._tipoVisible = visible;
    const btnV = document.getElementById('cofre-tipo-visible');
    const btnO = document.getElementById('cofre-tipo-oculto');
    const campoPin = document.getElementById('cofre-campo-pin');
    const desc = document.getElementById('cofre-colocar-desc');
    if (btnV) btnV.classList.toggle('activa', visible);
    if (btnO) btnO.classList.toggle('activa', !visible);
    if (campoPin) campoPin.classList.toggle('oculto', visible);
    if (desc) {
      desc.textContent = visible
        ? 'Cualquiera puede abrirlo y usar sus 6 casillas.'
        : 'Solo quien sepa el PIN de 4 números podrá abrirlo.';
    }
  },

  lista() {
    const mapa = new Map();
    for (const c of ((Admin && Admin.publicado && Admin.publicado.cofres) || [])) mapa.set(c.id, c);
    for (const c of (Guardado.datos.cofresLocales || [])) mapa.set(c.id, c);
    return [...mapa.values()].filter(c => !c.eliminado);
  },

  colocarDesdeAdmin() {
    this._modoAdminSinItem = true;
    this.usarCofreInventario();
  },

  iniciarColocacionAdmin(datos) {
    if (!datos) return;
    this._modoAdminSinItem = true;
    this._modoColocar = { visible: !!datos.visible, pin: datos.pin || null };
    this._mostrarCirculoColocar();
    if (typeof Admin !== 'undefined') {
      Admin.modo = 'colocar_cofre';
      Admin._mostrarControles('Toca el mapa dentro del círculo para el cofre', true);
    }
    Notificaciones.mostrar('📍 Toca el mapa dentro del círculo (máx. ' + CONFIG.radioColocarCofre + ' m)', 'info', 6000);
  },

  usarCofreInventario() {
    if (!this._modoAdminSinItem && !Mochila.tieneItem('cofre')) {
      Notificaciones.mostrar('No tienes un cofre en la mochila', 'alerta');
      return;
    }
    this._tipoVisible = true;
    this._elegirTipoCofre(true);
    const pinInput = document.getElementById('cofre-pin-input');
    if (pinInput) pinInput.value = '';
    document.getElementById('ventana-cofre-colocar').classList.remove('oculto');
  },

  _continuarColocacion() {
    const visible = this._tipoVisible;
    let pin = null;
    if (!visible) {
      const pinInput = document.getElementById('cofre-pin-input');
      pin = (pinInput && pinInput.value || '').trim();
      if (!Utilidades.pinCofreValido(pin)) {
        alert('El PIN debe ser de 4 números');
        if (pinInput) pinInput.focus();
        return;
      }
    }
    document.getElementById('ventana-cofre-colocar').classList.add('oculto');
    this._modoColocar = { visible, pin };
    this._mostrarCirculoColocar();
    Notificaciones.mostrar('📍 Toca el mapa dentro del círculo (máx. ' + CONFIG.radioColocarCofre + ' m)', 'info', 6000);
  },

  usarLlaveMaestra() {
    if (!Mochila.tieneItem('llave_maestra')) return;
    if (!GPS.posicion) return;
    const ocultos = this.lista().filter(c => !c.visible);
    let mejor = null;
    let mejorD = Infinity;
    for (const c of ocultos) {
      const d = Utilidades.distanciaMetros(GPS.posicion, c.pos);
      if (d <= CONFIG.distanciaInteraccion && d < mejorD) { mejor = c; mejorD = d; }
    }
    if (!mejor) {
      Notificaciones.mostrar('No hay cofre oculto cerca', 'alerta');
      return;
    }
    if (!confirm('¿Usar llave maestra cerca de un cofre oculto?\n15% de probabilidad de abrirlo (se gasta la llave).')) return;
    Mochila.quitar('llave_maestra', 1, 'Llave maestra usada');
    if (Math.random() < this.PROB_LLAVE) {
      if (!Guardado.datos.cofresAbiertos.includes(mejor.id)) {
        Guardado.datos.cofresAbiertos.push(mejor.id);
      }
      Guardado.guardar();
      if (mejor.pinRegistro) {
        Mochila.agregar('nota_escrita', 1, {
          texto: 'PIN del cofre oculto: ' + mejor.pinRegistro,
          silencioso: true
        });
      }
      Notificaciones.mostrar('🔓 ¡La llave abrió el cofre oculto!' +
        (mejor.pinRegistro ? ' Recibiste una nota con el PIN.' : ''), 'exito', 6000);
      this._mostrarVentana(mejor);
    } else {
      Notificaciones.mostrar('La llave no funcionó (15% de suerte). Se gastó la llave.', 'alerta', 5000);
    }
  },

  _mostrarCirculoColocar() {
    if (!GPS.posicion || !Mapa.mapa) return;
    if (this._circuloColocar) this._circuloColocar.remove();
    this._circuloColocar = L.circle(GPS.posicion, {
      radius: CONFIG.radioColocarCofre,
      color: '#ffd60a', weight: 2, fillColor: '#ffd60a', fillOpacity: 0.08, dashArray: '6 8'
    }).addTo(Mapa.mapa);
    Mapa.mapa.once('click', ev => this._confirmarColocacion(ev.latlng));
  },

  async _confirmarColocacion(latlng) {
    if (!this._modoColocar) return;
    if (this._circuloColocar) { this._circuloColocar.remove(); this._circuloColocar = null; }
    const dist = Utilidades.distanciaMetros(GPS.posicion, [latlng.lat, latlng.lng]);
    if (dist > CONFIG.radioColocarCofre) {
      Notificaciones.mostrar('Debe estar dentro del círculo', 'alerta');
      this._modoColocar = null;
      return;
    }
    if (!this._modoAdminSinItem) {
      if (!Mochila.quitar('cofre', 1, 'Cofre colocado')) {
        this._modoColocar = null;
        return;
      }
    }
    const cofre = {
      id: 'cofre_' + Date.now().toString(36),
      pos: [+latlng.lat.toFixed(6), +latlng.lng.toFixed(6)],
      visible: this._modoColocar.visible,
      pinHash: this._modoColocar.pin
        ? await Utilidades.sha256('cofre-pin|' + this._modoColocar.pin) : null,
      pinRegistro: this._modoColocar.pin || null,
      slots: new Array(this.TOTAL_SLOTS).fill(null),
      creador: Usuarios.perfilActivo.id,
      creadorNombre: Usuarios.perfilActivo.nombre,
      t: Date.now()
    };
    if (!Guardado.datos.cofresLocales) Guardado.datos.cofresLocales = [];
    Guardado.datos.cofresLocales.push(cofre);
    Guardado.guardar();
    if (typeof Admin !== 'undefined' && Admin.esAdminJugador()) {
      Admin.datos.cofresExtra = Admin.datos.cofresExtra || [];
      Admin.datos.cofresExtra.push(cofre);
      Admin.guardar();
      Admin._publicarParaTodos(true);
    }
    this._modoColocar = null;
    this._modoAdminSinItem = false;
    this._crearMarcador(cofre);
    Notificaciones.mostrar('🧰 Cofre ' + (cofre.visible ? 'visible' : 'oculto') + ' colocado', 'exito', 5000);
  },

  _pintarTodos() {
    for (const id of Object.keys(this._marcadores)) {
      if (this._marcadores[id].remove) this._marcadores[id].remove();
      delete this._marcadores[id];
    }
    for (const c of this.lista()) this._crearMarcador(c);
    for (const c of this.lista().filter(x => !x.visible)) this._registrarOculto(c);
  },

  _registrarOculto(c) {
    const id = 'cofre_h_' + c.id;
    if (Mapa.puntosInteractivos.some(p => p.id === id)) return;
    Mapa.registrarPunto({
      id,
      posicion: c.pos,
      radio: CONFIG.distanciaInteraccion,
      marcador: null,
      alTocar: () => {
        if (Mochila.tieneItem('llave_maestra')) this.usarLlaveMaestra();
        else if (c.creador === Usuarios.perfilActivo.id) this.abrir(c);
        else Notificaciones.mostrar('Hay algo oculto aquí…', 'info', 3000);
      }
    });
  },

  _crearMarcador(c) {
    const esAdm = typeof Admin !== 'undefined' && Admin.esAdminJugador() && this.verOcultos;
    if (!c.visible && !esAdm) return;
    if (this._marcadores[c.id]) return;
    const icono = c.visible ? '🧰' : '👻🧰';
    const marcador = Mapa.crearMarcadorEmoji(c.pos, icono, 28);
    this._marcadores[c.id] = marcador;
    Mapa.registrarPunto({
      id: 'cofre_' + c.id,
      posicion: c.pos,
      radio: CONFIG.distanciaInteraccion,
      marcador,
      alTocar: () => this.abrir(c)
    });
  },

  async abrir(cofre) {
    if (cofre.visible) {
      this._mostrarVentana(cofre);
      return;
    }
    if (Guardado.datos.cofresAbiertos.includes(cofre.id)) {
      this._mostrarVentana(cofre);
      return;
    }
    this._cofrePinPendiente = cofre;
    const pinInput = document.getElementById('cofre-abrir-pin');
    if (pinInput) pinInput.value = '';
    document.getElementById('ventana-cofre-pin').classList.remove('oculto');
    setTimeout(() => { if (pinInput) pinInput.focus(); }, 200);
  },

  async _confirmarAbrirPin() {
    const cofre = this._cofrePinPendiente;
    if (!cofre) return;
    const pinInput = document.getElementById('cofre-abrir-pin');
    const pin = (pinInput && pinInput.value || '').trim();
    if (!Utilidades.pinCofreValido(pin)) { alert('PIN de 4 números'); return; }
    const hash = await Utilidades.sha256('cofre-pin|' + pin);
    if (hash !== cofre.pinHash) { alert('PIN incorrecto'); return; }
    document.getElementById('ventana-cofre-pin').classList.add('oculto');
    this._cofrePinPendiente = null;
    Guardado.datos.cofresAbiertos.push(cofre.id);
    Guardado.guardar();
    this._mostrarVentana(cofre);
  },

  _maxPila(id) {
    return Items.seguro(id).unico ? 1 : (CONFIG.maxPila || 10);
  },

  _apilarEnSlots(slots, id, cantidad) {
    let restante = cantidad;
    const max = this._maxPila(id);
    if (Items.seguro(id).unico) {
      const vacio = slots.findIndex(s => !s);
      if (vacio < 0 || restante <= 0) return restante;
      slots[vacio] = { id, cantidad: 1 };
      return restante - 1;
    }
    for (const sl of slots) {
      if (restante <= 0) break;
      if (sl && sl.id === id && sl.cantidad < max) {
        const cabe = Math.min(restante, max - sl.cantidad);
        sl.cantidad += cabe;
        restante -= cabe;
      }
    }
    for (let i = 0; i < slots.length && restante > 0; i++) {
      if (!slots[i]) {
        const poner = Math.min(restante, max);
        slots[i] = { id, cantidad: poner };
        restante -= poner;
      }
    }
    return restante;
  },

  _moverEntreSlots(slots, origen, destino) {
    const o = slots[origen];
    const d = slots[destino];
    if (!o) return;
    const max = this._maxPila(o.id);
    if (d && d.id === o.id && !Items.seguro(o.id).unico) {
      const espacio = max - d.cantidad;
      if (espacio <= 0) {
        slots[destino] = o;
        slots[origen] = d;
      } else {
        const mover = Math.min(o.cantidad, espacio);
        d.cantidad += mover;
        o.cantidad -= mover;
        if (o.cantidad <= 0) slots[origen] = null;
      }
    } else {
      slots[destino] = o;
      slots[origen] = d || null;
    }
  },

  _mostrarVentana(cofre) {
    this._cofreActivo = cofre;
    this._arrastre = null;
    document.getElementById('cofre-info').textContent =
      (cofre.visible ? 'Cofre visible — abierto para todos' : 'Cofre oculto') +
      ' · ' + (cofre.creadorNombre || '—') + ' · máx. ' + (CONFIG.maxPila || 10) + ' por pila';
    const esAdm = typeof Admin !== 'undefined' && Admin.esAdminJugador();
    document.getElementById('cofre-admin-titulo').classList.toggle('oculto', !esAdm);
    document.getElementById('rejilla-cofre-admin').classList.toggle('oculto', !esAdm);
    this._pintarRejillas();
    document.getElementById('ventana-cofre').classList.remove('oculto');
  },

  _pintarRejillas() {
    const c = this._cofreActivo;
    if (!c) return;
    if (!c.slots) c.slots = new Array(this.TOTAL_SLOTS).fill(null);
    const rc = document.getElementById('rejilla-cofre');
    const rm = document.getElementById('rejilla-cofre-mochila');
    rc.innerHTML = '';
    rm.innerHTML = '';
    c.slots.forEach((sl, i) => {
      const cel = document.createElement('div');
      cel.className = 'slot cofre-slot';
      cel.dataset.zona = 'cofre';
      cel.dataset.indice = i;
      if (sl) {
        cel.textContent = Items.seguro(sl.id).icono;
        const cant = document.createElement('span');
        cant.className = 'cantidad';
        cant.textContent = sl.cantidad;
        cel.appendChild(cant);
        cel.addEventListener('pointerdown', ev => this._empezarArrastre(ev, 'cofre', i));
      }
      rc.appendChild(cel);
    });
    Mochila.slots.forEach((sl, i) => {
      const cel = document.createElement('div');
      cel.className = 'slot cofre-slot';
      cel.dataset.zona = 'mochila';
      cel.dataset.indice = i;
      if (sl) {
        cel.textContent = Items.seguro(sl.id).icono;
        const cant = document.createElement('span');
        cant.className = 'cantidad';
        cant.textContent = sl.cantidad;
        cel.appendChild(cant);
        cel.addEventListener('pointerdown', ev => this._empezarArrastre(ev, 'mochila', i));
      }
      rm.appendChild(cel);
    });
    const ra = document.getElementById('rejilla-cofre-admin');
    if (ra && typeof Admin !== 'undefined' && Admin.esAdminJugador()) {
      Admin._pintarInventarioInfinito(ra, id =>
        cel => cel.addEventListener('pointerdown', ev => this._empezarArrastre(ev, 'admin', id)));
    }
  },

  _empezarArrastre(ev, zona, ref) {
    ev.preventDefault();
    const c = this._cofreActivo;
    if (!c) return;
    let sl = null;
    if (zona === 'cofre') sl = c.slots[ref];
    else if (zona === 'mochila') sl = Mochila.slots[ref];
    else if (zona === 'admin') sl = { id: ref, cantidad: 1 };
    if (!sl) return;
    this._arrastre = { zona, ref, movio: false, x0: ev.clientX, y0: ev.clientY, fantasma: null, id: sl.id };
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
      a.fantasma = document.createElement('div');
      a.fantasma.id = 'item-fantasma';
      a.fantasma.textContent = Items.seguro(a.id).icono;
      document.body.appendChild(a.fantasma);
    }
    a.fantasma.style.left = ev.clientX + 'px';
    a.fantasma.style.top = ev.clientY + 'px';
    document.querySelectorAll('.cofre-slot.destino').forEach(el => el.classList.remove('destino'));
    const bajo = document.elementFromPoint(ev.clientX, ev.clientY);
    const slot = bajo?.closest?.('.cofre-slot');
    if (slot) slot.classList.add('destino');
  },

  _soltarArrastre(ev) {
    const a = this._arrastre;
    this._arrastre = null;
    if (a?.fantasma) a.fantasma.remove();
    if (!a || !this._cofreActivo) return;

    const bajo = document.elementFromPoint(ev.clientX, ev.clientY);
    const destEl = bajo?.closest?.('.cofre-slot');
    if (!destEl) {
      if (a.movio && a.zona === 'cofre') this._cofreActivo.slots[a.ref] = null;
      this._guardarCofre();
      this._pintarRejillas();
      return;
    }
    const destZona = destEl.dataset.zona;
    const dest = parseInt(destEl.dataset.indice, 10);
    if (isNaN(dest)) return;

    if (!a.movio) {
      if (a.zona === 'cofre' && destZona === 'mochila') this._pasarCofreAMochila(a.ref, 1);
      else if (a.zona === 'mochila' && destZona === 'cofre') this._pasarMochilaACofre(a.ref, 1);
      this._pintarRejillas();
      return;
    }

    if (a.zona === 'admin' && destZona === 'cofre') {
      const slots = this._cofreActivo.slots;
      const sl = slots[dest];
      const max = this._maxPila(a.id);
      if (!sl) {
        slots[dest] = { id: a.id, cantidad: 1 };
        this._guardarCofre();
      } else if (sl.id === a.id && sl.cantidad < max) {
        sl.cantidad++;
        this._guardarCofre();
      } else {
        Notificaciones.mostrar('Casilla ocupada o pila llena', 'alerta');
      }
    } else if (a.zona === 'admin' && destZona === 'mochila') {
      const sl = Mochila.slots[dest];
      const max = this._maxPila(a.id);
      if (!sl) {
        Mochila.slots[dest] = { id: a.id, cantidad: 1 };
        Mochila.guardar();
      } else if (sl.id === a.id && sl.cantidad < max) {
        sl.cantidad++;
        Mochila.guardar();
      } else {
        Notificaciones.mostrar('Casilla ocupada o pila llena', 'alerta');
      }
    } else if (a.zona === 'cofre' && destZona === 'cofre') {
      if (a.ref !== dest) {
        this._moverEntreSlots(this._cofreActivo.slots, a.ref, dest);
        this._guardarCofre();
      }
    } else if (a.zona === 'mochila' && destZona === 'mochila') {
      if (a.ref !== dest) Mochila.moverSlot(a.ref, dest);
    } else if (a.zona === 'cofre' && destZona === 'mochila') {
      this._pasarCofreAMochila(a.ref, this._cofreActivo.slots[a.ref]?.cantidad || 1, dest);
    } else if (a.zona === 'mochila' && destZona === 'cofre') {
      this._pasarMochilaACofre(a.ref, Mochila.slots[a.ref]?.cantidad || 1, dest);
    }
    this._pintarRejillas();
  },

  _pasarMochilaACofre(slotMochila, cantidad, slotCofreDestino) {
    const sl = Mochila.slots[slotMochila];
    if (!sl || !this._cofreActivo) return;
    const mover = Math.min(cantidad, sl.cantidad);
    const copia = JSON.parse(JSON.stringify(this._cofreActivo.slots));
    if (slotCofreDestino != null && !isNaN(slotCofreDestino)) {
      if (!copia[slotCofreDestino]) copia[slotCofreDestino] = { id: sl.id, cantidad: 0 };
      if (copia[slotCofreDestino].id && copia[slotCofreDestino].id !== sl.id) {
        Notificaciones.mostrar('Casilla ocupada por otro objeto', 'alerta');
        return;
      }
      const max = this._maxPila(sl.id);
      const cabe = Math.min(mover, max - (copia[slotCofreDestino].cantidad || 0));
      if (cabe <= 0) { Notificaciones.mostrar('Pila al máximo (' + max + ')', 'alerta'); return; }
      copia[slotCofreDestino] = { id: sl.id, cantidad: (copia[slotCofreDestino].cantidad || 0) + cabe };
      if (!Mochila.quitar(sl.id, cabe, 'Guardado en cofre')) return;
      this._cofreActivo.slots = copia;
    } else {
      const rest = this._apilarEnSlots(copia, sl.id, mover);
      const puesto = mover - rest;
      if (puesto <= 0) { Notificaciones.mostrar('Cofre lleno', 'alerta'); return; }
      if (!Mochila.quitar(sl.id, puesto, 'Guardado en cofre')) return;
      this._cofreActivo.slots = copia;
    }
    this._guardarCofre();
  },

  _pasarCofreAMochila(slotCofre, cantidad, slotMochilaDestino) {
    const sl = this._cofreActivo.slots[slotCofre];
    if (!sl) return;
    const mover = Math.min(cantidad, sl.cantidad);
    if (slotMochilaDestino != null && !isNaN(slotMochilaDestino)) {
      const dest = Mochila.slots[slotMochilaDestino];
      const max = this._maxPila(sl.id);
      if (dest && dest.id !== sl.id) {
        Notificaciones.mostrar('Casilla ocupada por otro objeto', 'alerta');
        return;
      }
      const cabe = dest ? Math.min(mover, max - dest.cantidad) : Math.min(mover, max);
      if (cabe <= 0 || !Mochila.agregar(sl.id, cabe, { silencioso: true })) return;
      sl.cantidad -= cabe;
      if (sl.cantidad <= 0) this._cofreActivo.slots[slotCofre] = null;
    } else {
      if (!Mochila.agregar(sl.id, mover, { silencioso: true })) return;
      sl.cantidad -= mover;
      if (sl.cantidad <= 0) this._cofreActivo.slots[slotCofre] = null;
    }
    this._guardarCofre();
  },

  _guardarCofre() {
    Guardado.guardar();
    if (typeof Admin !== 'undefined' && Admin.esAdminJugador()) Admin._publicarParaTodos(true);
  },

  alternarVerOcultos() {
    this.verOcultos = !this.verOcultos;
    this._pintarTodos();
    Notificaciones.mostrar(this.verOcultos ? '👁️ Cofres ocultos visibles' : 'Ocultos ocultos de nuevo', 'info', 4000);
  }
};
