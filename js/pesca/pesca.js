// ============================================================
// MINIJUEGO DE PESCA
// Hay muelles de pesca (🛶) en la bahía. Estando a menos de
// 20 m y con una caña en la mochila, se abre el minijuego:
// detén el indicador dentro de la zona verde para capturar.
// La carnada mejora la suerte (se gasta 1 por captura).
// ============================================================
const Pesca = {
  MUELLES: [],
  _animacion: null,
  _estado: 'listo', // listo | moviendo
  _posIndicador: 0,
  _direccion: 1,
  _zonaVerde: { inicio: 40, ancho: 20 },

  iniciar() {
    this.MUELLES.forEach((pos, i) => {
      if (Admin.eliminado('muelle_' + i)) return;
      Admin.pos('muelle_' + i, pos);
      const marcador = Mapa.crearMarcadorEmoji(pos, '🛶');
      Mapa.registrarPunto({
        id: 'muelle_' + i,
        posicion: pos,
        radio: CONFIG.distanciaInteraccion,
        marcador,
        alTocar: () => this.abrir()
      });
    });
    document.getElementById('btn-pescar').addEventListener('click', () => this.accionBoton());
  },

  abrir() {
    if (!Mochila.tieneItem('cana_pescar')) {
      Notificaciones.mostrar('🎣 Necesitas una caña de pescar (Casa del Pescador)', 'alerta', 4500);
      return;
    }
    if (typeof UIManager !== 'undefined') UIManager.abrir('ventana-pesca');
    else document.getElementById('ventana-pesca').classList.remove('oculto');
    this._reiniciar();
  },

  _reiniciar() {
    this._detenerAnimacion();
    this._estado = 'listo';
    document.getElementById('btn-pescar').textContent = 'LANZAR';
    document.getElementById('pesca-mensaje').textContent = 'Toca LANZAR y detén el indicador en la zona verde';
    document.getElementById('pesca-indicador').style.left = '0%';
    document.getElementById('pesca-zona-verde').style.left = '40%';
    document.getElementById('pesca-zona-verde').style.width = '20%';
  },

  accionBoton() {
    if (this._estado === 'listo') this._lanzar();
    else this._detener();
  },

  _lanzar() {
    this._estado = 'moviendo';
    document.getElementById('btn-pescar').textContent = '¡AHORA!';
    document.getElementById('pesca-mensaje').textContent = '...esperando que pique...';

    // Zona verde aleatoria; con carnada la zona es más grande (más fácil)
    const conCarnada = Mochila.tieneItem('carnada');
    const ancho = conCarnada ? 24 : 14;
    const inicio = 15 + Math.random() * (80 - ancho - 15);
    this._zonaVerde = { inicio, ancho };
    const verde = document.getElementById('pesca-zona-verde');
    verde.style.left = inicio + '%';
    verde.style.width = ancho + '%';

    this._posIndicador = 0;
    this._direccion = 1;
    const velocidad = 1.4 + Math.random() * 0.8;
    const paso = () => {
      this._posIndicador += this._direccion * velocidad;
      if (this._posIndicador >= 100) { this._posIndicador = 100; this._direccion = -1; }
      if (this._posIndicador <= 0) { this._posIndicador = 0; this._direccion = 1; }
      document.getElementById('pesca-indicador').style.left = 'calc(' + this._posIndicador + '% - 3px)';
      this._animacion = requestAnimationFrame(paso);
    };
    this._animacion = requestAnimationFrame(paso);
  },

  _detenerAnimacion() {
    if (this._animacion) cancelAnimationFrame(this._animacion);
    this._animacion = null;
  },

  _detener() {
    this._detenerAnimacion();
    this._estado = 'listo';
    document.getElementById('btn-pescar').textContent = 'LANZAR';

    const z = this._zonaVerde;
    const dentro = this._posIndicador >= z.inicio && this._posIndicador <= z.inicio + z.ancho;
    if (!dentro) {
      document.getElementById('pesca-mensaje').textContent = '💨 ¡Se escapó! Inténtalo otra vez';
      return;
    }
    this._capturar();
  },

  _capturar() {
    // Elegir pez según rareza (los raros salen menos)
    const conCarnada = Mochila.tieneItem('carnada');
    const peces = Items.peces();
    const pesos = peces.map(p => {
      let peso = { 1: 100, 2: 45, 3: 15, 4: 5 }[p.rareza] || 10;
      if (conCarnada && p.rareza >= 3) peso *= 2; // la carnada atrae peces raros
      return peso;
    });
    const total = pesos.reduce((a, b) => a + b, 0);
    let azar = Math.random() * total;
    let pez = peces[0];
    for (let i = 0; i < peces.length; i++) {
      azar -= pesos[i];
      if (azar <= 0) { pez = peces[i]; break; }
    }

    if (conCarnada) Mochila.quitar('carnada', 1, 'Gastado pescando');
    Mochila.agregar(pez.id, 1, { silencioso: true });
    document.getElementById('pesca-mensaje').textContent =
      pez.icono + ' ¡Capturaste: ' + pez.nombre + '! (se vende por $' + Math.floor(pez.precio / 2) + ')';
    Notificaciones.mostrar(pez.icono + ' Pescaste ' + pez.nombre, 'exito');

    // Animación del pez volando hacia la mochila
    const barra = document.getElementById('pesca-barra').getBoundingClientRect();
    Utilidades.volarHaciaMochila(pez.icono, barra.left + barra.width / 2, barra.top);

    // Red de pesca: 20% de atrapar un pez común extra
    if (Mochila.tieneItem('red_pesca') && Math.random() < 0.2) {
      const comunes = peces.filter(p => p.rareza === 1);
      const extra = comunes[Math.floor(Math.random() * comunes.length)];
      Mochila.agregar(extra.id, 1, { silencioso: true });
      Notificaciones.mostrar('🕸️ ¡Tu red atrapó también ' + extra.nombre + '!', 'exito');
    }

    Misiones.evento('pez_capturado', pez.id);
  }
};
