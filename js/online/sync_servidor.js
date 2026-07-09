/**
 * Publica el mundo del admin al servidor Render (fuente única de verdad).
 */
const SyncServidor = {
  TOKEN_KEY: 'mariel_online_token',
  SESION_PERFIL_KEY: 'mariel_online_perfil_id',
  SESION_PLAYER_KEY: 'mariel_online_player_id',

  _getToken() {
    try {
      return localStorage.getItem(this.TOKEN_KEY) || '';
    } catch (e) {
      return '';
    }
  },

  puedePublicar() {
    const base = typeof MarielRed !== 'undefined' ? MarielRed.urlServidor() : (CONFIG.servidorOnline || '').replace(/\/$/, '');
    return !!(base && this._getToken());
  },

  _base() {
    if (typeof MarielRed !== 'undefined') return MarielRed.urlServidor();
    return (CONFIG.servidorOnline || '').replace(/\/$/, '');
  },

  _clavesGuardadas() {
    const claves = [];
    try {
      const s = sessionStorage.getItem('mariel_clave_servidor');
      if (s) claves.push(s);
    } catch (e) { /* */ }
    if (typeof Usuarios !== 'undefined' && Usuarios.perfilActivo?.id) {
      try {
        const p = localStorage.getItem('mariel_clave_' + Usuarios.perfilActivo.id);
        if (p) claves.push(p);
      } catch (e1) { /* */ }
    }
    if (typeof Usuarios !== 'undefined' && Usuarios.esAdministrador && Usuarios.esAdministrador()) {
      try {
        const dev = localStorage.getItem('mariel_dev_clave_randy');
        if (dev) claves.push(dev);
        const adm = localStorage.getItem('mariel_dev_clave_admin');
        if (adm) claves.push(adm);
      } catch (e2) { /* */ }
    }
    return [...new Set(claves.filter(Boolean))];
  },

  _usuariosLogin() {
    const nombres = [];
    if (typeof Usuarios !== 'undefined' && Usuarios.perfilActivo?.nombre) {
      nombres.push(Usuarios.perfilActivo.nombre);
    }
    if (typeof Usuarios !== 'undefined' && Usuarios.esAdministrador && Usuarios.esAdministrador()) {
      const p = Usuarios.perfilActivo;
      const nom = String(p?.nombre || '').trim().toLowerCase();
      const adm = String(CONFIG.adminNombre || '').trim().toLowerCase();
      const alias = (CONFIG.adminAlias || []).map(a => String(a).toLowerCase());
      const adminId = CONFIG.adminId || 'pmr7x4zhznzw5o';
      const esCuentaAdmin = p?.id === adminId || nom === adm || alias.includes(nom);
      if (esCuentaAdmin) {
        if (CONFIG.adminNombre) nombres.push(CONFIG.adminNombre);
        for (const a of (CONFIG.adminAlias || [])) nombres.push(a);
      }
    }
    return [...new Set(nombres.map(n => String(n || '').trim()).filter(Boolean))];
  },

  _tokenPayload() {
    try {
      const t = this._getToken();
      if (!t) return null;
      return JSON.parse(atob(t.split('.')[1]));
    } catch (e) {
      return null;
    }
  },

  marcarSesionOnline(datos) {
    if (!datos) return;
    try {
      if (datos.perfilId) localStorage.setItem(this.SESION_PERFIL_KEY, String(datos.perfilId));
      if (datos.playerId != null) localStorage.setItem(this.SESION_PLAYER_KEY, String(datos.playerId));
    } catch (e) { /* */ }
  },

  limpiarSesionOnline() {
    try {
      localStorage.removeItem(this.TOKEN_KEY);
      localStorage.removeItem(this.SESION_PERFIL_KEY);
      localStorage.removeItem(this.SESION_PLAYER_KEY);
    } catch (e) { /* */ }
    if (typeof Multijugador !== 'undefined') {
      if (Multijugador.socket) {
        try {
          Multijugador.socket.removeAllListeners();
          Multijugador.socket.disconnect();
        } catch (e) { /* */ }
      }
      Multijugador.socket = null;
      Multijugador.activo = false;
    }
  },

  tokenCoincideConPerfilSync() {
    if (!this.puedePublicar() || typeof Usuarios === 'undefined' || !Usuarios.perfilActivo) {
      return false;
    }
    const perfil = Usuarios.perfilActivo;
    const payload = this._tokenPayload();
    if (!payload?.playerId) return false;

    const guardadoPerfilId = localStorage.getItem(this.SESION_PERFIL_KEY);
    const guardadoPlayerId = localStorage.getItem(this.SESION_PLAYER_KEY);
    if (guardadoPerfilId && guardadoPlayerId) {
      return guardadoPerfilId === perfil.id &&
        Number(guardadoPlayerId) === Number(payload.playerId);
    }

    const nombrePerfil = String(perfil.nombre || '').trim().toLowerCase();
    const nombreToken = String(payload.username || '').trim().toLowerCase();
    return perfil.id === 'srv_' + payload.playerId &&
      nombrePerfil && nombreToken && nombrePerfil === nombreToken;
  },

  async tokenCoincideConPerfil() {
    if (this.tokenCoincideConPerfilSync()) return true;
    if (!this.puedePublicar() || typeof Usuarios === 'undefined' || !Usuarios.perfilActivo) {
      return false;
    }
    const perfil = Usuarios.perfilActivo;
    const payload = this._tokenPayload();
    if (!payload?.playerId) return false;

    const base = this._base();
    if (!base) return false;
    try {
      const r = await Utilidades.fetchConTimeout(base + '/api/player/me', {
        headers: { Authorization: 'Bearer ' + this._getToken() },
        cache: 'no-store'
      }, 12000);
      if (!r.ok) return false;
      const data = await r.json().catch(() => ({}));
      const nombreSrv = String(data.player?.name || '').trim().toLowerCase();
      const nombrePerfil = String(perfil.nombre || '').trim().toLowerCase();
      if (!nombreSrv || nombreSrv !== nombrePerfil) return false;
      this.marcarSesionOnline({ perfilId: perfil.id, playerId: payload.playerId });
      return true;
    } catch (e) {
      return false;
    }
  },

  guardarClavePerfil(perfilId, clave) {
    if (!perfilId || !clave) return;
    try {
      sessionStorage.setItem('mariel_clave_servidor', clave);
      localStorage.setItem('mariel_clave_' + perfilId, clave);
      if (typeof Usuarios !== 'undefined' && Usuarios.esAdministrador && Usuarios.esAdministrador()) {
        localStorage.setItem('mariel_dev_clave_admin', clave);
        const nom = String(Usuarios.perfilActivo?.nombre || '').toLowerCase();
        if (nom === 'randy' || nom === 'soycaos') {
          localStorage.setItem('mariel_dev_clave_randy', clave);
        }
      }
    } catch (e) { /* */ }
  },

  /** Modal en pantalla (prompt() no funciona bien en móvil/PWA). */
  _pedirClaveModal(usuario) {
    return new Promise((resolve) => {
      const existente = document.getElementById('sync-servidor-overlay');
      if (existente) existente.remove();

      const overlay = document.createElement('div');
      overlay.id = 'sync-servidor-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:99999', 'background:rgba(0,0,0,.72)',
        'display:flex', 'align-items:center', 'justify-content:center', 'padding:16px'
      ].join(';');

      const caja = document.createElement('div');
      caja.style.cssText = [
        'background:#1e2630', 'color:#f0f4f8', 'border-radius:14px', 'padding:20px',
        'max-width:340px', 'width:100%', 'box-shadow:0 8px 32px rgba(0,0,0,.45)',
        'font-family:system-ui,sans-serif'
      ].join(';');

      const titulo = document.createElement('h3');
      titulo.textContent = 'Conectar al servidor';
      titulo.style.cssText = 'margin:0 0 8px;font-size:1.05rem';

      const texto = document.createElement('p');
      texto.textContent = 'Escribe la contraseña de ' + (usuario || 'tu cuenta') + ' para guardar el mapa en el servidor:';
      texto.style.cssText = 'margin:0 0 14px;font-size:.9rem;line-height:1.4;color:#b8c4d0';

      const input = document.createElement('input');
      input.type = 'password';
      input.autocomplete = 'current-password';
      input.placeholder = 'Contraseña';
      input.style.cssText = [
        'width:100%', 'box-sizing:border-box', 'padding:12px', 'border-radius:8px',
        'border:1px solid #3a4a5c', 'background:#0f1419', 'color:#fff', 'font-size:16px',
        'margin-bottom:14px'
      ].join(';');

      const fila = document.createElement('div');
      fila.style.cssText = 'display:flex;gap:10px';

      const btnCancel = document.createElement('button');
      btnCancel.type = 'button';
      btnCancel.textContent = 'Cancelar';
      btnCancel.style.cssText = 'flex:1;padding:12px;border:none;border-radius:8px;background:#586272;color:#fff;font-size:.95rem';

      const btnOk = document.createElement('button');
      btnOk.type = 'button';
      btnOk.textContent = 'Conectar';
      btnOk.style.cssText = 'flex:1;padding:12px;border:none;border-radius:8px;background:#3d8bfd;color:#fff;font-size:.95rem;font-weight:600';

      let cerrado = false;
      const terminar = (valor) => {
        if (cerrado) return;
        cerrado = true;
        overlay.remove();
        resolve(valor || '');
      };

      btnCancel.onclick = () => terminar('');
      btnOk.onclick = () => terminar(input.value);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); terminar(input.value); }
        if (ev.key === 'Escape') terminar('');
      });

      fila.appendChild(btnCancel);
      fila.appendChild(btnOk);
      caja.appendChild(titulo);
      caja.appendChild(texto);
      caja.appendChild(input);
      caja.appendChild(fila);
      overlay.appendChild(caja);
      document.body.appendChild(overlay);
      setTimeout(() => input.focus(), 80);
    });
  },

  async _intentarLoginConClave(clave, usuarios, perfil) {
    if (!clave) return false;
    for (const usuario of usuarios) {
      const srv = await Usuarios._loginServidor(usuario, clave, 0);
      if (srv && !srv.error && this._getToken()) {
        this.guardarClavePerfil(perfil.id, clave);
        this.marcarSesionOnline({
          perfilId: srv.perfil?.id || perfil.id,
          playerId: srv.player?.id
        });
        return true;
      }
    }
    return false;
  },

  /** Comprueba que el servidor responda antes de login o sync. */
  async despertarServidor() {
    const base = this._base();
    if (!base) return false;
    if (typeof MarielDiagnosticoRed !== 'undefined') {
      const diag = await MarielDiagnosticoRed.probarConexion(base, { timeoutMs: 22000 });
      return !!diag.ok;
    }
    for (let intento = 0; intento < 4; intento++) {
      try {
        const r = await Utilidades.fetchConTimeout(base + '/health', { cache: 'no-store' }, 22000);
        if (r.ok) return true;
      } catch (e) { /* reintento */ }
      if (intento < 3) {
        await new Promise(res => setTimeout(res, 2000 + intento * 2000));
      }
    }
    return false;
  },

  /** Último diagnóstico de red (para UI admin / cartel). */
  ultimoDiagnostico() {
    return (typeof MarielDiagnosticoRed !== 'undefined' && MarielDiagnosticoRed.ultimo) || null;
  },

  async verificarToken() {
    if (!this.puedePublicar()) return false;
    const base = this._base();
    try {
      const r = await Utilidades.fetchConTimeout(base + '/api/player/me', {
        headers: { Authorization: 'Bearer ' + this._getToken() },
        cache: 'no-store'
      }, 12000);
      if (r.status === 401 || r.status === 403) {
        localStorage.removeItem(this.TOKEN_KEY);
        return false;
      }
      return r.ok;
    } catch (e) {
      return false;
    }
  },

  /** Obtiene token JWT del servidor si falta (sesión local sin login-game). */
  async asegurarSesionServidor(opciones) {
    const opts = opciones || {};
    if (!CONFIG.servidorOnline) {
      return false;
    }
    if (typeof Usuarios === 'undefined' || !Usuarios.perfilActivo) {
      return false;
    }

    const despierto = await this.despertarServidor();
    if (!despierto && !opts.omitirDespertar) {
      /* seguir: a veces /health falla pero la API responde */
    }

    if (this.puedePublicar()) {
      const valido = await this.verificarToken();
      if (valido) {
        const coincide = await this.tokenCoincideConPerfil();
        if (coincide) return true;
      }
      this.limpiarSesionOnline();
    }

    const perfil = Usuarios.perfilActivo;
    const usuarios = this._usuariosLogin();

    for (const clave of this._clavesGuardadas()) {
      if (await this._intentarLoginConClave(clave, usuarios, perfil)) {
        return true;
      }
    }

    if (opts.pedirClave) {
      const usuario = perfil.nombre || perfil.id;
      let clave = '';
      if (typeof window !== 'undefined' && window.prompt) {
        try {
          clave = window.prompt(
            'Contraseña de ' + usuario + ' para conectar al servidor:',
            ''
          ) || '';
        } catch (e) { /* prompt bloqueado en PWA */ }
      }
      if (!clave) {
        clave = await this._pedirClaveModal(usuario);
      }
      if (!clave) return false;
      if (await this._intentarLoginConClave(clave, usuarios, perfil)) {
        return true;
      }
      if (typeof Notificaciones !== 'undefined') {
        Notificaciones.mostrar(
          '❌ ' + Utilidades.mensajeAmigable('Contraseña incorrecta o servidor no responde', 'No se pudo conectar. Reintenta.'),
          'error', 6000
        );
      }
      return false;
    }

    return false;
  },

  _headers() {
    const token = this._getToken();
    return {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    };
  },

  async publicar(jsonStr) {
    const base = this._base();
    const token = this._getToken();
    if (!base || !token) {
      return { ok: false, error: 'Sin sesión — vuelve a entrar con tu contraseña' };
    }
    await this.despertarServidor();
    const body = typeof jsonStr === 'string' ? jsonStr : JSON.stringify(jsonStr);
    for (let intento = 0; intento < 3; intento++) {
      try {
        const r = await Utilidades.fetchConTimeout(base + '/api/player/sync-mundo', {
          method: 'POST',
          headers: this._headers(),
          body: body
        }, 35000);
        const data = await r.json().catch(() => ({}));
        if (r.status === 401 || r.status === 403) {
          localStorage.removeItem(this.TOKEN_KEY);
          return { ok: false, error: r.status === 403
            ? 'Sin permiso de admin en el servidor'
            : 'Sesión expirada — vuelve a entrar' };
        }
        if (r.status === 429) {
          return { ok: false, error: data.error || 'Demasiadas publicaciones — espera un momento', status: 429 };
        }
        if (r.ok && data.ok) return { ok: true, data };
        if (intento < 2) {
          await new Promise(res => setTimeout(res, 2000 * (intento + 1)));
          continue;
        }
        return { ok: false, error: data.error || ('Error ' + r.status) };
      } catch (e) {
        if (intento < 2) {
          await this.despertarServidor();
          await new Promise(res => setTimeout(res, 2000 * (intento + 1)));
          continue;
        }
        return { ok: false, error: 'Servidor no responde — espera y reintenta' };
      }
    }
    return { ok: false, error: 'Servidor no responde' };
  },

  WORLD_CONFIG_KEYS: [
    'precios', 'itemsNuevos', 'mantenimiento', 'baneados', 'mensajes',
    'combate', 'optimizarVisibilidad', 'tiendasStock',
    'enemigosEstado', 'objetosEstado', 'tesorosEstado'
  ],

  MAP_DELTA_CAMPOS: [
    { campo: 'objetos', type: 'item' },
    { campo: 'enemigos', type: 'enemy' },
    { campo: 'tesoros', type: 'treasure' },
    { campo: 'tiendasAdmin', type: 'shop' },
    { campo: 'misiones', type: 'mission' },
    { campo: 'cofres', type: 'chest' }
  ],

  async _worldAdminPost(ruta, body, timeoutMs) {
    const base = this._base();
    const token = this._getToken();
    if (!base || !token) {
      return { ok: false, error: 'Sin sesión — vuelve a entrar con tu contraseña' };
    }
    await this.despertarServidor();
    const timeout = timeoutMs || 20000;
    try {
      const r = await Utilidades.fetchConTimeout(base + ruta, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(body || {})
      }, timeout);
      const data = await r.json().catch(() => ({}));
      if (r.status === 401 || r.status === 403) {
        localStorage.removeItem(this.TOKEN_KEY);
        return {
          ok: false,
          error: r.status === 403 ? 'Sin permiso de admin en el servidor' : 'Sesión expirada — vuelve a entrar',
          status: r.status
        };
      }
      if (r.status === 429) {
        return {
          ok: false,
          error: data.error || 'Demasiadas acciones — espera un momento',
          status: 429
        };
      }
      if (r.status === 404) {
        return { ok: false, error: 'Endpoint no disponible', status: 404, fallbackCompleto: true };
      }
      if (r.ok && data.ok) return { ok: true, data };
      return { ok: false, error: data.error || ('Error ' + r.status), status: r.status };
    } catch (e) {
      return { ok: false, error: 'Servidor no responde' };
    }
  },

  async adminUpsert({ id, type, x, y, data }) {
    return this._worldAdminPost('/api/player/world/upsert', { id, type, x, y, data });
  },

  async adminDelete({ id }) {
    return this._worldAdminPost('/api/player/world/delete', { id });
  },

  async adminConfig({ key, value }) {
    return this._worldAdminPost('/api/player/world/config', { key, value });
  },

  _firmaElementoMapa(item, posiciones) {
    const blob = Object.assign({}, item);
    const pos = blob.pos || blob.posicion || posiciones?.[item.id];
    if (pos && pos.length >= 2) {
      blob.pos = [Number(pos[0]), Number(pos[1])];
      delete blob.posicion;
    }
    delete blob._marcador;
    return JSON.stringify(blob);
  },

  _indiceMapa(mundo, campo) {
    const map = new Map();
    const elim = new Set(mundo?.eliminados || []);
    for (const it of (mundo?.[campo] || [])) {
      if (!it?.id || elim.has(it.id)) continue;
      map.set(it.id, this._firmaElementoMapa(it, mundo.posiciones));
    }
    return map;
  },

  /** Campos que aún requieren sync-mundo completo (jugadores, correo, etc.). */
  necesitaSyncMundoCompleto(base, actual) {
    if (!base || !actual) return true;
    if (actual.purgarJugadores) return true;
    const claves = [
      'jugadores', 'partidas', 'combateEnemigos', 'correoReclamados', 'correoTienda',
      'cuerposMuertos', 'adminPinClaves', 'moverPinJugador', 'tesoroIconoMapa',
      'bolsasDrop', 'botinesEnemigo', 'eliminados_recuperables'
    ];
    for (const k of claves) {
      const sb = JSON.stringify(base[k] ?? null);
      const sa = JSON.stringify(actual[k] ?? null);
      if (sb !== sa) return true;
    }
    return false;
  },

  /**
   * Fase 3.5 — sincroniza solo mapa + config autorizada (sin subir mundo entero).
   * Devuelve fallbackCompleto si el servidor no tiene los endpoints nuevos.
   */
  async sincronizarMapaDelta(base, actual) {
    if (!base || !actual) {
      return { ok: false, error: 'Mundo inválido' };
    }
    if (this.necesitaSyncMundoCompleto(base, actual)) {
      return { ok: false, fallbackCompleto: true, reason: 'requiere sync completo' };
    }

    const baseElim = new Set(base.eliminados || []);
    const actualElim = new Set(actual.eliminados || []);
    let ops = 0;
    const errores = [];

    for (const id of actualElim) {
      if (baseElim.has(id)) continue;
      const r = await this.adminDelete({ id });
      if (!r.ok) {
        if (r.fallbackCompleto) return { ok: false, fallbackCompleto: true };
        errores.push(r.error || ('delete ' + id));
        continue;
      }
      ops++;
    }

    for (const { campo, type } of this.MAP_DELTA_CAMPOS) {
      const prev = this._indiceMapa(base, campo);
      const curr = this._indiceMapa(actual, campo);
      const posiciones = actual.posiciones || {};

      for (const [id, firma] of curr) {
        if (prev.get(id) === firma) continue;
        const item = (actual[campo] || []).find(x => x && x.id === id);
        if (!item) continue;
        const pos = item.pos || item.posicion || posiciones[id];
        const r = await this.adminUpsert({
          id,
          type,
          x: pos?.[0],
          y: pos?.[1],
          data: item
        });
        if (!r.ok) {
          if (r.fallbackCompleto) return { ok: false, fallbackCompleto: true };
          errores.push(r.error || ('upsert ' + id));
          continue;
        }
        ops++;
      }
    }

    for (const key of this.WORLD_CONFIG_KEYS) {
      const sb = JSON.stringify(base[key] ?? null);
      const sa = JSON.stringify(actual[key] ?? null);
      if (sb === sa) continue;
      const r = await this.adminConfig({ key, value: actual[key] });
      if (!r.ok) {
        if (r.fallbackCompleto) return { ok: false, fallbackCompleto: true };
        errores.push(r.error || ('config ' + key));
        continue;
      }
      ops++;
    }

    if (errores.length) {
      return { ok: false, error: errores[0], ops };
    }
    const ts = Date.now();
    return { ok: true, ops, actualizadoEn: ts };
  },

  /** Sube vida/muerto de la partida al snapshot del servidor. */
  async subirPartida(perfilId, partida) {
    const base = this._base();
    const token = this._getToken();
    if (!base || !token || !perfilId || !partida) return false;
    try {
      const r = await fetch(base + '/api/player/sync-partida', {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({ perfilId, partida })
      });
      const data = await r.json().catch(() => ({}));
      return !!data.ok;
    } catch (e) {
      return false;
    }
  },

  async registrarCuenta(perfil, partida, clave) {
    const base = this._base();
    const token = this._getToken();
    if (!base || !token || !perfil?.id) return false;
    try {
      const body = { perfil, partida: partida || null };
      if (clave) body.clave = clave;
      const r = await fetch(base + '/api/player/registrar-cuenta', {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(body)
      });
      const data = await r.json().catch(() => ({}));
      return !!data.ok;
    } catch (e) {
      return false;
    }
  },

  /** Deja solo la cuenta admin en el servidor (borra el resto). */
  async limpiarCuentas() {
    const base = this._base();
    const token = this._getToken();
    if (!base || !token) {
      return { ok: false, error: 'Sin sesión en el servidor' };
    }
    try {
      const r = await Utilidades.fetchConTimeout(base + '/api/player/limpiar-cuentas', {
        method: 'POST',
        headers: this._headers()
      }, 25000);
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok) return data;
      return { ok: false, error: data.error || ('Error ' + r.status) };
    } catch (e) {
      return { ok: false, error: 'Servidor no responde' };
    }
  },

  async sincronizarGitHub() {
    const base = this._base();
    const token = this._getToken();
    if (!base || !token) {
      return { ok: false, error: 'Sin sesión en el servidor' };
    }
    for (let intento = 0; intento < 3; intento++) {
      try {
        const r = await Utilidades.fetchConTimeout(base + '/api/player/force-git-sync', {
          method: 'POST',
          headers: this._headers()
        }, 20000);
        const data = await r.json().catch(() => ({}));
        if (r.ok && data.ok) return data;
        if (intento < 2) {
          await new Promise(res => setTimeout(res, 2000 * (intento + 1)));
          continue;
        }
        return { ok: false, error: data.error || data.reason || ('Error ' + r.status) };
      } catch (e) {
        if (intento < 2) {
          await new Promise(res => setTimeout(res, 2000 * (intento + 1)));
          continue;
        }
        return { ok: false, error: 'Servidor no responde' };
      }
    }
    return { ok: false, error: 'Servidor no responde' };
  },

  /** Estado de la última sync a GitHub (solo admin). */
  async obtenerEstadoSync() {
    const base = this._base();
    const token = this._getToken();
    if (!base || !token) return null;
    try {
      const r = await Utilidades.fetchConTimeout(base + '/api/player/sync-status', {
        headers: this._headers(),
        cache: 'no-store'
      }, 10000);
      const data = await r.json().catch(() => ({}));
      return data.ok ? data : null;
    } catch (e) {
      return null;
    }
  },

  /** Admin: historial de acciones (Fase 9). */
  async obtenerAdminHistorial() {
    const base = this._base();
    const token = this._getToken();
    if (!base || !token) return null;
    try {
      const r = await Utilidades.fetchConTimeout(base + '/api/player/admin-historial', {
        headers: this._headers(),
        cache: 'no-store'
      }, 12000);
      const data = await r.json().catch(() => ({}));
      return data.ok ? data : null;
    } catch (e) {
      return null;
    }
  },

  async restaurarAdminHistorial(historialId) {
    return this._worldAdminPost('/api/player/admin-historial/restore', { historialId });
  },

  /** Descarga el mundo desde SQLite (público o autenticado). */
  async obtenerMundo() {
    const base = this._base();
    if (!base) return null;
    const token = this._getToken();
    const headers = token ? { Authorization: 'Bearer ' + token } : {};
    const url = token ? base + '/api/player/mundo' : base + '/api/public/mundo';
    try {
      const r = await Utilidades.fetchConTimeout(url, { headers, cache: 'no-store' }, 12000);
      if (!r.ok) return null;
      const data = await r.json().catch(() => ({}));
      if (!data.ok) return null;
      return {
        mundo: data.mundo,
        actualizadoEn: data.actualizadoEn || data.mundo?.actualizadoEn || 0
      };
    } catch (e) {
      return null;
    }
  }
};
