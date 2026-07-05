// ============================================================
// COFRES — visibles (libres) u ocultos (PIN 4 dígitos / llave maestra)
// ============================================================
const Cofres = {
  TOTAL_SLOTS: 6,
  PROB_LLAVE: 0.15,
  _marcadores: {},
  _circuloColocar: null,
  _modoColocar: null,
  verOcultos: false,

  iniciar() {
    if (!Guardado.datos.cofresAbiertos) Guardado.datos.cofresAbiertos = [];
    this._pintarTodos();
  },

  lista() {
    const mapa = new Map();
    for (const c of ((Admin && Admin.publicado && Admin.publicado.cofres) || [])) mapa.set(c.id, c);
    for (const c of (Guardado.datos.cofresLocales || [])) mapa.set(c.id, c);
    return [...mapa.values()].filter(c => !c.eliminado);
  },

  usarCofreInventario() {
    if (!Mochila.tieneItem('cofre')) {
      Notificaciones.mostrar('No tienes un cofre en la mochila', 'alerta');
      return;
    }
    const visible = confirm(
      '¿Cofre VISIBLE?\n\n' +
      'Aceptar = visible (cualquiera puede abrirlo y usar sus casillas)\n' +
      'Cancelar = oculto (solo con tu PIN de 4 números)'
    );
    let pin = null;
    if (!visible) {
      pin = prompt('PIN del cofre oculto (4 números):');
      if (pin === null) return;
      if (!Utilidades.pinCofreValido(pin.trim())) { alert('El PIN debe ser de 4 números'); return; }
      pin = pin.trim();
    }
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
      Guardado.datos.cofresAbiertos.push(mejor.id);
      Guardado.guardar();
      Notificaciones.mostrar('🔓 ¡La llave abrió el cofre oculto!', 'exito', 5000);
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
    if (!Mochila.quitar('cofre', 1, 'Cofre colocado')) {
      this._modoColocar = null;
      return;
    }
    const cofre = {
      id: 'cofre_' + Date.now().toString(36),
      pos: [+latlng.lat.toFixed(6), +latlng.lng.toFixed(6)],
      visible: this._modoColocar.visible,
      pinHash: this._modoColocar.pin
        ? await Utilidades.sha256('cofre-pin|' + this._modoColocar.pin) : null,
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
      Admin._publicarParaTodos();
    }
    this._modoColocar = null;
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
    const pin = prompt('PIN del cofre oculto (4 números):');
    if (pin === null) return;
    if (!Utilidades.pinCofreValido(pin.trim())) { alert('PIN de 4 números'); return; }
    const hash = await Utilidades.sha256('cofre-pin|' + pin.trim());
    if (hash !== cofre.pinHash) { alert('PIN incorrecto'); return; }
    Guardado.datos.cofresAbiertos.push(cofre.id);
    Guardado.guardar();
    this._mostrarVentana(cofre);
  },

  _mostrarVentana(cofre) {
    this._cofreActivo = cofre;
    document.getElementById('cofre-info').textContent =
      (cofre.visible ? 'Cofre visible — abierto para todos' : 'Cofre oculto') +
      ' · ' + (cofre.creadorNombre || '—');
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
      const cel = document.createElement('button');
      cel.className = 'slot cofre-slot';
      if (sl) {
        cel.textContent = Items.seguro(sl.id).icono;
        const cant = document.createElement('span');
        cant.className = 'cantidad';
        cant.textContent = sl.cantidad;
        cel.appendChild(cant);
      }
      cel.addEventListener('click', () => this._moverAMochila(i));
      rc.appendChild(cel);
    });
    Mochila.slots.forEach((sl, i) => {
      if (!sl) return;
      const cel = document.createElement('button');
      cel.className = 'slot cofre-slot';
      cel.textContent = Items.seguro(sl.id).icono;
      const cant = document.createElement('span');
      cant.className = 'cantidad';
      cant.textContent = sl.cantidad;
      cel.appendChild(cant);
      cel.addEventListener('click', () => this._moverACofre(i));
      rm.appendChild(cel);
    });
  },

  _moverACofre(slotMochila) {
    const sl = Mochila.slots[slotMochila];
    if (!sl || !this._cofreActivo) return;
    const vacio = this._cofreActivo.slots.findIndex(s => !s);
    if (vacio < 0) { Notificaciones.mostrar('Cofre lleno (6 casillas)', 'alerta'); return; }
    this._cofreActivo.slots[vacio] = { id: sl.id, cantidad: 1 };
    Mochila.quitar(sl.id, 1, 'Guardado en cofre');
    this._guardarCofre();
    this._pintarRejillas();
  },

  _moverAMochila(slotCofre) {
    const sl = this._cofreActivo.slots[slotCofre];
    if (!sl) return;
    if (!Mochila.agregar(sl.id, 1, { silencioso: true })) return;
    sl.cantidad--;
    if (sl.cantidad <= 0) this._cofreActivo.slots[slotCofre] = null;
    this._guardarCofre();
    this._pintarRejillas();
  },

  _guardarCofre() {
    Guardado.guardar();
    if (typeof Admin !== 'undefined' && Admin.esAdminJugador()) Admin._publicarParaTodos();
  },

  alternarVerOcultos() {
    this.verOcultos = !this.verOcultos;
    this._pintarTodos();
    Notificaciones.mostrar(this.verOcultos ? '👁️ Cofres ocultos visibles' : 'Ocultos ocultos de nuevo', 'info', 4000);
  }
};
