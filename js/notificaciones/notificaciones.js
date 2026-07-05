// ============================================================
// SISTEMA DE NOTIFICACIONES
// Aparecen deslizándose desde la derecha y desaparecen solas.
// Tipos: 'info', 'exito', 'error', 'alerta'
// ============================================================
const Notificaciones = {

  mostrar(texto, tipo = 'info', duracionMs = 3200) {
    const zona = document.getElementById('zona-notificaciones');
    const n = document.createElement('div');
    n.className = 'notificacion ' + tipo;
    n.textContent = texto;
    zona.appendChild(n);

    requestAnimationFrame(() => requestAnimationFrame(() => n.classList.add('visible')));

    setTimeout(() => {
      n.classList.add('saliendo');
      setTimeout(() => n.remove(), 400);
    }, duracionMs);

    if (typeof Guardado !== 'undefined' && Guardado.datos) {
      if (!Guardado.datos.notificaciones) Guardado.datos.notificaciones = [];
      Guardado.datos.notificaciones.unshift({ texto, tipo, t: Date.now() });
      Guardado.datos.notificaciones = Guardado.datos.notificaciones.slice(0, 20);
      Guardado.guardar();
      if (tipo === 'admin') this._actualizarBadge();
    }
  },

  _actualizarBadge() {
    const badge = document.getElementById('badge-avisos');
    if (!badge || !Guardado.datos) return;
    const sinLeer = (Guardado.datos.notificaciones || []).some(n => n.tipo === 'admin' && !n.leido);
    badge.classList.toggle('oculto', !sinLeer);
  },

  mostrarAdmin(texto, duracionMs) {
    this.mostrar('✉️ Administrador: ' + texto, 'admin', duracionMs || 10000);
  },

  // ---------- VENTANA DE ÚLTIMOS AVISOS ----------
  iniciarVisor() {
    document.getElementById('btn-notific').addEventListener('click', () => this.abrirVisor());
  },

  abrirVisor() {
    const cont = document.getElementById('lista-notificaciones');
    cont.innerHTML = '';
    const lista = (Guardado.datos && Guardado.datos.notificaciones) || [];
    if (!lista.length) {
      cont.innerHTML = '<div class="tienda-vacia">Todavía no tienes avisos</div>';
    }
    for (const aviso of lista) {
      if (aviso.tipo === 'admin') aviso.leido = true;
      const fila = document.createElement('div');
      fila.className = 'fila-aviso ' + (aviso.tipo || 'info');
      fila.innerHTML = '<div>' + aviso.texto + '</div>' +
        '<div class="fecha">' + Utilidades.fechaLegible(aviso.t) + '</div>';
      cont.appendChild(fila);
    }
    Guardado.guardar();
    this._actualizarBadge();
    document.getElementById('ventana-notific').classList.remove('oculto');
  }
};
