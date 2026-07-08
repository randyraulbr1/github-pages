// ============================================================
// UI MANAGER — Fase 6 faces.md
// Control central de ventanas, foco, ESC y bloqueo del mapa.
// ============================================================
const UIManager = {
  _stack: [],
  _confirms: new Set(),
  _confirmCancel: {},

  VENTANAS: {
    'ventana-mochila': { esc: true, peer: true },
    'ventana-opciones': { esc: true, peer: true, show: true },
    'ventana-amigos': { esc: true, peer: true },
    'chatPanel': { esc: true, peer: true, show: true, noOculto: true },
    'ventana-tienda': { esc: true, peer: true },
    'ventana-misiones': { esc: true, peer: true },
    'ventana-notific': { esc: true, peer: true, show: true },
    'ventana-historial': { esc: true, peer: true },
    'ventana-correo': { esc: true, peer: true },
    'ventana-correo-reclamo': { esc: true, peer: true },
    'ventana-pesca': { esc: true, peer: true },
    'ventana-cofre': { esc: true, peer: true },
    'ventana-cofre-colocar': { esc: true, peer: true },
    'ventana-cofre-pin': { esc: true, peer: true },
    'ventana-admin': { esc: true, peer: false },
    'ventana-combate': { esc: false, peer: false },
    'ventana-ataud': { esc: false, peer: false }
  },

  iniciar() {
    if (this._iniciado) return;
    this._iniciado = true;
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (this.cerrarSuperior()) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  },

  _el(id) {
    return document.getElementById(id);
  },

  estaVisible(id) {
    const el = this._el(id);
    if (!el) return false;
    const cfg = this.VENTANAS[id] || {};
    if (cfg.show) return el.classList.contains('show') && !el.classList.contains('oculto');
    if (cfg.noOculto) return el.classList.contains('show');
    return !el.classList.contains('oculto');
  },

  abrir(id, opts) {
    const el = this._el(id);
    if (!el) return false;
    const cfg = this.VENTANAS[id] || {};
    if (opts?.cerrarPares !== false && cfg.peer !== false) this._cerrarPares(id);
    if (cfg.show) {
      el.classList.remove('oculto');
      el.classList.add('show');
    } else if (cfg.noOculto) {
      el.classList.add('show');
    } else {
      el.classList.remove('oculto');
    }
    this._stack = this._stack.filter((x) => x !== id);
    this._stack.push(id);
    this._syncBody();
    return true;
  },

  cerrar(id) {
    const el = this._el(id);
    if (!el) return;
    const cfg = this.VENTANAS[id] || {};
    if (cfg.show) {
      el.classList.remove('show');
      if (!cfg.noOculto) el.classList.add('oculto');
    } else if (cfg.noOculto) {
      el.classList.remove('show');
    } else {
      el.classList.add('oculto');
    }
    this._stack = this._stack.filter((x) => x !== id);
    this._syncBody();
  },

  abrirConfirm(id, opts) {
    const el = this._el(id);
    if (!el) return;
    el.classList.remove('oculto');
    if (id === 'opciones-overlay') el.classList.add('show');
    el.setAttribute('aria-hidden', 'false');
    this._confirms.add(id);
    if (opts?.onCancel) this._confirmCancel[id] = opts.onCancel;
    this._syncBody();
  },

  cerrarConfirm(id) {
    const el = this._el(id);
    if (!el) return;
    el.classList.add('oculto');
    if (id === 'opciones-overlay') el.classList.remove('show');
    el.setAttribute('aria-hidden', 'true');
    this._confirms.delete(id);
    delete this._confirmCancel[id];
    this._syncBody();
  },

  _cerrarPares(excepto) {
    for (const id of [...this._stack]) {
      if (id === excepto) continue;
      if (this.VENTANAS[id]?.peer === false) continue;
      this.cerrar(id);
    }
    if (excepto !== 'chatPanel' && this.estaVisible('chatPanel')) {
      if (typeof Chat !== 'undefined' && Chat.cerrarPanel) Chat.cerrarPanel();
      else this.cerrar('chatPanel');
    }
  },

  cerrarSuperior() {
    const ordenConfirm = ['inv-confirm-overlay', 'opciones-overlay', 'chat-overlay', 'amigos-overlay'];
    for (let i = ordenConfirm.length - 1; i >= 0; i--) {
      const id = ordenConfirm[i];
      if (!this._confirmVisible(id)) continue;
      const cb = this._confirmCancel[id];
      if (cb) cb();
      else if (id === 'opciones-overlay' && typeof Opciones !== 'undefined') Opciones._cerrarConfirm();
      else if (id === 'amigos-overlay' && typeof Amigos !== 'undefined') Amigos._cerrarConfirm();
      else if (id === 'chat-overlay' && typeof Chat !== 'undefined') Chat._cerrarConfirmBorrar();
      else this.cerrarConfirm(id);
      return true;
    }

    for (let i = this._stack.length - 1; i >= 0; i--) {
      const id = this._stack[i];
      if (!this.estaVisible(id)) continue;
      const cfg = this.VENTANAS[id];
      if (cfg?.esc === false) continue;
      if (id === 'ventana-admin' && typeof Admin !== 'undefined' && Admin.cerrarPanel) {
        Admin.cerrarPanel();
      } else if (id === 'chatPanel' && typeof Chat !== 'undefined' && Chat.cerrarPanel) {
        Chat.cerrarPanel();
      } else {
        this.cerrar(id);
      }
      return true;
    }
    return false;
  },

  _confirmVisible(id) {
    const el = this._el(id);
    if (!el) return false;
    if (id === 'opciones-overlay') return el.classList.contains('show');
    return !el.classList.contains('oculto');
  },

  refrescar() {
    this._syncBody();
  },

  _syncBody() {
    const hayVentana = this._stack.some((id) => this.estaVisible(id));
    const hayConfirm = this._confirms.size > 0 ||
      ['inv-confirm-overlay', 'opciones-overlay', 'chat-overlay', 'amigos-overlay']
        .some((id) => this._confirmVisible(id));
    document.body.classList.toggle('ui-bloquea-mapa', hayVentana || hayConfirm);
    document.body.classList.toggle('ui-ventana-abierta', hayVentana);
  }
};
