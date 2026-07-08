/**
 * Chat entre jugadores — conectado al servidor en vivo.
 * Pins en el mapa del juego (arrastrables) y seguimiento tipo misiones.
 */
const Chat = {
  activePlayer: null,
  chats: {},
  unread: {},
  _contactosKey: 'mariel_chat_contactos',
  _contactos: {},
  _colocandoPin: null,
  _pinsMapa: {},
  _pinsAbandonados: new Set(),
  _abandonadosKey: 'mariel_pins_chat_abandonados',
  _pinActivo: null,
  _lineaPin: null,
  _clickFueraOk: false,
  _confirmModo: null,

  _miId() {
    if (typeof Multijugador !== 'undefined' && Multijugador._miPlayerId) {
      return Multijugador._miPlayerId();
    }
    return -1;
  },

  _token() {
    return localStorage.getItem(Multijugador.TOKEN_KEY);
  },

  _headers() {
    return {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + this._token()
    };
  },

  _base() {
    return Multijugador.urlServidor();
  },

  _online() {
    return typeof Multijugador !== 'undefined' && Multijugador.activo && !!this._token();
  },

  _cargarContactos() {
    try {
      const raw = localStorage.getItem(this._contactosKey);
      this._contactos = raw ? JSON.parse(raw) : {};
      if (!this._contactos || typeof this._contactos !== 'object') this._contactos = {};
    } catch (e) {
      this._contactos = {};
    }
  },

  _guardarContactos() {
    localStorage.setItem(this._contactosKey, JSON.stringify(this._contactos));
  },

  marcarContacto(playerId, nombre) {
    const id = Number(playerId);
    if (!id || id === this._miId()) return;
    this._cargarContactos();
    const prev = this._contactos[id] || {};
    this._contactos[id] = {
      name: nombre || prev.name || ('Jugador ' + id),
      desde: prev.desde || Date.now()
    };
    this._guardarContactos();
  },

  quitarContacto(playerId) {
    const id = Number(playerId);
    this._cargarContactos();
    delete this._contactos[id];
    this._guardarContactos();
  },

  esContacto(playerId) {
    this._cargarContactos();
    return Object.prototype.hasOwnProperty.call(this._contactos, Number(playerId));
  },

  _nombreJugador(playerId) {
    const id = Number(playerId);
    if (typeof Amigos !== 'undefined') {
      const f = Amigos.friends.find(x => Number(x.playerId) === id);
      if (f?.name) return f.name;
    }
    if (typeof Multijugador !== 'undefined' && Multijugador.online) {
      const p = Multijugador.online.find(x => Number(x.playerId) === id);
      if (p?.name) return p.name;
    }
    this._cargarContactos();
    if (this._contactos[id]?.name) return this._contactos[id].name;
    const list = this.chats[id];
    if (list?.length) {
      const otro = list.find(m => m.from !== 'me' && m.name);
      if (otro?.name) return otro.name;
    }
    return 'Jugador ' + id;
  },

  _estaOnline(playerId) {
    const id = Number(playerId);
    if (typeof Multijugador !== 'undefined' && Multijugador.online) {
      return Multijugador.online.some(p => Number(p.playerId) === id);
    }
    return false;
  },

  abrirDesdeMapa(playerId, nombre) {
    if (!this._online()) {
      Notificaciones.mostrar('📡 Conéctate al servidor para chatear', 'alerta', 3000);
      return;
    }
    if (typeof Amigos !== 'undefined' && Amigos.bloqueadoCon(playerId)) {
      Notificaciones.mostrar('No puedes chatear con este jugador', 'alerta', 3000);
      return;
    }
    this.marcarContacto(playerId, nombre);
    this.openConversation(playerId);
  },

  iniciarUI() {
    if (this._uiLista) return;
    this._uiLista = true;
    this._cargarPinsAbandonados();
    this._cargarContactos();
    const btn = document.getElementById('btn-chat');
    if (!btn) return;
    btn.classList.remove('oculto');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePanel();
    });

    document.getElementById('closeChat')?.addEventListener('click', () => this.cerrarPanel());
    document.getElementById('backBtnChat')?.addEventListener('click', () => this.showList());
    document.getElementById('sendBtnChat')?.addEventListener('click', () => this.sendTextMessage());
    document.getElementById('emojiBtnChat')?.addEventListener('click', () => {
      document.getElementById('emojiPanelChat')?.classList.toggle('show');
    });
    document.getElementById('locationBtnChat')?.addEventListener('click', () => this.openMapToSend());
    document.getElementById('friendBtnChat')?.addEventListener('click', () => this.toggleFriend());
    document.getElementById('friendAcceptBtnChat')?.addEventListener('click', () => this._aceptarSolicitudChat());
    document.getElementById('friendRejectBtnChat')?.addEventListener('click', () => this._rechazarSolicitudChat());
    document.getElementById('chat-confirm-cancel')?.addEventListener('click', () => this._cerrarConfirmBorrar());
    document.getElementById('chat-confirm-ok')?.addEventListener('click', () => this._confirmarBorrarChat());
    document.getElementById('btn-chat-pin-confirmar')?.addEventListener('click', () => this.confirmarColocacionPin());
    document.getElementById('btn-chat-pin-cancelar')?.addEventListener('click', () => this.cancelarColocacionPin());

    const panel = document.getElementById('chatPanel');
    const inner = panel?.querySelector('.chat-inner-panel');
    inner?.addEventListener('click', (e) => e.stopPropagation());
    panel?.addEventListener('click', (e) => {
      if (e.target === panel) this.cerrarPanel();
    });

    const input = document.getElementById('chatInput');
    input?.addEventListener('keydown', (e) => {
      const isMobile = window.matchMedia('(pointer: coarse)').matches;
      if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
        e.preventDefault();
        this.sendTextMessage();
      }
    });
    input?.addEventListener('input', () => {
      input.style.height = '44px';
      input.style.height = Math.min(input.scrollHeight, 88) + 'px';
    });

    document.querySelectorAll('#emojiPanelChat .emoji').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!input) return;
        input.value += btn.textContent;
        input.focus();
      });
    });

    document.getElementById('messagesChat')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.pin-open-btn');
      if (!btn) return;
      const index = Number(btn.dataset.index);
      const list = this.chats[this.activePlayer] || [];
      const msg = list[index];
      if (msg?.type === 'location' && msg.location) {
        this.agregarPinMapa(msg.location.lat, msg.location.lng, msg.fromName || 'Jugador');
      }
    });

    document.getElementById('letrero-pin-chat')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-dejar-pin]');
      if (btn) this._pedirDejarSeguirPin();
    });

    if (!this._clickFueraOk) {
      this._clickFueraOk = true;
      const cerrarSiFuera = (e) => {
        const p = document.getElementById('chatPanel');
        if (!p?.classList.contains('show')) return;
        if (e.target.closest('#btn-chat')) return;
        const caja = p.querySelector('.chat-inner-panel');
        if (caja?.contains(e.target)) return;
        this.cerrarPanel();
      };
      document.addEventListener('click', cerrarSiFuera);
      document.addEventListener('touchstart', cerrarSiFuera, { passive: true });
    }

    this.showList();
  },

  enlazarSocket(socket) {
    if (!socket || socket._chatOk) return;
    socket._chatOk = true;
    socket.on('chat:message', (msg) => this._recibirMensaje(msg));
    socket.on('chat:read', (data) => this._aplicarLectura(data));
  },

  _syncChatAbiertoBody(abierto) {
    document.body.classList.toggle('chat-abierto', !!abierto);
  },

  togglePanel() {
    const panel = document.getElementById('chatPanel');
    if (!panel) return;
    if (!this._online()) {
      Notificaciones.mostrar('📡 Conéctate al servidor para usar el chat', 'alerta', 3500);
      return;
    }
    const abierto = !panel.classList.contains('show');
    if (abierto) {
      if (typeof UIManager !== 'undefined') UIManager.abrir('chatPanel');
      else panel.classList.add('show');
      this._syncChatAbiertoBody(true);
      document.getElementById('btn-chat')?.classList.add('activo');
      this.showList();
      this.refrescarConversaciones();
    } else {
      this.cerrarPanel();
    }
  },

  cerrarPanel() {
    if (typeof UIManager !== 'undefined') UIManager.cerrar('chatPanel');
    else document.getElementById('chatPanel')?.classList.remove('show');
    this._syncChatAbiertoBody(false);
    document.getElementById('btn-chat')?.classList.remove('activo');
    document.getElementById('emojiPanelChat')?.classList.remove('show');
  },

  _jugadoresDisponibles() {
    const map = new Map();
    const yo = this._miId();
    this._cargarContactos();

    if (typeof Amigos !== 'undefined') {
      for (const f of Amigos.friends || []) {
        if (Amigos.bloqueadoCon(f.playerId)) continue;
        map.set(Number(f.playerId), {
          id: Number(f.playerId),
          name: f.name,
          online: this._estaOnline(f.playerId) || !!f.online,
          friend: true
        });
      }
    }

    for (const [idStr, info] of Object.entries(this._contactos)) {
      const id = Number(idStr);
      if (!id || id === yo) continue;
      if (typeof Amigos !== 'undefined' && Amigos.bloqueadoCon(id)) continue;
      if (map.has(id)) continue;
      map.set(id, {
        id,
        name: info.name || this._nombreJugador(id),
        online: this._estaOnline(id),
        friend: false
      });
    }

    for (const j of map.values()) {
      if (!j.online) j.online = this._estaOnline(j.id);
      if (!j.name || j.name.startsWith('Jugador ')) {
        j.name = this._nombreJugador(j.id);
      }
    }

    return [...map.values()].sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      return a.name.localeCompare(b.name, 'es');
    });
  },

  async refrescarConversaciones() {
    const base = this._base();
    if (!base || !this._token()) return;
    try {
      const r = await fetch(base + '/api/chat/conversations', { headers: this._headers() });
      const data = await r.json();
      if (!data.ok) return;
      for (const c of data.conversations || []) {
        const id = Number(c.playerId);
        if (!this.chats[id]) this.chats[id] = [];
        const last = c.lastMessage;
        if (last) {
          const list = this.chats[id];
          if (!list.some(m => m.id === last.id)) list.push(this._normalizarMsg(last));
        }
      }
      this.renderChatList();
    } catch (e) { /* sin red */ }
  },

  _normalizarMsg(msg) {
    const yo = this._miId();
    return {
      id: msg.id,
      from: msg.fromPlayerId === yo ? 'me' : (msg.type === 'system' ? 'system' : 'other'),
      fromPlayerId: msg.fromPlayerId,
      toPlayerId: msg.toPlayerId,
      name: msg.fromName || msg.name || 'Jugador',
      text: msg.text || '',
      type: msg.type || 'text',
      location: msg.location || null,
      createdAt: msg.createdAt || Date.now(),
      readAt: msg.readAt || null
    };
  },

  _recibirMensaje(msg) {
    if (!msg) return;
    const yo = this._miId();
    const other = msg.fromPlayerId === yo ? msg.toPlayerId : msg.fromPlayerId;
    if (msg.fromPlayerId !== yo) {
      this.marcarContacto(other, msg.fromName);
    }
    const normal = this._normalizarMsg(msg);
    if (!this.chats[other]) this.chats[other] = [];
    if (!this.chats[other].some(m => m.id === normal.id)) {
      this.chats[other].push(normal);
    }
    if (this.activePlayer !== other && msg.fromPlayerId !== yo) {
      this.unread[other] = (this.unread[other] || 0) + 1;
    }
    if (this.activePlayer === other) {
      this.renderMessages();
      this._marcarLeido(other);
      const nombre = msg.fromName || 'Jugador';
      this._estadoLinea(nombre + ' escribió');
    }
    this.renderChatList();
    this._actualizarBadge();
    if (msg.fromPlayerId !== yo) {
      const preview = msg.type === 'location' ? '📍 Ubicación' : (msg.text || '').slice(0, 60);
      Notificaciones.mostrarSocial(
        '💬 ' + (msg.fromName || 'Jugador') + ': ' + preview,
        'info', 'chat', 3500
      );
    }
  },

  _aplicarLectura(data) {
    if (!data?.fromPlayerId) return;
    const other = Number(data.fromPlayerId);
    const lastId = Number(data.lastReadMessageId);
    const list = this.chats[other];
    if (!list) return;
    let cambio = false;
    for (const m of list) {
      if (m.from === 'me' && m.id && m.id <= lastId && !m.readAt) {
        m.readAt = Date.now();
        cambio = true;
      }
    }
    if (cambio && this.activePlayer === other) {
      this.renderMessages();
      const jug = this._jugadoresDisponibles().find(j => j.id === other);
      this._estadoLinea('Leído por ' + (jug?.name || 'jugador'));
    }
  },

  async _marcarLeido(otherId) {
    const list = this.chats[otherId] || [];
    const yo = this._miId();
    const recibidos = list.filter(m => m.fromPlayerId !== yo && m.id);
    if (!recibidos.length) return;
    const lastId = Math.max(...recibidos.map(m => m.id));
    const socket = Multijugador.socket;
    if (socket?.connected) {
      socket.emit('chat:markRead', { playerId: otherId, messageId: lastId });
      return;
    }
    const base = this._base();
    if (!base || !this._token()) return;
    try {
      await fetch(base + '/api/chat/read', {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({ playerId: otherId, messageId: lastId })
      });
    } catch (e) { /* sin red */ }
  },

  _estadoLinea(texto) {
    const el = document.getElementById('chatStatusLine');
    if (!el) return;
    if (!texto) {
      el.textContent = '';
      el.style.display = 'none';
      return;
    }
    el.style.display = 'flex';
    el.textContent = texto;
  },

  _avatarEmoji(nombre) {
    const n = (nombre || '?').trim();
    const emojis = ['🧔','🥷','🧢','👤','🎮','⚔️','🛡️','🏃'];
    let h = 0;
    for (let i = 0; i < n.length; i++) h = (h + n.charCodeAt(i)) % emojis.length;
    return emojis[h];
  },

  _checksHtml(msg) {
    if (msg.from !== 'me') return '';
    if (msg.readAt) return '<span class="checks read">✓✓ leído</span>';
    return '<span class="checks sent">✓</span>';
  },

  showList() {
    this.activePlayer = null;
    document.getElementById('chatView')?.classList.remove('show');
    document.getElementById('chatList')?.classList.add('show');
    document.getElementById('backBtnChat')?.classList.remove('show');
    document.getElementById('headerTitleChat').textContent = '💬 Chats';
    const sub = document.getElementById('chatSub');
    if (sub) sub.textContent = 'Selecciona un jugador';
    document.getElementById('emojiPanelChat')?.classList.remove('show');
    document.getElementById('friendBtnChat')?.classList.add('oculto');
    document.getElementById('friendAcceptBtnChat')?.classList.add('oculto');
    document.getElementById('friendRejectBtnChat')?.classList.add('oculto');
    document.getElementById('friendPendingChat')?.classList.add('oculto');
    this._estadoLinea('');
    this.renderChatList();
  },

  async openConversation(playerId) {
    if (typeof Amigos !== 'undefined' && Amigos.bloqueadoCon(playerId)) {
      Notificaciones.mostrar('No puedes chatear con este jugador', 'alerta', 3000);
      return;
    }
    this.activePlayer = Number(playerId);
    this.marcarContacto(this.activePlayer, this._nombreJugador(this.activePlayer));
    this.unread[this.activePlayer] = 0;
    document.getElementById('chatList')?.classList.remove('show');
    document.getElementById('chatView')?.classList.add('show');
    document.getElementById('backBtnChat')?.classList.add('show');

    const jug = this._jugadoresDisponibles().find(j => j.id === this.activePlayer);
    document.getElementById('headerTitleChat').textContent = jug?.name || ('Jugador ' + this.activePlayer);
    const sub = document.getElementById('chatSub');
    if (sub) sub.textContent = jug?.online ? '🟢 En línea' : '⚪ Desconectado';

    await this._cargarHistorial(this.activePlayer);
    this.updateFriendButton();
    this.renderMessages();
    this._marcarLeido(this.activePlayer);
    this._actualizarBadge();
    this._estadoLinea('Listo');

    const panel = document.getElementById('chatPanel');
    if (panel && !panel.classList.contains('show')) {
      panel.classList.add('show');
      this._syncChatAbiertoBody(true);
      document.getElementById('btn-chat')?.classList.add('activo');
    }
  },

  async _cargarHistorial(playerId) {
    const socket = Multijugador.socket;
    if (socket?.connected) {
      await new Promise(resolve => {
        socket.emit('chat:history', { playerId }, (res) => {
          if (res?.ok) this.chats[playerId] = (res.messages || []).map(m => this._normalizarMsg(m));
          resolve();
        });
        setTimeout(resolve, 2500);
      });
      return;
    }
    const base = this._base();
    if (!base || !this._token()) return;
    try {
      const r = await fetch(base + '/api/chat/' + playerId, { headers: this._headers() });
      const data = await r.json();
      if (data.ok) this.chats[playerId] = (data.messages || []).map(m => this._normalizarMsg(m));
    } catch (e) { /* sin red */ }
  },

  renderChatList() {
    const lista = document.getElementById('chatList');
    if (!lista || this.activePlayer) return;
    const jugadores = this._jugadoresDisponibles();
    lista.innerHTML = '';

    if (!jugadores.length) {
      lista.innerHTML =
        '<div class="chat-vacio">No hay chats todavía.<br>' +
        'Agrega amigos o toca un jugador en el mapa → <b>Chatear</b>.</div>';
      return;
    }

    for (const j of jugadores) {
      const last = this._ultimoMensaje(j.id);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'chat-row';
      row.dataset.playerId = String(j.id);
      row.innerHTML =
        '<div class="avatar ' + (j.online ? 'online' : '') + '">' + this._avatarEmoji(j.name) + '</div>' +
        '<div class="chat-row-info">' +
          '<div class="chat-row-name">' + this._esc(j.name) +
            (j.friend ? ' <span class="friend-mark">★</span>' : '') +
          '</div>' +
          '<div class="chat-row-last">' + this._esc(last.text) + '</div>' +
        '</div>' +
        '<div class="chat-row-meta">' +
          '<div class="chat-time">' + last.time + '</div>' +
          ((this.unread[j.id] || 0) > 0
            ? '<div class="unread">' + this._contadorGlobo(this.unread[j.id]) + '</div>'
            : '') +
        '</div>';
      row.addEventListener('click', () => this.openConversation(j.id));
      this._enlazarBorrarChat(row, j.id, j.name);
      lista.appendChild(row);
    }
  },

  _enlazarBorrarChat(row, playerId, nombre) {
    let timer = null;
    let longPress = false;
    const iniciar = (e) => {
      if (e.type === 'mousedown' && e.button !== 0) return;
      clearTimeout(timer);
      longPress = false;
      timer = setTimeout(() => {
        timer = null;
        longPress = true;
        row.classList.add('borrar-pulsado');
        this._pedirBorrarChat(playerId, nombre);
        setTimeout(() => row.classList.remove('borrar-pulsado'), 200);
      }, 550);
    };
    const cancelar = () => {
      clearTimeout(timer);
      timer = null;
    };
    row.addEventListener('touchstart', iniciar, { passive: true });
    row.addEventListener('touchend', cancelar);
    row.addEventListener('touchmove', cancelar);
    row.addEventListener('touchcancel', cancelar);
    row.addEventListener('mousedown', iniciar);
    row.addEventListener('mouseup', cancelar);
    row.addEventListener('mouseleave', cancelar);
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      longPress = true;
      this._pedirBorrarChat(playerId, nombre);
    });
    row.addEventListener('click', (e) => {
      if (!longPress) return;
      e.preventDefault();
      e.stopPropagation();
      longPress = false;
    }, true);
  },

  _pedirBorrarChat(playerId, nombre) {
    const id = Number(playerId);
    const esAmigo = typeof Amigos !== 'undefined' && Amigos.esAmigo(id);
    const titulo = document.getElementById('chat-confirm-title');
    const texto = document.getElementById('chat-confirm-text');
    const cancelBtn = document.getElementById('chat-confirm-cancel');
    const okBtn = document.getElementById('chat-confirm-ok');
    if (titulo) titulo.textContent = '¿Borrar chat?';
    if (texto) {
      texto.textContent = esAmigo
        ? ('¿Borrar la conversación con ' + nombre + '? Seguirá en tus amigos.')
        : ('¿Borrar el chat con ' + nombre + '? Dejará de aparecer en la lista.');
    }
    if (cancelBtn) cancelBtn.textContent = 'Cancelar';
    if (okBtn) {
      okBtn.textContent = 'Borrar';
      okBtn.classList.add('danger');
    }
    this._confirmModo = 'borrar';
    this._borrarChatPendiente = id;
    this._abrirConfirmChat();
  },

  _abrirConfirmChat() {
    if (typeof UIManager !== 'undefined') {
      UIManager.abrirConfirm('chat-overlay', { onCancel: () => this._cerrarConfirmBorrar() });
    } else document.getElementById('chat-overlay')?.classList.remove('oculto');
  },

  _pedirDejarSeguirPin() {
    if (!this._pinActivo || !this._pinsMapa[this._pinActivo]) return;
    const pin = this._pinsMapa[this._pinActivo];
    const titulo = document.getElementById('chat-confirm-title');
    const texto = document.getElementById('chat-confirm-text');
    const cancelBtn = document.getElementById('chat-confirm-cancel');
    const okBtn = document.getElementById('chat-confirm-ok');
    if (titulo) titulo.textContent = '¿Dejar de seguir el pin?';
    if (texto) {
      texto.textContent = 'Se borrará el pin del mapa y la línea azul. No volverá a aparecer.';
    }
    if (cancelBtn) cancelBtn.textContent = 'No';
    if (okBtn) {
      okBtn.textContent = 'Sí';
      okBtn.classList.remove('danger');
    }
    this._confirmModo = 'pin';
    this._abrirConfirmChat();
  },

  _cerrarConfirmBorrar() {
    this._borrarChatPendiente = null;
    this._confirmModo = null;
    const cancelBtn = document.getElementById('chat-confirm-cancel');
    const okBtn = document.getElementById('chat-confirm-ok');
    if (cancelBtn) cancelBtn.textContent = 'Cancelar';
    if (okBtn) {
      okBtn.textContent = 'Borrar';
      okBtn.classList.add('danger');
    }
    if (typeof UIManager !== 'undefined') UIManager.cerrarConfirm('chat-overlay');
    else document.getElementById('chat-overlay')?.classList.add('oculto');
  },

  _confirmarBorrarChat() {
    if (this._confirmModo === 'pin') {
      this._cerrarConfirmBorrar();
      this.abandonarPinActivo();
      return;
    }
    const id = this._borrarChatPendiente;
    this._cerrarConfirmBorrar();
    if (!id) return;
    this._ejecutarBorrarChat(id);
  },

  _ejecutarBorrarChat(playerId) {
    const id = Number(playerId);
    const esAmigo = typeof Amigos !== 'undefined' && Amigos.esAmigo(id);
    delete this.chats[id];
    delete this.unread[id];
    if (!esAmigo) this.quitarContacto(id);
    if (this.activePlayer === id) this.showList();
    else this.renderChatList();
    this._actualizarBadge();
    Notificaciones.mostrar('Chat borrado', 'info', 2200);
  },

  _ultimoMensaje(playerId) {
    const list = this.chats[playerId] || [];
    const last = list[list.length - 1];
    if (!last) return { text: 'Sin mensajes', time: '' };
    const prefijo = last.from === 'me' ? 'Tú: ' : '';
    const text = last.type === 'location' ? '📍 Ubicación enviada' : (prefijo + (last.text || ''));
    return { text, time: this._timeAgo(last.createdAt) };
  },

  renderMessages() {
    const cont = document.getElementById('messagesChat');
    if (!cont || !this.activePlayer) return;
    const list = this.chats[this.activePlayer] || [];
    const jug = this._jugadoresDisponibles().find(j => j.id === this.activePlayer);
    cont.innerHTML = '';

    if (!list.length) {
      cont.innerHTML =
        '<div class="msg system">' +
          '<div class="msg-name">Sistema</div>' +
          '<div class="msg-text">No hay mensajes todavía. Escribe o manda una ubicación 📍</div>' +
        '</div>';
      return;
    }

    list.forEach((msg, index) => {
      const div = document.createElement('div');
      const clase = msg.from === 'system' ? 'system' : (msg.from === 'me' ? 'me' : 'other');
      div.className = 'msg ' + clase;
      const nombre = msg.from === 'me' ? 'Tú' : this._esc(msg.name || jug?.name || 'Jugador');
      let html =
        '<div class="msg-name">' + nombre + '</div>' +
        '<div class="msg-text">' + this._esc(msg.text) + '</div>';

      if (msg.type === 'location' && msg.location) {
        const pct = this._latLngAPorcentaje(msg.location.lat, msg.location.lng);
        html +=
          '<div class="pin-card">' +
            '<div class="pin-map" style="--px:' + pct.x + '%; --py:' + pct.y + '%;"></div>' +
            '<div class="pin-text">📍 Ubicación · ' + msg.location.lat.toFixed(5) + ', ' + msg.location.lng.toFixed(5) +
            '</div>' +
            '<button type="button" class="pin-open-btn" data-index="' + index + '">Abrir pin en el mapa</button>' +
          '</div>';
      }

      html += '<div class="msg-bottom">' +
        '<span>' + this._timeAgo(msg.createdAt) + '</span>' +
        this._checksHtml(msg) +
      '</div>';
      div.innerHTML = html;
      cont.appendChild(div);
    });
    cont.scrollTop = cont.scrollHeight;
  },

  async sendTextMessage() {
    if (!this.activePlayer || !this._online()) return;
    const input = document.getElementById('chatInput');
    const text = (input?.value || '').trim();
    if (!text) return;

    const ok = await this._enviar({
      toPlayerId: this.activePlayer,
      type: 'text',
      text
    });
    if (!ok) return;

    if (input) {
      input.value = '';
      input.style.height = '44px';
    }
    document.getElementById('emojiPanelChat')?.classList.remove('show');
    const jug = this._jugadoresDisponibles().find(j => j.id === this.activePlayer);
    this._estadoLinea('Enviado a ' + (jug?.name || 'jugador'));
    this.renderMessages();
    this.renderChatList();
  },

  async _enviar(payload) {
    const socket = Multijugador.socket;
    if (socket?.connected) {
      return new Promise(resolve => {
        socket.emit('chat:send', payload, (res) => {
          if (!res?.ok) {
            Notificaciones.mostrar(res?.error || 'No se pudo enviar', 'alerta', 3000);
            resolve(false);
            return;
          }
          if (res.message) this._recibirMensaje(res.message);
          resolve(true);
        });
        setTimeout(() => resolve(false), 4000);
      });
    }
    const base = this._base();
    if (!base || !this._token()) return false;
    try {
      const r = await fetch(base + '/api/chat/send', {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(payload)
      });
      const data = await r.json();
      if (!data.ok) {
        Notificaciones.mostrar(data.error || 'No se pudo enviar', 'alerta', 3000);
        return false;
      }
      if (data.message) this._recibirMensaje(data.message);
      return true;
    } catch (e) {
      Notificaciones.mostrar('Sin conexión al servidor', 'alerta', 3000);
      return false;
    }
  },

  toggleFriend() {
    if (!this.activePlayer || typeof Amigos === 'undefined') return;
    if (Amigos.esAmigo(this.activePlayer)) {
      Notificaciones.mostrar('Ya es tu amigo ★', 'info', 2500);
      return;
    }
    if (Amigos.pendingOut.some(r => Number(r.toPlayerId) === this.activePlayer)) {
      Notificaciones.mostrar('Ya enviaste solicitud de amistad', 'info', 2500);
      return;
    }
    Amigos.solicitar(this.activePlayer).then(() => this.updateFriendButton());
    const jug = this._jugadoresDisponibles().find(j => j.id === this.activePlayer);
    this._estadoLinea('Solicitud de amistad enviada a ' + (jug?.name || 'jugador'));
  },

  _solicitudEntrante() {
    if (typeof Amigos === 'undefined' || !this.activePlayer) return null;
    return Amigos.pendingIn.find(r => Number(r.fromPlayerId) === this.activePlayer) || null;
  },

  _aceptarSolicitudChat() {
    const s = this._solicitudEntrante();
    if (!s || typeof Amigos === 'undefined') return;
    Amigos.aceptar(s.id).then(() => {
      this.updateFriendButton();
      this.renderChatList();
      this._estadoLinea('Ahora son amigos ★');
    });
  },

  _rechazarSolicitudChat() {
    const s = this._solicitudEntrante();
    if (!s || typeof Amigos === 'undefined') return;
    Amigos.rechazar(s.id).then(() => {
      this.updateFriendButton();
      this._estadoLinea('Solicitud rechazada');
    });
  },

  updateFriendButton() {
    const addBtn = document.getElementById('friendBtnChat');
    const acceptBtn = document.getElementById('friendAcceptBtnChat');
    const rejectBtn = document.getElementById('friendRejectBtnChat');
    const pendingLbl = document.getElementById('friendPendingChat');
    [addBtn, acceptBtn, rejectBtn, pendingLbl].forEach(el => el?.classList.add('oculto'));

    if (!this.activePlayer || typeof Amigos === 'undefined') return;
    const id = this.activePlayer;

    if (Amigos.esAmigo(id) || Amigos.bloqueadoCon(id)) return;

    const entrante = this._solicitudEntrante();
    if (entrante) {
      acceptBtn?.classList.remove('oculto');
      rejectBtn?.classList.remove('oculto');
      return;
    }

    if (Amigos.pendingOut.some(r => Number(r.toPlayerId) === id)) {
      pendingLbl?.classList.remove('oculto');
      return;
    }

    addBtn?.classList.remove('oculto', 'friend-added');
    if (addBtn) {
      addBtn.textContent = '👥';
      addBtn.title = 'Agregar amigo';
    }
  },

  openMapToSend() {
    if (!this.activePlayer || !Mapa.mapa) return;
    if (this._colocandoPin) return;
    const centro = typeof GPS !== 'undefined' && GPS.posicion
      ? GPS.posicion.slice()
      : CONFIG.centro.slice();
    const playerId = this.activePlayer;
    this.cerrarPanel();

    const marcador = L.marker(centro, {
      draggable: true,
      zIndexOffset: 2100,
      icon: L.divIcon({
        className: '',
        html: '<div class="pin-chat-mapa pin-chat-colocar">📍</div>',
        iconSize: [36, 36],
        iconAnchor: [18, 32]
      })
    }).addTo(Mapa.mapa);

    this._colocandoPin = { marcador, playerId };
    const ctrl = document.getElementById('chat-pin-controles');
    if (ctrl) ctrl.classList.remove('oculto');
    Mapa.mapa.panTo(centro);
  },

  async confirmarColocacionPin() {
    if (!this._colocandoPin?.marcador) return;
    const p = this._colocandoPin.marcador.getLatLng();
    const playerId = this._colocandoPin.playerId;
    this._limpiarColocacionPin();
    await this.openConversation(playerId);
    const ok = await this._enviar({
      toPlayerId: playerId,
      type: 'location',
      text: 'Te envié una ubicación.',
      lat: +p.lat.toFixed(6),
      lng: +p.lng.toFixed(6)
    });
    if (ok) {
      this.renderMessages();
      this.renderChatList();
    }
  },

  cancelarColocacionPin() {
    const playerId = this._colocandoPin?.playerId;
    this._limpiarColocacionPin();
    if (playerId) this.openConversation(playerId);
  },

  _limpiarColocacionPin() {
    if (this._colocandoPin?.marcador) {
      this._colocandoPin.marcador.remove();
    }
    this._colocandoPin = null;
    document.getElementById('chat-pin-controles')?.classList.add('oculto');
  },

  _latLngAPorcentaje(lat, lng) {
    const [so, ne] = CONFIG.limites;
    const x = ((lng - so[1]) / (ne[1] - so[1])) * 100;
    const y = ((ne[0] - lat) / (ne[0] - so[0])) * 100;
    return {
      x: Math.max(3, Math.min(97, x)),
      y: Math.max(8, Math.min(97, y))
    };
  },

  _iconoPinMapa(activo) {
    return L.divIcon({
      className: '',
      html: '<div class="pin-chat-mapa' + (activo ? ' pin-chat-activo' : ' pin-chat-guardado') + '">📍</div>',
      iconSize: [32, 32],
      iconAnchor: [16, 28]
    });
  },

  _keyPin(lat, lng) {
    return Number(lat).toFixed(5) + ',' + Number(lng).toFixed(5);
  },

  _cargarPinsAbandonados() {
    try {
      const raw = localStorage.getItem(this._abandonadosKey);
      const lista = raw ? JSON.parse(raw) : [];
      this._pinsAbandonados = new Set((lista || []).filter(Boolean));
    } catch (e) {
      this._pinsAbandonados = new Set();
    }
  },

  _guardarPinsAbandonados() {
    try {
      localStorage.setItem(this._abandonadosKey, JSON.stringify([...this._pinsAbandonados]));
    } catch (e) { /* */ }
  },

  agregarPinMapa(lat, lng, etiqueta) {
    if (!Mapa.mapa || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const key = this._keyPin(lat, lng);
    if (this._pinsAbandonados.has(key)) {
      Notificaciones.mostrar('📍 Ya dejaste de seguir este pin', 'alerta', 3500);
      return;
    }
    if (!this._pinsMapa[key]) {
      const marcador = L.marker([lat, lng], {
        icon: this._iconoPinMapa(false)
      }).addTo(Mapa.mapa);
      marcador.on('click', () => this._activarPinMapa(key));
      this._pinsMapa[key] = { marcador, lat, lng, etiqueta: etiqueta || 'Ubicación' };
    }
    this._activarPinMapa(key);
    this.cerrarPanel();
    Notificaciones.mostrar('📍 Sigue la línea azul hasta el pin', 'exito', 3500);
  },

  _activarPinMapa(key) {
    if (this._pinsAbandonados.has(key) || !this._pinsMapa[key]) return;
    const prev = this._pinActivo;
    if (prev && this._pinsMapa[prev]) {
      this._pinsMapa[prev].marcador.setIcon(this._iconoPinMapa(false));
    }
    this._pinActivo = key;
    const pin = this._pinsMapa[key];
    if (pin) pin.marcador.setIcon(this._iconoPinMapa(true));
    this._actualizarLineaPin();
    this._pintarLetreroPin();
  },

  dejarDeSeguirPin(opciones) {
    const silencioso = opciones && opciones.silencioso;
    const pinKey = this._pinActivo;
    const pin = pinKey ? this._pinsMapa[pinKey] : null;
    this._pinActivo = null;
    this._actualizarLineaPin();
    if (pin) {
      pin.marcador.setIcon(this._iconoPinMapa(false));
      if (!silencioso) {
        Notificaciones.mostrar(
          '📍 Dejaste de seguir el pin de ' + (pin.etiqueta || 'ubicación') + '.',
          'info', 4500
        );
      }
    }
    this._pintarLetreroPin();
  },

  abandonarPinActivo() {
    const pinKey = this._pinActivo;
    if (!pinKey) return;
    const pin = this._pinsMapa[pinKey];
    this._pinActivo = null;
    this._actualizarLineaPin();
    if (pin?.marcador) {
      try { pin.marcador.off('click'); } catch (e) { /* */ }
      pin.marcador.remove();
    }
    delete this._pinsMapa[pinKey];
    this._pinsAbandonados.add(pinKey);
    this._guardarPinsAbandonados();
    this._pintarLetreroPin();
    Notificaciones.mostrar('📍 Dejaste de seguir el pin. Ya no aparece en el mapa.', 'info', 4500);
  },

  _pintarLetreroPin() {
    const cont = document.getElementById('letrero-pin-chat');
    if (!cont) return;
    if (!this._pinActivo || !this._pinsMapa[this._pinActivo]) {
      cont.classList.add('oculto');
      cont.innerHTML = '';
      return;
    }
    const pin = this._pinsMapa[this._pinActivo];
    let distTxt = '';
    if (typeof GPS !== 'undefined' && GPS.posicion) {
      const d = Math.round(Utilidades.distanciaMetros(GPS.posicion, [pin.lat, pin.lng]));
      distTxt = '<div class="estado-letrero">' + d + ' m · sigue la línea azul</div>';
    }
    cont.classList.remove('oculto');
    cont.innerHTML =
      '<div class="mision-letrero lista pin-chat-letrero">' +
        '<span class="punto-color premio" style="background:#38c6ff"></span>' +
        '<div class="datos-letrero">' +
          '<div class="titulo-letrero">📍 Pin de ' + this._esc(pin.etiqueta) + ' ➜</div>' +
          distTxt +
          '<div class="estado-letrero">Toca ✕ para dejar de seguir</div>' +
        '</div>' +
        '<button type="button" class="btn-letrero-pin" data-dejar-pin title="Dejar de seguir">✕</button>' +
      '</div>';
  },

  verificarLlegadaPin() {
    if (!this._pinActivo || !GPS.posicion) return;
    const pin = this._pinsMapa[this._pinActivo];
    if (!pin) return;
    const dist = Utilidades.distanciaMetros(GPS.posicion, [pin.lat, pin.lng]);
    if (dist <= CONFIG.distanciaInteraccion) {
      const etiqueta = pin.etiqueta;
      this.dejarDeSeguirPin({ silencioso: true });
      Notificaciones.mostrar('📍 Llegaste al pin de ' + etiqueta, 'exito', 4500);
    } else {
      this._pintarLetreroPin();
    }
  },

  _actualizarLineaPin() {
    if (!Mapa.mapa) return;
    const miPos = typeof GPS !== 'undefined' && GPS.posicion ? GPS.posicion : null;
    if (!miPos || !this._pinActivo || !this._pinsMapa[this._pinActivo]) {
      if (this._lineaPin) {
        Mapa.mapa.removeLayer(this._lineaPin);
        this._lineaPin = null;
      }
      return;
    }
    const pin = this._pinsMapa[this._pinActivo];
    const coords = [[miPos[0], miPos[1]], [pin.lat, pin.lng]];
    if (!this._lineaPin) {
      this._lineaPin = L.polyline(coords, {
        color: '#38c6ff',
        weight: 4,
        opacity: 0.9,
        dashArray: '10, 12',
        className: 'linea-pin-chat'
      }).addTo(Mapa.mapa);
    } else {
      this._lineaPin.setLatLngs(coords);
    }
  },

  actualizarLineaSiActiva() {
    this._actualizarLineaPin();
    this.verificarLlegadaPin();
  },

  _contadorGlobo(cantidad) {
    if (typeof Utilidades !== 'undefined' && typeof Utilidades.contadorBadge === 'function') {
      return Utilidades.contadorBadge(cantidad);
    }
    const n = Math.max(0, Math.floor(Number(cantidad) || 0));
    if (n <= 0) return '';
    if (n > 10) return '+10';
    return String(n);
  },

  _actualizarBadge() {
    const badge = document.getElementById('badge-chat');
    if (!badge) return;
    const total = Object.values(this.unread).reduce((a, b) => a + (b || 0), 0);
    badge.textContent = this._contadorGlobo(total);
    badge.classList.toggle('oculto', total <= 0);
  },

  _timeAgo(ts) {
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 1) return 'ahora';
    if (mins === 1) return '1 min';
    if (mins < 60) return mins + ' min';
    return Math.floor(mins / 60) + ' h';
  },

  _esc(text) {
    return String(text)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }
};
