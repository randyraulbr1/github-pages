// ============================================================
// SISTEMA DE DINERO
// El saldo real se guarda junto a un hash de control y además
// cada movimiento queda registrado en el historial encadenado.
// Al cargar, el saldo se compara contra la suma del historial:
// si no cuadra, se marca como posible hackeo.
// ============================================================
const Dinero = {
  saldo: 0,

  async iniciar() {
    if (Guardado.datos.dinero === null) {
      // Partida nueva
      Guardado.datos.dinero = { saldo: CONFIG.dineroInicial, control: '' };
      this.saldo = CONFIG.dineroInicial;
      await Historial.registrar('dinero', {
        detalle: 'Dinero inicial', monto: CONFIG.dineroInicial, saldo: this.saldo
      });
      await this._sellar();
    } else {
      this.saldo = Guardado.datos.dinero.saldo;
      const controlEsperado = await this._hashControl(this.saldo);
      const sumaHistorial = (Guardado.datos.historialDinero || []).reduce((s, e) => s + e.monto, 0);
      if (Guardado.datos.dinero.control !== controlEsperado || sumaHistorial !== this.saldo) {
        Guardado.integridadRota = true;
        Notificaciones.mostrar('⚠️ Se detectó una modificación del dinero guardado', 'error', 6000);
      }
    }
    this.pintar();
  },

  _hashControl(saldo) {
    return Utilidades.sha256(Guardado.SAL + '|saldo|' + saldo);
  },

  async _sellar() {
    Guardado.datos.dinero.saldo = this.saldo;
    Guardado.datos.dinero.control = await this._hashControl(this.saldo);
    Guardado.guardar();
  },

  puedePagar(cantidad) {
    return this.saldo >= cantidad;
  },

  // Suma dinero. 'motivo' aparece en el historial.
  async ganar(cantidad, motivo) {
    if (cantidad <= 0) return;
    this.saldo += cantidad;
    await Historial.registrar('dinero', { detalle: motivo, monto: cantidad, saldo: this.saldo });
    await this._sellar();
    this.pintar();
  },

  // Resta dinero. Devuelve false si no alcanza.
  async gastar(cantidad, motivo) {
    if (cantidad <= 0) return true;
    if (!this.puedePagar(cantidad)) {
      Notificaciones.mostrar('No tienes suficiente dinero', 'error');
      return false;
    }
    this.saldo -= cantidad;
    await Historial.registrar('dinero', { detalle: motivo, monto: -cantidad, saldo: this.saldo });
    await this._sellar();
    this.pintar();
    return true;
  },

  pintar() {
    const cant = this.saldo;
    const texto = '$' + cant;
    const el = document.getElementById('hud-dinero-cantidad');
    if (el) el.textContent = texto;
    if (typeof Opciones !== 'undefined' && Opciones.pintarPerfilOpciones) Opciones.pintarPerfilOpciones();
  }
};
