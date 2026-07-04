// ============================================================
// MISIONES
// Cada misión tiene su punto ❗ en el mapa. Las de "visitar" se
// completan llegando; las de "entregar" tocando el punto con
// los items requeridos; las de "contar" avanzan con eventos
// del juego (pescar, recoger tesoros...).
// ============================================================
const Misiones = {

  iniciar() {
    // Estado guardado de cada misión: { progreso, completada }
    for (const m of DATOS_MISIONES) {
      if (!Guardado.datos.misiones[m.id]) {
        Guardado.datos.misiones[m.id] = { progreso: 0, completada: false };
      }
    }

    for (const m of DATOS_MISIONES) {
      if (Admin.eliminado(m.id)) continue;
      Admin.pos(m.id, m.posicion);
      const estado = Guardado.datos.misiones[m.id];
      if (estado.completada) continue;
      const marcador = Mapa.crearMarcadorEmoji(m.posicion, '❗', 26);
      m._marcador = marcador;
      Mapa.registrarPunto({
        id: m.id,
        posicion: m.posicion,
        radio: CONFIG.distanciaInteraccion,
        marcador,
        alTocar: () => this._tocar(m),
        alCambiarDistancia: d => {
          if (m.tipo === 'visitar' && d <= CONFIG.distanciaInteraccion) this._completarVisita(m);
        }
      });
    }

    document.getElementById('btn-misiones').addEventListener('click', () => this.abrir());
  },

  _estado(m) { return Guardado.datos.misiones[m.id]; },

  _tocar(m) {
    const estado = this._estado(m);
    if (estado.completada) return;

    if (m.tipo === 'entregar') {
      const tieneTodo = m.requiere.every(r => Mochila.contar(r.id) >= r.cantidad);
      if (!tieneTodo) {
        const falta = m.requiere.map(r => {
          const it = Items.obtener(r.id);
          return it.nombre + ' (' + Mochila.contar(r.id) + '/' + r.cantidad + ')';
        }).join(', ');
        Notificaciones.mostrar('📦 Te falta: ' + falta, 'alerta', 4500);
        return;
      }
      for (const r of m.requiere) Mochila.quitar(r.id, r.cantidad, 'Entregado (misión)');
      this._completar(m);
    } else {
      // Mostrar información de la misión
      this.abrir();
    }
  },

  _completarVisita(m) {
    if (!this._estado(m).completada) this._completar(m);
  },

  // Los módulos del juego avisan aquí: Misiones.evento('pez_capturado')
  evento(nombre) {
    for (const m of DATOS_MISIONES) {
      const estado = this._estado(m);
      if (m.tipo !== 'contar' || estado.completada || m.evento !== nombre) continue;
      estado.progreso++;
      Guardado.guardar();
      if (estado.progreso >= m.meta) {
        this._completar(m);
      } else {
        Notificaciones.mostrar('📜 ' + m.titulo + ': ' + estado.progreso + '/' + m.meta, 'info');
      }
    }
  },

  async _completar(m) {
    const estado = this._estado(m);
    if (estado.completada) return;
    estado.completada = true;
    Guardado.guardar();
    if (m._marcador) { m._marcador.remove(); m._marcador = null; }

    Notificaciones.mostrar('✅ Misión completada: ' + m.titulo, 'exito', 5000);
    if (m.recompensa.dinero) {
      await Dinero.ganar(m.recompensa.dinero, 'Misión: ' + m.titulo);
    }
    for (const premio of (m.recompensa.items || [])) {
      Mochila.agregar(premio.id, premio.cantidad);
    }
  },

  // ---------- VENTANA DE MISIONES ----------
  abrir() {
    document.getElementById('ventana-misiones').classList.remove('oculto');
    const cont = document.getElementById('lista-misiones');
    cont.innerHTML = '';
    for (const m of DATOS_MISIONES) {
      if (Admin.eliminado(m.id)) continue;
      const estado = this._estado(m);
      const caja = document.createElement('div');
      caja.className = 'mision' + (estado.completada ? ' completada' : '');
      const distancia = Math.round(Utilidades.distanciaMetros(GPS.posicion, m.posicion));
      let progreso = '';
      if (m.tipo === 'contar') progreso = 'Progreso: ' + estado.progreso + ' / ' + m.meta;
      if (m.tipo === 'entregar') {
        progreso = 'Llevas: ' + m.requiere.map(r =>
          Items.obtener(r.id).nombre + ' ' + Mochila.contar(r.id) + '/' + r.cantidad).join(', ');
      }
      caja.innerHTML =
        '<div class="titulo">' + (estado.completada ? '✅ ' : '❗ ') + m.titulo + '</div>' +
        '<div class="descripcion">' + m.descripcion + '</div>' +
        (progreso && !estado.completada ? '<div class="progreso">' + progreso + '</div>' : '') +
        (!estado.completada ? '<div class="distancia">📍 A ' + distancia + ' m del objetivo · Recompensa: $' +
          (m.recompensa.dinero || 0) + '</div>' : '');
      cont.appendChild(caja);
    }
    // Misiones creadas por el administrador
    if (typeof Admin !== 'undefined') Admin.pintarMisiones(cont);
  }
};
