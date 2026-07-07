// ============================================================
// VIDA, HAMBRE Y NIVEL (XP)
// La vida solo baja si el hambre llega a 0.
// Vida máxima escala del 100 (nv 1) hasta ~496 (nv 100).
// ============================================================
const Vida = {
  actual: CONFIG.vidaMaxima,
  hambre: CONFIG.hambreInicial,
  xp: 0,
  nivel: 1,
  _muerto: false,

  vidaMaxima(nivel) {
    const n = Math.max(1, Math.min(CONFIG.nivelMaximo, nivel != null ? nivel : this.nivel));
    if (typeof Admin !== 'undefined' && Admin.vidaJugadorPorNivel) {
      return Admin.vidaJugadorPorNivel(n);
    }
    const extra = CONFIG.vidaExtraPorNivel || 4;
    return CONFIG.vidaMaxima + Math.floor((n - 1) * extra);
  },

  iniciar() {
    this.xp = Guardado.datos.xp ?? 0;
    this.nivel = Guardado.datos.nivel ?? 1;
    this._recalcularNivel();
    const max = this.vidaMaxima();
    this.actual = Guardado.datos.vida ?? max;
    if (this.actual > max) this.actual = max;
    this.hambre = Guardado.datos.hambre ?? CONFIG.hambreInicial;
    this._muerto = !!(Guardado.datos.muerto || this.actual <= 0);
    if (this._muerto) this.actual = 0;
    if (this._muerto && !Guardado.datos.muertePos && Guardado.datos.posicionJugador) {
      Guardado.datos.muertePos = Guardado.datos.posicionJugador.slice();
    }
    this._asegurarVidaAdmin();
    this.pintar();
    if (this._muerto) this._mostrarPantallaMuerte();
    setInterval(() => this._tickHambre(), CONFIG.segundosDesgasteHambre * 1000);
  },

  estaMuerto() {
    if (this._esAdmin()) return false;
    return this._muerto || this.actual <= 0;
  },

  _esAdmin() {
    return typeof Usuarios !== 'undefined' && Usuarios.esAdministrador();
  },

  _vidaMinimaAdmin() {
    return this.vidaMaxima();
  },

  _asegurarVidaAdmin() {
    if (!this._esAdmin()) return;
    const max = this.vidaMaxima();
    if (this._muerto || this.actual < max) {
      this._muerto = false;
      Guardado.datos.muerto = false;
      this.actual = max;
      Guardado.datos.vida = max;
      const pantalla = document.getElementById('pantalla-muerte');
      if (pantalla) pantalla.classList.add('oculto');
      document.body.classList.remove('jugador-muerto');
    }
  },

  xpParaNivel(n) {
    if (n >= CONFIG.nivelMaximo) return Infinity;
    return Math.floor(80 * Math.pow(n, 1.85));
  },

  _recalcularNivel() {
    let n = 1;
    let restante = this.xp;
    while (n < CONFIG.nivelMaximo) {
      const necesita = this.xpParaNivel(n);
      if (restante < necesita) break;
      restante -= necesita;
      n++;
    }
    const subio = n > this.nivel;
    this.nivel = n;
    Guardado.datos.nivel = this.nivel;
    if (subio) {
      this.actual = this.vidaMaxima();
      Guardado.datos.vida = this.actual;
      if (typeof Mochila !== 'undefined' && Mochila.armaEquipadaId() &&
          !Items.armaAptaParaNivel(Mochila.armaEquipadaId(), this.nivel)) {
        Mochila.desequiparArma();
      }
      if (this._muerto) {
        this._muerto = false;
        Guardado.datos.muerto = false;
        const pantalla = document.getElementById('pantalla-muerte');
        if (pantalla) pantalla.classList.add('oculto');
        document.body.classList.remove('jugador-muerto');
      }
      Notificaciones.mostrar(
        '⭐ ¡Subiste al nivel ' + this.nivel + '! Vida restaurada a ' + this.vidaMaxima(),
        'exito', 5000
      );
      if (typeof Mochila !== 'undefined' && Mochila._pintarDanoAtaque) Mochila._pintarDanoAtaque();
    }
  },

  ganarXp(cantidad, motivo) {
    if (this.estaMuerto()) return;
    if (this.nivel >= CONFIG.nivelMaximo) return;
    this.xp += cantidad;
    Guardado.datos.xp = this.xp;
    this._recalcularNivel();
    Guardado.guardar();
    this.pintar();
    if (motivo) Notificaciones.mostrar('✨ +' + cantidad + ' XP · ' + motivo, 'info', 3000);
  },

  _tickHambre() {
    if (this.estaMuerto()) return;
    if (typeof Usuarios !== 'undefined' && Usuarios.esAdministrador()) return;
    if (this.hambre > 0) {
      this.hambre = Math.max(0, this.hambre - 1);
      Guardado.datos.hambre = this.hambre;
      Guardado.guardar();
      this.pintar();
      if (this.hambre === 0) Notificaciones.mostrar('🍽️ ¡Tienes hambre! Come algo', 'alerta', 4000);
    } else {
      this.cambiar(-1, null);
    }
  },

  alimentar(cantidad, motivo) {
    if (this.estaMuerto()) return;
    const antes = this.hambre;
    this.hambre = Math.min(CONFIG.hambreMaxima, this.hambre + cantidad);
    if (this.hambre !== antes) {
      Guardado.datos.hambre = this.hambre;
      Guardado.guardar();
      this.pintar();
      if (motivo) Notificaciones.mostrar('🍽️ ' + motivo + ' (+' + (this.hambre - antes) + ' hambre)', 'exito');
    }
  },

  /** Daño de enemigos — popup flotante en vez de notificación */
  recibirDano(cantidad, motivo, nombreEnemigo) {
    if (this.estaMuerto() || cantidad <= 0) return;
    const antes = this.actual;
    let nuevo = Math.max(0, this.actual - cantidad);
    if (this._esAdmin()) nuevo = this.vidaMaxima();
    this.actual = nuevo;
    if (this.actual !== antes) {
      Guardado.datos.vida = this.actual;
      Guardado.guardar();
      this.pintar();
      if (nombreEnemigo || cantidad > 0) {
        this._mostrarDanoFlotante(cantidad);
        if (nombreEnemigo && typeof Utilidades !== 'undefined') {
          Utilidades.vibrar(120 + Math.min(80, cantidad * 8));
        }
      } else if (motivo) {
        Notificaciones.mostrar(motivo, 'alerta', 2200);
      }
      if (this.actual === 0) this._activarMuerte();
    }
  },

  _mostrarDanoFlotante(cantidad) {
    const zona = document.getElementById('zona-dano-flotante');
    if (!zona) return;
    const el = document.createElement('div');
    el.className = 'dano-flotante';
    el.textContent = '-' + cantidad;
    zona.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('visible')));
    setTimeout(() => {
      el.classList.add('saliendo');
      setTimeout(() => el.remove(), 450);
    }, 900);
  },

  cambiar(cantidad, motivo) {
    if (this.estaMuerto() && cantidad < 0) return;
    if (cantidad < 0 && typeof Usuarios !== 'undefined' && Usuarios.esAdministrador()) return;
    const max = this.vidaMaxima();
    const antes = this.actual;
    this.actual = Math.max(0, Math.min(max, this.actual + cantidad));
    if (this.actual !== antes) {
      Guardado.datos.vida = this.actual;
      Guardado.guardar();
      this.pintar();
      if (motivo && cantidad > 0) Notificaciones.mostrar('❤️ ' + motivo, 'exito');
      if (this.actual === 0) this._activarMuerte();
    }
  },

  _activarMuerte() {
    if (this._esAdmin()) {
      this._asegurarVidaAdmin();
      return;
    }
    if (this._muerto) return;
    this._muerto = true;
    Guardado.datos.muerto = true;
    Guardado.datos.vida = 0;
    if (typeof GPS !== 'undefined' && GPS.posicion) {
      Guardado.datos.muertePos = GPS.posicion.slice();
    }
    Guardado.datos.muertoAt = Date.now();
    Guardado.datos.muerteInventario = (Guardado.datos.mochila || [])
      .filter(Boolean)
      .map(s => ({ id: s.id, cantidad: s.cantidad || 1 }));
    Guardado.guardar();
    if (typeof Guardado !== 'undefined') Guardado.sincronizarNube(true).catch(() => {});
    this._mostrarPantallaMuerte();
    if (typeof Enemigos !== 'undefined' && Enemigos._limpiarVisionHaciaJugador) {
      Enemigos._limpiarVisionHaciaJugador();
    }
    if (typeof Multijugador !== 'undefined') Multijugador.enviarStats(true);
  },

  _mostrarPantallaMuerte() {
    const pantalla = document.getElementById('pantalla-muerte');
    if (pantalla) pantalla.classList.remove('oculto');
    document.body.classList.add('jugador-muerto');
    this._actualizarTextoExpiraMuerte();
  },

  _muertoAtMs() {
    if (Guardado.datos.muertoAt) return Guardado.datos.muertoAt;
    if (typeof Multijugador !== 'undefined' && Multijugador.activo) {
      const c = Multijugador.cuerpos?.[String(Multijugador._miPlayerId())];
      if (c?.muertoAt) return c.muertoAt;
    }
    return null;
  },

  _actualizarTextoExpiraMuerte() {
    const el = document.getElementById('muerte-expira-texto');
    if (!el) return;
    const horas = CONFIG.cuerpoMuertoHoras || 1;
    const muertoAt = this._muertoAtMs();
    if (!muertoAt) {
      el.innerHTML = 'Tu ataúd ⚰️ permanece <b>' + horas + ' hora</b> en el mapa. Después desaparece y no podrás ser revivido.';
      return;
    }
    const expira = muertoAt + horas * 3600000;
    const f = new Date(expira);
    const fecha = f.toLocaleDateString('es-ES');
    const hora = f.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    el.innerHTML = 'Tu ataúd ⚰️ desaparece el <b>' + fecha + ' a las ' + hora + '</b>. Después no podrás ser revivido.';
  },

  revivir(vida, motivo) {
    this._muerto = false;
    Guardado.datos.muerto = false;
    Guardado.datos.muertePos = null;
    Guardado.datos.muerteInventario = null;
    Guardado.datos.muertoAt = null;
    const max = this.vidaMaxima();
    this.actual = Math.max(1, Math.min(max, vida || max));
    Guardado.datos.vida = this.actual;
    Guardado.guardar();
    this.pintar();
    const pantalla = document.getElementById('pantalla-muerte');
    if (pantalla) pantalla.classList.add('oculto');
    document.body.classList.remove('jugador-muerto');
    if (typeof Multijugador !== 'undefined') {
      Multijugador._quitarCuerpoPropioSiVivo?.();
      Multijugador.enviarStats(true);
    }
    Notificaciones.mostrar(
      motivo || '❤️ El administrador te revivió. ¡Ya puedes seguir jugando!',
      'exito', 6000
    );
    if (typeof Guardado !== 'undefined') Guardado.sincronizarNube(true).catch(() => {});
  },

  pintar() {
    const max = this.vidaMaxima();
    const pctVida = max > 0 ? (this.actual / max) * 100 : 0;
    document.getElementById('vida-relleno').style.width = pctVida + '%';
    const contVida = document.getElementById('contenedor-vida');
    if (contVida) {
      contVida.classList.remove('vida-alta', 'vida-media', 'vida-baja');
      if (pctVida >= 60) contVida.classList.add('vida-alta');
      else if (pctVida >= 30) contVida.classList.add('vida-media');
      else contVida.classList.add('vida-baja');
    }
    const vt = document.getElementById('vida-texto');
    if (vt) vt.textContent = this.actual + '/' + max;

    const pctHam = (this.hambre / CONFIG.hambreMaxima) * 100;
    const hr = document.getElementById('hambre-relleno');
    if (hr) hr.style.width = pctHam + '%';
    const ht = document.getElementById('hambre-texto');
    if (ht) ht.textContent = this.hambre + '/' + CONFIG.hambreMaxima;

    const nl = document.getElementById('nivel-texto');
    if (nl) nl.textContent = 'Nv ' + this.nivel;
    const necesita = this.nivel >= CONFIG.nivelMaximo ? 1 : this.xpParaNivel(this.nivel);
    let acum = 0;
    for (let i = 1; i < this.nivel; i++) acum += this.xpParaNivel(i);
    const enNivel = this.xp - acum;
    const pctXp = this.nivel >= CONFIG.nivelMaximo ? 100 : Math.min(100, (enNivel / necesita) * 100);
    const xr = document.getElementById('xp-relleno');
    if (xr) xr.style.width = pctXp + '%';
    const xt = document.getElementById('xp-texto');
    if (xt) {
      xt.textContent = this.nivel >= CONFIG.nivelMaximo
        ? 'MAX' : Math.floor(enNivel) + '/' + necesita;
    }
    if (typeof Opciones !== 'undefined' && Opciones.pintarPerfilOpciones) Opciones.pintarPerfilOpciones();
    if (typeof Multijugador !== 'undefined') Multijugador.enviarStats(false);
  }
};
