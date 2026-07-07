// Detecta actualizaciones al instante y bloquea el juego hasta pulsar Actualizar.
const MarielVersion = {
  _bloqueado: false,
  _embebida: null,
  _remota: null,
  _pollMs: 20000,
  _swPollMs: 45000,
  _pollTimer: null,
  _swTimer: null,
  _comprobando: false,
  _swReg: null,

  iniciar(versionEmbebida) {
    this._embebida = String(versionEmbebida || window.__MARIEL_EMBEDDED__ || '');
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
        if (ev.data?.tipo === 'nueva-version') this._comprobarRemota();
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
    if (typeof CONFIG !== 'undefined' && CONFIG.version) return String(CONFIG.version);
    return this._embebida || localStorage.getItem('mariel_app_version') || '?';
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
    const intentos = [
      fetch('version.json?_=' + ts, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } }),
      fetch('js/config/config.js?_=' + ts, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } })
    ];
    for (const prom of intentos) {
      try {
        const r = await prom;
        if (!r.ok) continue;
        const txt = await r.text();
        const v = this._parseVersionTexto(txt);
        if (v) return v;
      } catch (e) { /* siguiente fuente */ }
    }
    return null;
  },

  _versionObjetivo(local, remoto) {
    const r = this._num(remoto);
    const l = this._num(local);
    const emb = this._num(this._embebida);
    if (r > l) return remoto;
    if (r > emb) return remoto;
    if (emb > l) return this._embebida;
    return null;
  },

  necesitaActualizar(local, remoto) {
    const l = this._num(local);
    const r = this._num(remoto);
    if (!r) return false;
    if (r > l) return true;
    const emb = this._num(this._embebida);
    if (emb && r > emb) return true;
    return false;
  },

  revisar() {
    const local = this.versionLocal();
    const remoto = this._remota;
    const objetivo = this._versionObjetivo(local, remoto || this._embebida);
    if (objetivo) {
      this.mostrarBloqueo(local, objetivo);
      return true;
    }
    if (!this._bloqueado && remoto && this._num(remoto) === this._num(local)) {
      localStorage.setItem('mariel_app_version', remoto);
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
    document.body.classList.add('mariel-bloqueado-actualizar');

    const det = document.getElementById('actualizar-detalle');
    if (det) det.textContent = 'Tu versión: ' + local + ' · Nueva: ' + remoto;

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

    if (typeof Notificaciones !== 'undefined') {
      Notificaciones.mostrar('⬆️ Hay una actualización — pulsa Actualizar', 'alerta', 8000);
    }
  },

  async actualizar() {
    const btn = document.getElementById('btn-actualizar-app');
    const objetivo = this._remota || this._embebida;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Actualizando…';
    }
    if (objetivo) localStorage.setItem('mariel_app_version', objetivo);

    try {
      if (this._swReg?.waiting) {
        this._swReg.waiting.postMessage({ tipo: 'skip-waiting' });
      }
      if ('serviceWorker' in navigator) {
        const rs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(rs.map(r => r.unregister()));
      }
      if ('caches' in window) {
        const ks = await caches.keys();
        await Promise.all(ks.map(k => caches.delete(k)));
      }
    } catch (e) { /* seguir con recarga */ }

    const bust = '?v=' + Date.now();
    location.replace(location.pathname + bust + location.hash);
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
