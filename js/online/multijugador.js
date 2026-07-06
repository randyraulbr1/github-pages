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
  _ultimoPullMundo: 0,
  _mundoPendiente: null,
  _reconectando: false,

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
      this._mostrarReconectando(true);
    });

    this.socket.on('connect', () => {
      this.activo = true;
      this._mostrarReconectando(false);
      if (typeof GPS !== 'undefined' && GPS.posicion) {
        this.enviarPosicion(GPS.posicion[0], GPS.posicion[1], true);
      }
      this.enviarStats(true);
      this._iniciarPollingMundo();
      this.loadWorld();
      if (typeof Usuarios !== 'undefined' && Usuarios.perfilActivo &&
          typeof SyncServidor !== 'undefined' && SyncServidor.registrarCuenta) {
        SyncServidor.registrarCuenta(Usuarios.perfilActivo, null).catch(() => {});
      }
    });

    this.socket.on('disconnect', () => {
      this.activo = false;
      this._mostrarReconectando(true);
      if (this._pollMundo) {
        clearInterval(this._pollMundo);
        this._pollMundo = null;
      }
    });

    this.socket.on('game:init', (data) => {
      if (typeof Amigos !== 'undefined' && data.social) Amigos.aplicarSocial(data.social);
      this.online = (data.onlinePlayers || []).filter(p => this._visible(p.playerId));
      this._redibujar(false);
      if (data.cuerposMuertos) this._aplicarCuerpos(data.cuerposMuertos);
      if (data.mundoSnapshot) {
        this._aplicarMundoServidor({
          mundo: data.mundoSnapshot,
          actualizadoEn: data.mundoActualizadoEn || data.mundoSnapshot.actualizadoEn || 0
        }, false);
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
      this._redibujar(false);
    });

    this.socket.on('player:offline', (p) => {
      this.online = this.online.filter(x => Number(x.playerId) !== Number(p.playerId));
      this._quitarMarcador(p.playerId);
      this._redibujarCuerpos();
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
      const pid = Number(data.playerId);
      if (pid === this._miPlayerId()) {
        if (data.deadInventory) this._aplicarInventarioMuerto(data.deadInventory);
        if (typeof Vida !== 'undefined') {
          const nombre = (data.reviverName || 'Un jugador').replace(/</g, '');
          Vida.revivir(
            data.hp,
            '❤️ ' + nombre + ' te revivió con un botiquín. ¡Ya puedes seguir jugando!'
          );
        }
      }
      const i = this.online.findIndex(x => Number(x.playerId) === pid);
      if (i >= 0) {
        this.online[i].hp = data.hp;
        this.online[i].dead = false;
        this.online[i].deathX = null;
        this.online[i].deathY = null;
        this.online[i].deadInventory = [];
        this.online[i].deadLevel = null;
        this._actualizarMarcador(this.online[i]);
      }
      delete this.cuerpos[String(pid)];
      this._quitarMarcadorCuerpo(String(pid));
    });

    this.socket.on('world:updateObject', (obj) => {
      if (!obj?.data?.origenId) return;
      if (obj.type === 'enemy' && typeof Enemigos !== 'undefined') {
        Enemigos.actualizarDesdeServidor(obj.data.origenId, obj.x, obj.y, obj.data);
        return;
      }
      if (typeof Admin === 'undefined') return;
      const origenId = obj.data.origenId;
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

    this.socket.on('world:removeObject', () => { /* el mundo completo llega por mundo:sync */ });

    this.socket.on('mundo:sync', (data) => {
      if (!data?.mundo || typeof Admin === 'undefined') return;
      const ts = data.actualizadoEn || data.mundo.actualizadoEn || Date.now();
      const json = JSON.stringify(data.mundo);
      this.mundoServidorTs = Math.max(this.mundoServidorTs, ts);
      Admin._crudoPublicado = json;
      Admin._ultimoFirmaPublicada = Admin._firmaMundo(json);
      Admin._aplicarMundoRemoto(json);
      if (data.mundo.cuerposMuertos) this._aplicarCuerpos(data.mundo.cuerposMuertos);
      if (typeof Usuarios !== 'undefined' && !Usuarios.esAdministrador() &&
          typeof Notificaciones !== 'undefined') {
        Notificaciones.mostrar('🌍 El admin actualizó el mapa', 'info', 4000);
      }
    });

    this.socket.on('partida:sync', (data) => {
      this._aplicarPartidaServidor(data);
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
      this._aplicarCuerpos(data?.cuerpos || {});
    });

    this.socket.on('world:objetoRecogido', (data) => {
      if (!data?.origenId || typeof Admin === 'undefined') return;
      Admin.aplicarRecogidaCompartida(data.origenId, data.recogidoAt, data.playerId);
    });

    this.socket.on('enemy:attack', (data) => {
      if (typeof Vida !== 'undefined' && data.damage) {
        Vida.recibirDano(data.damage, null, data.enemyName || 'Enemigo');
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
    } else if (data.partida) {
      const prev = Admin.publicado.partidas[data.perfilId];
      if (!prev || (data.partida.t || 0) >= (prev.t || 0)) {
        Admin.publicado.partidas[data.perfilId] = data.partida;
      }
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

  _mostrarReconectando(activo) {
    this._reconectando = !!activo;
    if (typeof Notificaciones === 'undefined') return;
    if (activo) {
      Notificaciones.mostrar('📡 Reconectando al servidor…', 'alerta', 0);
    }
  },

  _aplicarMundoAlCliente(data, avisar) {
    if (!data?.mundo) return false;
    const m = data.mundo;
    const tieneMapa = (m.misiones?.length || 0) + (m.objetos?.length || 0) +
      (m.enemigos?.length || 0) + (m.tesoros?.length || 0) +
      (m.tiendasAdmin?.length || 0) + Object.keys(m.posiciones || {}).length;
    if (!tieneMapa && !(m.jugadores?.length)) return false;

    if (typeof Admin === 'undefined' || typeof Admin._aplicarMundoRemoto !== 'function') {
      this._mundoPendiente = data;
      return false;
    }

    const ts = data.actualizadoEn || m.actualizadoEn || Date.now();
    const json = JSON.stringify(m);
    const firma = Admin._firmaMundo(json);
    if (ts <= this.mundoServidorTs && firma === Admin._ultimoFirmaPublicada) return false;

    this.mundoServidorTs = Math.max(this.mundoServidorTs, ts);
    Admin._crudoPublicado = json;
    Admin._ultimoFirmaPublicada = firma;
    Admin._aplicarMundoRemoto(json);
    if (m.cuerposMuertos) this._aplicarCuerpos(m.cuerposMuertos);
    if (avisar && typeof Usuarios !== 'undefined' && !Usuarios.esAdministrador() &&
        typeof Notificaciones !== 'undefined') {
      Notificaciones.mostrar('🌍 El admin actualizó el mapa', 'info', 4000);
    }
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
      return this._aplicarMundoServidor({
        mundo: data.mundo,
        actualizadoEn: data.actualizadoEn || data.mundo.actualizadoEn || 0
      }, false);
    } catch (e) {
      return false;
    }
  },

  async _pullMundoServidor() {
    const ahora = Date.now();
    if (ahora - this._ultimoPullMundo < 2500) return;
    this._ultimoPullMundo = ahora;
    await this.obtenerMundoServidor();
  },

  recogerTesoroCompartido(tesoroId) {
    return new Promise((resolve) => {
      if (!this.socket || !this.activo || !tesoroId) return resolve(false);
      this.socket.emit('world:tesoroRecogido', { tesoroId }, (res) => {
        if (res?.ok && typeof Admin !== 'undefined') {
          Admin.aplicarRecogidaTesoro(tesoroId, res.recogidoAt);
        }
        resolve(!!res?.ok);
      });
    });
  },

  saquearMuerto(playerId, itemId, cantidad, btn) {
    if (!this.socket || !this.activo) return;
    const tomar = Math.max(1, cantidad || 1);
    const datos = this._datosPopupMuerto(playerId);
    const inv = (datos.deadInventory || []).map(x => ({ id: x.id, cantidad: x.cantidad || 1 }));
    const idx = inv.findIndex(x => x.id === itemId);
    if (idx < 0) {
      Notificaciones.mostrar('❌ Ese objeto ya no está en el cuerpo', 'alerta', 2500);
      this._refrescarPopupsMuertos(playerId);
      return;
    }
    inv[idx].cantidad -= tomar;
    if (inv[idx].cantidad <= 0) inv.splice(idx, 1);
    this._aplicarLootLocal(playerId, inv);
    const fila = btn?.closest('.popup-muerto-item');
    if (fila) {
      fila.classList.add('popup-muerto-item-saqueado');
      setTimeout(() => fila.remove(), 180);
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
        if (typeof Mochila !== 'undefined' && res.item) {
          Mochila.agregar(res.item.id, res.item.cantidad, { silencioso: true });
        }
        Notificaciones.mostrar('🎒 Saqueaste del cuerpo', 'exito', 3000);
        this._aplicarLootLocal(playerId, res.deadInventory);
      } else {
        this._aplicarLootLocal(playerId, datos.deadInventory || []);
        this._refrescarPopupsMuertos(playerId);
        if (res?.error) Notificaciones.mostrar('❌ ' + res.error, 'error', 3500);
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

  _popupMuertoHtml(p) {
    const nombre = (p.name || 'Jugador').replace(/</g, '');
    const nv = p.deadLevel || p.level || 1;
    let html = '<div class="popup-muerto">';
    html += '<div class="popup-muerto-nombre">' + nombre + '</div>';
    html += '<div class="popup-muerto-nivel">Nv ' + nv + ' · 💀 Muerto</div>';
    const items = p.deadInventory || [];
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
    const esAmigo = typeof Amigos !== 'undefined' && Amigos.esAmigo(pid);
    if (!soyYo && !esAmigo && typeof Amigos !== 'undefined') {
      html += '<button type="button" class="popup-muerto-amigo" data-amigo-pid="' + pid +
        '">👥 Agregar amigo</button>';
    }
    html += '</div>';
    return html;
  },

  _aplicarCuerpos(cuerpos) {
    this.cuerpos = cuerpos || {};
    this._redibujarCuerpos();
  },

  _redibujarCuerpos() {
    const idsOnlineDead = new Set(
      this.online.filter(p => this._estaMuerto(p)).map(p => String(p.playerId))
    );
    for (const id of Object.keys(this.cuerposMarcadores)) {
      if (!this.cuerpos[id] || idsOnlineDead.has(id)) this._quitarMarcadorCuerpo(id);
    }
    for (const [id, c] of Object.entries(this.cuerpos)) {
      if (idsOnlineDead.has(id)) continue;
      this._actualizarMarcadorCuerpo(c);
    }
  },

  _jugadorMuertoParaPopup(p) {
    return {
      playerId: p.playerId,
      name: p.name,
      deadLevel: p.deadLevel || p.level,
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
      return {
        playerId: c.playerId,
        name: c.name,
        deadLevel: c.deadLevel,
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
    m.bindPopup(
      () => this._popupMuertoHtml(this._datosPopupMuerto(playerId)),
      { maxWidth: 260, className: 'popup-muerto-wrap' }
    );
    this._enlazarPopupMuerto(m, playerId);
  },

  _actualizarMarcadorCuerpo(c) {
    if (!Mapa.mapa || !c) return;
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
        zIndexOffset: 9999
      }).addTo(Mapa.mapa);
      m.on('click', () => m.openPopup());
      this._bindPopupMuerto(m, c.playerId);
      this.cuerposMarcadores[id] = m;
    } else {
      m.setLatLng([pos.x, pos.y]);
      m.setIcon(icon);
      this._bindPopupMuerto(m, c.playerId);
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
      if (!root._muertoClickOk) {
        root._muertoClickOk = true;
        root.addEventListener('click', (ev) => this._manejarClickPopupMuerto(ev, m));
      }
    });
  },

  _manejarClickPopupMuerto(ev, m) {
    const btn = ev.target.closest('button');
    if (!btn || btn.disabled) return;
    ev.preventDefault();
    ev.stopPropagation();
    const pid = m._muertoPlayerId;
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
    this._actualizarLineasAmigo();
  },

  _actualizarLineasAmigo() {
    if (!Mapa.mapa || typeof Amigos === 'undefined') return;
    const marcados = Amigos.obtenerMarcados();
    const miPos = typeof GPS !== 'undefined' && GPS.posicion ? GPS.posicion : null;
    const activos = new Set();

    if (miPos && marcados.size) {
      for (const pid of marcados) {
        const jugador = this.online.find(p => Number(p.playerId) === Number(pid));
        if (!jugador || this._estaMuerto(jugador)) continue;
        activos.add(String(pid));
        const dest = this._posMarcador(jugador);
        const coords = [[miPos[0], miPos[1]], [dest.x, dest.y]];
        let linea = this._lineasAmigo[pid];
        if (!linea) {
          linea = L.polyline(coords, {
            color: '#5ce883',
            weight: 3,
            opacity: 0.8,
            dashArray: '10, 12',
            lineCap: 'round',
            className: 'linea-amigo-mapa'
          }).addTo(Mapa.mapa);
          this._lineasAmigo[pid] = linea;
        } else {
          linea.setLatLngs(coords);
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
    const d = this._distanciaMarcador(datos);
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
        const marcador = this.marcadores[datos.playerId] || this.cuerposMarcadores[String(datos.playerId)];
        if (marcador?.getPopup()?.isOpen()) marcador.closePopup();
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
    const esAdmin = typeof Usuarios !== 'undefined' && Usuarios.esAdministrador();
    const hpMax = Vida.vidaMaxima();
    const muerto = Vida.estaMuerto();
    const payload = {
      hp: esAdmin ? hpMax : Math.round(Vida.actual),
      hpMax,
      level: esAdmin ? 999 : Vida.nivel,
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
    if (typeof Usuarios !== 'undefined' && Usuarios.perfilActivo) {
      payload.perfilId = Usuarios.perfilActivo.id;
      const cambioMuerte = muerto !== this._ultimoMuertoSync;
      if (forzar || cambioMuerte) {
        payload.partidaMin = {
          vida: payload.hp,
          muerto,
          nivel: Vida.nivel,
          hambre: Vida.hambre,
          xp: Vida.xp
        };
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
      className: '',
      html: '<div class="marcador-jugador-muerto">' +
        '<div class="mjm-etiqueta">' + nombre + '</div>' +
        '<div class="mjm-carabela">⚰️</div></div>',
      iconSize: [56, 58],
      iconAnchor: [28, 54]
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
    const muerto = this._estaMuerto(p);
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
        m.on('click', () => m.openPopup());
        this._bindPopupMuerto(m, id);
      } else {
        m.bindPopup(() => typeof Amigos !== 'undefined' ? Amigos.popupHtml(p) : p.name);
      }
      this.marcadores[id] = m;
    } else {
      this._animarMarcador(id, pos.x, pos.y);
      m.setIcon(icon);
      m.off('click');
      if (muerto) {
        m.on('click', () => m.openPopup());
        this._bindPopupMuerto(m, id);
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
    this._redibujarCuerpos();
    this._actualizarLineasAmigo();
    if (mostrarAviso !== false && this.online.length && typeof Notificaciones !== 'undefined') {
      Notificaciones.mostrar('👥 ' + this.online.length + ' jugador(es) en vivo', 'info', 3000);
    }
  }
};
