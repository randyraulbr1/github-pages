/**
 * Multijugador en vivo — integrado en Mariel Explorer (tcodm.com).
 * Muestra otros jugadores en el mapa real del juego vía Socket.IO + Render.
 */
const Multijugador = {
  TOKEN_KEY: 'mariel_online_token',
  socket: null,
  activo: false,
  marcadores: {},
  online: [],
  _ultimoEnvio: 0,

  urlServidor() {
    return (CONFIG.servidorOnline || '').replace(/\/$/, '');
  },

  async _cargarSocketIo() {
    if (typeof io !== 'undefined') return;
    const url = this.urlServidor();
    if (!url) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url + '/socket.io/socket.io.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Sin socket.io'));
      document.head.appendChild(s);
    });
  },

  async sincronizarCuenta(usuario, clave) {
    const base = this.urlServidor();
    if (!base || !usuario || !clave) return false;
    const body = JSON.stringify({ username: usuario.trim(), password: clave });
    const headers = { 'Content-Type': 'application/json' };
    try {
      let r = await fetch(base + '/api/login', { method: 'POST', headers, body });
      let data = await r.json().catch(() => ({}));
      if (!r.ok) {
        r = await fetch(base + '/api/register', { method: 'POST', headers, body });
        data = await r.json().catch(() => ({}));
      }
      if (data.token) {
        localStorage.setItem(this.TOKEN_KEY, data.token);
        return true;
      }
    } catch (e) { /* servidor dormido o sin red */ }
    return false;
  },

  async iniciar() {
    const base = this.urlServidor();
    const token = localStorage.getItem(this.TOKEN_KEY);
    if (!base || !token || typeof Usuarios === 'undefined' || !Usuarios.perfilActivo) return;
    if (typeof Mapa === 'undefined' || !Mapa.mapa) return;

    try {
      await this._cargarSocketIo();
    } catch (e) {
      return;
    }

    this.socket = io(base, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true
    });

    this.socket.on('connect', () => {
      this.activo = true;
      if (typeof GPS !== 'undefined' && GPS.posicion) {
        this.enviarPosicion(GPS.posicion[0], GPS.posicion[1], true);
      }
    });

    this.socket.on('disconnect', () => { this.activo = false; });

    this.socket.on('game:init', (data) => {
      this.online = (data.onlinePlayers || []).filter(p =>
        Number(p.playerId) !== Number(data.player?.id));
      this._redibujar();
    });

    this.socket.on('players:sync', (data) => {
      const miId = this._miPlayerId();
      this.online = (data.players || []).filter(p => Number(p.playerId) !== miId);
      this._redibujar();
    });

    this.socket.on('player:online', (p) => {
      if (Number(p.playerId) === this._miPlayerId()) return;
      const i = this.online.findIndex(x => Number(x.playerId) === Number(p.playerId));
      if (i >= 0) this.online[i] = p; else this.online.push(p);
      this._redibujar();
    });

    this.socket.on('player:offline', (p) => {
      this.online = this.online.filter(x => Number(x.playerId) !== Number(p.playerId));
      this._quitarMarcador(p.playerId);
    });

    this.socket.on('player:move', (p) => {
      if (Number(p.playerId) === this._miPlayerId()) return;
      const i = this.online.findIndex(x => Number(x.playerId) === Number(p.playerId));
      if (i >= 0) {
        this.online[i].x = p.x;
        this.online[i].y = p.y;
      } else {
        this.online.push(p);
      }
      this._actualizarMarcador(p.playerId, p.x, p.y, p.name);
    });
  },

  _miPlayerId() {
    try {
      const t = localStorage.getItem(this.TOKEN_KEY);
      if (!t) return -1;
      const payload = JSON.parse(atob(t.split('.')[1]));
      return Number(payload.playerId);
    } catch (e) { return -1; }
  },

  enviarPosicion(lat, lng, forzar) {
    if (!this.socket || !this.activo) return;
    const ahora = Date.now();
    if (!forzar && ahora - this._ultimoEnvio < 1800) return;
    this._ultimoEnvio = ahora;
    this.socket.emit('player:move', { x: lat, y: lng, gps: true }, () => {});
  },

  _iconoOtro(nombre) {
    return L.divIcon({
      className: '',
      html: '<div class="punto-otro-jugador"><span>' + (nombre || '?') + '</span></div>',
      iconSize: [60, 28],
      iconAnchor: [30, 14]
    });
  },

  _actualizarMarcador(id, lat, lng, nombre) {
    if (!Mapa.mapa) return;
    let m = this.marcadores[id];
    if (!m) {
      const p = this.online.find(x => Number(x.playerId) === Number(id));
      m = L.marker([lat, lng], {
        icon: this._iconoOtro(nombre || p?.name),
        interactive: false,
        zIndexOffset: 900
      }).addTo(Mapa.mapa);
      this.marcadores[id] = m;
    } else {
      m.setLatLng([lat, lng]);
    }
  },

  _quitarMarcador(id) {
    const m = this.marcadores[id];
    if (m && Mapa.mapa) Mapa.mapa.removeLayer(m);
    delete this.marcadores[id];
  },

  _redibujar() {
    const ids = new Set(this.online.map(p => String(p.playerId)));
    for (const id of Object.keys(this.marcadores)) {
      if (!ids.has(id)) this._quitarMarcador(id);
    }
    for (const p of this.online) {
      this._actualizarMarcador(p.playerId, p.x, p.y, p.name);
    }
    if (this.online.length && typeof Notificaciones !== 'undefined') {
      Notificaciones.mostrar('👥 ' + this.online.length + ' jugador(es) en vivo en el mapa', 'info', 3500);
    }
  }
};
