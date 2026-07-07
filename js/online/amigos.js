/**
 * Amigos — solicitudes, lista, bloqueos (servidor Render).
 */
const Amigos = {
  friends: [],
  pendingIn: [],
  pendingOut: [],
  blocked: [],
  friendIds: new Set(),
  blockedIds: new Set(),
  _socialCacheKey: 'mariel_amigos_social_v1',
  _marcadosKey: 'mariel_amigos_pin',
  _favKey: 'mariel_amigos_fav',
  _marcados: new Set(),
  _favoritos: new Set(),
  _filtro: '',
  _toastTimer: null,
  _confirmPending: null,

  _cargarMarcados() {
    try {
      const raw = localStorage.getItem(this._marcadosKey);
      if (raw) {
        const ids = JSON.parse(raw).map(Number).filter(Boolean);
        this._marcados = new Set(ids.length ? [ids[0]] : []);
      }
    } catch (e) { this._marcados = new Set(); }
    try {
      const fav = JSON.parse(localStorage.getItem(this._favKey) || '[]');
      this._favoritos = new Set((fav || []).map(Number).filter(Boolean));
    } catch (e) { this._favoritos = new Set(); }
  },

  _guardarMarcados() {
    const ids = [...this._marcados];
    localStorage.setItem(this._marcadosKey, JSON.stringify(ids.length ? [ids[0]] : []));
  },

  _guardarFavoritos() {
    localStorage.setItem(this._favKey, JSON.stringify([...this._favoritos]));
  },

  esFavorito(playerId) { return this._favoritos.has(Number(playerId)); },

  toggleFavorito(playerId) {
    const id = Number(playerId);
    if (this._favoritos.has(id)) this._favoritos.delete(id);
    else this._favoritos.add(id);
    this._guardarFavoritos();
    this._pintar();
    const nombre = this.friends.find(f => Number(f.playerId) === id)?.name || 'amigo';
    this._toast(this._favoritos.has(id) ? '⭐ ' + nombre + ' favorito' : 'Quitado de favoritos');
  },

  obtenerMarcados() { return this._marcados; },

  esMarcado(playerId) { return this._marcados.has(Number(playerId)); },

  _avatarEmoji(name) {
    const emojis = ['🧔', '🧢', '🐺', '🥷', '🧍', '👤', '🎮', '🦊', '🐉'];
    let h = 0;
    const n = String(name || '?');
    for (let i = 0; i < n.length; i++) h = (h + n.charCodeAt(i)) % emojis.length;
    return emojis[h];
  },

  _esc(text) {
    return String(text)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  },

  _toast(text) {
    const t = document.getElementById('amigos-toast');
    if (!t) {
      Notificaciones.mostrar(text, 'info', 1800);
      return;
    }
    t.textContent = text;
    t.classList.remove('oculto');
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      t.classList.remove('show');
      t.classList.add('oculto');
    }, 1800);
  },

  _estaMuertoEnMapa(f) {
    const pid = Number(f.playerId);
    if (typeof Multijugador === 'undefined') return false;
    const online = Multijugador.online?.find(p => Number(p.playerId) === pid);
    if (online && Multijugador._estaMuerto(online)) return true;
    return !!(Multijugador.cuerpos && Multijugador.cuerpos[String(pid)]);
  },

  _estaEnMapa(f) {
    if (this._estaMuertoEnMapa(f)) return true;
    if (typeof Multijugador === 'undefined' || !Multijugador.online?.length) return false;
    const pid = Number(f.playerId);
    const nombre = (f.name || '').trim().toLowerCase();
    return Multijugador.online.some(p =>
      Number(p.playerId) === pid ||
      (p.name || '').trim().toLowerCase() === nombre
    );
  },

  _estadoAmigo(f) {
    if (this._estaMuertoEnMapa(f)) {
      return { texto: '💀 Muerto · ataúd en mapa', enMapa: true, muerto: true, online: true };
    }
    const enMapa = this._estaEnMapa(f);
    if (enMapa) return { texto: 'En el mapa', enMapa: true, online: true };
    if (f.online) return { texto: 'En línea', enMapa: false, online: true };
    return { texto: 'Desconectado', enMapa: false, online: false };
  },

  _puedePin(f) {
    const e = this._estadoAmigo(f);
    return e.enMapa || e.online;
  },

  _puedeChat(f) {
    return this._estadoAmigo(f).online || this._estaEnMapa(f);
  },

  toggleMarcar(playerId) {
    const id = Number(playerId);
    if (this._marcados.has(id)) {
      this._marcados.delete(id);
    } else {
      this._marcados.clear();
      this._marcados.add(id);
    }
    this._guardarMarcados();
    this._pintar();
    if (typeof Multijugador !== 'undefined') {
      Multijugador._actualizarLineasAmigo();
      Multijugador._redibujar(false);
    }
    const nombre = this.friends.find(f => Number(f.playerId) === id)?.name || 'amigo';
    if (this._marcados.has(id)) {
      this._toast(this._estaMuertoEnMapa({ playerId: id })
        ? 'Pin hacia ataúd de ' + nombre
        : 'Pin de ' + nombre + ' marcado en el mapa');
    } else {
      this._toast('Pin desmarcado');
    }
  },

  abrirChat(playerId) {
    const id = Number(playerId);
    this.cerrar();
    if (typeof Chat === 'undefined') return;
    if (!Chat._online()) {
      Notificaciones.mostrar('📡 Conéctate al servidor para chatear', 'alerta', 3000);
      return;
    }
    const nombre = this.friends.find(f => Number(f.playerId) === id)?.name;
    Chat.marcarContacto(id, nombre);
    Chat.openConversation(id);
    this._toast('Chat con ' + (nombre || 'jugador'));
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

  aplicarSocial(data) {
    if (!data) return;
    this.friends = data.friends || [];
    this.pendingIn = data.pendingIn || [];
    this.pendingOut = data.pendingOut || [];
    this.blocked = data.blocked || [];
    this.friendIds = new Set((data.friendIds || this.friends.map(f => f.playerId)).map(Number));
    this.blockedIds = new Set((data.blockedIds || this.blocked.map(b => b.playerId)).map(Number));
    try {
      if ((data.friends || []).length || (data.pendingIn || []).length) {
        localStorage.setItem(this._socialCacheKey, JSON.stringify(data));
      }
    } catch (e) { /* */ }
    this._pintar();
    if (typeof Chat !== 'undefined') {
      if (Chat.activePlayer) Chat.updateFriendButton();
      Chat.renderChatList();
    }
    if (typeof Multijugador !== 'undefined') {
      Multijugador._actualizarLineasAmigo();
      Multijugador._redibujar(false);
    }
  },

  esAmigo(playerId) {
    return this.friendIds.has(Number(playerId));
  },

  estaBloqueado(playerId) {
    return this.blockedIds.has(Number(playerId));
  },

  abrir() {
    const ventana = document.getElementById('ventana-amigos');
    if (!ventana) return;
    ventana.classList.remove('oculto');
    ventana.style.zIndex = '5600';
    this.refrescar();
  },

  cerrar() {
    document.getElementById('ventana-amigos')?.classList.add('oculto');
  },

  iniciarUI() {
    const enlazar = () => {
      const btn = document.getElementById('btn-amigos');
      if (!btn || btn.dataset.amigosOk) return false;
      btn.dataset.amigosOk = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.abrir();
      });
      document.getElementById('cerrar-amigos')?.addEventListener('click', () => this.cerrar());
      return true;
    };

    if (!this._uiLista) {
      this._uiLista = true;
      this._cargarMarcados();
    }
    this._cargarSocialCache();
    if (!enlazar()) {
      document.addEventListener('DOMContentLoaded', () => enlazar(), { once: true });
    }

    if (this._uiCompleta) return;
    this._uiCompleta = true;

    const enviar = document.getElementById('btn-amigos-agregar');
    if (enviar) enviar.addEventListener('click', () => this.solicitarPorNombre());

    document.getElementById('amigos-buscar')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.solicitarPorNombre();
    });

    document.getElementById('amigos-buscar-filtro')?.addEventListener('input', (e) => {
      this._filtro = (e.target.value || '').trim().toLowerCase();
      this._pintar();
    });

    document.getElementById('amigos-confirm-cancel')?.addEventListener('click', () => this._cerrarConfirm());
    document.getElementById('amigos-confirm-ok')?.addEventListener('click', () => this._aceptarConfirm());

    document.addEventListener('click', () => this._cerrarMenus());

    const panel = document.querySelector('#ventana-amigos .friends-panel');
    panel?.addEventListener('click', (e) => e.stopPropagation());

    this._pintar();
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

  _actualizarBadgeAmigos() {
    const badge = document.getElementById('badge-amigos');
    if (!badge) return;
    const n = this.pendingIn.length;
    if (n > 0) {
      badge.textContent = this._contadorGlobo(n);
      badge.classList.remove('oculto');
    } else {
      badge.classList.add('oculto');
    }
  },

  _cerrarMenus() {
    document.querySelectorAll('#ventana-amigos .pop-menu.show').forEach(m => m.classList.remove('show'));
  },

  _pedirConfirm(titulo, texto, accion) {
    this._confirmPending = accion;
    const ov = document.getElementById('amigos-overlay');
    const t = document.getElementById('amigos-confirm-title');
    const p = document.getElementById('amigos-confirm-text');
    if (t) t.textContent = titulo;
    if (p) p.textContent = texto;
    ov?.classList.remove('oculto');
  },

  _cerrarConfirm() {
    this._confirmPending = null;
    document.getElementById('amigos-overlay')?.classList.add('oculto');
  },

  async _aceptarConfirm() {
    const fn = this._confirmPending;
    this._cerrarConfirm();
    if (typeof fn === 'function') await fn();
  },

  _cargarSocialCache() {
    if (this.friends.length) return;
    try {
      const raw = localStorage.getItem(this._socialCacheKey);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data?.friends?.length) this.aplicarSocial(data);
    } catch (e) { /* */ }
  },

  async refrescar() {
    const base = this._base();
    if (!base || !this._token()) {
      this._cargarSocialCache();
      return;
    }
    try {
      const r = await fetch(base + '/api/friends', { headers: this._headers() });
      const data = await r.json();
      if (data.ok) {
        this.aplicarSocial(data);
        return;
      }
    } catch (e) { /* sin red */ }
    this._cargarSocialCache();
  },

  async solicitarPorNombre() {
    const input = document.getElementById('amigos-buscar');
    const nombre = (input?.value || '').trim();
    if (nombre.length < 2) {
      this._toast('Escribe el nombre del jugador');
      return;
    }
    const existe = this.friends.some(f =>
      (f.name || '').trim().toLowerCase() === nombre.toLowerCase()
    );
    if (existe) {
      this._toast('Ese jugador ya está en amigos');
      return;
    }
    await this.solicitar(null, nombre);
    if (input) input.value = '';
  },

  async solicitar(playerId, username) {
    const base = this._base();
    if (!base || !this._token()) return;
    try {
      const body = playerId ? { playerId } : { username };
      const r = await fetch(base + '/api/friends/request', {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(body)
      });
      const data = await r.json();
      if (!data.ok) {
        Notificaciones.mostrar(data.error || 'No se pudo enviar', 'alerta', 3000);
        return;
      }
      this._toast('📨 Solicitud enviada');
      await this.refrescar();
    } catch (e) {
      Notificaciones.mostrar('Sin conexión al servidor', 'alerta', 3000);
    }
  },

  async aceptar(requestId) {
    await this._post('/api/friends/accept', { requestId }, '✅ Amigo agregado');
    this._toast('Amigo agregado');
  },

  async rechazar(requestId) {
    await this._post('/api/friends/reject', { requestId }, 'Solicitud rechazada');
    this._toast('Solicitud rechazada');
  },

  async eliminar(playerId) {
    const id = Number(playerId);
    const nombre = this.friends.find(f => Number(f.playerId) === id)?.name || 'Jugador';
    this._pedirConfirm(
      '¿Eliminar amigo?',
      '¿Seguro que quieres eliminar a ' + nombre + ' de tus amigos?',
      async () => {
        if (this._marcados.has(id)) {
          this._marcados.delete(id);
          this._guardarMarcados();
          if (typeof Multijugador !== 'undefined') Multijugador._actualizarLineasAmigo();
        }
        const base = this._base();
        if (!base || !this._token()) return;
        try {
          const r = await fetch(base + '/api/friends/' + playerId, {
            method: 'DELETE',
            headers: this._headers()
          });
          const data = await r.json();
          if (data.ok) {
            this._toast(nombre + ' eliminado');
            await this.refrescar();
          }
        } catch (e) { /* */ }
      }
    );
  },

  async bloquear(playerId) {
    const id = Number(playerId);
    const nombre = this.friends.find(f => Number(f.playerId) === id)?.name || 'Jugador';
    this._pedirConfirm(
      '¿Bloquear jugador?',
      'No podrás recibir mensajes ni invitaciones de ' + nombre + '.',
      async () => {
        await this._post('/api/friends/block', { playerId }, '🚫 Jugador bloqueado');
        this._toast(nombre + ' bloqueado');
      }
    );
  },

  async desbloquear(playerId) {
    const base = this._base();
    if (!base || !this._token()) return;
    try {
      await fetch(base + '/api/friends/block/' + playerId, {
        method: 'DELETE',
        headers: this._headers()
      });
      this._toast('Bloqueo quitado');
      await this.refrescar();
    } catch (e) { /* */ }
  },

  async _post(path, body, okMsg) {
    const base = this._base();
    if (!base || !this._token()) return;
    try {
      const r = await fetch(base + path, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(body)
      });
      const data = await r.json();
      if (data.ok) {
        if (okMsg) Notificaciones.mostrar(okMsg, 'exito', 2500);
        await this.refrescar();
      } else {
        Notificaciones.mostrar(data.error || 'Error', 'alerta', 3000);
      }
    } catch (e) {
      Notificaciones.mostrar('Sin conexión', 'alerta', 3000);
    }
  },

  popupHtml(p) {
    const id = Number(p.playerId);
    const nombre = this._esc(p.name || '?');
    const nivel = p.level || 1;
    const hp = p.hp != null ? Math.round(p.hp) : null;
    const hpMax = Math.max(1, p.hpMax || 100);
    let principal = '';
    let secundario = '';

    const btnChat = this.estaBloqueado(id) ? '' :
      '<button type="button" class="popup-jugador-amigo-btn" data-accion="chatear" data-id="' + id +
      '">💬 Chatear</button>';

    if (this.esAmigo(id)) {
      const marcado = this.esMarcado(id);
      principal = btnChat +
        '<button type="button" class="popup-jugador-amigo-btn' + (marcado ? ' activo' : '') +
        '" data-accion="marcar" data-id="' + id + '">' +
        (marcado ? '📍 Pin en mapa' : '📍 Marcar en mapa') + '</button>';
    } else if (this.pendingOut.some(r => Number(r.toPlayerId) === id)) {
      principal = btnChat + '<div class="popup-jugador-pendiente">⏳ Solicitud enviada</div>';
    } else if (this.estaBloqueado(id)) {
      principal =
        '<button type="button" class="popup-jugador-amigo-btn secundario" data-accion="desbloquear" data-id="' + id + '">' +
        'Desbloquear jugador</button>';
    } else {
      principal = btnChat;
      secundario =
        '<button type="button" class="popup-jugador-amigo-btn secundario" data-accion="agregar" data-id="' + id + '">' +
        '👥 Agregar amigo</button>';
    }

    const vidaTxt = hp != null
      ? '<span class="popup-jugador-vida">❤️ ' + hp + '/' + hpMax + '</span>'
      : '';

    return '<div class="popup-jugador">' +
      '<div class="popup-jugador-nombre">' + nombre + '</div>' +
      '<div class="popup-jugador-meta"><span>Nv ' + nivel + '</span>' + vidaTxt + '</div>' +
      '<div class="popup-jugador-acciones">' + principal + secundario + '</div>' +
      '</div>';
  },

  manejarPopupClick(ev) {
    const btn = ev.target.closest('[data-accion]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const acc = btn.dataset.accion;
    if (acc === 'chatear') {
      let nombre = '';
      if (typeof Multijugador !== 'undefined' && Multijugador.online) {
        const p = Multijugador.online.find(x => Number(x.playerId) === id);
        nombre = p?.name || '';
      }
      if (typeof Chat !== 'undefined') Chat.abrirDesdeMapa(id, nombre);
      return;
    }
    if (acc === 'agregar') this.solicitar(id);
    else if (acc === 'marcar') this.toggleMarcar(id);
    else if (acc === 'quitar') this.eliminar(id);
    else if (acc === 'bloquear') this.bloquear(id);
    else if (acc === 'desbloquear') this.desbloquear(id);
  },

  _pintarTarjetaAmigo(f) {
    const id = Number(f.playerId);
    const estado = this._estadoAmigo(f);
    const marcado = this.esMarcado(id);
    const fav = this.esFavorito(id);
    const puedePin = this._puedePin(f);
    const puedeChat = this._puedeChat(f);
    const clases = ['friend-card'];
    if (estado.online) clases.push('online');
    if (marcado) clases.push('pin-activo');

    const statusCls = estado.online && !estado.muerto ? '' : ' offline';

    return '<div class="' + clases.join(' ') + '" data-amigo-id="' + id + '">' +
      '<div class="avatar">' + this._avatarEmoji(f.name) +
        '<span class="status-dot"></span></div>' +
      '<div class="friend-info">' +
        '<div class="friend-name">' + this._esc(f.name) + (fav ? ' ⭐' : '') + '</div>' +
        '<div class="friend-status' + statusCls + '">' + this._esc(estado.texto) +
          (marcado ? ' · 📍 Marcado' : '') + '</div>' +
      '</div>' +
      '<div class="actions">' +
        '<button type="button" class="friend-action chat"' +
          (puedeChat ? '' : ' disabled') + ' data-amigo-chat="' + id + '" title="Chat">💬</button>' +
        '<button type="button" class="friend-action pin' + (marcado ? ' activo' : '') + '"' +
          (puedePin ? '' : ' disabled') + ' data-amigo-pin="' + id + '" title="Ver pin">📍</button>' +
        '<button type="button" class="friend-action more" data-amigo-menu="' + id + '" title="Más">⋮</button>' +
      '</div>' +
      '<div class="pop-menu" data-menu-for="' + id + '">' +
        '<div class="menu-item invite" data-amigo-invite="' + id + '">👥 Invitar grupo</div>' +
        '<div class="menu-item fav' + (fav ? ' fav-activo' : '') + '" data-amigo-fav="' + id + '">⭐ Favorito</div>' +
        '<div class="menu-item block danger" data-amigo-block="' + id + '">🚫 Bloquear</div>' +
        '<div class="menu-item remove danger" data-amigo-quitar="' + id + '">🗑️ Eliminar</div>' +
      '</div></div>';
  },

  _enlazarTarjetas(contenedor) {
    if (!contenedor) return;
    contenedor.querySelectorAll('[data-amigo-pin]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        if (el.disabled) return;
        this.toggleMarcar(Number(el.dataset.amigoPin));
      };
    });
    contenedor.querySelectorAll('[data-amigo-chat]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        if (el.disabled) return;
        this.abrirChat(Number(el.dataset.amigoChat));
      };
    });
    contenedor.querySelectorAll('[data-amigo-menu]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        const id = el.dataset.amigoMenu;
        const menu = contenedor.querySelector('[data-menu-for="' + id + '"]');
        if (!menu) return;
        const abierto = menu.classList.contains('show');
        this._cerrarMenus();
        if (!abierto) menu.classList.add('show');
      };
    });
    contenedor.querySelectorAll('[data-amigo-quitar]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        this._cerrarMenus();
        this.eliminar(Number(el.dataset.amigoQuitar));
      };
    });
    contenedor.querySelectorAll('[data-amigo-block]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        this._cerrarMenus();
        this.bloquear(Number(el.dataset.amigoBlock));
      };
    });
    contenedor.querySelectorAll('[data-amigo-fav]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        this._cerrarMenus();
        this.toggleFavorito(Number(el.dataset.amigoFav));
      };
    });
    contenedor.querySelectorAll('[data-amigo-invite]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        this._cerrarMenus();
        const nombre = this.friends.find(f => Number(f.playerId) === Number(el.dataset.amigoInvite))?.name || 'amigo';
        this._toast('Invitación a grupo — ' + nombre + ' (próximamente)');
      };
    });
    contenedor.querySelectorAll('[data-amigo-aceptar]').forEach(el => {
      el.onclick = () => this.aceptar(Number(el.dataset.amigoAceptar));
    });
    contenedor.querySelectorAll('[data-amigo-rechazar]').forEach(el => {
      el.onclick = () => this.rechazar(Number(el.dataset.amigoRechazar));
    });
    contenedor.querySelectorAll('[data-amigo-desbloquear]').forEach(el => {
      el.onclick = () => this.desbloquear(Number(el.dataset.amigoDesbloquear));
    });
  },

  _pintar() {
    const lista = document.getElementById('amigos-lista');
    const pendientes = document.getElementById('amigos-pendientes');
    const bloqueados = document.getElementById('amigos-bloqueados');
    const contador = document.getElementById('amigos-count');
    if (!lista) return;

    if (contador) {
      contador.textContent = this.friends.length + (this.friends.length === 1 ? ' amigo' : ' amigos');
    }

    if (pendientes) {
      if (this.pendingIn.length) {
        pendientes.classList.remove('oculto');
        let html = '<div class="amigos-pendientes-titulo">SOLICITUDES PENDIENTES (' + this.pendingIn.length + ')</div>';
        for (const r of this.pendingIn) {
          html += '<div class="friend-card pendiente">' +
            '<div class="avatar">' + this._avatarEmoji(r.fromName) + '</div>' +
            '<div class="friend-info"><div class="friend-name">' + this._esc(r.fromName) + '</div>' +
            '<div class="friend-status offline">Quiere ser tu amigo</div></div>' +
            '<div class="actions">' +
            '<button type="button" class="friend-action aceptar" data-amigo-aceptar="' + r.id + '">Aceptar</button>' +
            '<button type="button" class="friend-action rechazar" data-amigo-rechazar="' + r.id + '">Rechazar</button>' +
            '</div></div>';
        }
        pendientes.innerHTML = html;
        this._enlazarTarjetas(pendientes);
      } else {
        pendientes.classList.add('oculto');
        pendientes.innerHTML = '';
      }
    }

    const filtro = this._filtro;
    const amigosFiltrados = this.friends.filter(f =>
      !filtro || (f.name || '').toLowerCase().includes(filtro)
    );

    lista.innerHTML = '';
    if (!amigosFiltrados.length) {
      lista.innerHTML = '<div class="friend-card"><div class="avatar">?</div><div class="friend-info">' +
        '<div class="friend-name">' +
          (filtro ? 'Sin resultados' : 'Sin amigos todavía') +
        '</div><div class="friend-status offline">' +
          (filtro ? 'No encontré ningún amigo con ese nombre.' : 'Agrégalos por nombre o desde el mapa.') +
        '</div></div></div>';
    } else {
      for (const f of amigosFiltrados) {
        lista.insertAdjacentHTML('beforeend', this._pintarTarjetaAmigo(f));
      }
      this._enlazarTarjetas(lista);
    }

    if (bloqueados) {
      if (this.blocked.length) {
        bloqueados.classList.remove('oculto');
        let html = '<div class="amigos-bloqueados-titulo">BLOQUEADOS</div>';
        for (const b of this.blocked) {
          html += '<div class="amigos-bloqueado-fila">' +
            '<span>' + this._esc(b.name) + '</span>' +
            '<button type="button" class="friend-action aceptar" data-amigo-desbloquear="' + b.playerId + '">Desbloquear</button>' +
            '</div>';
        }
        bloqueados.innerHTML = html;
        this._enlazarTarjetas(bloqueados);
      } else {
        bloqueados.classList.add('oculto');
        bloqueados.innerHTML = '';
      }
    }

    this._actualizarBadgeAmigos();
  },

  _pintarSiAbierto() {
    const ventana = document.getElementById('ventana-amigos');
    if (ventana && !ventana.classList.contains('oculto')) this._pintar();
  }
};
