// ============================================================
// SISTEMA DE NOTIFICACIONES
// Solo avisa en pantalla lo importante (misiones, admin, alertas).
// El resto queda en el historial de avisos (campana).
// ============================================================
const Notificaciones = {
  _toastTimer: null,
  _toastOcultarTimer: null,
  _toastEl: null,
  _toastPila: 0,

  _contadorGlobo(cantidad) {
    if (typeof Utilidades !== 'undefined' && typeof Utilidades.contadorBadge === 'function') {
      return Utilidades.contadorBadge(cantidad);
    }
    const n = Math.max(0, Math.floor(Number(cantidad) || 0));
    if (n <= 0) return '';
    if (n > 10) return '+10';
    return String(n);
  },

  _sinLeer() {
    if (!Guardado.datos) return 0;
    return (Guardado.datos.notificaciones || []).filter(n => n && n.leido !== true).length;
  },

  _esImportante(texto, tipo) {
    if (tipo === 'admin' || tipo === 'error') return true;
    const t = (texto || '').toLowerCase();
    if (/misión|mision|administrador|baneado|muert|revivid|sin token|integridad|gps desactiv|sin conexión|mantenimiento|subiste al nivel|nivel \d/i.test(t)) {
      return true;
    }
    if (tipo === 'alerta') {
      if (/acércate|zona de combate|tesoro cerca|hambre/i.test(t)) return false;
      return true;
    }
    if (tipo === 'exito' && /misión|misión completada|recompensa/i.test(t)) return true;
    if (tipo === 'info' && /acércate|recoger|demasiado lejos|revivir|botiquín/i.test(t)) return true;
    return false;
  },

  _puedeMostrarToast() {
    if (document.body.classList.contains('en-auth')) return false;
    const admin = document.getElementById('ventana-admin');
    if (admin && !admin.classList.contains('oculto')) return false;
    return true;
  },

  _guardarHistorial(texto, tipo, categoria) {
    if (typeof Guardado === 'undefined' || !Guardado.datos) return;
    if (!Guardado.datos.notificaciones) Guardado.datos.notificaciones = [];
    const lista = Guardado.datos.notificaciones;
    const idx = lista.findIndex(n => n && n.texto === texto);
    if (idx >= 0) lista.splice(idx, 1);
    lista.unshift({
      texto,
      tipo,
      categoria: categoria || null,
      t: Date.now(),
      leido: false
    });
    Guardado.datos.notificaciones = lista.slice(0, 20);
    Guardado.guardar();
    this._actualizarBadge();
  },

  mostrar(texto, tipo = 'info', duracionMs = 3200) {
    this._guardarHistorial(texto, tipo);
    if (!this._puedeMostrarToast()) return;
    if (!this._esImportante(texto, tipo)) return;
    this._mostrarToast(texto, tipo, duracionMs);
  },

  mostrarSocial(texto, tipo = 'info', categoria = 'chat', duracionMs = 3500) {
    this._guardarHistorial(texto, tipo, categoria);
    if (!this._puedeMostrarToast()) return;
    const prefs = (typeof Guardado !== 'undefined' && Guardado.datos?.preferencias) || {};
    if (categoria === 'chat' && prefs.notifChat === false) return;
    if (categoria === 'amigos' && prefs.notifAmigos === false) return;
    this._mostrarToast(texto, tipo, duracionMs);
  },

  _mostrarToast(texto, tipo, duracionMs) {
    const zona = document.getElementById('zona-notificaciones');
    if (!zona) return;

    if (this._toastEl && zona.contains(this._toastEl)) {
      const txt = this._toastEl.querySelector('.notif-texto');
      if (txt && txt.textContent === texto) {
        this._toastEl.className = 'notificacion visible ' + tipo;
        clearTimeout(this._toastOcultarTimer);
        this._toastOcultarTimer = setTimeout(() => this._ocultarToast(), duracionMs);
        return;
      }
      this._toastPila++;
      const txt = this._toastEl.querySelector('.notif-texto');
      const pila = this._toastEl.querySelector('.notif-pila');
      if (txt) txt.textContent = texto;
      if (pila) {
        pila.textContent = this._contadorGlobo(this._toastPila);
        pila.classList.toggle('oculto', this._toastPila <= 1);
      }
      this._toastEl.className = 'notificacion visible ' + tipo;
    } else {
      zona.querySelectorAll('.notificacion').forEach(n => n.remove());
      this._toastPila = 1;
      const n = document.createElement('div');
      n.className = 'notificacion ' + tipo;
      n.innerHTML =
        '<span class="notif-texto"></span>' +
        '<span class="notif-pila oculto">1</span>';
      n.querySelector('.notif-texto').textContent = texto;
      zona.appendChild(n);
      this._toastEl = n;
      requestAnimationFrame(() => requestAnimationFrame(() => n.classList.add('visible')));
    }

    clearTimeout(this._toastOcultarTimer);
    this._toastOcultarTimer = setTimeout(() => this._ocultarToast(), duracionMs);
  },

  _ocultarToast() {
    if (!this._toastEl) return;
    const el = this._toastEl;
    el.classList.add('saliendo');
    this._toastEl = null;
    this._toastPila = 0;
    setTimeout(() => el.remove(), 400);
  },

  _actualizarBadge() {
    const badge = document.getElementById('badge-avisos');
    if (!badge) return;
    const sinLeer = this._sinLeer();
    badge.textContent = this._contadorGlobo(sinLeer);
    badge.classList.toggle('oculto', sinLeer <= 0);
    badge.setAttribute('aria-label', sinLeer > 0 ? (sinLeer + ' avisos sin leer') : '');
  },

  mostrarAdmin(texto, duracionMs) {
    this.mostrar('✉️ Administrador: ' + texto, 'admin', duracionMs || 10000);
  },

  iniciarVisor() {
    document.getElementById('btn-notific')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.abrirVisor();
    });
    document.getElementById('cerrar-notific')?.addEventListener('click', () => this.cerrarVisor());
    document.getElementById('avisos-marcar-leidos')?.addEventListener('click', () => this._marcarTodosLeidos());
    document.getElementById('avisos-limpiar')?.addEventListener('click', () => this._limpiarTodos());

    const ventana = document.getElementById('ventana-notific');
    const panel = ventana?.querySelector('.avisos-panel');
    panel?.addEventListener('click', (e) => e.stopPropagation());
    ventana?.addEventListener('click', (e) => {
      if (e.target === ventana) this.cerrarVisor();
    });

    if (!this._clickFueraOk) {
      this._clickFueraOk = true;
      const cerrarSiFuera = (e) => {
        const v = document.getElementById('ventana-notific');
        if (!v || v.classList.contains('oculto')) return;
        if (e.target.closest('#btn-notific')) return;
        const caja = v.querySelector('.avisos-panel');
        if (caja?.contains(e.target)) return;
        this.cerrarVisor();
      };
      document.addEventListener('click', cerrarSiFuera);
    }
    this._actualizarBadge();
  },

  _claseAviso(aviso) {
    if (aviso.categoria === 'chat') return 'chat';
    if (aviso.categoria === 'amigos') return 'chat';
    const texto = aviso.texto || '';
    if (aviso.tipo === 'admin') return 'admin';
    if (/📍|pin|ubicación/i.test(texto)) return 'pin';
    if (/💬|chat/i.test(texto)) return 'chat';
    if (aviso.tipo === 'alerta' || aviso.tipo === 'error') return 'warning';
    if (aviso.tipo === 'exito') return 'pin';
    return 'admin';
  },

  _iconoAviso(aviso, clase) {
    const texto = aviso.texto || '';
    const match = texto.match(/^(\p{Extended_Pictographic})/u);
    if (match) return match[1];
    if (clase === 'pin') return '📍';
    if (clase === 'chat') return '💬';
    if (clase === 'warning') return '⚠️';
    return '🌴';
  },

  _esc(texto) {
    return String(texto)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  },

  _toastAvisos(texto) {
    const el = document.getElementById('avisos-toast');
    if (!el) return;
    el.textContent = texto;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), 1700);
  },

  _pintarVisor() {
    const cont = document.getElementById('lista-notificaciones');
    if (!cont) return;
    const lista = (Guardado.datos && Guardado.datos.notificaciones) || [];
    cont.innerHTML = '';

    if (!lista.length) {
      cont.innerHTML = '<div class="avisos-empty show">No tienes avisos nuevos 🔕</div>';
      return;
    }

    lista.forEach((aviso, index) => {
      const clase = this._claseAviso(aviso);
      const icono = this._iconoAviso(aviso, clase);
      const fila = document.createElement('div');
      fila.className = 'avisos-notice ' + clase + (aviso.leido ? '' : ' new');
      fila.innerHTML =
        '<div class="avisos-notice-title">' + icono + ' ' + this._esc(aviso.texto) + '</div>' +
        '<div class="avisos-notice-time">' + this._esc(Utilidades.fechaLegible(aviso.t)) + '</div>';
      fila.addEventListener('click', () => {
        aviso.leido = true;
        Guardado.guardar();
        this._actualizarBadge();
        this._toastAvisos('Aviso abierto');
        this._pintarVisor();
      });
      cont.appendChild(fila);
    });
  },

  _marcarTodosLeidos() {
    const lista = Guardado.datos?.notificaciones || [];
    lista.forEach(n => { n.leido = true; });
    Guardado.guardar();
    this._actualizarBadge();
    this._toastAvisos('Avisos marcados como leídos');
    this._pintarVisor();
  },

  _limpiarTodos() {
    if (!Guardado.datos) return;
    Guardado.datos.notificaciones = [];
    Guardado.guardar();
    this._actualizarBadge();
    this._toastAvisos('Avisos limpiados');
    this._pintarVisor();
  },

  abrirVisor() {
    this._pintarVisor();
    const v = document.getElementById('ventana-notific');
    v?.classList.remove('oculto');
    v?.classList.add('show');
  },

  cerrarVisor() {
    const v = document.getElementById('ventana-notific');
    v?.classList.add('oculto');
    v?.classList.remove('show');
  }
};
