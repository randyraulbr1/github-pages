/**
 * Publica el mundo del admin al servidor Render (fuente única de verdad).
 */
const SyncServidor = {
  puedePublicar() {
    return !!(CONFIG.servidorOnline && localStorage.getItem(Multijugador.TOKEN_KEY));
  },

  _base() {
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
      if (CONFIG.adminNombre) nombres.push(CONFIG.adminNombre);
      for (const a of (CONFIG.adminAlias || [])) nombres.push(a);
    }
    return [...new Set(nombres.map(n => String(n || '').trim()).filter(Boolean))];
  },

  guardarClavePerfil(perfilId, clave) {
    if (!perfilId || !clave) return;
    try {
      sessionStorage.setItem('mariel_clave_servidor', clave);
      localStorage.setItem('mariel_clave_' + perfilId, clave);
      if (typeof Usuarios !== 'undefined' && Usuarios.esAdministrador && Usuarios.esAdministrador()) {
        localStorage.setItem('mariel_dev_clave_admin', clave);
        const nom = String(Usuarios.perfilActivo?.nombre || '').toLowerCase();
        if (nom === 'randy') localStorage.setItem('mariel_dev_clave_randy', clave);
      }
    } catch (e) { /* */ }
  },

  /** Despierta Render (plan gratis) antes de login o sync. */
  async despertarServidor() {
    const base = this._base();
    if (!base) return false;
    for (let intento = 0; intento < 4; intento++) {
      try {
        const r = await Utilidades.fetchConTimeout(base + '/health', { cache: 'no-store' }, 22000);
        if (r.ok) return true;
      } catch (e) { /* servidor dormido */ }
      if (intento < 3) {
        await new Promise(res => setTimeout(res, 2000 + intento * 2000));
      }
    }
    return false;
  },

  async verificarToken() {
    if (!this.puedePublicar()) return false;
    const base = this._base();
    try {
      const r = await Utilidades.fetchConTimeout(base + '/api/player/me', {
        headers: { Authorization: 'Bearer ' + localStorage.getItem(Multijugador.TOKEN_KEY) },
        cache: 'no-store'
      }, 12000);
      if (r.status === 401 || r.status === 403) {
        localStorage.removeItem(Multijugador.TOKEN_KEY);
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
    if (!CONFIG.servidorOnline || typeof Usuarios === 'undefined' || !Usuarios.perfilActivo) {
      return false;
    }

    await this.despertarServidor();

    if (this.puedePublicar()) {
      const valido = await this.verificarToken();
      if (valido) return true;
    }

    const perfil = Usuarios.perfilActivo;
    const usuarios = this._usuariosLogin();
    for (const clave of this._clavesGuardadas()) {
      for (const usuario of usuarios) {
        const srv = await Usuarios._loginServidor(usuario, clave, 0);
        if (srv && !srv.error) {
          this.guardarClavePerfil(perfil.id, clave);
          return true;
        }
      }
    }

    if (opts.pedirClave) {
      const usuario = perfil.nombre || perfil.id;
      const clave = prompt(
        'Contraseña de ' + usuario + ' para conectar al servidor:',
        ''
      );
      if (!clave) return false;
      for (const u of usuarios) {
        const srv = await Usuarios._loginServidor(u, clave, 0);
        if (srv && !srv.error) {
          this.guardarClavePerfil(perfil.id, clave);
          return true;
        }
      }
      if (typeof Notificaciones !== 'undefined') {
        Notificaciones.mostrar('❌ Contraseña incorrecta o servidor no responde', 'error', 6000);
      }
    }
    return this.puedePublicar();
  },

  _headers() {
    const token = localStorage.getItem(Multijugador.TOKEN_KEY);
    return {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    };
  },

  async publicar(jsonStr) {
    const base = this._base();
    const token = localStorage.getItem(Multijugador.TOKEN_KEY);
    if (!base || !token) {
      return { ok: false, error: 'Sin token — entra con tu contraseña' };
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
          localStorage.removeItem(Multijugador.TOKEN_KEY);
          return { ok: false, error: r.status === 403
            ? 'Sin permiso de admin en el servidor'
            : 'Sesión expirada — vuelve a entrar' };
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

  /** Sube vida/muerto de la partida al snapshot del servidor. */
  async subirPartida(perfilId, partida) {
    const base = this._base();
    const token = localStorage.getItem(Multijugador.TOKEN_KEY);
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
    const token = localStorage.getItem(Multijugador.TOKEN_KEY);
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
    const token = localStorage.getItem(Multijugador.TOKEN_KEY);
    if (!base || !token) {
      return { ok: false, error: 'Sin conexión al servidor' };
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
      return { ok: false, error: 'Sin conexión al servidor' };
    }
  },

  async sincronizarGitHub() {
    const base = this._base();
    const token = localStorage.getItem(Multijugador.TOKEN_KEY);
    if (!base || !token) {
      return { ok: false, error: 'Sin conexión al servidor' };
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
        return { ok: false, error: 'Sin conexión al servidor' };
      }
    }
    return { ok: false, error: 'Sin conexión al servidor' };
  },

  /** Estado de la última sync a GitHub (solo admin). */
  async obtenerEstadoSync() {
    const base = this._base();
    const token = localStorage.getItem(Multijugador.TOKEN_KEY);
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

  /** Descarga el mundo desde SQLite (público o autenticado). */
  async obtenerMundo() {
    const base = this._base();
    if (!base) return null;
    const token = localStorage.getItem(Multijugador.TOKEN_KEY);
    const headers = token ? { Authorization: 'Bearer ' + token } : {};
    const url = token ? base + '/api/player/mundo' : base + '/api/public/mundo';
    try {
      const r = await fetch(url, { headers, cache: 'no-store' });
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
