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

  // Registra un evento. Cada entrada guarda automáticamente:
  //  fecha y hora, posición GPS del jugador y el lugar del mapa más cercano.
  // Ejemplos:
  //  Historial.registrar('dinero',  { detalle: 'Compra: Pan', monto: -10, saldo: 90 })
  //  Historial.registrar('objetos', { detalle: 'Obtenido: Sardina x1', monto: 1 })
  registrar(tipo, entrada) {
    this._cola = this._cola.then(async () => {
      const lista = this._lista(tipo);
      const anterior = lista.length ? lista[lista.length - 1].hash : 'GENESIS';
      const pos = (typeof GPS !== 'undefined' && GPS.posicion)
        ? [+GPS.posicion[0].toFixed(6), +GPS.posicion[1].toFixed(6)]
        : null;
      const e = {
        t: Date.now(),
        detalle: entrada.detalle,
        monto: entrada.monto ?? 0,
        saldo: entrada.saldo ?? null,
        lugar: entrada.lugar || this._lugarCercano(pos),
        pos,
        hashAnterior: anterior
      };
      e.hash = await this._hashEntrada(e);
      lista.push(e);
      Guardado.guardar();
    });
    return this._cola;
  },

  // El hash cubre también el lugar y la posición: si alguien los edita, se detecta
  _hashEntrada(e) {
    return Utilidades.sha256(
      Guardado.SAL + '|' + e.t + '|' + e.detalle + '|' + e.monto + '|' + e.saldo + '|' +
      (e.lugar ?? '') + '|' + (e.pos ? e.pos.join(',') : '') + '|' + e.hashAnterior
    );
  },

  // Fórmula de las entradas antiguas (partidas guardadas antes de añadir el lugar)
  _hashEntradaAntiguo(e) {
    return Utilidades.sha256(
      Guardado.SAL + '|' + e.t + '|' + e.detalle + '|' + e.monto + '|' + e.saldo + '|' + e.hashAnterior
    );
  },

  // Nombre del sitio del mapa más cercano a una posición (tienda, muelle, tesoro, misión)
  _lugarCercano(pos) {
    if (!pos) return 'sin posición';
    const candidatos = [];
    if (typeof DATOS_TIENDAS !== 'undefined')
      for (const t of DATOS_TIENDAS) candidatos.push({ nombre: t.nombre, pos: t.posicion });
    if (typeof Pesca !== 'undefined')
      Pesca.MUELLES.forEach((p, i) => candidatos.push({ nombre: '🛶 Muelle de pesca ' + (i + 1), pos: p }));
    if (typeof DATOS_TESOROS !== 'undefined')
      for (const t of DATOS_TESOROS) candidatos.push({ nombre: '✨ ' + t.id.replace(/_/g, ' '), pos: t.posicion });
    if (typeof DATOS_MISIONES !== 'undefined')
      for (const m of DATOS_MISIONES) candidatos.push({ nombre: '❗ ' + m.titulo, pos: m.posicion });
    let mejor = null, distanciaMinima = Infinity;
    for (const c of candidatos) {
      const d = Utilidades.distanciaMetros(pos, c.pos);
      if (d < distanciaMinima) { distanciaMinima = d; mejor = c; }
    }
    if (mejor && distanciaMinima <= 40) return mejor.nombre + ' (a ' + Math.round(distanciaMinima) + ' m)';
    return 'campo abierto';
  },

  // Verifica toda la cadena y devuelve los índices de entradas manipuladas
  async verificar(tipo) {
    const lista = this._lista(tipo);
    const malas = [];
    let anterior = 'GENESIS';
    for (let i = 0; i < lista.length; i++) {
      const e = lista[i];
      let esperado = await this._hashEntrada(e);
      // La fórmula antigua solo vale para entradas que nunca tuvieron lugar/posición
      if (esperado !== e.hash && e.lugar === undefined && e.pos === undefined) {
        esperado = await this._hashEntradaAntiguo(e);
      }
      if (e.hashAnterior !== anterior || e.hash !== esperado) malas.push(i);
      anterior = e.hash;
    }
    return malas;
  },

  // ---------- VISOR ----------
  iniciarVisor() {
    // El historial solo lo abre el administrador (desde su panel)
    const boton = document.getElementById('btn-historial');
    if (boton) boton.addEventListener('click', () => this.abrir());
    document.getElementById('pestana-hist-dinero').addEventListener('click', () => this.cambiarPestana('dinero'));
    document.getElementById('pestana-hist-objetos').addEventListener('click', () => this.cambiarPestana('objetos'));
  },

  abrir() {
    document.getElementById('historial-jugador').textContent =
      (typeof Usuarios !== 'undefined' && Usuarios.perfilActivo)
        ? '👤 Jugador: ' + Usuarios.perfilActivo.nombre : '';
    if (typeof UIManager !== 'undefined') UIManager.abrir('ventana-historial');
    else document.getElementById('ventana-historial').classList.remove('oculto');
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
      const unidad = tipo === 'dinero' ? '$' : 'ud.';
      fila.innerHTML =
        '<div class="detalle">' +
          '<div>' + e.detalle + (malas.includes(i) ? ' <span class="sello-hackeo">[MANIPULADO]</span>' : '') + '</div>' +
          '<div class="fecha">🕒 ' + Utilidades.fechaLegible(e.t) +
            (e.saldo !== null ? ' · saldo: $' + e.saldo : '') + '</div>' +
          (e.lugar ? '<div class="fecha">📍 ' + e.lugar +
            (e.pos ? ' · ' + e.pos[0] + ', ' + e.pos[1] : '') + '</div>' : '') +
        '</div>' +
        '<div class="monto ' + claseMonto + '">' + signo + e.monto + ' ' + unidad + '</div>';
      cont.appendChild(fila);
    }
  }
};
