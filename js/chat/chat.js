/**
 * Chat entre jugadores — conectado al servidor en vivo.
 * Compartir ubicación como pin en el mapa local.
 */
const Chat = {
  activePlayer: null,
  chats: {},
  unread: {},
  pinPosition: { lat: null, lng: null },
  mapMode: 'send',
  _pinsMapa: {},
  _pinActivo: null,
  _lineaPin: null,
  _draggingPin: false,

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

  iniciarUI() {
    const btn = document.getElementById('btn-chat');
    if (!btn) return;
    btn.classList.remove('oculto');
    btn.addEventListener('click', () => this.togglePanel());

    document.getElementById('closeChat')?.addEventListener('click', () => this.cerrarPanel());
    document.getElementById('backBtnChat')?.addEventListener('click', () => this.showList());
    document.getElementById('sendBtnChat')?.addEventListener('click', () => this.sendTextMessage());
    document.getElementById('emojiBtnChat')?.addEventListener('click', () => {
      document.getElementById('emojiPanelChat')?.classList.toggle('show');
    });
    document.getElementById('locationBtnChat')?.addEventListener('click', () => this.openMapToSend());
    document.getElementById('friendBtnChat')?.addEventListener('click', () => this.toggleFriend());
    document.getElementById('closeMapChat')?.addEventListener('click', () => this.cerrarMapa());
    document.getElementById('centerPinChat')?.addEventListener('click', () => this.centrarPin());
    document.getElementById('sendLocationChat')?.addEventListener('click', () => this.enviarUbicacion());

    const input = document.getElementById('chatInput');
    input?.addEventListener('keydown', (e) => {
      const isMobile = window.matchMedia('(pointer: coarse)').matches;
      if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
        e.preventDefault();
        this.sendTextMessage();
      }
    });
    input?.addEventListener('input', () => {
      input.style.height = '42px';
      input.style.height = Math.min(input.scrollHeight, 84) + 'px';
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

    this._initPinDrag();
    this.showList();
  },

  enlazarSocket(socket) {
    if (!socket || socket._chatOk) return;
    socket._chatOk = true;
    socket.on('chat:message', (msg) => this._recibirMensaje(msg));
  },

  togglePanel() {
    const panel = document.getElementById('chatPanel');
    if (!panel) return;
    if (!this._online()) {
      Notificaciones.mostrar('📡 Conéctate al servidor para usar el chat', 'alerta', 3500);
      return;
    }
    panel.classList.toggle('show');
    document.getElementById('btn-chat')?.classList.toggle('activo', panel.classList.contains('show'));
    if (panel.classList.contains('show')) {
      this.showList();
      this.refrescarConversaciones();
    }
  },

  cerrarPanel() {
    document.getElementById('chatPanel')?.classList.remove('show');
    document.getElementById('btn-chat')?.classList.remove('activo');
    document.getElementById('emojiPanelChat')?.classList.remove('show');
  },

  _jugadoresDisponibles() {
    const map = new Map();
    const yo = this._miId();

    if (typeof Amigos !== 'undefined') {
      for (const f of Amigos.friends || []) {
        if (Amigos.estaBloqueado(f.playerId)) continue;
        map.set(Number(f.playerId), {
          id: Number(f.playerId),
          name: f.name,
          online: !!f.online,
          friend: true
        });
      }
    }

    if (typeof Multijugador !== 'undefined' && Multijugador.online) {
      for (const p of Multijugador.online) {
        const id = Number(p.playerId);
        if (!id || id === yo) continue;
        if (typeof Amigos !== 'undefined' && Amigos.estaBloqueado(id)) continue;
        const prev = map.get(id);
        map.set(id, {
          id,
          name: p.name || prev?.name || ('Jugador ' + id),
          online: true,
          friend: prev?.friend || (typeof Amigos !== 'undefined' && Amigos.esAmigo(id))
        });
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
      createdAt: msg.createdAt || Date.now()
    };
  },

  _recibirMensaje(msg) {
    if (!msg) return;
    const yo = this._miId();
    const other = msg.fromPlayerId === yo ? msg.toPlayerId : msg.fromPlayerId;
    const normal = this._normalizarMsg(msg);
    if (!this.chats[other]) this.chats[other] = [];
    if (!this.chats[other].some(m => m.id === normal.id)) {
      this.chats[other].push(normal);
    }
    if (this.activePlayer !== other && msg.fromPlayerId !== yo) {
      this.unread[other] = (this.unread[other] || 0) + 1;
    }
    if (this.activePlayer === other) this.renderMessages();
    this.renderChatList();
    this._actualizarBadge();
    if (msg.fromPlayerId !== yo) {
      Notificaciones.mostrar('💬 ' + (msg.fromName || 'Jugador'), 'info', 2200);
    }
  },

  showList() {
    this.activePlayer = null;
    document.getElementById('chatView')?.classList.remove('show');
    document.getElementById('chatList')?.classList.add('show');
    document.getElementById('backBtnChat')?.classList.remove('show');
    document.getElementById('headerTitleChat').textContent = '💬 Chats';
    document.getElementById('chatSub') && (document.getElementById('chatSub').textContent = 'Jugadores en línea');
    document.getElementById('emojiPanelChat')?.classList.remove('show');
    this.renderChatList();
  },

  async openConversation(playerId) {
    this.activePlayer = Number(playerId);
    this.unread[this.activePlayer] = 0;
    document.getElementById('chatList')?.classList.remove('show');
    document.getElementById('chatView')?.classList.add('show');
    document.getElementById('backBtnChat')?.classList.add('show');

    const jug = this._jugadoresDisponibles().find(j => j.id === this.activePlayer);
    document.getElementById('headerTitleChat').textContent = jug?.name || ('Jugador ' + this.activePlayer);
    const sub = document.getElementById('chatSub');
    if (sub) sub.textContent = jug?.online ? '🟢 En línea' : '⚫ Desconectado';

    await this._cargarHistorial(this.activePlayer);
    this.updateFriendButton();
    this.renderMessages();
    this._actualizarBadge();
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
    if (!lista) return;
    const jugadores = this._jugadoresDisponibles();
    lista.innerHTML = '';

    if (!jugadores.length) {
      lista.innerHTML = '<div class="chat-vacio">No hay jugadores disponibles.<br>Conéctate al servidor y agrega amigos.</div>';
      return;
    }

    for (const j of jugadores) {
      const last = this._ultimoMensaje(j.id);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'chat-row';
      row.innerHTML =
        '<div class="avatar ' + (j.online ? 'online' : '') + '">🧍</div>' +
        '<div class="chat-row-info">' +
          '<div class="chat-row-name">' + this._esc(j.name) +
            (j.friend ? ' <span class="friend-mark">★</span>' : '') +
          '</div>' +
          '<div class="chat-row-last">' + this._esc(last.text) + '</div>' +
        '</div>' +
        '<div class="chat-row-meta">' +
          '<div class="chat-time">' + last.time + '</div>' +
          ((this.unread[j.id] || 0) > 0 ? '<div class="unread">' + this.unread[j.id] + '</div>' : '') +
        '</div>';
      row.addEventListener('click', () => this.openConversation(j.id));
      lista.appendChild(row);
    }
  },

  _ultimoMensaje(playerId) {
    const list = this.chats[playerId] || [];
    const last = list[list.length - 1];
    if (!last) return { text: 'Sin mensajes todavía', time: '' };
    const text = last.type === 'location' ? '📍 Ubicación enviada' : last.text;
    return { text, time: this._timeAgo(last.createdAt) };
  },

  renderMessages() {
    const cont = document.getElementById('messagesChat');
    if (!cont || !this.activePlayer) return;
    const list = this.chats[this.activePlayer] || [];
    cont.innerHTML = '';

    if (!list.length) {
      cont.innerHTML =
        '<div class="message other">' +
          '<div class="message-name">Sistema</div>' +
          '<div class="message-text">No hay mensajes todavía. Escribe o manda una ubicación 📍</div>' +
        '</div>';
      return;
    }

    list.forEach((msg, index) => {
      const div = document.createElement('div');
      div.className = 'message ' + msg.from;
      let html =
        '<div class="message-name">' + this._esc(msg.name) + '</div>' +
        '<div class="message-text">' + this._esc(msg.text) + '</div>';

      if (msg.type === 'location' && msg.location) {
        const pct = this._latLngAPorcentaje(msg.location.lat, msg.location.lng);
        html +=
          '<div class="location-card">' +
            '<div class="location-map" style="--px:' + pct.x + '%; --py:' + pct.y + '%;"></div>' +
            '<div class="location-info">📍 Pin de ' + this._esc(msg.location.playerId || ('JG-' + msg.fromPlayerId)) +
              ' · ' + msg.location.lat.toFixed(5) + ', ' + msg.location.lng.toFixed(5) +
            '</div>' +
            '<button type="button" class="pin-open-btn" data-index="' + index + '">Abrir pin en el mapa</button>' +
          '</div>';
      }

      html += '<div class="message-time">' + this._timeAgo(msg.createdAt) + '</div>';
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
      input.style.height = '42px';
    }
    document.getElementById('emojiPanelChat')?.classList.remove('show');
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
    Amigos.solicitar(this.activePlayer);
    this.updateFriendButton();
  },

  updateFriendButton() {
    const btn = document.getElementById('friendBtnChat');
    if (!btn || !this.activePlayer) return;
    const esAmigo = typeof Amigos !== 'undefined' && Amigos.esAmigo(this.activePlayer);
    btn.textContent = esAmigo ? '✓' : '＋';
    btn.classList.toggle('friend-added', esAmigo);
    btn.title = esAmigo ? 'Amigo agregado' : 'Agregar amigo';
  },

  openMapToSend() {
    if (!this.activePlayer) return;
    this.mapMode = 'send';
    document.getElementById('mapTitleChat').textContent = '📍 Enviar ubicación';
    document.getElementById('mapSubChat').textContent = 'Arrastra el pin y envíalo al jugador.';
    document.getElementById('sendLocationChat').textContent = 'Enviar pin';
    const base = typeof GPS !== 'undefined' && GPS.posicion
      ? GPS.posicion.slice()
      : CONFIG.centro.slice();
    this.pinPosition = { lat: base[0], lng: base[1] };
    this._actualizarPinModal();
    document.getElementById('mapModalChat')?.classList.add('show');
  },

  openReceivedPin(msg) {
    this.mapMode = 'reply';
    document.getElementById('mapTitleChat').textContent = '📍 Pin recibido';
    document.getElementById('mapSubChat').textContent = 'Puedes moverlo y reenviarlo.';
    document.getElementById('sendLocationChat').textContent = 'Reenviar pin';
    this.pinPosition = { lat: msg.location.lat, lng: msg.location.lng };
    this._actualizarPinModal();
    document.getElementById('mapModalChat')?.classList.add('show');
  },

  cerrarMapa() {
    document.getElementById('mapModalChat')?.classList.remove('show');
  },

  centrarPin() {
    const base = typeof GPS !== 'undefined' && GPS.posicion
      ? GPS.posicion.slice()
      : CONFIG.centro.slice();
    this.pinPosition = { lat: base[0], lng: base[1] };
    this._actualizarPinModal();
  },

  async enviarUbicacion() {
    if (!this.activePlayer || !this.pinPosition.lat) return;
    const ok = await this._enviar({
      toPlayerId: this.activePlayer,
      type: 'location',
      text: this.mapMode === 'reply' ? 'Te envié una nueva ubicación.' : 'Te envié una ubicación.',
      lat: +this.pinPosition.lat.toFixed(6),
      lng: +this.pinPosition.lng.toFixed(6)
    });
    if (ok) {
      this.cerrarMapa();
      this.renderMessages();
      this.renderChatList();
    }
  },

  _initPinDrag() {
    const pin = document.getElementById('pinChatDrag');
    const map = document.getElementById('dragMapChat');
    if (!pin || !map) return;

    const mover = (clientX, clientY) => {
      const rect = map.getBoundingClientRect();
      const x = Math.max(0.03, Math.min(0.97, (clientX - rect.left) / rect.width));
      const y = Math.max(0.08, Math.min(0.97, (clientY - rect.top) / rect.height));
      const [so, ne] = CONFIG.limites;
      const lat = ne[0] - y * (ne[0] - so[0]);
      const lng = so[1] + x * (ne[1] - so[1]);
      this.pinPosition = { lat: +lat.toFixed(6), lng: +lng.toFixed(6) };
      this._actualizarPinModal();
    };

    pin.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this._draggingPin = true;
      pin.setPointerCapture(e.pointerId);
    });
    pin.addEventListener('pointermove', (e) => {
      if (!this._draggingPin) return;
      mover(e.clientX, e.clientY);
    });
    pin.addEventListener('pointerup', () => { this._draggingPin = false; });
    map.addEventListener('pointerdown', (e) => {
      if (e.target === pin) return;
      mover(e.clientX, e.clientY);
    });
  },

  _actualizarPinModal() {
    const pin = document.getElementById('pinChatDrag');
    if (!pin || this.pinPosition.lat == null) return;
    const pct = this._latLngAPorcentaje(this.pinPosition.lat, this.pinPosition.lng);
    pin.style.left = pct.x + '%';
    pin.style.top = pct.y + '%';
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

  agregarPinMapa(lat, lng, etiqueta) {
    if (!Mapa.mapa || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const key = lat.toFixed(5) + ',' + lng.toFixed(5);
    if (!this._pinsMapa[key]) {
      const marcador = L.marker([lat, lng], {
        icon: L.divIcon({
          className: '',
          html: '<div class="pin-chat-mapa">📍</div>',
          iconSize: [32, 32],
          iconAnchor: [16, 28]
        })
      }).addTo(Mapa.mapa);
      marcador.on('click', () => this._activarPinMapa(key));
      this._pinsMapa[key] = { marcador, lat, lng, etiqueta: etiqueta || 'Ubicación' };
    }
    this._activarPinMapa(key);
    this.cerrarPanel();
    Notificaciones.mostrar('📍 Pin agregado al mapa — sigue la línea azul', 'exito', 3500);
  },

  _activarPinMapa(key) {
    this._pinActivo = key;
    this._actualizarLineaPin();
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
  },

  _actualizarBadge() {
    const badge = document.getElementById('badge-chat');
    if (!badge) return;
    const total = Object.values(this.unread).reduce((a, b) => a + (b || 0), 0);
    badge.textContent = total > 9 ? '9+' : String(total);
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
