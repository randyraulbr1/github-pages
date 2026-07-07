// Comprueba versión local vs servidor y bloquea el juego si hace falta actualizar.
const MarielVersion = {
  _bloqueado: false,
  _embebida: null,
  _remota: null,

  iniciar(versionEmbebida) {
    this._embebida = String(versionEmbebida || '');
    const btn = document.getElementById('btn-actualizar-app');
    if (btn && !btn._marielVersionOk) {
      btn._marielVersionOk = true;
      btn.addEventListener('click', () => this.actualizar());
    }
    this.revisar();
    this._comprobarRemota();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.revisar();
    });
  },

  _num(v) {
    const n = parseInt(String(v || ''), 10);
    return Number.isFinite(n) ? n : 0;
  },

  versionLocal() {
    if (typeof CONFIG !== 'undefined' && CONFIG.version) return String(CONFIG.version);
    return this._embebida || localStorage.getItem('mariel_app_version') || '?';
  },

  async obtenerRemota() {
    try {
      const r = await fetch('js/config/config.js?nocache=' + Date.now(), { cache: 'no-store' });
      const txt = await r.text();
      const m = txt.match(/version:\s*['"](\d+)['"]/);
      return m ? m[1] : null;
    } catch (e) {
      return null;
    }
  },

  necesitaActualizar(local, remoto) {
    const l = this._num(local);
    const r = this._num(remoto);
    if (!r) return false;
    if (l && r > l) return true;
    const emb = this._num(this._embebida);
    if (emb && r > emb) return true;
    return false;
  },

  revisar() {
    const local = this.versionLocal();
    const remoto = this._remota;
    const emb = this._embebida;
    if (this.necesitaActualizar(local, remoto || emb)) {
      this.mostrarBloqueo(local, remoto || emb);
      return true;
    }
    if (this._num(emb) > this._num(local)) {
      this.mostrarBloqueo(local, emb);
      return true;
    }
    if (!this._bloqueado && remoto) {
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

    ['pantalla-carga', 'pantalla-login', 'pantalla-registro', 'pantalla-muerte',
      'pantalla-bloqueo', 'pantalla-sesion-remota', 'pantalla-cuenta-eliminada'
    ].forEach(id => document.getElementById(id)?.classList.add('oculto'));
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
      if ('serviceWorker' in navigator) {
        const rs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(rs.map(r => r.unregister()));
      }
      if ('caches' in window) {
        const ks = await caches.keys();
        await Promise.all(ks.map(k => caches.delete(k)));
      }
    } catch (e) { /* seguir con recarga */ }

    location.reload();
  },

  async comprobarRemota() {
    await this._comprobarRemota();
  },

  async _comprobarRemota() {
    const remoto = await this.obtenerRemota();
    if (remoto) this._remota = remoto;
    this.revisar();
  }
};
