// ============================================================
// VIDA, HAMBRE Y NIVEL (XP)
// La vida solo baja si el hambre llega a 0.
// ============================================================
const Vida = {
  actual: CONFIG.vidaMaxima,
  hambre: CONFIG.hambreInicial,
  xp: 0,
  nivel: 1,
  _muerto: false,

  iniciar() {
    this.actual = Guardado.datos.vida ?? CONFIG.vidaMaxima;
    this.hambre = Guardado.datos.hambre ?? CONFIG.hambreInicial;
    this.xp = Guardado.datos.xp ?? 0;
    this.nivel = Guardado.datos.nivel ?? 1;
    this._muerto = !!(Guardado.datos.muerto || this.actual <= 0);
    if (this._muerto) this.actual = 0;
    this._recalcularNivel();
    this.pintar();
    if (this._muerto) this._mostrarPantallaMuerte();
    setInterval(() => this._tickHambre(), CONFIG.segundosDesgasteHambre * 1000);
  },

  estaMuerto() {
    return this._muerto || this.actual <= 0;
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
    if (subio) Notificaciones.mostrar('⭐ ¡Subiste al nivel ' + this.nivel + '!', 'exito', 5000);
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

  cambiar(cantidad, motivo) {
    if (this.estaMuerto() && cantidad < 0) return;
    const antes = this.actual;
    this.actual = Math.max(0, Math.min(CONFIG.vidaMaxima, this.actual + cantidad));
    if (this.actual !== antes) {
      Guardado.datos.vida = this.actual;
      Guardado.guardar();
      this.pintar();
      if (motivo && cantidad > 0) Notificaciones.mostrar('❤️ ' + motivo, 'exito');
      if (this.actual === 0) this._activarMuerte();
    }
  },

  _activarMuerte() {
    if (this._muerto) return;
    this._muerto = true;
    Guardado.datos.muerto = true;
    Guardado.datos.vida = 0;
    Guardado.guardar();
    this._mostrarPantallaMuerte();
  },

  _mostrarPantallaMuerte() {
    const pantalla = document.getElementById('pantalla-muerte');
    if (pantalla) pantalla.classList.remove('oculto');
    document.body.classList.add('jugador-muerto');
  },

  revivir(vida) {
    this._muerto = false;
    Guardado.datos.muerto = false;
    this.actual = Math.max(1, Math.min(CONFIG.vidaMaxima, vida || CONFIG.vidaMaxima));
    Guardado.datos.vida = this.actual;
    Guardado.guardar();
    this.pintar();
    const pantalla = document.getElementById('pantalla-muerte');
    if (pantalla) pantalla.classList.add('oculto');
    document.body.classList.remove('jugador-muerto');
    Notificaciones.mostrar('❤️ El administrador te ha revivido', 'exito', 6000);
  },

  pintar() {
    const pctVida = (this.actual / CONFIG.vidaMaxima) * 100;
    document.getElementById('vida-relleno').style.width = pctVida + '%';

    const pctHam = (this.hambre / CONFIG.hambreMaxima) * 100;
    const hr = document.getElementById('hambre-relleno');
    if (hr) hr.style.width = pctHam + '%';

    const nl = document.getElementById('nivel-texto');
    if (nl) nl.textContent = 'Nv ' + this.nivel;
    const necesita = this.nivel >= CONFIG.nivelMaximo ? 1 : this.xpParaNivel(this.nivel);
    let acum = 0;
    for (let i = 1; i < this.nivel; i++) acum += this.xpParaNivel(i);
    const enNivel = this.xp - acum;
    const pctXp = this.nivel >= CONFIG.nivelMaximo ? 100 : Math.min(100, (enNivel / necesita) * 100);
    const xr = document.getElementById('xp-relleno');
    if (xr) xr.style.width = pctXp + '%';
  }
};
