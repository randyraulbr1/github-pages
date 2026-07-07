// Versión de la app: sin bloquear el juego. Solo SW y limpieza manual de caché.
const MarielVersion = {
  _embebida: null,
  _remota: null,
  _swReg: null,
  _actualizando: false,

  iniciar(versionEmbebida) {
    this._embebida = String(window.__MARIEL_EMBEDDED__ || versionEmbebida || '');
    this._desbloquearTodo();
    const btn = document.getElementById('btn-actualizar-app');
    if (btn && !btn._marielVersionOk) {
      btn._marielVersionOk = true;
      btn.addEventListener('click', () => this.actualizar());
    }
  },

  _desbloquearTodo() {
    document.body.classList.remove('mariel-bloqueado-actualizar');
    const pant = document.getElementById('pantalla-actualizar');
    if (pant) pant.classList.add('oculto');
    const btn = document.getElementById('btn-actualizar-app');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Actualizar';
    }
    const est = document.getElementById('actualizar-estado');
    if (est) {
      est.textContent = '';
      est.classList.add('oculto');
    }
  },

  estaBloqueado() {
    return false;
  },

  exigirActualizado() {
    return true;
  },

  versionCargada() {
    const emb = parseInt(this._embebida || '0', 10);
    const cfg = typeof CONFIG !== 'undefined' ? parseInt(CONFIG.version || '0', 10) : 0;
    return Math.max(emb, cfg) || emb || cfg || 0;
  },

  revisar() {
    return false;
  },

  async comprobarRemota() {
    /* sin bloqueo */
  },

  registrarServiceWorker(reg) {
    if (!reg) return;
    this._swReg = reg;
    const revisar = () => {
      if (reg.update) reg.update().catch(() => {});
    };
    revisar();
    setInterval(revisar, 30000);
  },

  async _limpiarTodaCache() {
    try {
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

  async actualizar() {
    if (this._actualizando) return;
    this._actualizando = true;
    const btn = document.getElementById('btn-actualizar-app');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Actualizando…';
    }
    try {
      const v = typeof CONFIG !== 'undefined' ? CONFIG.version : this._embebida;
      if (v) localStorage.setItem('mariel_ultima_version', String(v));
      await this._limpiarTodaCache();
    } catch (e) { /* */ }
    location.replace(location.origin + '/?_=' + Date.now());
  }
};
