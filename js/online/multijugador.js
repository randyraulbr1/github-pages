/**
 * Multijugador en vivo — integrado en Mariel Explorer (tcodm.com).
 * Jugadores con vida/nivel, amigos, objetos compartidos del servidor.
 */
const Multijugador = {
  TOKEN_KEY: 'mariel_online_token',
  socket: null,
  activo: false,
  marcadores: {},
  cuerpos: {},
  cuerposMarcadores: {},
  online: [],
  _ultimoEnvio: 0,
  _ultimoStats: 0,
  mundoServidorTs: 0,
  _animaciones: {},
  _lineasAmigo: {},
  _pollMundo: null,
  _tickCuerposId: null,
  _ataudPlayerId: null,
  _jugadoresRevividos: new Set(),
  _ultimoPullMundo: 0,
  _mundoPendiente: null,
  _reconectando: false,
  _mundoSocketListo: false,
  _marcadoresPartida: {},

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
    const body = JSON.stringify({ usuario: nombre, clave });
    const headers = { 'Content-Type': 'application/json' };
    try {
      let r = await Utilidades.fetchConTimeout(base + '/api/login-game', {
        method: 'POST',
        headers,
        body
      }, 12000);
      let data = await r.json().catch(() => ({}));
      if (r.ok && data.ok && data.token) {
        localStorage.setItem(this.TOKEN_KEY, data.token);
        return true;
      }
      r = await fetch(base + '/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: nombre, password: clave })
      });
      data = await r.json().catch(() => ({}));
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

    if (typeof SyncServidor !== 'undefined') {
      await SyncServidor.despertarServidor();
      if (localStorage.getItem(this.TOKEN_KEY)) {
        const valido = await SyncServidor.verificarToken();
        const coincide = valido && await SyncServidor.tokenCoincideConPerfil();
        if (!coincide) SyncServidor.limpiarSesionOnline();
      }
      if (!localStorage.getItem(this.TOKEN_KEY)) {
        await SyncServidor.asegurarSesionServidor({});
      }
    }

    let token = localStorage.getItem(this.TOKEN_KEY);
    if (!token) {
      const claves = [];
      try {
        const s = sessionStorage.getItem('mariel_clave_servidor');
        if (s) claves.push(s);
      } catch (e) { /* */ }
      if (typeof Usuarios !== 'undefined' && Usuarios.esAdministrador && Usuarios.esAdministrador()) {
        try {
          const dev = localStorage.getItem('mariel_dev_clave_randy');
          if (dev) claves.push(dev);
        } catch (e2) { /* */ }
      }
      for (const clave of claves) {
        await this.sincronizarCuenta(Usuarios.perfilActivo.nombre, clave);
        token = localStorage.getItem(this.TOKEN_KEY);
        if (token) break;
      }
    }
    if (!token && typeof SyncServidor !== 'undefined') {
      await SyncServidor.asegurarSesionServidor();
      token = localStorage.getItem(this.TOKEN_KEY);
    }
    if (!token) return false;

    await this.iniciar();
    return !!this.socket;
  },

  /**
   * Conecta y espera game:init / mundo del socket antes de quitar la pantalla de carga.
   */
  async conectarYEsperarMundo(timeoutMs) {
    const limite = typeof timeoutMs === 'number' ? timeoutMs : 12000;
    const ok = await this.conectar();
    if (!this.socket) return false;
    if (this._mundoSocketListo) return true;

    return new Promise((resolve) => {
      let hecho = false;
      const terminar = (valor) => {
        if (hecho) return;
        hecho = true;
        clearTimeout(timer);
        if (this.socket) {
          this.socket.off('game:init', alListo);
          this.socket.off('connect', alConectar);
        }
        resolve(!!valor);
      };
      const alListo = () => {
        this._mundoSocketListo = true;
        terminar(true);
      };
      const alConectar = () => {
        this.socket.once('game:init', alListo);
      };
      const timer = setTimeout(() => terminar(this.activo), limite);

      if (this.socket.connected) {
        this.socket.once('game:init', alListo);
      } else {
        this.socket.once('connect', alConectar);
      }
    });
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
      reconnectionAttempts: 20,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 8000,
      timeout: 25000
    });

    this._enlazarEventos();
    this._enlazarCartelServidor();

    if (typeof Amigos !== 'undefined') Amigos.iniciarUI();
    if (typeof Chat !== 'undefined') {
      Chat.iniciarUI();
      Chat.enlazarSocket(this.socket);
    }
    this._enlazarPanelAtaud();
  },

  _enlazarPanelAtaud() {
    if (this._panelAtaudOk) return;
    this._panelAtaudOk = true;
    const vent = document.getElementById('ventana-ataud');
    const cont = document.getElementById('ventana-ataud-contenido');
    const cerrar = document.getElementById('btn-cerrar-ataud');
    if (cerrar) cerrar.addEventListener('click', () => this._cerrarPanelAtaud());
    if (vent) {
      vent.addEventListener('click', (ev) => {
        if (ev.target === vent) this._cerrarPanelAtaud();
      });
    }
    if (cont) {
      cont.addEventListener('click', (ev) => this._manejarClickPopupMuerto(ev, null));
    }
  },

  _cerrarPanelAtaud() {
    const vent = document.getElementById('ventana-ataud');
    if (vent) {
      vent.classList.add('oculto');
      vent.setAttribute('aria-hidden', 'true');
    }
    this._ataudPlayerId = null;
  },

  _mostrarPanelAtaud(playerId) {
    if (typeof MarielVersion !== 'undefined' && MarielVersion.estaBloqueado && MarielVersion.estaBloqueado()) {
      return;
    }
    const pid = Number(playerId);
    if (!pid) return;
    this._enlazarPanelAtaud();
    const cont = document.getElementById('ventana-ataud-contenido');
    const vent = document.getElementById('ventana-ataud');
    if (!cont || !vent) {
      const m = this.cuerposMarcadores[String(pid)];
      if (m?.openPopup) m.openPopup();
      return;
    }
    this._ataudPlayerId = pid;
    cont.innerHTML = this._popupMuertoHtml(this._datosPopupMuerto(pid));
    vent.classList.remove('oculto');
    vent.setAttribute('aria-hidden', 'false');
  },

  _enlazarEventos() {
    if (!this.socket) return;

    this.socket.on('connect_error', () => {
      this.activo = false;
      this._actualizarIndicadorConexion('reconectando');
    });

    this.socket.on('connect', () => {
      this.activo = true;
      this._reconectando = false;
      this._ocultarAvisoReconexion();
      this._actualizarIndicadorConexion('online');
      if (typeof GPS !== 'undefined') {
        if (GPS.posicion) {
          this.enviarPosicion(GPS.posicion[0], GPS.posicion[1], true);
        } else if (typeof Guardado !== 'undefined' && Guardado.datos?.posicionJugador?.length >= 2) {
          const pos = Guardado.datos.posicionJugador;
          this.enviarPosicion(pos[0], pos[1], true);
        }
      }
      this.enviarStats(true);
      this._iniciarPollingMundo();
      this._iniciarTickCuerpos();
      this.loadWorld();
      if (typeof Amigos !== 'undefined') Amigos.refrescar();
      if (typeof Chat !== 'undefined') Chat.refrescarConversaciones();
      if (typeof Usuarios !== 'undefined' && Usuarios.perfilActivo &&
          typeof SyncServidor !== 'undefined' && SyncServidor.registrarCuenta) {
        SyncServidor.registrarCuenta(Usuarios.perfilActivo, null).catch(() => {});
      }
    });

    this.socket.on('disconnect', (motivo) => {
      this.activo = false;
      if (motivo === 'io client disconnect') {
        this._actualizarIndicadorConexion('offline');
        return;
      }
      this._actualizarIndicadorConexion('reconectando');
      if (this._pollMundo) {
        clearInterval(this._pollMundo);
        this._pollMundo = null;
      }
      if (this._tickCuerposId) {
        clearInterval(this._tickCuerposId);
        this._tickCuerposId = null;
      }
    });

    this.socket.io.on('reconnect', () => {
      this.activo = true;
      this._reconectando = false;
      this._ocultarAvisoReconexion();
      this._actualizarIndicadorConexion('online');
      if (typeof Amigos !== 'undefined') Amigos.refrescar();
    });

    this.socket.io.on('reconnect_attempt', () => {
      this._actualizarIndicadorConexion('reconectando');
    });

    this.socket.io.on('reconnect_failed', () => {
      this.activo = false;
      this._actualizarIndicadorConexion('offline');
      this._intentarReconectarManual();
    });

    this.socket.on('game:init', (data) => {
      this._mundoSocketListo = true;
      if (typeof Amigos !== 'undefined' && data.social) Amigos.aplicarSocial(data.social);
      this.online = (data.onlinePlayers || []).filter(p => this._visible(p.playerId));
      this._redibujar(false);
      if (data.cuerposMuertos) this._aplicarCuerpos(data.cuerposMuertos);
      if (typeof ContenidoMundo !== 'undefined') {
        ContenidoMundo.inicializarDesdeInit({
          worldObjects: data.worldObjects,
          missions: data.missions,
          mundoSnapshot: data.mundoSnapshot
        });
      }
      if (data.worldObjects && typeof Enemigos !== 'undefined') {
        for (const obj of data.worldObjects) {
          if (obj?.type !== 'enemy' || !obj.data?.origenId) continue;
          Enemigos.actualizarDesdeServidor(obj.data.origenId, obj.x, obj.y, obj.data);
        }
      }
      if (data.mundoSnapshot) {
        this._aplicarMundoServidor({
          mundo: data.mundoSnapshot,
          actualizadoEn: data.mundoActualizadoEn || data.mundoSnapshot.actualizadoEn || 0
        }, false);
      }
      if (data.mundoSnapshot?.botinesEnemigo && typeof BotinEnemigo !== 'undefined') {
        BotinEnemigo.aplicarTodosDesdeMundo(data.mundoSnapshot.botinesEnemigo);
      }
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
      this._actualizarMarcador(p);
      this._redibujar(false);
      if (typeof Amigos !== 'undefined') Amigos._marcarOnline(p.playerId);
    });

    this.socket.on('player:offline', (p) => {
      const pid = Number(p.playerId);
      this.online = this.online.filter(x => Number(x.playerId) !== pid);
      this._quitarMarcador(p.playerId);
      if (this._jugadoresRevividos.has(pid)) {
        const sid = String(pid);
        delete this.cuerpos[sid];
        this._quitarMarcadorCuerpo(sid);
      }
      this._redibujarCuerpos();
      if (typeof Amigos !== 'undefined') Amigos._marcarOffline(pid);
    });

    this.socket.on('player:move', (p) => {
      if (!this._visible(p.playerId)) return;
      const i = this.online.findIndex(x => Number(x.playerId) === Number(p.playerId));
      if (i >= 0) Object.assign(this.online[i], p);
      else this.online.push(p);
      this._actualizarMarcador(this.online[i >= 0 ? i : this.online.length - 1]);
      if (typeof Admin !== 'undefined' && Admin.modo === 'organizar' && !Admin._organizandoArrastreActivo) {
        requestAnimationFrame(() => Admin._reaplicarArrastreOrganizar());
      }
    });

    this.socket.on('player:adminMove', (data) => {
      const x = Number(data?.x);
      const y = Number(data?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (typeof GPS !== 'undefined' && GPS._actualizar) {
        GPS.dejarDeSeguir();
        GPS._actualizar([x, y]);
      }
      if (typeof Notificaciones !== 'undefined') {
        Notificaciones.mostrar('📍 El administrador movió tu pin en el mapa', 'info', 4500);
      }
    });

    this.socket.on('player:updateStats', (p) => {
      if (!this._visible(p.playerId)) return;
      const i = this.online.findIndex(x => Number(x.playerId) === Number(p.playerId));
      if (i >= 0) {
        Object.assign(this.online[i], p);
        const pid = Number(p.playerId);
        if (this._estaMuerto(this.online[i])) {
          this._jugadoresRevividos.delete(pid);
          this._asegurarCuerpoLocal(this.online[i]);
        } else {
          const sid = String(pid);
          this._jugadoresRevividos.add(pid);
          delete this.cuerpos[sid];
          this._quitarMarcadorCuerpo(sid);
        }
        this._actualizarMarcador(this.online[i]);
        this._redibujarCuerpos();
      }
    });

    this.socket.on('player:revived', (data) => {
      if (!data?.playerId) return;
      const pid = Number(data.playerId);
      if (pid === this._miPlayerId()) {
        if (data.deadInventory) this._aplicarInventarioMuerto(data.deadInventory);
        if (typeof Vida !== 'undefined') {
          const motivo = data.fromAdmin
            ? '❤️ El administrador te revivió. ¡Ya puedes seguir jugando!'
            : '❤️ ' + (data.reviverName || 'Un jugador').replace(/</g, '') +
              ' te revivió con un botiquín. ¡Ya puedes seguir jugando!';
          Vida.revivir(data.hp, motivo);
        }
      }
      this._aplicarJugadorRevivido(pid, data.hp, data.hpMax);
    });

    this.socket.on('world:updateObject', (obj) => {
      if (!obj?.data?.origenId) return;
      const origenId = obj.data.origenId;
      if (obj.type === 'enemy' && typeof Enemigos !== 'undefined') {
        Enemigos.actualizarDesdeServidor(origenId, obj.x, obj.y, obj.data);
        return;
      }
      if (typeof ContenidoMundo !== 'undefined' && ContenidoMundo.usarDeltas() &&
          (obj.type === 'treasure' || obj.type === 'shop' || obj.type === 'chest')) {
        ContenidoMundo.aplicarWorldObject(obj);
        return;
      }
      if (typeof Admin === 'undefined') return;
      const recogido = Admin.publicado?.objetosEstado?.[origenId]?.recogidoAt;
      if (recogido) {
        Admin.aplicarRecogidaCompartida(origenId, recogido, null);
        return;
      }
      Admin.publicado.posiciones = Admin.publicado.posiciones || {};
      Admin.publicado.posiciones[origenId] = [obj.x, obj.y];
      if (obj.type === 'item') {
        const o = Admin.objetosTodos().find(x => x.id === origenId);
        if (o) {
          o.pos = [obj.x, obj.y];
          if (!o._marcador) Admin._crearMarcadorObjeto(o);
          else {
            o._marcador.setLatLng(o.pos);
            Admin._revisarObjeto(o);
          }
        }
      }
    });

    this.socket.on('world:removeObject', (payload) => {
      const origenId = payload?.origenId;
      if (!origenId) return;
      if (typeof ContenidoMundo !== 'undefined' && ContenidoMundo.usarDeltas()) {
        ContenidoMundo.quitarPorOrigenId(origenId);
      }
    });

    this.socket.on('mission:create', (m) => {
      if (typeof ContenidoMundo !== 'undefined' && ContenidoMundo.usarDeltas()) {
        ContenidoMundo.aplicarMision(m);
      }
    });

    this.socket.on('mission:update', (m) => {
      if (typeof ContenidoMundo !== 'undefined' && ContenidoMundo.usarDeltas()) {
        ContenidoMundo.aplicarMision(m);
      }
    });

    this.socket.on('mundo:sync', (data) => {
      if (!data?.mundo || typeof Admin === 'undefined') return;
      const ts = data.actualizadoEn || data.mundo.actualizadoEn || Date.now();
      const json = JSON.stringify(data.mundo);
      this.mundoServidorTs = Math.max(this.mundoServidorTs, ts);
      Admin._crudoPublicado = json;
      Admin._ultimoFirmaPublicada = Admin._firmaMundo(json);
      const esAdmin = typeof Usuarios !== 'undefined' && Usuarios.esAdministrador();
      if (typeof ContenidoMundo !== 'undefined' && ContenidoMundo.usarDeltas()) {
        ContenidoMundo.reconciliarDesdeSnapshot(data.mundo);
      }
      Admin._aplicarMundoRemoto(json, { permitirReduccion: !esAdmin });
      if (typeof Admin.pintarMapaCompleto === 'function' &&
          !(typeof ContenidoMundo !== 'undefined' && ContenidoMundo.usarDeltas())) {
        Admin.pintarMapaCompleto();
      }
      if (data.mundo.cuerposMuertos) this._aplicarCuerpos(data.mundo.cuerposMuertos);
      if (typeof Admin.mostrarPantallaBloqueoSiCorresponde === 'function') {
        Admin.mostrarPantallaBloqueoSiCorresponde();
      }
      if (typeof Usuarios !== 'undefined') {
        Usuarios.verificarCuentaEnMundo().catch(() => {});
      }
    });

    this.socket.on('partida:sync', (data) => {
      this._aplicarPartidaServidor(data);
    });

    this.socket.on('account:deleted', (data) => {
      if (typeof Usuarios !== 'undefined' && Usuarios._cuentaMeAfecta(data)) {
        Usuarios.expulsarCuentaEliminada();
      }
    });

    this.socket.on('world:shopStock', (data) => {
      if (!data?.tiendaId || !data?.itemId || typeof Admin === 'undefined') return;
      if (!Admin.publicado.tiendasStock) Admin.publicado.tiendasStock = {};
      const key = data.tiendaId + '|' + data.itemId;
      Admin.publicado.tiendasStock[key] = data.stock;
      if (typeof Tiendas !== 'undefined' && Tiendas.tiendaAbierta?.id === data.tiendaId) {
        Tiendas.pintar();
      }
    });

    this.socket.on('world:tesoroRecogido', (data) => {
      if (!data?.tesoroId || typeof Admin === 'undefined') return;
      Admin.aplicarRecogidaTesoro(data.tesoroId, data.recogidoAt);
    });

    this.socket.on('player:lootUpdate', (data) => {
      if (!data?.playerId) return;
      if (Number(data.playerId) === this._miPlayerId()) {
        this._aplicarInventarioMuerto(data.deadInventory || []);
      }
      this._aplicarLootLocal(data.playerId, data.deadInventory || []);
    });

    this.socket.on('cuerpos:sync', (data) => {
      const entrantes = data?.cuerpos || {};
      for (const pid of [...this._jugadoresRevividos]) {
        if (!entrantes[String(pid)]) this._jugadoresRevividos.delete(pid);
      }
      this._aplicarCuerpos(entrantes);
    });

    this.socket.on('world:objetoRecogido', (data) => {
      if (!data?.origenId || typeof Admin === 'undefined') return;
      Admin.aplicarRecogidaCompartida(data.origenId, data.recogidoAt, data.playerId);
    });

    this.socket.on('world:bagUpdate', (data) => {
      if (!data?.bolsa || typeof Bolsas === 'undefined') return;
      Bolsas.aplicarBolsaRemota(data.bolsa);
    });

    this.socket.on('world:bagRemove', (data) => {
      if (!data?.bolsaId || typeof Bolsas === 'undefined') return;
      Bolsas.aplicarBolsaEliminada(data.bolsaId);
    });

    this.socket.on('world:enemyLoot', (data) => {
      if (!data?.botin || typeof BotinEnemigo === 'undefined') return;
      BotinEnemigo.aplicarBotin(data.botin);
    });

    this.socket.on('world:enemyLootUpdate', (data) => {
      if (!data?.botin || typeof BotinEnemigo === 'undefined') return;
      BotinEnemigo.aplicarBotinActualizado(data.botin);
    });

    this.socket.on('world:enemyLootRemove', (data) => {
      if (!data?.botinId || typeof BotinEnemigo === 'undefined') return;
      BotinEnemigo.aplicarBotinEliminado(data.botinId);
    });

    this.socket.on('sesion:actualizada', (data) => {
      if (typeof Usuarios !== 'undefined' && Usuarios.aplicarSesionRemotaDesdeSocket) {
        Usuarios.aplicarSesionRemotaDesdeSocket(data);
      }
    });

    this.socket.on('mundo:enemyState', (data) => {
      if (!data?.enemyId || typeof Enemigos === 'undefined') return;
      Enemigos._aplicarEstadoEnemigoRemoto(data.enemyId, data.estado, !!data.eliminado, data.botin);
    });

    this.socket.on('enemy:attack', (data) => {
      if (typeof Vida !== 'undefined' && data.damage) {
        Vida.recibirDano(data.damage, null, data.enemyName || 'Enemigo');
        this.enviarStats(true);
      }
    });

    this.socket.on('friends:request', (data) => {
      if (typeof Amigos !== 'undefined') {
        Amigos.refrescar();
        const nombre = data?.fromName || 'Un jugador';
        Notificaciones.mostrarSocial('📨 ' + nombre + ' quiere ser tu amigo', 'info', 'amigos', 4500);
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
    if (!this._visibilidadOk) {
      this._visibilidadOk = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        if (this.activo) return;
        if (typeof Usuarios === 'undefined' || !Usuarios.perfilActivo) return;
        this._intentarReconectarManual();
        this._sincronizarPinesPartida();
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
    if (typeof Amigos !== 'undefined' && Amigos.bloqueadoCon(id)) return false;
    return true;
  },

  _distanciaJugador(p) {
    if (!GPS.posicion || !p) return Infinity;
    const pos = this._posMarcador(p);
    return Utilidades.distanciaMetros(GPS.posicion, [pos.x, pos.y]);
  },

  _estaEnVivo(playerId) {
    const id = Number(playerId);
    if (!Number.isFinite(id) || id < 0) return false;
    return this.online.some(p => Number(p.playerId) === id);
  },

  _debeMostrarJugador(p) {
    if (!p || !this._visible(p.playerId)) return false;
    if (this._esAdminMarcador(p)) return true;
    if (this._estaEnVivo(p.playerId)) return true;
    if (typeof Amigos !== 'undefined' && Amigos.esMarcado(p.playerId)) return true;
    if (typeof Admin !== 'undefined' && Admin.entidadVisibleEnRango) {
      return Admin.entidadVisibleEnRango(this._distanciaJugador(p));
    }
    const max = CONFIG.distanciaVerEntidades || 500;
    return CONFIG.optimizarVisibilidad === false || this._distanciaJugador(p) <= max;
  },

  _iniciarPollingMundo() {
    if (this._pollMundo) clearInterval(this._pollMundo);
    this._pollMundo = setInterval(() => this._pullMundoServidor(), 4000);
  },

  _iniciarTickCuerpos() {
    if (this._tickCuerposId) clearInterval(this._tickCuerposId);
    this._tickCuerposId = setInterval(() => this._refrescarTimersCuerpos(), 1000);
  },

  _refrescarTimersCuerpos() {
    const ids = new Set();
    for (const pid of Object.keys(this.cuerpos || {})) {
      const c = this.cuerpos[pid];
      if (c && this._cuerpoVigente(c)) ids.add(Number(pid));
    }
    for (const p of (this.online || [])) {
      if (this._estaMuerto(p)) ids.add(Number(p.playerId));
    }
    for (const pid of ids) this._refrescarPopupsMuertos(pid);
  },

  _aplicarPartidaAdminEnMi(perfilId, snap) {
    if (!perfilId || !snap?.datos) return;
    if (typeof Usuarios === 'undefined' || Usuarios.perfilActivo?.id !== perfilId) return;
    if (typeof Guardado === 'undefined' || !Guardado.datos) return;
    const t = snap.t || 0;
    if (t <= (Guardado.datos.nubeT || 0)) return;

    const d = snap.datos;
    const remoteStatsT = snap.statsT || t;
    const localStatsT = Guardado.datos.statsT || 0;
    const pisarStats = remoteStatsT >= localStatsT;
    const invPendiente = Guardado.datos._invPendienteSync;
    let mochilaLocal;
    let armaLocal;
    const prefsLocal = Guardado.datos.preferencias
      ? JSON.parse(JSON.stringify(Guardado.datos.preferencias))
      : null;
    const prefsTLocal = Guardado.datos.preferenciasT || 0;
    if (invPendiente && !pisarStats) {
      mochilaLocal = JSON.parse(JSON.stringify(Guardado.datos.mochila || []));
      armaLocal = Guardado.datos.armaEquipada;
    }
    Guardado._aplicarSnapshot(d, { sinStats: !pisarStats });
    if (pisarStats) {
      Guardado.datos.statsT = remoteStatsT;
      delete Guardado.datos._invPendienteSync;
    }
    if (invPendiente && !pisarStats) {
      Guardado.datos.mochila = mochilaLocal;
      Guardado.datos.armaEquipada = armaLocal;
    }
    const remotaT = d.preferenciasT || 0;
    if (prefsLocal && (!d.preferencias || remotaT < prefsTLocal)) {
      Guardado.datos.preferencias = prefsLocal;
      Guardado.datos.preferenciasT = prefsTLocal;
    }
    Guardado.datos.nubeT = t;

    let revivido = false;
    if (typeof Vida !== 'undefined') {
      if (d.nivel != null) Vida.nivel = d.nivel;
      if (d.xp != null) Vida.xp = d.xp;
      const muertoRemoto = !!(d.muerto || (d.vida != null && d.vida <= 0));
      const muertoLocal = Vida.estaMuerto() || Guardado.datos.muerto;
      if (muertoRemoto) {
        Vida._activarMuerte();
      } else if (muertoLocal && typeof Admin !== 'undefined' && Admin._revividoRecienteEnPartida(d)) {
        Vida.revivir(d.vida, '❤️ El administrador te revivió. ¡Ya puedes seguir jugando!');
        revivido = true;
      } else if (!muertoLocal) {
        if (d.vida != null) Vida.actual = d.vida;
        if (d.hambre != null) Vida.hambre = d.hambre;
        Vida.pintar();
      }
    }
    if (typeof Mochila !== 'undefined') {
      Mochila._refrescarTrasGuardado();
      Mochila.pintar();
    }
    if (typeof Dinero !== 'undefined' && d.dinero) {
      Dinero.saldo = d.dinero.saldo;
      Dinero.pintar();
    }
    Guardado.guardarAhora();
    if (!revivido) this.enviarStats(true);
    // (Sin notificación: el servidor reenvía la partida a menudo con hora
    //  nueva, así que el aviso "El administrador actualizó tu personaje"
    //  salía en bucle. Se aplica el cambio en silencio.)
  },

  _aplicarPartidaServidor(data) {
    if (!data?.perfilId || typeof Admin === 'undefined') return;
    if (!Admin.publicado) return;
    if (!Admin.publicado.partidas) Admin.publicado.partidas = {};
    if (data.eliminado) {
      delete Admin.publicado.partidas[data.perfilId];
      if (Admin.publicado.jugadores) {
        Admin.publicado.jugadores = Admin.publicado.jugadores.filter(
          j => j && j.id !== data.perfilId
        );
      }
      if (typeof Usuarios !== 'undefined' && Usuarios._cuentaMeAfecta(data)) {
        Usuarios.expulsarCuentaEliminada();
      }
    } else if (data.partida) {
      const prev = Admin.publicado.partidas[data.perfilId];
      if (!prev || (data.partida.t || 0) >= (prev.t || 0)) {
        Admin.publicado.partidas[data.perfilId] = data.partida;
      }
      this._aplicarPartidaAdminEnMi(data.perfilId, data.partida);
    }
    Admin._aplicarRevivirDesdeNube();
    if (typeof Usuarios !== 'undefined' && Usuarios.perfilActivo?.id === data.perfilId &&
        data.partida?.datos?.muerto && Array.isArray(data.partida.datos.muerteInventario)) {
      this._aplicarInventarioMuerto(data.partida.datos.muerteInventario);
    }
    const vistaJug = document.getElementById('admin-vista-jugadores');
    if (vistaJug && !vistaJug.classList.contains('oculto') && Admin._adminAbierto?.()) {
      Admin._listarCuentasAsync({ soloRefrescar: true });
    }
  },

  _ocultarAvisoReconexion() {
    if (typeof Notificaciones !== 'undefined' && Notificaciones._ocultarToast) {
      Notificaciones._ocultarToast();
    }
  },

  _intentarReconectarManual() {
    if (this._reconectarTimer) return;
    this._reconectarTimer = setTimeout(async () => {
      this._reconectarTimer = null;
      if (this.activo || typeof Usuarios === 'undefined' || !Usuarios.perfilActivo) return;
      if (typeof SyncServidor !== 'undefined') {
        await SyncServidor.asegurarSesionServidor().catch(() => {});
      }
      await this.conectar();
    }, 4000);
  },

  _mostrarReconectando(activo) {
    this._reconectando = !!activo;
    this._actualizarIndicadorConexion(activo ? 'reconectando' : (this.activo ? 'online' : 'offline'));
    if (typeof Notificaciones === 'undefined') return;
    if (activo) {
      Notificaciones.mostrar('📡 Reconectando al servidor…', 'alerta', 4000);
    } else {
      this._ocultarAvisoReconexion();
    }
  },

  _enlazarCartelServidor() {
    const cartel = document.getElementById('cartel-servidor-actualizando');
    if (!cartel || cartel._marielServidorOk) return;
    cartel._marielServidorOk = true;
    cartel.addEventListener('click', () => this._recargarPaginaServidor());
  },

  _recargarPaginaServidor() {
    try {
      sessionStorage.setItem('mariel_reconectar_servidor', String(Date.now()));
    } catch (e) { /* */ }
    if (this.socket) {
      try { this.socket.disconnect(); } catch (err) { /* */ }
    }
    const url = location.origin + '/?_serv=' + Date.now();
    location.replace(url);
  },

  _actualizarCartelServidor(estado) {
    const cartel = document.getElementById('cartel-servidor-actualizando');
    if (!cartel) return;
    const mostrar = (estado === 'reconectando' || estado === 'offline') &&
      CONFIG.servidorOnline && Usuarios?.perfilActivo;
    const titulo = cartel.querySelector('.cartel-servidor-texto');
    if (!mostrar) {
      cartel.classList.add('oculto');
      return;
    }
    if (titulo) {
      titulo.textContent = estado === 'offline'
        ? 'Sin conexión al servidor'
        : 'Servidor actualizando';
    }
    cartel.classList.remove('oculto');
  },

  _actualizarIndicadorConexion(estado) {
    const el = document.getElementById('indicador-conexion');
    if (!el) return;
    if (!CONFIG.servidorOnline || !Usuarios?.perfilActivo) {
      el.classList.add('oculto');
      el.classList.remove('visible', 'estado-reconectando', 'estado-offline');
      el.setAttribute('aria-hidden', 'true');
      this._actualizarCartelServidor('online');
      return;
    }
    el.classList.remove('oculto', 'visible', 'estado-reconectando', 'estado-offline');
    if (estado === 'reconectando') {
      el.classList.add('visible', 'estado-reconectando');
      el.title = 'Reconectando al servidor…';
      el.setAttribute('aria-hidden', 'false');
    } else if (estado === 'offline') {
      el.classList.add('visible', 'estado-offline');
      el.title = 'Sin conexión al servidor';
      el.setAttribute('aria-hidden', 'false');
    } else {
      el.title = 'Conectado al servidor';
      el.setAttribute('aria-hidden', 'true');
    }
    this._actualizarCartelServidor(estado);
  },

  _aplicarMundoAlCliente(data, avisar) {
    if (!data?.mundo) return false;
    const m = data.mundo;
    const tieneMapa = (m.misiones?.length || 0) + (m.objetos?.length || 0) +
      (m.enemigos?.length || 0) + (m.tesoros?.length || 0) +
      (m.tiendasAdmin?.length || 0) + Object.keys(m.posiciones || {}).length;
    const tieneContenido = typeof MundoPublico !== 'undefined' && MundoPublico.mundoTieneContenido
      ? MundoPublico.mundoTieneContenido(m) : tieneMapa > 0;
    const tieneJugadores = (m.jugadores?.length || 0) > 0 ||
      Object.keys(m.partidas || {}).length > 0;
    if (!tieneContenido && !tieneJugadores) return false;

    if (typeof Admin === 'undefined' || typeof Admin._aplicarMundoRemoto !== 'function') {
      this._mundoPendiente = data;
      return false;
    }

    const ts = data.actualizadoEn || m.actualizadoEn || Date.now();
    const remotoN = Admin._contarElementosMapa(m);
    const localN = Admin._contarMapaAdminCompleto();
    const esAdmin = typeof Usuarios !== 'undefined' && Usuarios.esAdministrador();
    if (remotoN < localN) {
      if (esAdmin) {
        setTimeout(() => Admin._publicarParaTodos(true), 2500);
        return false;
      }
      if (remotoN === 0) return false;
    }

    const json = JSON.stringify(m);
    const firma = Admin._firmaMundo(json);
    if (ts <= this.mundoServidorTs && firma === Admin._ultimoFirmaPublicada) return false;

    this.mundoServidorTs = Math.max(this.mundoServidorTs, ts);
    Admin._crudoPublicado = json;
    Admin._ultimoFirmaPublicada = firma;
    Admin._aplicarMundoRemoto(json, { soloMapa: true, permitirReduccion: !esAdmin });
    if (typeof Admin.pintarMapaCompleto === 'function') Admin.pintarMapaCompleto();
    if (m.cuerposMuertos) this._aplicarCuerpos(m.cuerposMuertos);
    if (m.botinesEnemigo && typeof BotinEnemigo !== 'undefined') {
      BotinEnemigo.aplicarTodosDesdeMundo(m.botinesEnemigo);
    }
    if (tieneContenido) this._mundoSocketListo = true;
    this._sincronizarPinesPartida();
    return true;
  },

  aplicarMundoPendiente() {
    if (!this._mundoPendiente) return false;
    const data = this._mundoPendiente;
    this._mundoPendiente = null;
    return this._aplicarMundoAlCliente(data, false);
  },

  async loadWorld() {
    return this.obtenerMundoServidor();
  },

  _aplicarMundoServidor(data, avisar) {
    return this._aplicarMundoAlCliente(data, avisar);
  },

  /** Descarga el mundo del servidor (SQLite). */
  async obtenerMundoServidor() {
    if (typeof SyncServidor !== 'undefined' && SyncServidor.obtenerMundo) {
      const data = await SyncServidor.obtenerMundo();
      if (data?.mundo) {
        return this._aplicarMundoServidor(data, false);
      }
    }
    const base = this.urlServidor();
    if (!base) return false;
    try {
      const r = await fetch(base + '/api/public/mundo', { cache: 'no-store' });
      const data = await r.json().catch(() => ({}));
      if (!data.ok || !data.mundo) return false;
      if (typeof MundoPublico !== 'undefined' && MundoPublico.mundoTieneContenido &&
          !MundoPublico.mundoTieneContenido(data.mundo)) {
        const tieneJugadores = (data.mundo.jugadores?.length || 0) > 0 ||
          Object.keys(data.mundo.partidas || {}).length > 0;
        if (!tieneJugadores) {
          const gh = await MundoPublico._descargarDesdeGitHub?.();
          if (gh?.texto) {
            return this._aplicarMundoServidor({
              mundo: JSON.parse(gh.texto),
              actualizadoEn: gh.actualizadoEn || 0
            }, false);
          }
          return false;
        }
      }
      return this._aplicarMundoServidor({
        mundo: data.mundo,
        actualizadoEn: data.actualizadoEn || data.mundo.actualizadoEn || 0
      }, false);
    } catch (e) {
      return false;
    }
  },

  async _pullMundoVersion() {
    const base = this.urlServidor();
    if (!base) return false;
    try {
      const r = await fetch(base + '/api/public/mundo/version', { cache: 'no-store' });
      const data = await r.json().catch(() => ({}));
      if (!data.ok) return false;
      const ts = data.actualizadoEn || 0;
      if (ts > this.mundoServidorTs) {
        return this.obtenerMundoServidor();
      }
      return false;
    } catch (e) {
      return false;
    }
  },

  async _pullMundoServidor() {
    if (this.activo) {
      return this._pullMundoVersion();
    }
    const ahora = Date.now();
    if (ahora - this._ultimoPullMundo < 2500) return;
    this._ultimoPullMundo = ahora;
    await this.obtenerMundoServidor();
  },

  recogerTesoroCompartido(tesoroId, pos) {
    return new Promise((resolve) => {
      if (!this.socket || !this.activo || !tesoroId) return resolve({ ok: false });
      this.socket.emit('world:tesoroRecogido', {
        tesoroId,
        lat: pos?.[0],
        lng: pos?.[1],
        pos
      }, (res) => {
        if (res?.ok) {
          this._aplicarRespuestaEconomia(res);
          if (typeof Admin !== 'undefined') {
            Admin.aplicarRecogidaTesoro(tesoroId, res.recogidoAt);
          }
        }
        resolve(res || { ok: false });
      });
    });
  },

  saquearMuerto(playerId, itemId, cantidad, btn) {
    if (!this.socket || !this.activo) return;
    const tomar = Math.max(1, cantidad || 1);
    const datos = this._datosPopupMuerto(playerId);
    const maxDist = CONFIG.distanciaVerMuerto || 50;
    const d = this._distanciaCuerpo(datos);
    if (d > maxDist) {
      Notificaciones.mostrar('📍 Demasiado lejos para saquear (' + Math.round(d) + ' m). Máx. ' + maxDist + ' m', 'info', 3500);
      return;
    }
    const inv = (datos.deadInventory || []).map(x => ({ id: x.id, cantidad: x.cantidad || 1 }));
    const idx = inv.findIndex(x => x.id === itemId);
    if (idx < 0) {
      Notificaciones.mostrar('❌ Ese objeto ya no está en el cuerpo', 'alerta', 2500);
      this._refrescarPopupsMuertos(playerId);
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.classList.add('cargando');
      btn.textContent = '⏳';
    }
    const payload = {
      targetPlayerId: playerId,
      itemId,
      cantidad: tomar
    };
    if (typeof GPS !== 'undefined' && GPS.posicion) {
      payload.reviverX = GPS.posicion[0];
      payload.reviverY = GPS.posicion[1];
    }
    this.socket.emit('player:lootBody', payload, (res) => {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('cargando');
        btn.textContent = 'Saquear';
      }
      if (res?.ok) {
        inv[idx].cantidad -= tomar;
        if (inv[idx].cantidad <= 0) inv.splice(idx, 1);
        this._aplicarLootLocal(playerId, inv);
        const fila = btn?.closest('.popup-muerto-item');
        if (fila) {
          fila.classList.add('popup-muerto-item-saqueado');
          setTimeout(() => fila.remove(), 180);
        }
        if (typeof Mochila !== 'undefined' && res.item) {
          Mochila.agregar(res.item.id, res.item.cantidad, { silencioso: true });
        }
        Notificaciones.mostrar('🎒 Saqueaste del cuerpo', 'exito', 3000);
        this._refrescarPopupsMuertos(playerId);
      } else {
        Notificaciones.mostrar('❌ ' + (res?.error || 'No se pudo saquear'), 'alerta', 3500);
        this._refrescarPopupsMuertos(playerId);
      }
    });
  },

  _aplicarLootLocal(playerId, deadInventory) {
    const pid = Number(playerId);
    const inv = deadInventory || [];
    const i = this.online.findIndex(x => Number(x.playerId) === pid);
    if (i >= 0) {
      this.online[i].deadInventory = inv;
      this._actualizarMarcador(this.online[i]);
    }
    const cid = String(playerId);
    if (this.cuerpos[cid]) {
      this.cuerpos[cid].deadInventory = inv;
      this._actualizarMarcadorCuerpo(this.cuerpos[cid]);
    }
    this._refrescarPopupsMuertos(pid);
  },

  /** Si me saquean estando muerto: quita ítems de mi mochila local. */
  _aplicarInventarioMuerto(deadInventory) {
    if (typeof Guardado === 'undefined' || !Guardado.datos) return;
    const inv = (deadInventory || []).map(x => ({
      id: x.id,
      cantidad: x.cantidad || 1
    }));
    const total = typeof Mochila !== 'undefined' && Mochila.TOTAL_SLOTS
      ? Mochila.TOTAL_SLOTS : 25;
    const slots = new Array(total).fill(null);
    let i = 0;
    for (const it of inv) {
      if (!it.id || i >= total) break;
      slots[i++] = { id: it.id, cantidad: it.cantidad };
    }
    Guardado.datos.mochila = slots;
    Guardado.datos.muerteInventario = inv;
    if (typeof Mochila !== 'undefined') {
      Mochila.slots = slots;
      if (typeof Mochila.pintar === 'function') Mochila.pintar();
    }
    Guardado.guardar();
  },

  _refrescarPopupsMuertos(playerId) {
    const datos = this._datosPopupMuerto(playerId);
    const html = this._popupMuertoHtml(datos);
    if (Number(this._ataudPlayerId) === Number(playerId)) {
      const cont = document.getElementById('ventana-ataud-contenido');
      if (cont) cont.innerHTML = html;
    }
    const marcadores = [
      this.marcadores[playerId],
      this.cuerposMarcadores[String(playerId)]
    ].filter(Boolean);
    for (const m of marcadores) {
      const popup = m.getPopup();
      if (!popup) continue;
      popup.setContent(html);
    }
  },

  _esAdminMarcador(p) {
    const nom = (p.name || '').trim().toLowerCase();
    const adm = (CONFIG.adminNombre || 'soycaos').toLowerCase();
    const alias = (CONFIG.adminAlias || []).map(a => a.toLowerCase());
    return nom === adm || alias.includes(nom);
  },

  _nombreMarcador(p) {
    if (this._esAdminMarcador(p)) return CONFIG.adminDisplayNombre || 'SoyCaos';
    return (p.name || '?').replace(/</g, '');
  },

  _cuerpoVigente(c) {
    if (!c) return false;
    const ms = (CONFIG.cuerpoMuertoHoras || 1) * 3600000;
    if (!c.muertoAt) return true;
    return Date.now() - c.muertoAt < ms;
  },

  _tiempoRestanteCuerpo(c) {
    if (!c?.muertoAt) return '';
    const ms = (CONFIG.cuerpoMuertoHoras || 1) * 3600000;
    const rest = ms - (Date.now() - c.muertoAt);
    if (rest <= 0) return 'expirado';
    const totalSeg = Math.ceil(rest / 1000);
    const h = Math.floor(totalSeg / 3600);
    const m = Math.floor((totalSeg % 3600) / 60);
    const s = totalSeg % 60;
    if (h > 0) return h + ' h ' + String(m).padStart(2, '0') + ' min';
    if (m > 0) return m + ' min ' + String(s).padStart(2, '0') + ' s';
    return s + ' s';
  },

  _distanciaCuerpo(datos) {
    if (!GPS.posicion || datos.deathX == null || datos.deathY == null) return Infinity;
    return Utilidades.distanciaMetros(GPS.posicion, [datos.deathX, datos.deathY]);
  },

  _popupMuertoHtml(p) {
    const nombre = (p.name || 'Jugador').replace(/</g, '');
    const nv = p.deadLevel || p.level || 1;
    const datos = this._datosPopupMuerto(p.playerId);
    const dist = this._distanciaCuerpo(datos);
    const maxDist = CONFIG.distanciaVerMuerto || 50;
    const cerca = dist <= maxDist;
    const cuerpo = this.cuerpos[String(p.playerId)];
    const restante = cuerpo ? this._tiempoRestanteCuerpo(cuerpo) : '';
    let html = '<div class="popup-muerto">';
    html += '<div class="popup-muerto-nombre">' + nombre + '</div>';
    html += '<div class="popup-muerto-nivel">Nv ' + nv + ' · 💀 Muerto</div>';
    if (restante && restante !== 'expirado') {
      html += '<div class="popup-muerto-expira">⏱️ Restante: ' + restante + '</div>';
    }
    html += '<div class="popup-muerto-ayuda">' +
      (cerca
        ? '📍 Estás cerca (' + Math.round(dist) + ' m)'
        : '📍 Puedes abrir el ataúd desde aquí. Para saquear o revivir con botiquín acércate a menos de ' + maxDist + ' m (ahora ' + Math.round(dist) + ' m)') +
      '<br>🎒 Cualquier jugador puede <b>saquear</b> cerca del cuerpo.<br>🩹 <b>Revivir</b> con botiquín requiere estar cerca.</div>';
    const items = datos.deadInventory || [];
    if (items.length) {
      html += '<div class="popup-muerto-items">';
      for (const it of items) {
        const item = typeof Items !== 'undefined' ? Items.seguro(it.id) : { nombre: it.id, icono: '📦' };
        html += '<div class="popup-muerto-item"><span>' + (item.icono || '') + ' ' +
          item.nombre + ' x' + (it.cantidad || 1) + '</span>' +
          '<button type="button" data-loot-id="' + it.id + '" data-loot-pid="' + p.playerId +
          '" data-loot-q="' + (it.cantidad || 1) + '">Saquear</button></div>';
      }
      html += '</div>';
    }
    html += '<button type="button" class="popup-muerto-revivir" data-revive-pid="' + p.playerId +
      '">🩹 Revivir (botiquín)</button>';
    const pid = Number(p.playerId);
    const soyYo = pid === this._miPlayerId();
    if (!soyYo && typeof Amigos !== 'undefined' && !Amigos.bloqueadoCon(pid)) {
      html += '<button type="button" class="popup-muerto-chat" data-chat-pid="' + pid +
        '" data-chat-nombre="' + nombre.replace(/"/g, '&quot;') + '">💬 Chatear</button>';
    }
    const esAmigo = typeof Amigos !== 'undefined' && Amigos.esAmigo(pid);
    if (!soyYo && !esAmigo && typeof Amigos !== 'undefined') {
      html += '<button type="button" class="popup-muerto-amigo" data-amigo-pid="' + pid +
        '">👥 Agregar amigo</button>';
    }
    html += '</div>';
    return html;
  },

  _esCuerpoPropio(playerId, cuerpo) {
    const miId = this._miPlayerId();
    if (miId > 0 && Number(playerId) === miId) return true;
    const c = cuerpo || this.cuerpos[String(playerId)];
    if (typeof Usuarios !== 'undefined' && Usuarios.perfilActivo?.nombre && c?.name) {
      const mio = String(Usuarios.perfilActivo.nombre).trim().toLowerCase();
      const suyo = String(c.name).trim().toLowerCase();
      if (mio && suyo === mio) return true;
    }
    return false;
  },

  /** El jugador nunca debe ver su propio ⚰️ en el mapa si ya está vivo. */
  _debeMostrarCuerpoEnMapa(c) {
    if (!c || !this._cuerpoVigente(c)) return false;
    if (this._esCuerpoPropio(c.playerId, c)) {
      return typeof Vida !== 'undefined' && Vida.estaMuerto();
    }
    const pid = Number(c.playerId);
    if (this._jugadoresRevividos.has(pid)) return false;
    const on = this.online.find(x => Number(x.playerId) === pid);
    if (on && !this._estaMuerto(on)) return false;
    return true;
  },

  _quitarCuerpoPropioSiVivo() {
    const miId = this._miPlayerId();
    if (miId <= 0 && (typeof Usuarios === 'undefined' || !Usuarios.perfilActivo?.nombre)) return;
    if (typeof Vida !== 'undefined' && Vida.estaMuerto()) return;
    const miNombre = typeof Usuarios !== 'undefined' && Usuarios.perfilActivo?.nombre
      ? String(Usuarios.perfilActivo.nombre).trim().toLowerCase()
      : '';
    const quitar = (id) => {
      delete this.cuerpos[id];
      this._quitarMarcadorCuerpo(id);
      if (typeof Admin !== 'undefined' && Admin.publicado?.cuerposMuertos) {
        delete Admin.publicado.cuerposMuertos[id];
      }
    };
    if (miId > 0) quitar(String(miId));
    for (const [id, c] of Object.entries(this.cuerpos || {})) {
      if (miNombre && String(c?.name || '').trim().toLowerCase() === miNombre) {
        quitar(id);
      }
    }
    this._cerrarPanelAtaud();
  },

  _aplicarCuerpos(cuerpos) {
    const filtrados = {};
    for (const [id, c] of Object.entries(cuerpos || {})) {
      if (!this._cuerpoVigente(c)) continue;
      if (!this._debeMostrarCuerpoEnMapa(c)) continue;
      const pid = Number(id);
      if (this._jugadoresRevividos.has(pid)) continue;
      if (!this._debeMostrarCuerpoEnMapa(c)) continue;
      filtrados[id] = c;
    }
    this.cuerpos = filtrados;
    this._quitarCuerpoPropioSiVivo();
    const miId = this._miPlayerId();
    const miCuerpo = miId > 0 ? this.cuerpos[String(miId)] : null;
    if (miCuerpo?.muertoAt && typeof Guardado !== 'undefined' && Guardado.datos) {
      Guardado.datos.muertoAt = miCuerpo.muertoAt;
      if (typeof Vida !== 'undefined' && Vida._actualizarTextoExpiraMuerte) {
        Vida._actualizarTextoExpiraMuerte();
      }
    }
    this._redibujarCuerpos();
  },

  _asegurarCuerpoLocal(p) {
    if (!p || !this._estaMuerto(p)) return;
    const id = String(p.playerId);
    const pos = this._posMarcador(p);
    if (pos.x == null || pos.y == null) return;
    const prev = this.cuerpos[id];
    this.cuerpos[id] = {
      playerId: Number(p.playerId),
      name: p.name || prev?.name || 'Jugador',
      deathX: pos.x,
      deathY: pos.y,
      deadLevel: p.deadLevel || p.level || prev?.deadLevel || 1,
      deadInventory: (Array.isArray(p.deadInventory) && p.deadInventory.length)
        ? p.deadInventory
        : (prev?.deadInventory || p.deadInventory || []),
      muertoAt: prev?.muertoAt || Date.now()
    };
  },

  _aplicarJugadorRevivido(playerId, hp, hpMax) {
    const pid = Number(playerId);
    if (!pid) return;
    const sid = String(pid);
    this._jugadoresRevividos.add(pid);
    delete this.cuerpos[sid];
    this._quitarMarcadorCuerpo(sid);
    if (typeof Admin !== 'undefined' && Admin.publicado?.cuerposMuertos) {
      delete Admin.publicado.cuerposMuertos[sid];
    }
    if (pid === this._miPlayerId()) {
      this._quitarCuerpoPropioSiVivo();
    }
    const i = this.online.findIndex(x => Number(x.playerId) === pid);
    if (i >= 0) {
      if (hp != null) this.online[i].hp = hp;
      if (hpMax != null) this.online[i].hpMax = hpMax;
      this.online[i].dead = false;
      this.online[i].deathX = null;
      this.online[i].deathY = null;
      this.online[i].deadInventory = [];
      this.online[i].deadLevel = null;
      this._actualizarMarcador(this.online[i]);
    }
    this._redibujarCuerpos();
    this._actualizarLineasAmigo();
  },

  _redibujarCuerpos() {
    for (const p of this.online) {
      if (this._estaMuerto(p)) this._asegurarCuerpoLocal(p);
    }
    for (const id of Object.keys(this.cuerposMarcadores)) {
      const on = this.online.find(x => String(x.playerId) === id);
      if (on && !this._estaMuerto(on)) {
        delete this.cuerpos[id];
        this._quitarMarcadorCuerpo(id);
        continue;
      }
      if (!this.cuerpos[id] || !this._cuerpoVigente(this.cuerpos[id])) {
        this._quitarMarcadorCuerpo(id);
      }
    }
    for (const [id, c] of Object.entries(this.cuerpos)) {
      const on = this.online.find(x => String(x.playerId) === id);
      if (on && !this._estaMuerto(on)) {
        delete this.cuerpos[id];
        this._quitarMarcadorCuerpo(id);
        continue;
      }
      if (!this._debeMostrarCuerpoEnMapa(c)) {
        delete this.cuerpos[id];
        this._quitarMarcadorCuerpo(id);
        continue;
      }
      this._actualizarMarcadorCuerpo(c);
    }
    this._quitarCuerpoPropioSiVivo();
    this._actualizarLineasAmigo();
    this._enlazarPanelAtaud();
  },

  _jugadorMuertoParaPopup(p) {
    const nv = p.deadLevel || p.level || 1;
    const hpMax = Math.max(1, p.hpMax || (typeof Vida !== 'undefined' && Vida.vidaMaxima
      ? Vida.vidaMaxima(nv) : 100));
    return {
      playerId: p.playerId,
      name: p.name,
      deadLevel: nv,
      hpMax,
      deadInventory: p.deadInventory || [],
      deathX: p.deathX,
      deathY: p.deathY,
      dead: true
    };
  },

  _datosPopupMuerto(playerId) {
    const pid = Number(playerId);
    const online = this.online.find(x => Number(x.playerId) === pid);
    if (online && this._estaMuerto(online)) return this._jugadorMuertoParaPopup(online);
    const c = this.cuerpos[String(pid)];
    if (c) {
      const nv = c.deadLevel || 1;
      return {
        playerId: c.playerId,
        name: c.name,
        deadLevel: nv,
        hpMax: Math.max(1, c.hpMax || (typeof Vida !== 'undefined' && Vida.vidaMaxima
          ? Vida.vidaMaxima(nv) : 100)),
        deadInventory: c.deadInventory || [],
        deathX: c.deathX,
        deathY: c.deathY,
        dead: true
      };
    }
    if (online) return this._jugadorMuertoParaPopup(online);
    return { playerId: pid, name: 'Jugador', deadInventory: [], dead: true };
  },

  _bindPopupMuerto(m, playerId) {
    m._muertoPlayerId = playerId;
    if (m.unbindPopup) m.unbindPopup();
    m.options.interactive = true;
    if (typeof m.setInteractive === 'function') m.setInteractive(true);
    m.bindPopup(
      () => this._popupMuertoHtml(this._datosPopupMuerto(playerId)),
      {
        maxWidth: 280,
        className: 'popup-muerto-wrap',
        closeButton: true,
        autoPan: true,
        autoClose: true,
        closeOnClick: false
      }
    );
    this._enlazarPopupMuerto(m, playerId);
  },

  _enlazarToqueAtaud(m) {
    if (!m) return;
    m.off('click');
    m.off('touchend');
    m.off('touchstart');
    m.off('touchmove');
    let toqueMovido = false;
    m.on('touchstart', () => { toqueMovido = false; });
    m.on('touchmove', () => { toqueMovido = true; });
    const abrir = (ev) => {
      if (typeof Admin !== 'undefined' && Admin.modo === 'organizar') return;
      if (ev?.type === 'touchend' && toqueMovido) return;
      if (ev?.cancelable && ev.type === 'touchend') ev.preventDefault();
      if (typeof L !== 'undefined' && L.DomEvent) L.DomEvent.stopPropagation(ev);
      const pid = m._muertoPlayerId;
      if (pid != null) this._mostrarPanelAtaud(pid);
    };
    m.on('click', abrir);
    m.on('touchend', abrir);
    this._enlazarToqueAtaudDom(m, abrir);
  },

  _enlazarToqueAtaudDom(m, abrir) {
    const el = m.getElement?.();
    if (!el) {
      m.once?.('add', () => this._enlazarToqueAtaudDom(m, abrir));
      return;
    }
    if (el._ataudDomOk) return;
    el._ataudDomOk = true;
    el.classList.add('marcador-ataud-hit');
    el.style.pointerEvents = 'auto';
    el.style.cursor = 'pointer';
    if (typeof L !== 'undefined' && L.DomEvent) {
      L.DomEvent.on(el, 'click', abrir);
      L.DomEvent.on(el, 'touchend', abrir);
    }
  },

  _restaurarToqueAtaud(m) {
    if (!m || m._muertoPlayerId == null) return;
    const el = m.getElement?.();
    if (el) {
      el.classList.remove('admin-pin-organizar', 'admin-pin-armado', 'admin-pin-moviendo');
      el.querySelector('.admin-pin-x')?.remove();
      el.querySelector('.admin-pin-grip')?.remove();
    }
    m.options.draggable = false;
    if (m.dragging) m.dragging.disable();
    this._enlazarToqueAtaud(m);
    this._bindPopupMuerto(m, m._muertoPlayerId);
  },

  _actualizarMarcadorCuerpo(c) {
    if (!Mapa.mapa || !c) return;
    if (!this._debeMostrarCuerpoEnMapa(c)) {
      this._quitarMarcadorCuerpo(String(c.playerId));
      return;
    }
    const id = String(c.playerId);
    const p = {
      playerId: c.playerId,
      name: c.name,
      deadLevel: c.deadLevel,
      deadInventory: c.deadInventory || [],
      deathX: c.deathX,
      deathY: c.deathY,
      dead: true
    };
    let m = this.cuerposMarcadores[id];
    const icon = this._iconoJugadorMuerto(p);
    const pos = { x: c.deathX, y: c.deathY };
    if (!m) {
      m = L.marker([pos.x, pos.y], {
        icon,
        interactive: true,
        bubblingMouseEvents: false,
        riseOnHover: true,
        zIndexOffset: 10050
      }).addTo(Mapa.mapa);
      this._bindPopupMuerto(m, c.playerId);
      this._enlazarToqueAtaud(m);
      this.cuerposMarcadores[id] = m;
    } else {
      m.setLatLng([pos.x, pos.y]);
      m.setIcon(icon);
      m.options.interactive = true;
      if (typeof m.setInteractive === 'function') m.setInteractive(true);
      this._bindPopupMuerto(m, c.playerId);
      this._enlazarToqueAtaud(m);
    }
  },

  _quitarMarcadorCuerpo(id) {
    const m = this.cuerposMarcadores[id];
    if (m && Mapa.mapa) Mapa.mapa.removeLayer(m);
    delete this.cuerposMarcadores[id];
  },

  _enlazarPopupMuerto(m, playerId) {
    m._muertoPlayerId = playerId;
    m.off('popupopen').on('popupopen', () => {
      const root = m.getPopup()?.getElement();
      if (!root) return;
      if (typeof L !== 'undefined' && L.DomEvent) {
        L.DomEvent.disableClickPropagation(root);
        L.DomEvent.disableScrollPropagation(root);
      }
      if (root._muertoClickFn) {
        root.removeEventListener('click', root._muertoClickFn);
      }
      root._muertoClickFn = (ev) => this._manejarClickPopupMuerto(ev, m);
      root.addEventListener('click', root._muertoClickFn);
    });
  },

  _manejarClickPopupMuerto(ev, m) {
    const btn = ev.target.closest('button');
    if (!btn || btn.disabled) return;
    ev.preventDefault();
    ev.stopPropagation();
    const pid = m?._muertoPlayerId ?? this._ataudPlayerId;
    if (!pid) return;
    const datos = this._datosPopupMuerto(pid);
    if (btn.classList.contains('popup-muerto-revivir')) {
      if (btn.classList.contains('cargando')) return;
      this.revivirJugador(datos, btn);
      return;
    }
    if (btn.classList.contains('popup-muerto-amigo')) {
      if (btn.classList.contains('cargando')) return;
      btn.classList.add('cargando');
      btn.textContent = '⏳ Enviando…';
      if (typeof Amigos !== 'undefined') {
        Amigos.solicitar(pid).finally(() => {
          btn.classList.remove('cargando');
          btn.textContent = '👥 Agregar amigo';
        });
      }
      return;
    }
    if (btn.classList.contains('popup-muerto-chat')) {
      const nombre = btn.getAttribute('data-chat-nombre') || '';
      if (typeof Chat !== 'undefined') Chat.abrirDesdeMapa(pid, nombre);
      this._cerrarPanelAtaud();
      if (m?.closePopup) m.closePopup();
      return;
    }
    if (btn.hasAttribute('data-loot-id')) {
      if (btn.classList.contains('cargando')) return;
      this.saquearMuerto(
        Number(btn.getAttribute('data-loot-pid')),
        btn.getAttribute('data-loot-id'),
        Number(btn.getAttribute('data-loot-q') || 1),
        btn
      );
    }
  },

  _aplicarMochilaServidor(mochila) {
    if (!mochila || !Array.isArray(mochila) || typeof Guardado === 'undefined' || !Guardado.datos) return;
    Guardado.datos.mochila = mochila;
    Guardado.datos.statsT = Date.now();
    Guardado.datos.nubeT = Date.now();
    if (typeof Mochila !== 'undefined') {
      Mochila.slots = Guardado.datos.mochila;
      Mochila.pintar();
    }
    Guardado.guardar();
  },

  _aplicarRespuestaEconomia(res) {
    if (!res?.ok || typeof Guardado === 'undefined' || !Guardado.datos) return;
    if (res.mochila) this._aplicarMochilaServidor(res.mochila);
    else if (res.partida?.datos?.mochila) this._aplicarMochilaServidor(res.partida.datos.mochila);
    const d = res.partida?.datos || {};
    if (res.saldo != null || d.dinero?.saldo != null) {
      const saldo = res.saldo != null ? res.saldo : d.dinero.saldo;
      if (!Guardado.datos.dinero) Guardado.datos.dinero = { saldo: 0, control: '' };
      Guardado.datos.dinero.saldo = saldo;
      if (typeof Dinero !== 'undefined') {
        Dinero.saldo = saldo;
        Dinero.pintar();
      }
    }
    if (res.vida != null && typeof Vida !== 'undefined') {
      Vida.actual = res.vida;
      Vida.pintar();
    }
    if (res.hambre != null && typeof Vida !== 'undefined') {
      Vida.hambre = res.hambre;
      Vida.pintar();
    }
    if (res.xp != null && typeof Vida !== 'undefined') {
      Vida.xp = res.xp;
    }
    Guardado.datos.statsT = Date.now();
    Guardado.datos.nubeT = Date.now();
    Guardado.guardar();
  },

  comprarEnTienda(tiendaId, itemId, pos) {
    return new Promise((resolve) => {
      if (!this.socket || !this.activo || !tiendaId || !itemId) return resolve({ ok: false });
      this.socket.emit('player:shopBuy', {
        tiendaId,
        itemId,
        lat: pos?.[0],
        lng: pos?.[1],
        pos
      }, (res) => {
        if (res?.ok) this._aplicarRespuestaEconomia(res);
        resolve(res || { ok: false });
      });
    });
  },

  usarItemServidor(itemId, cantidad) {
    return new Promise((resolve) => {
      if (!this.socket || !this.activo || !itemId) return resolve({ ok: false });
      this.socket.emit('player:useItem', { itemId, cantidad: cantidad || 1 }, (res) => {
        if (res?.ok) this._aplicarRespuestaEconomia(res);
        resolve(res || { ok: false });
      });
    });
  },

  recogerObjetoCompartido(origenId, pos) {
    return new Promise((resolve) => {
      if (!this.socket || !this.activo || !origenId) return resolve({ ok: false });
      this.socket.emit('world:pickupShared', {
        origenId,
        lat: pos?.[0],
        lng: pos?.[1],
        pos
      }, (res) => {
        if (res?.ok) {
          if (res.mochila) this._aplicarMochilaServidor(res.mochila);
          if (typeof Admin !== 'undefined') {
            Admin.aplicarRecogidaCompartida(origenId, res.recogidoAt, this._miPlayerId());
          }
        }
        resolve(res || { ok: false });
      });
    });
  },

  soltarBolsa(payload) {
    return new Promise((resolve) => {
      if (!this.socket || !this.activo || !payload?.pos) return resolve(null);
      this.socket.emit('world:dropBag', {
        x: payload.pos[0],
        y: payload.pos[1],
        items: payload.items || [],
        ocultoHasta: payload.ocultoHasta || 0,
        ocultoParaPlayerId: payload.ocultoParaPlayerId || null,
        recogibleDesde: payload.recogibleDesde || 0,
        soloDropper: !!payload.soloDropper
      }, (res) => {
        resolve(res?.ok ? res.bolsa : null);
      });
    });
  },

  attackEnemy(enemyId, pos) {
    return new Promise((resolve) => {
      if (!this.socket || !this.activo || !enemyId) return resolve({ ok: false });
      this.socket.emit('world:attackEnemy', {
        enemyId,
        x: pos?.[0],
        y: pos?.[1]
      }, (res) => resolve(res || { ok: false }));
    });
  },

  recogerBolsa(bolsaId, recogidos, pos) {
    return new Promise((resolve) => {
      if (!this.socket || !this.activo || !bolsaId) return resolve({ ok: false });
      this.socket.emit('world:pickupBag', {
        bolsaId,
        recogidos: recogidos || [],
        x: pos?.[0],
        y: pos?.[1]
      }, (res) => {
        if (res?.ok && res.mochila) this._aplicarMochilaServidor(res.mochila);
        resolve(res || { ok: false });
      });
    });
  },

  reclamarBotinEnemigo(botinId, pos) {
    return new Promise((resolve) => {
      if (!this.socket || !this.activo || !botinId) return resolve({ ok: false });
      this.socket.emit('world:claimEnemyLoot', {
        botinId,
        x: pos?.[0],
        y: pos?.[1]
      }, (res) => resolve(res || { ok: false }));
    });
  },

  _estaMuerto(p) {
    if (!p) return false;
    if (p.hp != null && p.hp > 0) return false;
    return !!(p.dead || (p.hp != null && p.hp <= 0));
  },

  _posMarcador(p) {
    if (this._estaMuerto(p) && p.deathX != null && p.deathY != null) {
      return { x: p.deathX, y: p.deathY };
    }
    let x = Number(p.x);
    let y = Number(p.y);
    if (Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) > 0.01 && Math.abs(y) > 0.01) {
      return { x, y };
    }
    if (typeof Admin !== 'undefined' && Admin.publicado?.partidas) {
      const nombre = String(p.name || '').trim().toLowerCase();
      const jugadores = Admin.jugadoresGlobales ? Admin.jugadoresGlobales() : (Admin.publicado.jugadores || []);
      const jug = jugadores.find(j => String(j.nombre || '').trim().toLowerCase() === nombre);
      const pos = jug?.id ? Admin.publicado.partidas[jug.id]?.datos?.posicionJugador : null;
      if (pos?.length >= 2) {
        x = Number(pos[0]);
        y = Number(pos[1]);
        if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
      }
    }
    if (typeof GPS !== 'undefined' && GPS.posicion && Number(p.playerId) === this._miPlayerId()) {
      return { x: GPS.posicion[0], y: GPS.posicion[1] };
    }
    return { x: CONFIG.centro[0], y: CONFIG.centro[1] };
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
    if (this.activo) {
      for (const p of this.online) this._actualizarMarcador(p);
      this._actualizarLineasAmigo();
    }
    this._sincronizarPinesPartida();
  },

  _nombreEnLinea(nombre) {
    const n = String(nombre || '').trim().toLowerCase();
    const on = this.online.find(p => String(p.name || '').trim().toLowerCase() === n);
    if (on) {
      const id = String(on.playerId);
      if (this.cuerpos[id] || this.cuerposMarcadores[id] || this._estaMuerto(on)) {
        return !!(this.cuerposMarcadores[id] || this.cuerpos[id]);
      }
      return !!this.marcadores[on.playerId];
    }
    for (const [id, c] of Object.entries(this.cuerpos || {})) {
      if (c && String(c.name || '').trim().toLowerCase() === n) {
        return !!this.cuerposMarcadores[id];
      }
    }
    return false;
  },

  _quitarMarcadorPartida(perfilId) {
    const m = this._marcadoresPartida[perfilId];
    if (m && Mapa.mapa) {
      try { Mapa.mapa.removeLayer(m); } catch (e) { /* */ }
    }
    delete this._marcadoresPartida[perfilId];
  },

  _cuerpoPorNombre(nombre) {
    const key = String(nombre || '').trim().toLowerCase();
    if (!key) return null;
    for (const c of Object.values(this.cuerpos || {})) {
      if (c && String(c.name || '').trim().toLowerCase() === key) return c;
    }
    if (typeof Admin !== 'undefined' && Admin.publicado?.cuerposMuertos) {
      for (const c of Object.values(Admin.publicado.cuerposMuertos)) {
        if (c && String(c.name || '').trim().toLowerCase() === key) return c;
      }
    }
    return null;
  },

  _jugadorPartidaVisible(j, lat, lng) {
    if (!j) return false;
    if (this._cuerpoPorNombre(j.nombre)) return false;
    const enVivo = this.online.find(p =>
      String(p.name || '').trim().toLowerCase() === String(j.nombre || '').trim().toLowerCase()
    );
    if (enVivo) {
      const fake = { playerId: enVivo.playerId, name: enVivo.name, x: lat, y: lng };
      return this._debeMostrarJugador(fake);
    }
    const fake = { playerId: -1, name: j.nombre, x: lat, y: lng };
    if (!this._debeMostrarJugador(fake)) return false;
    return true;
  },

  _actualizarMarcadorPartida(j, lat, lng, partida) {
    if (!Mapa.mapa || !j?.id) return;
    const nivel = partida?.datos?.nivel || 1;
    const fake = {
      playerId: -1,
      name: j.nombre,
      x: lat,
      y: lng,
      level: nivel,
      hp: partida?.datos?.vida ?? 100,
      hpMax: 100
    };
    let m = this._marcadoresPartida[j.id];
    const icon = this._iconoJugador(fake);
    if (!m) {
      m = L.marker([lat, lng], {
        icon,
        interactive: true,
        zIndexOffset: 850
      }).addTo(Mapa.mapa);
      m.bindPopup(
        () => '<b>' + this._nombreMarcador(fake) + '</b><br><small>Última posición guardada</small>',
        { maxWidth: 260, className: 'popup-jugador-wrap', closeButton: true }
      );
      this._marcadoresPartida[j.id] = m;
    } else {
      m.setLatLng([lat, lng]);
      m.setIcon(icon);
    }
  },

  /** Pines de jugadores desde partidas guardadas (cuando no están conectados al socket). */
  _sincronizarPinesPartida() {
    if (!Mapa.mapa || typeof Admin === 'undefined' || !Admin.publicado) return;
    const miId = typeof Usuarios !== 'undefined' ? Usuarios.perfilActivo?.id : null;
    const jugadores = Admin.jugadoresGlobales ? Admin.jugadoresGlobales() : (Admin.publicado.jugadores || []);
    const partidas = Admin.publicado.partidas || {};
    const activos = new Set();

    for (const j of jugadores) {
      if (!j?.id || j.id === miId) continue;
      if (this._nombreEnLinea(j.nombre)) continue;
      const part = partidas[j.id];
      const pos = part?.datos?.posicionJugador;
      if (!pos || pos.length < 2) continue;
      const lat = Number(pos[0]);
      const lng = Number(pos[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (!this._jugadorPartidaVisible(j, lat, lng)) {
        this._quitarMarcadorPartida(j.id);
        continue;
      }
      activos.add(j.id);
      this._actualizarMarcadorPartida(j, lat, lng, part);
    }

    for (const id of Object.keys(this._marcadoresPartida)) {
      if (!activos.has(id)) this._quitarMarcadorPartida(id);
    }
  },

  _destinoAmigoMarcado(pid) {
    const id = Number(pid);
    const jugador = this.online.find(p => Number(p.playerId) === id);
    if (jugador && this._estaMuerto(jugador)) {
      const pos = this._posMarcador(jugador);
      return { x: pos.x, y: pos.y, muerto: true };
    }
    const cuerpo = this.cuerpos[String(id)];
    if (cuerpo && cuerpo.deathX != null && cuerpo.deathY != null) {
      return { x: cuerpo.deathX, y: cuerpo.deathY, muerto: true };
    }
    if (jugador && !this._estaMuerto(jugador)) {
      const pos = this._posMarcador(jugador);
      return { x: pos.x, y: pos.y, muerto: false };
    }
    return null;
  },

  _actualizarLineasAmigo() {
    if (!Mapa.mapa || typeof Amigos === 'undefined') return;
    const marcados = Amigos.obtenerMarcados();
    const miPos = typeof GPS !== 'undefined' && GPS.posicion ? GPS.posicion : null;
    const activos = new Set();

    if (miPos && marcados.size) {
      for (const pid of marcados) {
        if (Amigos.bloqueadoCon(pid)) continue;
        const dest = this._destinoAmigoMarcado(pid);
        if (!dest) continue;
        activos.add(String(pid));
        const coords = [[miPos[0], miPos[1]], [dest.x, dest.y]];
        const color = dest.muerto ? '#f59e0b' : '#5ce883';
        let linea = this._lineasAmigo[pid];
        if (!linea) {
          linea = L.polyline(coords, {
            color,
            weight: dest.muerto ? 4 : 3,
            opacity: 0.85,
            dashArray: dest.muerto ? '8, 10' : '10, 12',
            lineCap: 'round',
            className: 'linea-amigo-mapa' + (dest.muerto ? ' linea-amigo-ataud' : '')
          }).addTo(Mapa.mapa);
          this._lineasAmigo[pid] = linea;
        } else {
          linea.setLatLngs(coords);
          linea.setStyle({ color, weight: dest.muerto ? 4 : 3, dashArray: dest.muerto ? '8, 10' : '10, 12' });
        }
      }
    }

    for (const id of Object.keys(this._lineasAmigo)) {
      if (!activos.has(id)) {
        Mapa.mapa.removeLayer(this._lineasAmigo[id]);
        delete this._lineasAmigo[id];
      }
    }
  },

  revivirJugador(p, btn) {
    if (!this.socket || !this.activo || !p?.playerId) return;
    const datos = this._datosPopupMuerto(p.playerId);
    const d = this._distanciaCuerpo(datos);
    const maxDist = CONFIG.distanciaVerMuerto || 50;
    if (d > maxDist) {
      Notificaciones.mostrar('📍 Demasiado lejos para revivir (' + Math.round(d) + ' m). Máx. ' + maxDist + ' m', 'info', 3500);
      return;
    }
    if (typeof Mochila === 'undefined' || !Mochila.tieneItem('botiquin')) {
      Notificaciones.mostrar('🩹 Necesitas un botiquín en la mochila ($300 en la farmacia)', 'alerta', 4500);
      return;
    }
    const nv = datos.deadLevel || p.level || 1;
    const targetHpMax = Math.max(1, datos.hpMax || p.hpMax || (typeof Vida !== 'undefined' && Vida.vidaMaxima
      ? Vida.vidaMaxima(nv) : 100));
    const cura = typeof Vida !== 'undefined' && Vida.vidaAlRevivir
      ? Vida.vidaAlRevivir(targetHpMax)
      : Math.max(1, Math.round(targetHpMax * 0.4));
    const hpMax = targetHpMax;
    if (btn) {
      btn.disabled = true;
      btn.classList.add('cargando');
      btn.textContent = '⏳ Reviviendo…';
    }
    const payload = {
      targetPlayerId: datos.playerId,
      reviveHp: cura,
      hpMax
    };
    if (typeof GPS !== 'undefined' && GPS.posicion) {
      payload.reviverX = GPS.posicion[0];
      payload.reviverY = GPS.posicion[1];
    }
    this.socket.emit('player:revive', payload, (res) => {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('cargando');
        btn.textContent = '🩹 Revivir (botiquín)';
      }
      if (res?.ok) {
        Mochila.quitar('botiquin', 1, 'Revivió a ' + (datos.name || 'jugador'));
        Notificaciones.mostrar('🩹 Reviviste a ' + (datos.name || 'jugador'), 'exito', 5000);
        this._aplicarJugadorRevivido(datos.playerId, res.hp, payload.hpMax);
        this._cerrarPanelAtaud();
        const marcador = this.marcadores[datos.playerId] || this.cuerposMarcadores[String(datos.playerId)];
        if (marcador?.getPopup()?.isOpen()) marcador.closePopup();
      } else {
        Notificaciones.mostrar('❌ ' + (res?.error || 'No se pudo revivir'), 'error', 4000);
      }
    });
  },

  enviarPosicion(lat, lng, forzar) {
    if (!this.socket || !this.activo) return;
    if (typeof SyncServidor !== 'undefined' && SyncServidor.puedePublicar() &&
        !SyncServidor.tokenCoincideConPerfilSync()) {
      return;
    }
    const ahora = Date.now();
    if (!forzar && ahora - this._ultimoEnvio < 700) return;
    this._ultimoEnvio = ahora;
    this.socket.emit('player:move', { x: lat, y: lng, gps: true, force: forzar }, () => {});
    this.enviarStats(false);
  },

  adminMoverJugador(playerId, lat, lng, perfilId) {
    if (!this.socket || !this.activo) return;
    this.socket.emit('admin:movePlayerPin', {
      targetPlayerId: playerId,
      x: lat,
      y: lng,
      perfilId: perfilId || null
    }, (res) => {
      if (!res?.ok && typeof Notificaciones !== 'undefined') {
        Notificaciones.mostrar('❌ ' + (res.error || 'No se pudo mover al jugador'), 'error', 4000);
      }
    });
  },

  enviarStats(forzar) {
    if (!this.socket || !this.activo || typeof Vida === 'undefined') return;
    const ahora = Date.now();
    if (!forzar && ahora - this._ultimoStats < 3500) return;
    this._ultimoStats = ahora;
    const esAdmin = typeof Usuarios !== 'undefined' && Usuarios.esAdministrador();
    const hpMax = Vida.vidaMaxima();
    const muerto = Vida.estaMuerto();
    const payload = {
      hp: esAdmin ? hpMax : Math.round(Vida.actual),
      hpMax,
      level: Vida.nivel,
      hunger: Math.round(Vida.hambre),
      xp: Vida.xp,
      dead: muerto
    };
    if (muerto && typeof Guardado !== 'undefined' && Guardado.datos.muertePos) {
      payload.deathX = Guardado.datos.muertePos[0];
      payload.deathY = Guardado.datos.muertePos[1];
      payload.deadInventory = (Guardado.datos.mochila || [])
        .filter(Boolean)
        .map(s => ({ id: s.id, cantidad: s.cantidad || 1 }));
      payload.deadLevel = Vida.nivel;
    }
    if (typeof Guardado !== 'undefined') {
      const invUntil = Math.max(
        Guardado.datos.invisibleHasta || 0,
        Guardado.datos.proteccionRevivirHasta || 0
      );
      if (invUntil > Date.now()) {
        payload.invisibleUntil = invUntil;
      } else {
        payload.invisibleUntil = 0;
      }
    } else {
      payload.invisibleUntil = 0;
    }
    if (typeof Usuarios !== 'undefined' && Usuarios.perfilActivo) {
      payload.perfilId = Usuarios.perfilActivo.id;
      const cambioMuerte = muerto !== this._ultimoMuertoSync;
      const statsT = typeof Guardado !== 'undefined' ? (Guardado.datos.statsT || 0) : 0;
      const statsNuevos = statsT > (this._ultimoStatsTEnviado || 0);
      if (forzar || cambioMuerte || statsNuevos) {
        payload.partidaMin = {
          vida: payload.hp,
          muerto,
          nivel: Vida.nivel,
          hambre: Vida.hambre,
          xp: Vida.xp
        };
        payload.statsT = statsT || Date.now();
        this._ultimoStatsTEnviado = payload.statsT;
        this._ultimoMuertoSync = muerto;
      }
    }
    this.socket.emit('player:updateStats', payload, () => {});
  },

  _pctVida(p) {
    const max = Math.max(1, p.hpMax || 100);
    return Math.max(0, Math.min(100, Math.round((p.hp != null ? p.hp : max) / max * 100)));
  },

  _iconoJugadorMuerto(p) {
    const nombre = this._nombreMarcador(p);
    return L.divIcon({
      className: 'marcador-ataud-hit',
      html: '<div class="marcador-jugador-muerto">' +
        '<div class="mjm-etiqueta">' + nombre + '</div>' +
        '<div class="mjm-carabela">⚰️</div></div>',
      iconSize: [72, 64],
      iconAnchor: [36, 58]
    });
  },

  _iconoJugador(p) {
    if (this._esAdminMarcador(p)) {
      return L.divIcon({
        className: '',
        html: '<div class="marcador-jugador-online marcador-admin">' +
          '<div class="mjo-corona">👑</div>' +
          '<div class="mjo-etiqueta">' +
          '<span class="mjo-nombre">' + (CONFIG.adminDisplayNombre || 'SoyCaos') + '</span>' +
          '<span class="mjo-nivel mjo-nivel-inf">∞</span></div>' +
          '<div class="mjo-barra mjo-barra-admin"><div class="mjo-barra-fill" style="width:100%"></div></div>' +
          '<div class="mjo-punto mjo-punto-admin"></div></div>',
        iconSize: [96, 62],
        iconAnchor: [48, 58]
      });
    }
    const amigo = typeof Amigos !== 'undefined' && Amigos.esAmigo(p.playerId);
    const marcado = typeof Amigos !== 'undefined' && Amigos.esMarcado(p.playerId);
    const pct = this._pctVida(p);
    const nombre = this._nombreMarcador(p);
    const nv = p.level || 1;
    let clases = 'marcador-jugador-online';
    if (amigo) clases += ' es-amigo';
    if (marcado) clases += ' pin-marcado';
    return L.divIcon({
      className: '',
      html: '<div class="' + clases + '">' +
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
    const sid = String(id);
    const cuerpoActivo = this.cuerpos[sid];
    if (cuerpoActivo && this._cuerpoVigente(cuerpoActivo) && this._debeMostrarCuerpoEnMapa(cuerpoActivo)) {
      this._quitarMarcador(id);
      this._actualizarMarcadorCuerpo(cuerpoActivo);
      return;
    }
    const muerto = this._estaMuerto(p);
    if (muerto) {
      this._asegurarCuerpoLocal(p);
      this._quitarMarcador(id);
      const c = this.cuerpos[sid];
      if (c) this._actualizarMarcadorCuerpo(c);
      return;
    }
    if (this.cuerpos[sid] || this.cuerposMarcadores[sid]) {
      delete this.cuerpos[sid];
      this._quitarMarcadorCuerpo(sid);
    }
    if (!this._debeMostrarJugador(p)) {
      this._quitarMarcador(id);
      return;
    }
    const pos = this._posMarcador(p);
    let m = this.marcadores[id];
    const icon = this._iconoJugador(p);
    if (!m) {
      m = L.marker([pos.x, pos.y], {
        icon,
        interactive: true,
        zIndexOffset: 900
      }).addTo(Mapa.mapa);
      m.bindPopup(
        () => typeof Amigos !== 'undefined' ? Amigos.popupHtml(p) : p.name,
        { maxWidth: 300, className: 'popup-jugador-wrap', closeButton: true }
      );
      this.marcadores[id] = m;
    } else {
      this._animarMarcador(id, pos.x, pos.y);
      m.setIcon(icon);
      m.off('click');
      if (m.unbindPopup) m.unbindPopup();
      m.bindPopup(
        () => typeof Amigos !== 'undefined' ? Amigos.popupHtml(p) : p.name,
        { maxWidth: 300, className: 'popup-jugador-wrap', closeButton: true }
      );
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
    this._redibujarCuerpos();
    this._actualizarLineasAmigo();
    this._sincronizarPinesPartida();
    if (typeof Amigos !== 'undefined') Amigos._pintarSiAbierto();
    if (mostrarAviso !== false && this.online.length && typeof Notificaciones !== 'undefined') {
      Notificaciones.mostrar('👥 ' + this.online.length + ' jugador(es) en vivo', 'info', 3000);
    }
    if (typeof Admin !== 'undefined' && Admin.modo === 'organizar' && !Admin._organizandoArrastreActivo) {
      requestAnimationFrame(() => Admin._reaplicarArrastreOrganizar());
    }
  }
};
