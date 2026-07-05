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
    this._pintar();
    if (typeof Multijugador !== 'undefined') Multijugador._redibujar();
  },

  esAmigo(playerId) {
    return this.friendIds.has(Number(playerId));
  },

  estaBloqueado(playerId) {
    return this.blockedIds.has(Number(playerId));
  },

  iniciarUI() {
    const btn = document.getElementById('btn-amigos');
    if (btn) {
      btn.addEventListener('click', () => {
        document.getElementById('ventana-amigos').classList.remove('oculto');
        this.refrescar();
      });
    }
    const enviar = document.getElementById('btn-amigos-agregar');
    if (enviar) {
      enviar.addEventListener('click', () => this.solicitarPorNombre());
    }
    this._pintar();
  },

  async refrescar() {
    const base = this._base();
    if (!base || !this._token()) return;
    try {
      const r = await fetch(base + '/api/friends', { headers: this._headers() });
      const data = await r.json();
      if (data.ok) this.aplicarSocial(data);
    } catch (e) { /* sin red */ }
  },

  async solicitarPorNombre() {
    const input = document.getElementById('amigos-buscar');
    const nombre = (input?.value || '').trim();
    if (nombre.length < 2) {
      Notificaciones.mostrar('Escribe el nombre del jugador', 'alerta', 2500);
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
      Notificaciones.mostrar('📨 Solicitud enviada', 'exito', 2500);
      await this.refrescar();
    } catch (e) {
      Notificaciones.mostrar('Sin conexión al servidor', 'alerta', 3000);
    }
  },

  async aceptar(requestId) {
    await this._post('/api/friends/accept', { requestId }, '✅ Amigo agregado');
  },

  async rechazar(requestId) {
    await this._post('/api/friends/reject', { requestId }, 'Solicitud rechazada');
  },

  async eliminar(playerId) {
    const base = this._base();
    if (!base || !this._token()) return;
    try {
      const r = await fetch(base + '/api/friends/' + playerId, {
        method: 'DELETE',
        headers: this._headers()
      });
      const data = await r.json();
      if (data.ok) {
        Notificaciones.mostrar('Amigo eliminado de tu lista', 'info', 2500);
        await this.refrescar();
      }
    } catch (e) { /* */ }
  },

  async bloquear(playerId) {
    await this._post('/api/friends/block', { playerId }, '🚫 Jugador bloqueado');
  },

  async desbloquear(playerId) {
    const base = this._base();
    if (!base || !this._token()) return;
    try {
      await fetch(base + '/api/friends/block/' + playerId, {
        method: 'DELETE',
        headers: this._headers()
      });
      Notificaciones.mostrar('Bloqueo quitado', 'info', 2500);
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
    let btns = '';
    if (this.esAmigo(id)) {
      btns += '<button type="button" class="btn-amigo-mini" data-accion="quitar" data-id="' + id + '">Quitar amigo</button>';
    } else if (!this.pendingOut.some(r => Number(r.toPlayerId) === id)) {
      btns += '<button type="button" class="btn-amigo-mini" data-accion="agregar" data-id="' + id + '">Agregar amigo</button>';
    }
    if (this.estaBloqueado(id)) {
      btns += '<button type="button" class="btn-amigo-mini" data-accion="desbloquear" data-id="' + id + '">Desbloquear</button>';
    } else {
      btns += '<button type="button" class="btn-amigo-mini btn-amigo-peligro" data-accion="bloquear" data-id="' + id + '">Bloquear</button>';
    }
    return '<div class="popup-jugador"><b>' + (p.name || '?') + '</b><br>Nv ' + (p.level || 1) +
      '<div class="popup-jugador-btns">' + btns + '</div></div>';
  },

  manejarPopupClick(ev) {
    const btn = ev.target.closest('[data-accion]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const acc = btn.dataset.accion;
    if (acc === 'agregar') this.solicitar(id);
    else if (acc === 'quitar') this.eliminar(id);
    else if (acc === 'bloquear') this.bloquear(id);
    else if (acc === 'desbloquear') this.desbloquear(id);
  },

  _pintar() {
    const lista = document.getElementById('amigos-lista');
    if (!lista) return;

    let html = '';

    if (this.pendingIn.length) {
      html += '<div class="amigos-seccion-titulo">Solicitudes pendientes</div>';
      for (const r of this.pendingIn) {
        html += '<div class="amigos-fila">' +
          '<span>' + r.fromName + ' quiere ser tu amigo</span>' +
          '<span class="amigos-fila-btns">' +
          '<button type="button" class="btn-amigo-mini" data-amigo-aceptar="' + r.id + '">Aceptar</button>' +
          '<button type="button" class="btn-amigo-mini btn-amigo-peligro" data-amigo-rechazar="' + r.id + '">Rechazar</button>' +
          '</span></div>';
      }
    }

    html += '<div class="amigos-seccion-titulo">Mis amigos</div>';
    if (!this.friends.length) {
      html += '<p class="amigos-vacio">Aún no tienes amigos. Agrégalos desde el mapa o por nombre.</p>';
    }
    for (const f of this.friends) {
      const on = f.online ? '🟢 En línea' : '⚫ Desconectado';
      html += '<div class="amigos-fila">' +
        '<span><b>' + f.name + '</b> · Nv ? · ' + on + '</span>' +
        '<span class="amigos-fila-btns">' +
        '<button type="button" class="btn-amigo-mini btn-amigo-peligro" data-amigo-quitar="' + f.playerId + '">Quitar</button>' +
        '<button type="button" class="btn-amigo-mini btn-amigo-peligro" data-amigo-bloquear="' + f.playerId + '">Bloquear</button>' +
        '</span></div>';
    }

    if (this.blocked.length) {
      html += '<div class="amigos-seccion-titulo">Bloqueados</div>';
      for (const b of this.blocked) {
        html += '<div class="amigos-fila">' +
          '<span>' + b.name + '</span>' +
          '<button type="button" class="btn-amigo-mini" data-amigo-desbloquear="' + b.playerId + '">Desbloquear</button>' +
          '</div>';
      }
    }

    lista.innerHTML = html;

    lista.querySelectorAll('[data-amigo-aceptar]').forEach(el => {
      el.onclick = () => this.aceptar(Number(el.dataset.amigoAceptar));
    });
    lista.querySelectorAll('[data-amigo-rechazar]').forEach(el => {
      el.onclick = () => this.rechazar(Number(el.dataset.amigoRechazar));
    });
    lista.querySelectorAll('[data-amigo-quitar]').forEach(el => {
      el.onclick = () => this.eliminar(Number(el.dataset.amigoQuitar));
    });
    lista.querySelectorAll('[data-amigo-bloquear]').forEach(el => {
      el.onclick = () => this.bloquear(Number(el.dataset.amigoBloquear));
    });
    lista.querySelectorAll('[data-amigo-desbloquear]').forEach(el => {
      el.onclick = () => this.desbloquear(Number(el.dataset.amigoDesbloquear));
    });

    const badge = document.getElementById('badge-amigos');
    if (badge) {
      if (this.pendingIn.length) {
        badge.textContent = String(this.pendingIn.length);
        badge.classList.remove('oculto');
      } else {
        badge.classList.add('oculto');
      }
    }
  }
};
