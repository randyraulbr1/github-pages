// Detecta actualizaciones al instante y bloquea el juego hasta pulsar Actualizar.
const MarielVersion = {
  // Fuente canónica: rama main (donde se fusionan los PRs)
  _versionCanonica: 'https://raw.githubusercontent.com/randyraulbr1/github-pages/main/version.json',

  _bloqueado: false,
  _embebida: null,
  _remota: null,
  _pollMs: 12000,
  _swPollMs: 25000,
  _pollTimer: null,
  _swTimer: null,
  _comprobando: false,
  _swReg: null,
  _actualizando: false,

  _prepararLoginTrasActualizacion() {
    try {
      sessionStorage.setItem('mariel_forzar_login', '1');
      const adminRaw = localStorage.getItem('mariel_admin_v1');
      if (adminRaw) {
        localStorage.setItem('mariel_admin_backup_v1', adminRaw);
      }
      const raw = localStorage.getItem('mariel_perfiles_v2');
      if (raw) {
        const datos = JSON.parse(raw);
        if (datos && typeof datos === 'object') {
          datos.activo = null;
          datos.sesionId = null;
          localStorage.setItem('mariel_perfiles_v2', JSON.stringify(datos));
        }
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

  iniciar(versionEmbebida) {
    this._embebida = String(window.__MARIEL_EMBEDDED__ || versionEmbebida || '');
    this._aplicarVersionTrasActualizacion();
    const btn = document.getElementById('btn-actualizar-app');
    if (btn && !btn._marielVersionOk) {
      btn._marielVersionOk = true;
      btn.addEventListener('click', () => this.actualizar());
    }

    const pendiente = window.__MARIEL_UPDATE_PENDING;
    if (pendiente?.remote) {
      this._remota = String(pendiente.remote);
      this.mostrarBloqueo(pendiente.local || this._embebida, pendiente.remote);
    }

    this.revisar();
    this._comprobarRemota();

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this._comprobarRemota();
    });
    window.addEventListener('focus', () => this._comprobarRemota());
    window.addEventListener('online', () => this._comprobarRemota());

    if (this._pollTimer) clearInterval(this._pollTimer);
    this._pollTimer = setInterval(() => this._comprobarRemota(), this._pollMs);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        this._comprobarRemota();
      });
      navigator.serviceWorker.addEventListener('message', (ev) => {
        if (ev.data?.tipo === 'nueva-version') {
          if (ev.data.version) this._remota = String(ev.data.version);
          this._comprobarRemota();
        }
      });
    }
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
      this._comprobarRemota();
    }
    this._swReg.addEventListener?.('updatefound', () => {
      const nw = this._swReg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          this._comprobarRemota();
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

  /** Versión realmente cargada en esta sesión (no localStorage). */
  versionCargada() {
    const emb = this._num(this._embebida);
    const cfg = typeof CONFIG !== 'undefined' ? this._num(CONFIG.version) : 0;
    let forz = 0;
    try {
      const fv = sessionStorage.getItem('mariel_force_version');
      const t0 = parseInt(sessionStorage.getItem('mariel_actualizado_en') || '0', 10);
      if (fv && t0 && Date.now() - t0 < 120000) forz = this._num(fv);
    } catch (e) { /* */ }
    return Math.max(emb, cfg, forz) || emb || cfg || forz || 0;
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
    const urls = [];
    if (origen) urls.push(origen + '/version.json?_=' + ts);
    urls.push(
      this._versionCanonica + '?_=' + ts,
      'version.json?_=' + ts,
      'js/config/config.js?_=' + ts
    );
    for (const url of urls) {
      try {
        const r = await fetch(url, opts);
        if (!r.ok) continue;
        const txt = await r.text();
        const v = this._parseVersionTexto(txt);
        if (v) return v;
      } catch (e) { /* siguiente fuente */ }
    }
    return null;
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
    document.body.classList.remove('mariel-bloqueado-actualizar');
    document.getElementById('pantalla-actualizar')?.classList.add('oculto');
    const btn = document.getElementById('btn-actualizar-app');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Actualizar';
    }
    this._estadoActualizar('', false);
  },

  revisar() {
    const cargada = this.versionCargada();
    const remoto = this._remota;
    const r = this._num(remoto);

    if (r && cargada >= r) {
      this._desbloquearActualizacion(String(cargada));
      return false;
    }

    if (r && r > cargada) {
      this.mostrarBloqueo(String(cargada || '?'), String(r));
      return true;
    }

    if (this._bloqueado && r && r <= cargada) {
      this._desbloquearActualizacion(String(cargada));
    }
    return false;
  },

  mostrarBloqueo(local, remoto) {
    if (this._bloqueado) {
      const det = document.getElementById('actualizar-detalle');
      if (det) det.textContent = 'Tu versión: ' + local + ' · Nueva: ' + remoto;
      return;
    }
    this._bloqueado = true;
    this._remota = String(remoto || this._remota || '');
    document.body.classList.add('mariel-bloqueado-actualizar');

    const det = document.getElementById('actualizar-detalle');
    if (det) det.textContent = 'Tu versión: ' + local + ' · Nueva: ' + remoto;
    this._estadoActualizar('', false);

    const pant = document.getElementById('pantalla-actualizar');
    if (pant) pant.classList.remove('oculto');

    [
      'pantalla-carga', 'pantalla-login', 'pantalla-registro', 'pantalla-muerte',
      'pantalla-bloqueo', 'pantalla-sesion-remota', 'pantalla-cuenta-eliminada',
      'chatPanel', 'ventana-amigos', 'ventana-opciones', 'ventana-mochila'
    ].forEach(id => document.getElementById(id)?.classList.add('oculto'));

    document.querySelectorAll('.chat-panel.show, .ventana:not(.oculto)').forEach(el => {
      el.classList.add('oculto');
      el.classList.remove('show');
    });
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
      headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
    };
    await Promise.all(urls.map(u => fetch(u, opts).catch(() => null)));
  },

  async actualizar() {
    if (this._actualizando) return;
    this._actualizando = true;

    const btn = document.getElementById('btn-actualizar-app');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Actualizar';
    }

    this._estadoActualizar('Comprobando versión…', true);
    let objetivo = null;
    try {
      objetivo = await this.obtenerRemota();
    } catch (e) { /* */ }
    objetivo = String(objetivo || this._remota || this._embebida || '');
    if (!objetivo || objetivo === '?') {
      if (btn) btn.disabled = false;
      this._estadoActualizar('No se pudo comprobar la versión. Reintenta.', true);
      this._actualizando = false;
      return;
    }

    this._remota = objetivo;
    localStorage.setItem('mariel_app_version', objetivo);
    try {
      sessionStorage.setItem('mariel_force_version', objetivo);
      sessionStorage.setItem('mariel_actualizado_en', String(Date.now()));
    } catch (e) { /* */ }

    this._prepararLoginTrasActualizacion();
    this._estadoActualizar('Limpiando caché…', true);
    await this._limpiarTodaCache();

    this._estadoActualizar('Descargando v' + objetivo + '…', true);
    await this._precargarVersion(objetivo);

    this._estadoActualizar('Listo — iniciar sesión…', true);
    await new Promise((r) => setTimeout(r, 350));

    const url = location.origin + '/?_mariel=' + Date.now();
    location.replace(url);
  },

  async comprobarRemota() {
    await this._comprobarRemota();
  },

  async _comprobarRemota() {
    if (this._comprobando) return;
    this._comprobando = true;
    try {
      const remoto = await this.obtenerRemota();
      if (remoto) this._remota = remoto;
      this.revisar();
    } finally {
      this._comprobando = false;
    }
  }
};
