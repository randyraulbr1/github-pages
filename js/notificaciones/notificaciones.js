// ============================================================
// SISTEMA DE NOTIFICACIONES
// Solo avisa en pantalla lo importante (misiones, admin, alertas).
// El resto queda en el historial de avisos (campana).
// ============================================================
const Notificaciones = {

  _esImportante(texto, tipo) {
    if (tipo === 'admin' || tipo === 'error') return true;
    const t = (texto || '').toLowerCase();
    if (/misión|mision|mundo actualizado|administrador|baneado|muert|revivid|sin token|integridad|gps desactiv|sin conexión|mantenimiento|subiste al nivel|nivel \d/i.test(t)) {
      return true;
    }
    if (tipo === 'alerta') {
      if (/acércate|zona de combate|tesoro cerca|hambre/i.test(t)) return false;
      return true;
    }
    if (tipo === 'exito' && /misión|misión completada|recompensa/i.test(t)) return true;
    return false;
  },

  _puedeMostrarToast() {
    if (document.body.classList.contains('en-auth')) return false;
    const admin = document.getElementById('ventana-admin');
    if (admin && !admin.classList.contains('oculto')) return false;
    return true;
  },

  _guardarHistorial(texto, tipo) {
    if (typeof Guardado === 'undefined' || !Guardado.datos) return;
    if (!Guardado.datos.notificaciones) Guardado.datos.notificaciones = [];
    Guardado.datos.notificaciones.unshift({ texto, tipo, t: Date.now() });
    Guardado.datos.notificaciones = Guardado.datos.notificaciones.slice(0, 20);
    Guardado.guardar();
    if (tipo === 'admin') this._actualizarBadge();
  },

  mostrar(texto, tipo = 'info', duracionMs = 3200) {
    this._guardarHistorial(texto, tipo);
    if (!this._puedeMostrarToast()) return;
    if (!this._esImportante(texto, tipo)) return;

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
