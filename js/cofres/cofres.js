// ============================================================
// COFRES — colocar, abrir e intercambiar objetos (6 casillas)
// ============================================================
const Cofres = {
  TOTAL_SLOTS: 6,
  _marcadores: {},
  _circuloColocar: null,
  _modoColocar: null,
  verOcultos: false,

  iniciar() {
    if (!Guardado.datos.cofresAbiertos) Guardado.datos.cofresAbiertos = [];
    this._pintarTodos();
    if (typeof Admin !== 'undefined') Admin.iniciarVigilanciaCofres = () => this._pintarTodos();
  },

  lista() {
    const locales = Guardado.datos.cofresLocales || [];
    const globales = (typeof Admin !== 'undefined' && Admin.publicado && Admin.publicado.cofres) || [];
    const mapa = new Map();
    for (const c of globales) mapa.set(c.id, c);
    for (const c of locales) mapa.set(c.id, c);
    return [...mapa.values()].filter(c => !c.eliminado);
  },

  usarCofreInventario() {
    if (!Mochila.tieneItem('cofre')) {
      Notificaciones.mostrar('No tienes un cofre en la mochila', 'alerta');
      return;
    }
    const visible = confirm('¿Cofre VISIBLE en el mapa?\n\nAceptar = visible\nCancelar = oculto (solo quien sepa dónde está)');
    const clave = prompt('Contraseña del cofre (4 números):');
    if (clave === null) return;
    if (!/^\d{4}$/.test(clave.trim())) { alert('Debe ser de 4 números'); return; }
    this._modoColocar = { visible, pin: clave.trim() };
    this._mostrarCirculoColocar();
    Notificaciones.mostrar('📍 Toca el mapa dentro del círculo para dejar el cofre', 'info', 6000);
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
      Notificaciones.mostrar('Muy lejos: el cofre debe estar dentro del círculo (' + Math.round(dist) + ' m)', 'alerta');
      this._modoColocar = null;
      return;
    }
    if (!Mochila.quitar('cofre', 1, 'Cofre colocado en el mapa')) {
      this._modoColocar = null;
      return;
    }
    const cofre = {
      id: 'cofre_' + Date.now().toString(36),
      pos: [+latlng.lat.toFixed(6), +latlng.lng.toFixed(6)],
      visible: this._modoColocar.visible,
      pinHash: await Utilidades.sha256('cofre-pin|' + this._modoColocar.pin),
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
      this._marcadores[id].remove();
      delete this._marcadores[id];
    }
    for (const c of this.lista()) this._crearMarcador(c);
  },

  _crearMarcador(c) {
    const esAdm = typeof Admin !== 'undefined' && Admin.esAdminJugador() && this.verOcultos;
    if (!c.visible && !esAdm) return;
    if (this._marcadores[c.id]) return;
    const icono = c.visible ? '🧰' : (esAdm ? '👻🧰' : null);
    if (!icono) return;
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
    if (Guardado.datos.cofresAbiertos.includes(cofre.id)) {
      this._mostrarVentana(cofre);
      return;
    }
    const pin = prompt('Contraseña del cofre (4 números):');
    if (pin === null) return;
    const hash = await Utilidades.sha256('cofre-pin|' + pin.trim());
    if (hash !== cofre.pinHash) { alert('Contraseña incorrecta'); return; }
    Guardado.datos.cofresAbiertos.push(cofre.id);
    Guardado.guardar();
    this._mostrarVentana(cofre);
  },

  _mostrarVentana(cofre) {
    this._cofreActivo = cofre;
    document.getElementById('cofre-info').textContent =
      (cofre.visible ? 'Cofre visible' : 'Cofre oculto') + ' · ' + (cofre.creadorNombre || 'Desconocido');
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
        const it = Items.seguro(sl.id);
        cel.textContent = it.icono;
        const cant = document.createElement('span');
        cant.className = 'cantidad';
        cant.textContent = sl.cantidad;
        cel.appendChild(cant);
      }
      cel.addEventListener('click', () => this._moverACofre(i));
      rc.appendChild(cel);
    });
    Mochila.slots.forEach((sl, i) => {
      if (!sl) return;
      const cel = document.createElement('button');
      cel.className = 'slot cofre-slot';
      const it = Items.seguro(sl.id);
      cel.textContent = it.icono;
      const cant = document.createElement('span');
      cant.className = 'cantidad';
      cant.textContent = sl.cantidad;
      cel.appendChild(cant);
      cel.addEventListener('click', () => this._moverAMochila(i));
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
    Notificaciones.mostrar(this.verOcultos ? '👁️ Cofres ocultos visibles' : 'Cofres ocultos ocultos de nuevo', 'info', 4000);
  }
};
