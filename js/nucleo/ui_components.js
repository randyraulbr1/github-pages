// ============================================================
// FASE 12 — Componentes UI (patrón inventario)
// UIPanel, UIButton, UIToast, UIDialog, UIProgressBar, UIGrid
// ============================================================

const UIPanel = {
  /** Crea estructura panel estándar (header + body). */
  crear(opts) {
    const o = opts || {};
    const root = document.createElement('div');
    root.className = 'ventana-caja inventario-caja ui-panel' + (o.clase ? ' ' + o.clase : '');

    const header = document.createElement('div');
    header.className = 'inv-header ui-panel-header';

    const titulo = document.createElement('div');
    titulo.className = 'inv-titulo ui-panel-title';
    titulo.textContent = o.titulo || 'Panel';

    const cerrar = document.createElement('button');
    cerrar.type = 'button';
    cerrar.className = 'btn-cerrar inv-cerrar ui-panel-close';
    cerrar.setAttribute('aria-label', 'Cerrar');
    cerrar.textContent = '✕';
    if (o.onCerrar) cerrar.addEventListener('click', o.onCerrar);

    header.appendChild(titulo);
    header.appendChild(cerrar);

    const body = document.createElement('div');
    body.className = 'inv-content ui-panel-body';
    if (o.contenido) {
      if (typeof o.contenido === 'string') body.innerHTML = o.contenido;
      else body.appendChild(o.contenido);
    }

    root.appendChild(header);
    root.appendChild(body);
    return { root, header, titulo, cerrar, body };
  }
};

const UIButton = {
  crear(opts) {
    const o = opts || {};
    const btn = document.createElement('button');
    btn.type = 'button';
    const variant = o.variant || 'secondary';
    btn.className = 'ui-btn ui-btn-' + variant + (o.clase ? ' ' + o.clase : '');
    btn.textContent = o.texto || o.text || 'OK';
    if (o.id) btn.id = o.id;
    if (o.title) btn.title = o.title;
    if (o.onClick) btn.addEventListener('click', o.onClick);
    if (o.disabled) btn.disabled = true;
    return btn;
  }
};

const UIToast = {
  _timer: null,

  mostrar(mensaje, tipo, duracionMs) {
    const msg = String(mensaje || '').trim();
    if (!msg) return;
    const tipoOk = tipo || 'info';
    const ms = typeof duracionMs === 'number' ? duracionMs : 2800;

    let el = document.getElementById('ui-toast-global');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ui-toast-global';
      el.className = 'ui-toast oculto';
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }

    el.className = 'ui-toast ' + tipoOk;
    el.textContent = msg;
    el.classList.remove('oculto');
    el.classList.add('show');

    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      el.classList.remove('show');
      el.classList.add('oculto');
    }, ms);
  }
};

const UIDialog = {
  _resolver: null,

  iniciar() {
    if (this._iniciado) return;
    this._iniciado = true;
    let ov = document.getElementById('ui-dialog-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'ui-dialog-overlay';
      ov.className = 'ui-dialog-overlay oculto';
      ov.setAttribute('aria-hidden', 'true');
      ov.innerHTML =
        '<div class="ui-dialog" role="dialog" aria-modal="true">'
        + '<h3 class="ui-dialog-title" id="ui-dialog-title">Confirmar</h3>'
        + '<p class="ui-dialog-text" id="ui-dialog-text">¿Seguro?</p>'
        + '<div class="ui-dialog-row">'
        + '<button type="button" class="ui-btn ui-btn-secondary" id="ui-dialog-cancel">Cancelar</button>'
        + '<button type="button" class="ui-btn ui-btn-primary" id="ui-dialog-ok">Aceptar</button>'
        + '</div></div>';
      document.body.appendChild(ov);
      document.getElementById('ui-dialog-cancel')?.addEventListener('click', () => this._cerrar(false));
      document.getElementById('ui-dialog-ok')?.addEventListener('click', () => this._cerrar(true));
    }
  },

  confirmar(opts) {
    this.iniciar();
    const o = opts || {};
    return new Promise((resolve) => {
      this._resolver = resolve;
      const tit = document.getElementById('ui-dialog-title');
      const txt = document.getElementById('ui-dialog-text');
      const ok = document.getElementById('ui-dialog-ok');
      const cancel = document.getElementById('ui-dialog-cancel');
      if (tit) tit.textContent = o.titulo || o.title || 'Confirmar';
      if (txt) txt.textContent = o.texto || o.text || '¿Seguro?';
      if (ok) {
        ok.textContent = o.okText || 'Aceptar';
        ok.className = 'ui-btn ' + (o.okVariant === 'danger' ? 'ui-btn-danger' : 'ui-btn-primary');
      }
      if (cancel) cancel.textContent = o.cancelText || 'Cancelar';

      if (typeof UIManager !== 'undefined') {
        UIManager.abrirConfirm('ui-dialog-overlay', {
          onCancel: () => this._cerrar(false)
        });
      } else {
        const ov = document.getElementById('ui-dialog-overlay');
        ov?.classList.remove('oculto');
        ov?.setAttribute('aria-hidden', 'false');
      }
    });
  },

  _cerrar(valor) {
    if (typeof UIManager !== 'undefined') {
      UIManager.cerrarConfirm('ui-dialog-overlay');
    } else {
      const ov = document.getElementById('ui-dialog-overlay');
      ov?.classList.add('oculto');
      ov?.setAttribute('aria-hidden', 'true');
    }
    const fn = this._resolver;
    this._resolver = null;
    if (fn) fn(!!valor);
  }
};

const UIProgressBar = {
  crear(contenedor, opts) {
    const o = opts || {};
    const wrap = document.createElement('div');
    wrap.className = 'ui-progress' + (o.clase ? ' ' + o.clase : '');
    const fill = document.createElement('div');
    fill.className = 'ui-progress-fill';
    wrap.appendChild(fill);
    const parent = typeof contenedor === 'string'
      ? document.getElementById(contenedor)
      : contenedor;
    if (parent) {
      parent.innerHTML = '';
      parent.appendChild(wrap);
    }
    return { wrap, fill };
  },

  actualizar(barra, pct, opts) {
    const o = opts || {};
    const p = Math.max(0, Math.min(100, Number(pct) || 0));
    const fill = barra?.fill || barra?.querySelector?.('.ui-progress-fill');
    const wrap = barra?.wrap || barra;
    if (fill) fill.style.width = p + '%';
    if (wrap?.classList) {
      wrap.classList.toggle('ok', !!o.ok || p >= (o.okDesde ?? 100));
    }
  }
};

const UIGrid = {
  pintar(contenedor, slots, renderSlot) {
    const parent = typeof contenedor === 'string'
      ? document.getElementById(contenedor)
      : contenedor;
    if (!parent) return;
    parent.classList.add('ui-grid');
    parent.innerHTML = '';
    const lista = Array.isArray(slots) ? slots : [];
    const render = typeof renderSlot === 'function'
      ? renderSlot
      : (item) => {
          const el = document.createElement('div');
          el.className = 'ui-grid-slot';
          el.textContent = item?.icono || item?.icon || '📦';
          if (item?.cantidad > 1) {
            const q = document.createElement('span');
            q.className = 'ui-grid-qty';
            q.textContent = String(item.cantidad);
            el.appendChild(q);
          }
          return el;
        };
    for (const item of lista) {
      const cell = render(item);
      if (cell) parent.appendChild(cell);
    }
  }
};

// Alias global para scripts legacy
const UIComponents = {
  UIPanel,
  UIButton,
  UIToast,
  UIDialog,
  UIProgressBar,
  UIGrid
};
