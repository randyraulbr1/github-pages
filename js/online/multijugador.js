/**
 * Multijugador en vivo — integrado en Mariel Explorer (tcodm.com).
 * Jugadores con vida/nivel, amigos, objetos compartidos del servidor.
 */
const Multijugador = {
  TOKEN_KEY: 'mariel_online_token',
  socket: null,
  activo: false,
  marcadores: {},
  online: [],
  _ultimoEnvio: 0,
  _ultimoStats: 0,
  mundoServidorTs: 0,
  _animaciones: {},

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
    const nombre = (typeof Usuarios !== 'undefined' && Usuarios.perfilActivo)
      ? Usuarios.perfilActivo.nombre
      : (usuario || '').trim();
    if (!base || !nombre || !clave) return false;
    const body = JSON.stringify({ username: nombre, password: clave });
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

  /** Conecta al servidor en vivo (después de que el mapa esté listo). */
  async conectar() {
    const base = this.urlServidor();
    if (!base || typeof Usuarios === 'undefined' || !Usuarios.perfilActivo) return false;
    if (typeof Mapa === 'undefined' || !Mapa.mapa) return false;

    let token = localStorage.getItem(this.TOKEN_KEY);
    if (!token) {
      const clave = sessionStorage.getItem('mariel_clave_servidor');
      if (clave) {
        await this.sincronizarCuenta(Usuarios.perfilActivo.nombre, clave);
        token = localStorage.getItem(this.TOKEN_KEY);
      }
    }
    if (!token) return false;

    await this.iniciar();
    return this.activo;
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

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.activo = false;
    this.socket = io(base, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 8,
      timeout: 20000
    });

    this._enlazarEventos();

    if (typeof Amigos !== 'undefined') Amigos.iniciarUI();
  },

  _enlazarEventos() {
    if (!this.socket) return;

    this.socket.on('connect_error', () => {
      this.activo = false;
    });

    this.socket.on('connect', () => {
      this.activo = true;
      if (typeof GPS !== 'undefined' && GPS.posicion) {
        this.enviarPosicion(GPS.posicion[0], GPS.posicion[1], true);
      }
      this.enviarStats(true);
    });

    this.socket.on('disconnect', () => {
      this.activo = false;
    });

    this.socket.on('game:init', (data) => {
      if (typeof Amigos !== 'undefined' && data.social) Amigos.aplicarSocial(data.social);
      this.online = (data.onlinePlayers || []).filter(p => this._visible(p.playerId));
      this._redibujar(false);
      this.enviarStats(true);
    });

    this.socket.on('players:sync', (data) => {
      this.online = (data.players || []).filter(p => this._visible(p.playerId));
      this._redibujar(false);
    });

    this.socket.on('player:online', (p) => {
      if (!this._visible(p.playerId)) return;
      const i = this.online.findIndex(x => Number(x.playerId) === Number(p.playerId));
      if (i >= 0) this.online[i] = p; else this.online.push(p);
      this._redibujar(false);
    });

    this.socket.on('player:offline', (p) => {
      this.online = this.online.filter(x => Number(x.playerId) !== Number(p.playerId));
      this._quitarMarcador(p.playerId);
      if (typeof Amigos !== 'undefined') Amigos.refrescar();
    });

    this.socket.on('player:move', (p) => {
      if (!this._visible(p.playerId)) return;
      const i = this.online.findIndex(x => Number(x.playerId) === Number(p.playerId));
      if (i >= 0) Object.assign(this.online[i], p);
      else this.online.push(p);
      this._actualizarMarcador(p);
    });

    this.socket.on('player:updateStats', (p) => {
      if (!this._visible(p.playerId)) return;
      const i = this.online.findIndex(x => Number(x.playerId) === Number(p.playerId));
      if (i >= 0) {
        this.online[i].hp = p.hp;
        this.online[i].hpMax = p.hpMax || this.online[i].hpMax || 100;
        this.online[i].level = p.level;
        this._actualizarMarcador(this.online[i]);
      }
    });

    this.socket.on('world:updateObject', (obj) => {
      if (obj.type === 'enemy' && obj.data?.origenId && typeof Enemigos !== 'undefined') {
        Enemigos.actualizarDesdeServidor(obj.data.origenId, obj.x, obj.y, obj.data);
      }
    });

    this.socket.on('world:removeObject', () => { /* el mundo completo llega por mundo:sync */ });

    this.socket.on('mundo:sync', (data) => {
      if (!data?.mundo || typeof Admin === 'undefined') return;
      const m = data.mundo;
      const tieneMapa = (m.misiones?.length || 0) + (m.objetos?.length || 0) +
        (m.enemigos?.length || 0) + (m.tesoros?.length || 0) +
        (m.tiendasAdmin?.length || 0) + Object.keys(m.posiciones || {}).length;
      if (!tieneMapa) return;
      this.mundoServidorTs = data.actualizadoEn || Date.now();
      const json = JSON.stringify(m);
      Admin._crudoPublicado = json;
      Admin._ultimoFirmaPublicada = Admin._firmaMundo(json);
      Admin._aplicarMundoRemoto(json);
      if (typeof Usuarios !== 'undefined' && !Usuarios.esAdministrador() &&
          typeof Notificaciones !== 'undefined') {
        Notificaciones.mostrar('🌍 El admin actualizó el mapa', 'info', 4000);
      }
    });

    this.socket.on('enemy:attack', (data) => {
      if (typeof Vida !== 'undefined' && data.damage) {
        Vida.recibirDano(data.damage, '👹 ' + (data.enemyName || 'Enemigo') + ' te atacó (-' + data.damage + ')');
        this.enviarStats(true);
      }
    });

    this.socket.on('friends:request', () => {
      if (typeof Amigos !== 'undefined') {
        Amigos.refrescar();
        Notificaciones.mostrar('📨 Nueva solicitud de amistad', 'info', 4000);
      }
    });

    this.socket.on('friends:accepted', () => {
      if (typeof Amigos !== 'undefined') {
        Amigos.refrescar();
        Notificaciones.mostrar('✅ Tienes un nuevo amigo', 'exito', 3500);
      }
      this._redibujar(false);
    });

    this.socket.on('friends:update', () => {
      if (typeof Amigos !== 'undefined') Amigos.refrescar();
    });

    this.socket.on('friends:data', (data) => {
      if (typeof Amigos !== 'undefined') Amigos.aplicarSocial(data);
    });

    if (!this._clickAmigosOk) {
      this._clickAmigosOk = true;
      document.addEventListener('click', (ev) => {
        if (typeof Amigos !== 'undefined') Amigos.manejarPopupClick(ev);
      });
    }
  },

  _miPlayerId() {
    try {
      const t = localStorage.getItem(this.TOKEN_KEY);
      if (!t) return -1;
      const payload = JSON.parse(atob(t.split('.')[1]));
      return Number(payload.playerId);
    } catch (e) { return -1; }
  },

  _visible(playerId) {
    const id = Number(playerId);
    if (id === this._miPlayerId()) return false;
    if (typeof Amigos !== 'undefined' && Amigos.estaBloqueado(id)) return false;
    return true;
  },

  enviarPosicion(lat, lng, forzar) {
    if (!this.socket || !this.activo) return;
    const ahora = Date.now();
    if (!forzar && ahora - this._ultimoEnvio < 700) return;
    this._ultimoEnvio = ahora;
    this.socket.emit('player:move', { x: lat, y: lng, gps: true, force: forzar }, () => {});
    this.enviarStats(false);
  },

  enviarStats(forzar) {
    if (!this.socket || !this.activo || typeof Vida === 'undefined') return;
    const ahora = Date.now();
    if (!forzar && ahora - this._ultimoStats < 3500) return;
    this._ultimoStats = ahora;
    const hpMax = Vida.vidaMaxima();
    this.socket.emit('player:updateStats', {
      hp: Math.round(Vida.actual),
      hpMax,
      level: Vida.nivel,
      hunger: Math.round(Vida.hambre),
      xp: Vida.xp
    }, () => {});
  },

  _pctVida(p) {
    const max = Math.max(1, p.hpMax || 100);
    return Math.max(0, Math.min(100, Math.round((p.hp != null ? p.hp : max) / max * 100)));
  },

  _iconoJugador(p) {
    const amigo = typeof Amigos !== 'undefined' && Amigos.esAmigo(p.playerId);
    const pct = this._pctVida(p);
    const nombre = (p.name || '?').replace(/</g, '');
    const nv = p.level || 1;
    return L.divIcon({
      className: '',
      html: '<div class="marcador-jugador-online' + (amigo ? ' es-amigo' : '') + '">' +
        '<div class="mjo-etiqueta">' +
        '<span class="mjo-nombre">' + nombre + '</span>' +
        '<span class="mjo-nivel">Nv ' + nv + '</span>' +
        '</div>' +
        '<div class="mjo-barra"><div class="mjo-barra-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="mjo-punto"></div></div>',
      iconSize: [88, 56],
      iconAnchor: [44, 54]
    });
  },

  _animarMarcador(id, lat, lng) {
    const m = this.marcadores[id];
    if (!m || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (this._animaciones[id]) cancelAnimationFrame(this._animaciones[id]);
    const desde = m.getLatLng();
    const dist = Math.abs(desde.lat - lat) + Math.abs(desde.lng - lng);
    if (dist < 0.000003) {
      m.setLatLng([lat, lng]);
      return;
    }
    const inicio = performance.now();
    const duracion = Math.min(900, Math.max(280, dist * 800000));
    const paso = (ahora) => {
      const t = Math.min(1, (ahora - inicio) / duracion);
      const suave = t * (2 - t);
      m.setLatLng([
        desde.lat + (lat - desde.lat) * suave,
        desde.lng + (lng - desde.lng) * suave
      ]);
      if (t < 1) {
        this._animaciones[id] = requestAnimationFrame(paso);
      } else {
        delete this._animaciones[id];
      }
    };
    this._animaciones[id] = requestAnimationFrame(paso);
  },

  _actualizarMarcador(p) {
    if (!Mapa.mapa || !p) return;
    const id = p.playerId;
    let m = this.marcadores[id];
    const icon = this._iconoJugador(p);
    if (!m) {
      m = L.marker([p.x, p.y], {
        icon,
        interactive: true,
        zIndexOffset: 900
      }).addTo(Mapa.mapa);
      m.bindPopup(() => typeof Amigos !== 'undefined' ? Amigos.popupHtml(p) : p.name);
      this.marcadores[id] = m;
    } else {
      this._animarMarcador(id, p.x, p.y);
      m.setIcon(icon);
    }
  },

  _quitarMarcador(id) {
    const m = this.marcadores[id];
    if (m && Mapa.mapa) Mapa.mapa.removeLayer(m);
    delete this.marcadores[id];
  },

  _redibujar(mostrarAviso) {
    this.online = this.online.filter(p => this._visible(p.playerId));
    const ids = new Set(this.online.map(p => String(p.playerId)));
    for (const id of Object.keys(this.marcadores)) {
      if (!ids.has(id)) this._quitarMarcador(id);
    }
    for (const p of this.online) {
      this._actualizarMarcador(p);
    }
    if (mostrarAviso !== false && this.online.length && typeof Notificaciones !== 'undefined') {
      Notificaciones.mostrar('👥 ' + this.online.length + ' jugador(es) en vivo', 'info', 3000);
    }
  }
};
