// ============================================================
// BARRA DE VIDA
// La vida baja poco a poco con el tiempo (hay que comer) y se
// recupera usando comida o medicinas de la mochila.
// ============================================================
const Vida = {
  actual: CONFIG.vidaMaxima,

  iniciar() {
    this.actual = Guardado.datos.vida ?? CONFIG.vidaMaxima;
    this.pintar();
    // Desgaste lento: 1 punto cada CONFIG.segundosDesgasteVida segundos
    setInterval(() => this.cambiar(-1, null), CONFIG.segundosDesgasteVida * 1000);
  },

  // cantidad positiva cura, negativa daña. 'motivo' opcional para notificar.
  cambiar(cantidad, motivo) {
    const antes = this.actual;
    this.actual = Math.max(0, Math.min(CONFIG.vidaMaxima, this.actual + cantidad));
    if (this.actual !== antes) {
      Guardado.datos.vida = this.actual;
      Guardado.guardar();
      this.pintar();
      if (motivo && cantidad > 0) Notificaciones.mostrar('❤️ ' + motivo + ' (+' + (this.actual - antes) + ' vida)', 'exito');
      if (this.actual === 0) Notificaciones.mostrar('💀 ¡Estás sin energía! Come algo para recuperarte', 'error', 5000);
      else if (this.actual <= 20 && antes > 20) Notificaciones.mostrar('⚠️ Vida baja, busca comida', 'alerta');
    }
  },

  pintar() {
    const pct = (this.actual / CONFIG.vidaMaxima) * 100;
    const relleno = document.getElementById('vida-relleno');
    relleno.style.width = pct + '%';
    relleno.style.background = pct > 50 ? '#2ecc71' : pct > 20 ? '#ffd76a' : '#e0392b';
    document.getElementById('vida-texto').textContent = this.actual + ' / ' + CONFIG.vidaMaxima;
  }
};
