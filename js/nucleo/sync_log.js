/**
 * Logs visibles del flujo sync (admin publica → servidor → sockets → clientes).
 * Consola + panel #mariel-sync-log (solo admin).
 */
const MarielSyncLog = {
  _max: 40,
  _lineas: [],

  _esAdmin() {
    return typeof Usuarios !== 'undefined' && Usuarios.esAdministrador && Usuarios.esAdministrador();
  },

  _panel() {
    return document.getElementById('mariel-sync-log');
  },

  _pintarPanel() {
    const el = this._panel();
    if (!el) return;
    el.textContent = this._lineas.map(l => l.t + ' — ' + l.m + (l.d ? ' · ' + l.d : '')).join('\n');
    el.scrollTop = el.scrollHeight;
  },

  log(etiqueta, detalle) {
    const t = new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const msg = String(etiqueta || '').trim();
    const det = detalle != null && detalle !== '' ? String(detalle) : '';
    const linea = '[SYNC] ' + msg + (det ? ' — ' + det : '');
    console.warn(linea);
    this._lineas.push({ t, m: msg, d: det });
    if (this._lineas.length > this._max) this._lineas.shift();
    if (this._esAdmin()) {
      const panel = this._panel();
      if (panel) {
        panel.classList.remove('oculto');
        this._pintarPanel();
      }
    }
    try {
      window.dispatchEvent(new CustomEvent('mariel-sync-log', { detail: { etiqueta: msg, detalle: det, t } }));
    } catch (e) { /* */ }
  },

  tokenAdmin() {
    const key = (typeof SyncServidor !== 'undefined' && SyncServidor.TOKEN_KEY) ||
      (typeof Multijugador !== 'undefined' && Multijugador.TOKEN_KEY) || 'mariel_online_token';
    let token = '';
    try { token = localStorage.getItem(key) || ''; } catch (e) { /* */ }
    if (!token) {
      this.log('ADMIN TOKEN', 'NO — sin mariel_online_token, no publica online');
      return false;
    }
    let usuario = '?';
    let role = '?';
    try {
      const p = JSON.parse(atob(token.split('.')[1]));
      usuario = p.username || p.sub || '?';
      role = p.role || '?';
    } catch (e) { /* */ }
    this.log('ADMIN TOKEN EXISTE', 'usuario=' + usuario + ' role=' + role);
    return true;
  },

  socketEstado() {
    const s = typeof Multijugador !== 'undefined' ? Multijugador.socket : null;
    const conectado = !!(s && s.connected && Multijugador.activo);
    this.log(conectado ? 'SOCKET CONECTADO' : 'SOCKET DESCONECTADO',
      conectado ? 'id=' + (s.id || '?') : 'sin Socket.IO activo');
    return conectado;
  }
};
