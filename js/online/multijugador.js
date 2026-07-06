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
  _pollMundo: null,
  _ultimoPullMundo: 0,

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
      this._iniciarPollingMundo();
      this._pullMundoServidor();
    });

    this.socket.on('disconnect', () => {
      this.activo = false;
      if (this._pollMundo) {
        clearInterval(this._pollMundo);
        this._pollMundo = null;
      }
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
      this._actualizarMarcador(this.online[i >= 0 ? i : this.online.length - 1]);
    });

    this.socket.on('player:updateStats', (p) => {
      if (!this._visible(p.playerId)) return;
      const i = this.online.findIndex(x => Number(x.playerId) === Number(p.playerId));
      if (i >= 0) {
        Object.assign(this.online[i], p);
        this._actualizarMarcador(this.online[i]);
      }
    });

    this.socket.on('player:revived', (data) => {
      if (!data?.playerId) return;
      if (Number(data.playerId) === this._miPlayerId()) {
        if (typeof Vida !== 'undefined') {
          const nombre = (data.reviverName || 'Un jugador').replace(/</g, '');
          Vida.revivir(
            data.hp,
            '❤️ ' + nombre + ' te revivió con un botiquín. ¡Ya puedes seguir jugando!'
          );
        }
      }
      const i = this.online.findIndex(x => Number(x.playerId) === Number(data.playerId));
      if (i >= 0) {
        this.online[i].hp = data.hp;
        this.online[i].dead = false;
        this.online[i].deathX = null;
        this.online[i].deathY = null;
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
      this._aplicarMundoServidor(data, true);
    });

    this.socket.on('world:objetoRecogido', (data) => {
      if (!data?.origenId || typeof Admin === 'undefined') return;
      Admin.aplicarRecogidaCompartida(data.origenId, data.recogidoAt, data.playerId);
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

  _iniciarPollingMundo() {
    if (this._pollMundo) clearInterval(this._pollMundo);
    this._pollMundo = setInterval(() => this._pullMundoServidor(), 4000);
  },

  _aplicarMundoServidor(data, avisar) {
    if (!data?.mundo || typeof Admin === 'undefined') return false;
    const m = data.mundo;
    const tieneMapa = (m.misiones?.length || 0) + (m.objetos?.length || 0) +
      (m.enemigos?.length || 0) + (m.tesoros?.length || 0) +
      (m.tiendasAdmin?.length || 0) + Object.keys(m.posiciones || {}).length;
    if (!tieneMapa) return false;
    const ts = data.actualizadoEn || m.actualizadoEn || Date.now();
    if (ts <= this.mundoServidorTs) return false;
    this.mundoServidorTs = ts;
    const json = JSON.stringify(m);
    Admin._crudoPublicado = json;
    Admin._ultimoFirmaPublicada = Admin._firmaMundo(json);
    Admin._aplicarMundoRemoto(json);
    if (avisar && typeof Usuarios !== 'undefined' && !Usuarios.esAdministrador() &&
        typeof Notificaciones !== 'undefined') {
      Notificaciones.mostrar('🌍 El admin actualizó el mapa', 'info', 4000);
    }
    return true;
  },

  async _pullMundoServidor() {
    const base = this.urlServidor();
    const token = localStorage.getItem(this.TOKEN_KEY);
    if (!base || !token || !this.activo) return;
    const ahora = Date.now();
    if (ahora - this._ultimoPullMundo < 2500) return;
    this._ultimoPullMundo = ahora;
    try {
      const r = await fetch(base + '/api/player/mundo', {
        headers: { Authorization: 'Bearer ' + token }
      });
      const data = await r.json().catch(() => ({}));
      if (!data.ok || !data.mundo) return;
      this._aplicarMundoServidor(data, false);
    } catch (e) { /* servidor dormido */ }
  },

  recogerObjetoCompartido(origenId) {
    return new Promise((resolve) => {
      if (!this.socket || !this.activo || !origenId) return resolve(false);
      this.socket.emit('world:pickupShared', { origenId }, (res) => {
        if (res?.ok && typeof Admin !== 'undefined') {
          Admin.aplicarRecogidaCompartida(origenId, res.recogidoAt, this._miPlayerId());
        }
        resolve(!!res?.ok);
      });
    });
  },

  _estaMuerto(p) {
    return !!(p && (p.dead || (p.hp != null && p.hp <= 0)));
  },

  _posMarcador(p) {
    if (this._estaMuerto(p) && p.deathX != null && p.deathY != null) {
      return { x: p.deathX, y: p.deathY };
    }
    return { x: p.x, y: p.y };
  },

  _distanciaMarcador(p) {
    if (!GPS.posicion || !p) return Infinity;
    const pos = this._posMarcador(p);
    return Utilidades.distanciaMetros(GPS.posicion, [pos.x, pos.y]);
  },

  _visibleMuertoCerca(p) {
    return this._distanciaMarcador(p) <= (CONFIG.distanciaVerMuerto || 50);
  },

  refrescarMarcadoresDistancia() {
    if (!this.activo) return;
    for (const p of this.online) this._actualizarMarcador(p);
  },

  revivirJugador(p) {
    if (!this.socket || !this.activo || !p) return;
    if (!this._estaMuerto(p)) return;
    const d = this._distanciaMarcador(p);
    const maxDist = CONFIG.distanciaVerMuerto || 50;
    if (d > maxDist) {
      Notificaciones.mostrar('📍 Demasiado lejos para revivir (' + Math.round(d) + ' m). Máx. ' + maxDist + ' m', 'info', 3500);
      return;
    }
    if (typeof Mochila === 'undefined' || !Mochila.tieneItem('botiquin')) {
      Notificaciones.mostrar('🩹 Necesitas un botiquín en la mochila ($300 en la farmacia)', 'alerta', 4500);
      return;
    }
    const cura = CONFIG.vidaAlRevivir || 40;
    const hpMax = typeof Vida !== 'undefined' ? Vida.vidaMaxima() : 100;
    this.socket.emit('player:revive', {
      targetPlayerId: p.playerId,
      reviveHp: cura,
      hpMax
    }, (res) => {
      if (res?.ok) {
        Mochila.quitar('botiquin', 1, 'Revivió a ' + (p.name || 'jugador'));
        Notificaciones.mostrar('🩹 Reviviste a ' + (p.name || 'jugador'), 'exito', 5000);
      } else {
        Notificaciones.mostrar('❌ ' + (res?.error || 'No se pudo revivir'), 'error', 4000);
      }
    });
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
    const muerto = Vida.estaMuerto();
    const payload = {
      hp: Math.round(Vida.actual),
      hpMax,
      level: Vida.nivel,
      hunger: Math.round(Vida.hambre),
      xp: Vida.xp,
      dead: muerto
    };
    if (muerto && typeof Guardado !== 'undefined' && Guardado.datos.muertePos) {
      payload.deathX = Guardado.datos.muertePos[0];
      payload.deathY = Guardado.datos.muertePos[1];
    }
    this.socket.emit('player:updateStats', payload, () => {});
  },

  _pctVida(p) {
    const max = Math.max(1, p.hpMax || 100);
    return Math.max(0, Math.min(100, Math.round((p.hp != null ? p.hp : max) / max * 100)));
  },

  _iconoJugadorMuerto(p) {
    const nombre = (p.name || '?').replace(/</g, '');
    return L.divIcon({
      className: '',
      html: '<div class="marcador-jugador-muerto">' +
        '<div class="mjm-etiqueta">' + nombre + '</div>' +
        '<div class="mjm-carabela">⚰️</div></div>',
      iconSize: [56, 58],
      iconAnchor: [28, 54]
    });
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
    const muerto = this._estaMuerto(p);
    if (muerto && !this._visibleMuertoCerca(p)) {
      this._quitarMarcador(id);
      return;
    }
    const pos = this._posMarcador(p);
    let m = this.marcadores[id];
    const icon = muerto ? this._iconoJugadorMuerto(p) : this._iconoJugador(p);
    if (!m) {
      m = L.marker([pos.x, pos.y], {
        icon,
        interactive: true,
        zIndexOffset: muerto ? 9999 : 900
      }).addTo(Mapa.mapa);
      if (muerto) {
        m.on('click', () => this.revivirJugador(p));
        m.bindPopup('⚰️ ' + (p.name || 'Jugador') + ' · Toca con 🩹 botiquín para revivir');
      } else {
        m.bindPopup(() => typeof Amigos !== 'undefined' ? Amigos.popupHtml(p) : p.name);
      }
      this.marcadores[id] = m;
    } else {
      this._animarMarcador(id, pos.x, pos.y);
      m.setIcon(icon);
      m.off('click');
      if (muerto) {
        m.on('click', () => this.revivirJugador(p));
        m.bindPopup('⚰️ ' + (p.name || 'Jugador') + ' · Toca con 🩹 botiquín para revivir');
      } else {
        m.bindPopup(() => typeof Amigos !== 'undefined' ? Amigos.popupHtml(p) : p.name);
      }
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
