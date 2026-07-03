// ============================================================
// HISTORIAL SEGURO (cadena de hashes, estilo blockchain)
// Hay dos historiales: 'dinero' y 'objetos'.
// Cada entrada guarda el hash de la anterior; si alguien edita
// una entrada a mano, toda la cadena posterior queda inválida
// y el visor la marca como POSIBLE HACKEO.
// ============================================================
const Historial = {
  _cola: Promise.resolve(), // procesa las entradas en orden, una por una
  pestanaActual: 'dinero',

  _lista(tipo) {
    return tipo === 'dinero' ? Guardado.datos.historialDinero : Guardado.datos.historialObjetos;
  },

  // Registra un evento. Ejemplos:
  //  Historial.registrar('dinero',  { detalle: 'Compra: Pan', monto: -10, saldo: 90 })
  //  Historial.registrar('objetos', { detalle: 'Obtenido: Sardina x1', monto: 1 })
  registrar(tipo, entrada) {
    this._cola = this._cola.then(async () => {
      const lista = this._lista(tipo);
      const anterior = lista.length ? lista[lista.length - 1].hash : 'GENESIS';
      const e = {
        t: Date.now(),
        detalle: entrada.detalle,
        monto: entrada.monto ?? 0,
        saldo: entrada.saldo ?? null,
        hashAnterior: anterior
      };
      e.hash = await Utilidades.sha256(
        Guardado.SAL + '|' + e.t + '|' + e.detalle + '|' + e.monto + '|' + e.saldo + '|' + e.hashAnterior
      );
      lista.push(e);
      Guardado.guardar();
    });
    return this._cola;
  },

  // Verifica toda la cadena y devuelve los índices de entradas manipuladas
  async verificar(tipo) {
    const lista = this._lista(tipo);
    const malas = [];
    let anterior = 'GENESIS';
    for (let i = 0; i < lista.length; i++) {
      const e = lista[i];
      const esperado = await Utilidades.sha256(
        Guardado.SAL + '|' + e.t + '|' + e.detalle + '|' + e.monto + '|' + e.saldo + '|' + e.hashAnterior
      );
      if (e.hashAnterior !== anterior || e.hash !== esperado) malas.push(i);
      anterior = e.hash;
    }
    return malas;
  },

  // ---------- VISOR ----------
  iniciarVisor() {
    document.getElementById('btn-historial').addEventListener('click', () => this.abrir());
    document.getElementById('pestana-hist-dinero').addEventListener('click', () => this.cambiarPestana('dinero'));
    document.getElementById('pestana-hist-objetos').addEventListener('click', () => this.cambiarPestana('objetos'));
  },

  abrir() {
    document.getElementById('ventana-historial').classList.remove('oculto');
    this.pintar();
  },

  cambiarPestana(tipo) {
    this.pestanaActual = tipo;
    document.getElementById('pestana-hist-dinero').classList.toggle('activa', tipo === 'dinero');
    document.getElementById('pestana-hist-objetos').classList.toggle('activa', tipo === 'objetos');
    this.pintar();
  },

  async pintar() {
    const tipo = this.pestanaActual;
    const lista = this._lista(tipo);
    const malas = await this.verificar(tipo);

    const sello = document.getElementById('historial-integridad');
    if (Guardado.integridadRota || malas.length) {
      sello.textContent = '⚠️ POSIBLE HACKEO: se detectaron datos modificados a mano';
      sello.className = 'mal';
    } else {
      sello.textContent = '✅ Historial íntegro: sin señales de manipulación';
      sello.className = 'ok';
    }

    const cont = document.getElementById('historial-lista');
    cont.innerHTML = '';
    if (!lista.length) {
      cont.innerHTML = '<div class="tienda-vacia">Todavía no hay movimientos</div>';
      return;
    }
    // Más recientes arriba
    for (let i = lista.length - 1; i >= 0; i--) {
      const e = lista[i];
      const fila = document.createElement('div');
      fila.className = 'entrada-historial' + (malas.includes(i) ? ' manipulada' : '');
      const signo = e.monto > 0 ? '+' : '';
      const claseMonto = e.monto >= 0 ? 'positivo' : 'negativo';
      const unidad = tipo === 'dinero' ? '🪙' : 'ud.';
      fila.innerHTML =
        '<div class="detalle">' +
          '<div>' + e.detalle + (malas.includes(i) ? ' <span class="sello-hackeo">[MANIPULADO]</span>' : '') + '</div>' +
          '<div class="fecha">' + Utilidades.fechaLegible(e.t) +
            (e.saldo !== null ? ' · saldo: ' + e.saldo + ' 🪙' : '') + '</div>' +
        '</div>' +
        '<div class="monto ' + claseMonto + '">' + signo + e.monto + ' ' + unidad + '</div>';
      cont.appendChild(fila);
    }
  }
};
