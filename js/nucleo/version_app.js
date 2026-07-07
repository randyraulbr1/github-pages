// Detecta actualizaciones al instante y bloquea el juego hasta pulsar Actualizar.
const MarielVersion = {
  // Fuente canónica: rama main (donde se fusionan los PRs)
  _versionCanonica: 'https://raw.githubusercontent.com/randyraulbr1/github-pages/main/version.json',

  _bloqueado: false,
  _embebida: null,
  _remota: null,
  _pollMs: 8000,
  _swPollMs: 20000,
  _pollTimer: null,
  _swTimer: null,
  _comprobando: false,
  _swReg: null,
  _actualizando: false,
  _arranqueTimers: [],

  _versionPersistida() {
    try {
      return this._num(localStorage.getItem('mariel_app_version'));
    } catch (e) {
      return 0;
    }
  },

  _prepararLoginTrasActualizacion() {
    try {
      const adminRaw = localStorage.getItem('mariel_admin_v1');
      if (adminRaw) {
        localStorage.setItem('mariel_admin_backup_v1', adminRaw);
      }
      localStorage.removeItem('mariel_online_token');
    } catch (e) { /* */ }
  },

  _estadoActualizar(texto, visible) {
    const el = document.getElementById('actualizar-estado');
    if (!el) return;
    if (!visible) {
      el.classList.add('oculto');
      el.textContent = '';
      return;
    }
    el.textContent = texto || '';
    el.classList.remove('oculto');
  },

  _aplicarVersionTrasActualizacion() {
    try {
      const fuerza = sessionStorage.getItem('mariel_force_version');
      const cuando = parseInt(sessionStorage.getItem('mariel_actualizado_en') || '0', 10);
      if (!fuerza || !cuando || Date.now() - cuando > 120000) return;
      const emb = this._num(this._embebida);
      const objetivo = this._num(fuerza);
      if (!emb || emb < objetivo) return;
      this._embebida = fuerza;
      this._remota = fuerza;
      localStorage.setItem('mariel_app_version', fuerza);
      window.__MARIEL_UPDATE_PENDING = null;
      sessionStorage.removeItem('mariel_force_version');
      sessionStorage.removeItem('mariel_actualizado_en');
      this._desbloquearActualizacion(fuerza);
    } catch (e) { /* */ }
  },

  _aplicarPendienteInline(opts) {
    const bloquear = opts?.bloquear !== false;
    const p = window.__MARIEL_UPDATE_PENDING;
    if (!p?.remote) return false;
    const rem = this._num(p.remote);
    const loc = this.versionCargada();
    if (rem <= loc) return false;
    this._remota = String(p.remote);
    if (bloquear) {
      this.mostrarBloqueo(String(loc || p.local || '?'), String(p.remote));
    }
    return true;
  },

  _programarComprobacionesArranque() {
    for (const t of this._arranqueTimers) clearTimeout(t);
    this._arranqueTimers = [];
    [0, 800, 2000, 5000, 12000].forEach((ms) => {
      this._arranqueTimers.push(setTimeout(() => this._comprobarRemota({ bloquear: false }), ms));
    });

    try {
      const v = this.versionCargada();
      if (v) {
        const prev = this._versionPersistida();
        if (v > prev) localStorage.setItem('mariel_app_version', String(v));
      }
    } catch (e) { /* */ }
  },

  iniciar(versionEmbebida) {
    const emb = String(window.__MARIEL_EMBEDDED__ || versionEmbebida || '');
    const persistida = this._versionPersistida();
    this._embebida = String(Math.max(this._num(emb), persistida) || emb);
    this._aplicarVersionTrasActualizacion();
    const btn = document.getElementById('btn-actualizar-app');
    if (btn && !btn._marielVersionOk) {
      btn._marielVersionOk = true;
      btn.addEventListener('click', () => this.actualizar());
    }

    window.addEventListener('mariel-update-pending', () => {
      this._aplicarPendienteInline({ bloquear: false });
      this._comprobarRemota({ bloquear: false });
    });

    this._aplicarPendienteInline({ bloquear: false });
    this.revisar({ bloquear: false });
    this._comprobarRemota({ bloquear: false });
    this._programarComprobacionesArranque();

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this._comprobarRemota({ bloquear: false });
    });
    window.addEventListener('focus', () => this._comprobarRemota({ bloquear: false }));
    window.addEventListener('online', () => this._comprobarRemota({ bloquear: false }));

    if (this._pollTimer) clearInterval(this._pollTimer);
    this._pollTimer = setInterval(() => this._comprobarRemota({ bloquear: false }), this._pollMs);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        this._comprobarRemota({ bloquear: false });
      });
      navigator.serviceWorker.addEventListener('message', (ev) => {
        if (ev.data?.tipo === 'nueva-version') {
          if (ev.data.version) this._remota = String(ev.data.version);
          this._comprobarRemota({ bloquear: false });
        }
      });
    }
  },

  _evitarBloqueoFantasma() {
    const pant = document.getElementById('pantalla-actualizar');
    const bodyBloq = document.body.classList.contains('mariel-bloqueado-actualizar');
    const pantVisible = pant && !pant.classList.contains('oculto');
    if (bodyBloq && !pantVisible) {
      this._bloqueado = false;
      document.body.classList.remove('mariel-bloqueado-actualizar');
    }
  },

  async aplicarBloqueoTrasArranque() {
    await this._comprobarRemota({ bloquear: false });
    const cargada = this.versionCargada();
    const rem = this._num(this._remota);
    if (rem && rem > cargada) {
      this.mostrarBloqueo(String(cargada || '?'), String(rem));
    } else {
      this._desbloquearActualizacion(String(cargada || rem || ''));
    }
    this._evitarBloqueoFantasma();
  },

  registrarServiceWorker(reg) {
    if (!reg) return;
    this._swReg = reg;
    const revisarSw = () => {
      if (this._swReg?.update) this._swReg.update().catch(() => {});
    };
    revisarSw();
    if (this._swTimer) clearInterval(this._swTimer);
    this._swTimer = setInterval(revisarSw, this._swPollMs);
    if (this._swReg.waiting && navigator.serviceWorker.controller) {
      this._comprobarRemota({ bloquear: false });
    }
    this._swReg.addEventListener?.('updatefound', () => {
      const nw = this._swReg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          this._comprobarRemota({ bloquear: false });
        }
      });
    });
  },

  estaBloqueado() {
    return this._bloqueado;
  },

  exigirActualizado() {
    if (this._bloqueado) return false;
    if (this.revisar()) return false;
    return true;
  },

  _num(v) {
    const n = parseInt(String(v || ''), 10);
    return Number.isFinite(n) ? n : 0;
  },

  versionLocal() {
    return String(this.versionCargada() || this._embebida || '?');
  },

  versionCargada() {
    const emb = this._num(this._embebida);
    const cfg = typeof CONFIG !== 'undefined' ? this._num(CONFIG.version) : 0;
    const persistida = this._versionPersistida();
    let forz = 0;
    try {
      const fv = sessionStorage.getItem('mariel_force_version');
      const t0 = parseInt(sessionStorage.getItem('mariel_actualizado_en') || '0', 10);
      if (fv && t0 && Date.now() - t0 < 120000) forz = this._num(fv);
    } catch (e) { /* */ }
    return Math.max(emb, cfg, persistida, forz) || emb || cfg || persistida || forz || 0;
  },

  _parseVersionTexto(txt) {
    if (!txt) return null;
    try {
      const j = JSON.parse(txt);
      if (j?.version) return String(j.version);
    } catch (e) { /* no es JSON */ }
    const m = txt.match(/version:\s*['"](\d+)['"]/);
    return m ? m[1] : null;
  },

  async obtenerRemota() {
    const ts = Date.now();
    const opts = { cache: 'no-store', headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } };
    const origen = (typeof location !== 'undefined' && location.origin) ? location.origin : '';
    const urls = [this._versionCanonica + '?_=' + ts];
    if (origen) urls.push(origen + '/version.json?_=' + ts);
    urls.push('version.json?_=' + ts, 'js/config/config.js?_=' + ts);

    const nums = await Promise.all(urls.map(async (url) => {
      try {
        const r = await fetch(url, opts);
        if (!r.ok) return 0;
        const v = this._parseVersionTexto(await r.text());
        return this._num(v);
      } catch (e) {
        return 0;
      }
    }));

    const max = Math.max(0, ...nums);
    return max > 0 ? String(max) : null;
  },

  necesitaActualizar(local, remoto) {
    const cargada = this._num(local) || this.versionCargada();
    const r = this._num(remoto);
    return r > 0 && r > cargada;
  },

  _desbloquearActualizacion(version) {
    const v = String(version || this.versionCargada() || this._embebida || this._remota || '');
    if (v && v !== '?') localStorage.setItem('mariel_app_version', v);
    this._bloqueado = false;
    this._actualizando = false;
    window.__MARIEL_UPDATE_PENDING = null;
    document.body.classList.remove('mariel-bloqueado-actualizar');
    const pant = document.getElementById('pantalla-actualizar');
    if (pant) pant.classList.add('oculto');
    const btn = document.getElementById('btn-actualizar-app');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Actualizar';
    }
    this._estadoActualizar('', false);
    if (typeof Opciones !== 'undefined' && Opciones._refrescarVersionSiAbierto) {
      Opciones._refrescarVersionSiAbierto();
    }
  },

  revisar(opts) {
    const bloquear = opts?.bloquear !== false;
    if (this._aplicarPendienteInline({ bloquear })) return bloquear;

    const cargada = this.versionCargada();
    const remoto = this._remota;
    const r = this._num(remoto);

    if (r && cargada >= r) {
      if (bloquear || this._bloqueado) {
        this._desbloquearActualizacion(String(cargada));
      }
      return false;
    }

    if (r && r > cargada) {
      if (bloquear) {
        this.mostrarBloqueo(String(cargada || '?'), String(r));
        return true;
      }
      return false;
    }

    return this._bloqueado;
  },

  mostrarBloqueo(local, remoto) {
    const loc = String(local || this.versionCargada() || '?');
    const rem = String(remoto || this._remota || '');
    this._bloqueado = true;
    this._remota = rem;
    document.body.classList.add('mariel-bloqueado-actualizar');

    const det = document.getElementById('actualizar-detalle');
    if (det) det.textContent = 'Tu versión: ' + loc + ' · Nueva: ' + rem;
    this._estadoActualizar('', false);

    const pant = document.getElementById('pantalla-actualizar');
    if (pant) pant.classList.remove('oculto');

    [
      'pantalla-carga', 'pantalla-login', 'pantalla-registro', 'pantalla-muerte',
      'pantalla-bloqueo', 'pantalla-sesion-remota', 'pantalla-cuenta-eliminada',
      'chatPanel', 'ventana-amigos', 'ventana-opciones', 'ventana-mochila', 'ventana-admin'
    ].forEach(id => document.getElementById(id)?.classList.add('oculto'));

    document.querySelectorAll('.chat-panel.show, .ventana:not(.oculto)').forEach(el => {
      el.classList.add('oculto');
      el.classList.remove('show');
    });

    if (typeof Opciones !== 'undefined' && Opciones._refrescarVersionSiAbierto) {
      Opciones._refrescarVersionSiAbierto();
    }
  },

  async _limpiarTodaCache() {
    try {
      if (this._swReg?.waiting) {
        this._swReg.waiting.postMessage({ tipo: 'skip-waiting' });
      }
      if ('serviceWorker' in navigator) {
        const rs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(rs.map(r => r.unregister()));
      }
    } catch (e) { /* */ }
    try {
      if ('caches' in window) {
        const ks = await caches.keys();
        await Promise.all(ks.map(k => caches.delete(k)));
      }
    } catch (e) { /* */ }
  },

  async _precargarVersion(v) {
    const ts = Date.now();
    const urls = [
      'version.json?_=' + ts,
      'js/config/config.js?v=' + v + '&_=' + ts,
      'js/nucleo/version_app.js?v=' + v + '&_=' + ts,
      'sw.js?v=' + v + '&_=' + ts,
      'index.html?_=' + ts
    ];
    const opts = {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' }
    };
    await Promise.all(urls.map(u => fetch(u, opts).catch(() => null)));
  },

  async actualizar(opts) {
    if (this._actualizando) return { ok: false, error: 'en_curso' };
    this._actualizando = true;
    const manual = !!opts?.manual;

    const onProg = (pct, txt) => {
      if (!manual && txt) this._estadoActualizar(txt, true);
      if (typeof opts?.onProgreso === 'function') opts.onProgreso(pct, txt);
    };

    const btn = document.getElementById('btn-actualizar-app');
    if (btn && !manual) {
      btn.disabled = true;
      btn.textContent = 'Actualizar';
    }

    onProg(8, 'Comprobando versión…');
    let objetivo = null;
    try {
      objetivo = await this.obtenerRemota();
    } catch (e) { /* */ }
    objetivo = String(objetivo || this._remota || this._embebida || '');
    if (!objetivo || objetivo === '?') {
      if (btn && !manual) btn.disabled = false;
      onProg(0, 'No se pudo comprobar la versión. Reintenta.');
      this._actualizando = false;
      return { ok: false, error: 'sin_version' };
    }

    const cargada = this.versionCargada();
    if (!this.necesitaActualizar(cargada, objetivo)) {
      if (btn && !manual) btn.disabled = false;
      if (!manual) this._estadoActualizar('', false);
      onProg(100, 'Ya tienes la versión ' + objetivo);
      this._actualizando = false;
      return { ok: true, yaAlDia: true, version: objetivo };
    }

    this._remota = objetivo;
    localStorage.setItem('mariel_app_version', objetivo);
    try {
      sessionStorage.setItem('mariel_force_version', objetivo);
      sessionStorage.setItem('mariel_actualizado_en', String(Date.now()));
    } catch (e) { /* */ }

    this._prepararLoginTrasActualizacion();
    onProg(28, 'Limpiando caché…');
    await this._limpiarTodaCache();

    onProg(58, 'Descargando v' + objetivo + '…');
    await this._precargarVersion(objetivo);

    onProg(92, 'Listo — iniciar sesión…');
    await new Promise((r) => setTimeout(r, 350));

    const url = location.origin + '/?_mariel=' + Date.now();
    location.replace(url);
    return { ok: true, version: objetivo };
  },

  async comprobarRemota(opts) {
    await this._comprobarRemota(opts);
  },

  async _comprobarRemota(opts) {
    if (this._comprobando) return;
    this._comprobando = true;
    const bloquear = opts?.bloquear !== false;
    try {
      if (this._aplicarPendienteInline({ bloquear })) return;
      const remoto = await this.obtenerRemota();
      if (remoto) this._remota = remoto;
      this.revisar({ bloquear });
      this._evitarBloqueoFantasma();
    } finally {
      this._comprobando = false;
    }
  }
};
