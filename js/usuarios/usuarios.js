// ============================================================
// USUARIOS — login, registro y sesión única
// ============================================================
const Usuarios = {
  CLAVE: 'mariel_perfiles_v2',
  datos: null,
  perfilActivo: null,
  _resolver: null,
  _sesionCerrada: false,
  _cuentaEliminada: false,
  _mundoCache: null,

  _CUENTAS_RESET_V: '56',

  _aplicarResetCuentasV56() {
    if (localStorage.getItem('mariel_cuentas_reset_v') === this._CUENTAS_RESET_V) return;
    localStorage.setItem('mariel_cuentas_reset_v', this._CUENTAS_RESET_V);
  },

  async _partidaInicialRegistro() {
    const datos = typeof Guardado !== 'undefined' && Guardado._estadoNuevo
      ? Guardado._estadoNuevo()
      : {
        mochila: null, dinero: null, vida: CONFIG.vidaMaxima, hambre: CONFIG.hambreInicial,
        xp: 0, nivel: 1, muerto: false
      };
    datos.dinero = { saldo: CONFIG.dineroInicial };
    const sal = typeof Guardado !== 'undefined' ? Guardado.SAL : 'mariel-explorer::sal-de-integridad::2026';
    datos.dinero.control = await Utilidades.sha256(sal + '|saldo|' + datos.dinero.saldo);
    return { datos, t: Date.now() };
  },

  iniciar() {
    return new Promise(resolver => {
      this._resolver = resolver;
      try {
        this.datos = JSON.parse(localStorage.getItem(this.CLAVE) || 'null');
      } catch (e) { this.datos = null; }
      if (!this.datos) this.datos = { lista: [], activo: null, sesionId: null };
      this._aplicarResetCuentasV56();

      let forzarLogin = false;
      try {
        if (sessionStorage.getItem('mariel_forzar_login')) {
          sessionStorage.removeItem('mariel_forzar_login');
          this.datos.activo = null;
          this.datos.sesionId = null;
          this._guardarLista();
          forzarLogin = true;
        }
      } catch (e) { /* */ }

      if (!forzarLogin) {
        const sesion = this.datos.sesionId && this.datos.lista.find(p => p.id === this.datos.sesionId);
        if (sesion) {
          this._sincronizarNombreDesdeMundo(sesion);
          this.perfilActivo = sesion;
          this.datos.activo = sesion.id;
          document.body.classList.remove('en-auth');
          if (window.MarielBoot) MarielBoot.enfrente('Cargando tu partida…');
          if (this._resolver) { this._resolver(); this._resolver = null; }
          return;
        }
      }

      this.perfilActivo = null;
      document.body.classList.add('en-auth');
      this.mostrarLogin();
      // No resolver aquí: esperar a que iniciarSesion/crear llamen _activar()
    });
  },

  _guardarLista() {
    localStorage.setItem(this.CLAVE, JSON.stringify(this.datos));
  },

  _ocultarAuth() {
    document.getElementById('pantalla-login').classList.add('oculto');
    document.getElementById('pantalla-registro').classList.add('oculto');
    document.body.classList.remove('en-auth');
  },

  _mostrarAvisoAuth(pantalla, texto, tipo, opts) {
    const id = pantalla === 'registro' ? 'registro-aviso' : 'login-aviso';
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = texto;
    el.appendChild(span);
    el.className = 'auth-aviso-mensaje kingdom-auth-alerta ' + (tipo || 'error');
    el.classList.remove('oculto');
    if (opts?.reintentar) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'auth-reintentar btn-kingdom-secundario';
      btn.textContent = 'Reintentar';
      btn.addEventListener('click', () => {
        this._limpiarAvisoAuth(pantalla);
        opts.reintentar();
      });
      el.appendChild(btn);
    }
  },

  _authPuedeReintentar(texto) {
    return /conectar|conexión|servidor|reintentando/i.test(String(texto || ''));
  },

  _limpiarAvisoAuth(pantalla) {
    const id = pantalla === 'registro' ? 'registro-aviso' : 'login-aviso';
    const el = document.getElementById(id);
    if (el) {
      el.textContent = '';
      el.classList.add('oculto');
    }
  },

  mostrarLogin() {
    if (window.MarielBoot) MarielBoot.detrasAuth('Mundo listo · Inicia sesión');
    document.body.classList.add('en-auth');
    document.getElementById('pantalla-registro').classList.add('oculto');
    document.getElementById('pantalla-login').classList.remove('oculto');
    document.getElementById('login-usuario').value = '';
    const loginClave = document.getElementById('login-clave');
    if (loginClave) {
      loginClave.value = '';
      loginClave.type = 'password';
    }
    document.querySelectorAll('#pantalla-login .btn-ojo-clave').forEach(btn => {
      btn.classList.remove('ojo-muestra');
      btn.setAttribute('aria-label', 'Mostrar contraseña');
      btn.title = 'Mostrar contraseña';
    });
    this._limpiarAvisoAuth('login');
    this._enlazarOjos();
    MundoPublico.descargar().then(t => { if (t) this._mundoCache = t; }).catch(() => {});
  },

  mostrarRegistro() {
    if (window.MarielBoot) MarielBoot.detrasAuth('Mundo listo · Crea tu cuenta');
    document.getElementById('pantalla-login').classList.add('oculto');
    document.getElementById('pantalla-registro').classList.remove('oculto');
    ['registro-nombre', 'registro-telefono', 'registro-clave', 'registro-clave2'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    ['registro-clave', 'registro-clave2'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.type = 'password';
    });
    document.querySelectorAll('#pantalla-registro .btn-ojo-clave').forEach(btn => {
      btn.classList.remove('ojo-muestra');
      btn.setAttribute('aria-label', 'Mostrar contraseña');
      btn.title = 'Mostrar contraseña';
    });
    this._limpiarAvisoAuth('registro');
    this._enlazarOjos();
  },

  _enlazarOjos() {
    document.querySelectorAll('.btn-ojo-clave').forEach(btn => {
      btn.onclick = () => {
        const input = document.getElementById(btn.dataset.campo);
        if (!input) return;
        const oculto = input.type === 'password';
        input.type = oculto ? 'text' : 'password';
        btn.classList.toggle('ojo-muestra', oculto);
        const etiqueta = oculto ? 'Ocultar contraseña' : 'Mostrar contraseña';
        btn.setAttribute('aria-label', etiqueta);
        btn.title = etiqueta;
      };
    });
  },

  telefonoValido(t) {
    return /^\+?\d{6,15}$/.test(t);
  },

  _sincronizarNombreDesdeMundo(perfil) {
    if (!perfil?.id || typeof Admin === 'undefined' || !Admin.publicado) return;
    const g = (Admin.publicado.jugadores || []).find(j => j && j.id === perfil.id);
    if (g?.nombre) perfil.nombre = g.nombre;
  },

  esAdministrador() {
    if (!this.perfilActivo || !CONFIG.adminNombre) return false;
    const p = this.perfilActivo;
    const adminId = CONFIG.adminId || 'pmr7x4zhznzw5o';
    if (p.id === adminId) return true;
    const nom = String(p.nombre || '').trim().toLowerCase();
    const adm = CONFIG.adminNombre.toLowerCase();
    const alias = (CONFIG.adminAlias || []).map(a => String(a).toLowerCase());
    if (nom && (nom === adm || alias.includes(nom))) return true;
    if (typeof Admin !== 'undefined') {
      if (Admin._esCuentaProtegida?.(p)) return true;
      if (Admin.datos?.jugadoresPinAdmin?.[p.id]) return true;
    }
    return false;
  },

  _buscarPorLogin(usuario) {
    const u = usuario.trim().toLowerCase();
    const limpio = usuario.trim().replace(/[\s-]/g, '');
    return this.datos.lista.find(p =>
      p.nombre.toLowerCase() === u || (p.telefono && p.telefono === limpio));
  },

  async _buscarEnMundo(usuario) {
    if (typeof MundoPublico !== 'undefined' && MundoPublico.buscarCuentaPorLogin) {
      const cuenta = await MundoPublico.buscarCuentaPorLogin(usuario);
      if (cuenta) return cuenta;
    }

    const u = usuario.trim().toLowerCase();
    const limpio = usuario.trim().replace(/[\s-]/g, '');
    const buscar = lista => (lista || []).find(j =>
      (j.nombre && j.nombre.toLowerCase() === u) ||
      (j.telefono && j.telefono === limpio));

    if (typeof Admin !== 'undefined') {
      this._asegurarAdminMinimo();
      const g = buscar(Admin.jugadoresGlobales());
      if (g) return g;
    }

    if (this._mundoCache) {
      try {
        const g = buscar(JSON.parse(this._mundoCache).jugadores);
        if (g) return g;
      } catch (e) {}
    }

    return await MundoPublico.buscarJugadorPorLogin(usuario);
  },

  _asegurarAdminMinimo() {
    if (typeof Admin === 'undefined') return;
    if (!Admin.publicado) Admin.publicado = { jugadores: [] };
    if (!Admin.datos) {
      try { Admin.datos = JSON.parse(localStorage.getItem(Admin.CLAVE) || 'null'); } catch (e) {}
    }
    if (!Admin.datos) Admin.datos = { jugadoresExtra: [] };
    if (!Admin.datos.jugadoresExtra) Admin.datos.jugadoresExtra = [];
  },

  _generarTokenSesion() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  },

  _registrarEnAdminLocal(perfil) {
    if (typeof Admin === 'undefined') return;
    this._asegurarAdminMinimo();
    Admin.registrarJugador(perfil, true);
  },

  _publicarSesionEnFondo(perfil, token) {
    const canonId = (typeof Admin !== 'undefined' && Admin._idCanonicoJugador)
      ? Admin._idCanonicoJugador(perfil.id) : perfil.id;
    const datos = Object.assign({}, perfil, {
      id: canonId,
      sesionToken: token,
      sesionT: perfil.sesionT
    });
    this._registrarEnAdminLocal(datos);
    const publicar = async () => {
      try {
        if (typeof SyncServidor !== 'undefined' && SyncServidor.puedePublicar()) {
          await SyncServidor.registrarCuenta(datos, null);
        } else if (typeof MundoPublico !== 'undefined') {
          await MundoPublico.guardarCuenta(datos, null);
        }
      } catch (e) { /* */ }
    };
    return publicar();
  },

  async _loginServidor(usuario, clave, intento) {
    const base = typeof MarielRed !== 'undefined' ? MarielRed.urlServidor()
      : (CONFIG.servidorOnline || '').replace(/\/$/, '');
    if (!base) return null;
    try {
      const r = await Utilidades.fetchConTimeout(base + '/api/login-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, clave })
      }, 10000);
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok && data.token) {
        localStorage.setItem(
          (typeof SyncServidor !== 'undefined' && SyncServidor.TOKEN_KEY) ||
          (typeof Multijugador !== 'undefined' && Multijugador.TOKEN_KEY) || 'mariel_online_token',
          data.token
        );
        if (typeof SyncServidor !== 'undefined') {
          SyncServidor.marcarSesionOnline({
            perfilId: data.perfil?.id,
            playerId: data.player?.id
          });
        }
        return data;
      }
      if (r.status >= 500) {
        const alt = await this._loginServidorLegacy(base, usuario, clave);
        if (alt) return alt;
        const diag = typeof MarielDiagnosticoRed !== 'undefined'
          ? MarielDiagnosticoRed.clasificarFetch(null, base + '/api/login-game', r.status)
          : null;
        return {
          error: diag && typeof MarielDiagnosticoRed !== 'undefined'
            ? MarielDiagnosticoRed.mensajeUsuario(diag)
            : 'Error del backend al iniciar sesión (HTTP ' + r.status + ').',
          diagnostico: diag,
          codigo: data.codigo
        };
      }
      return { error: data.error || 'No se pudo entrar', codigo: data.codigo };
    } catch (e) {
      if ((intento || 0) < 2) {
        await new Promise(res => setTimeout(res, 1500));
        return this._loginServidor(usuario, clave, (intento || 0) + 1);
      }
      const diag = typeof MarielDiagnosticoRed !== 'undefined'
        ? MarielDiagnosticoRed.clasificarFetch(e, base + '/api/login-game')
        : null;
      return {
        error: typeof MarielDiagnosticoRed !== 'undefined' && diag
          ? MarielDiagnosticoRed.mensajeUsuario(diag)
          : 'No se pudo conectar al servidor. Comprueba la red y la URL del servidor.',
        diagnostico: diag
      };
    }
  },

  async _loginServidorLegacy(base, usuario, clave) {
    try {
      const r = await Utilidades.fetchConTimeout(base + '/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usuario, password: clave })
      }, 10000);
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.token) return null;
      localStorage.setItem(
        (typeof SyncServidor !== 'undefined' && SyncServidor.TOKEN_KEY) ||
        (typeof Multijugador !== 'undefined' && Multijugador.TOKEN_KEY) || 'mariel_online_token',
        data.token
      );
      if (typeof SyncServidor !== 'undefined') {
        SyncServidor.marcarSesionOnline({
          perfilId: data.perfil?.id,
          playerId: data.player?.id
        });
      }
      return data;
    } catch (e) {
      return null;
    }
  },

  async _registrarServidor(nombre, telefono, clave, perfilId, intento) {
    const base = typeof MarielRed !== 'undefined' ? MarielRed.urlServidor()
      : (CONFIG.servidorOnline || '').replace(/\/$/, '');
    if (!base) return null;
    try {
      const r = await Utilidades.fetchConTimeout(base + '/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: nombre, password: clave, telefono, perfilId })
      }, 12000);
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok || !data.token) return { error: data.error || 'No se pudo registrar' };
      localStorage.setItem(
        (typeof SyncServidor !== 'undefined' && SyncServidor.TOKEN_KEY) ||
        (typeof Multijugador !== 'undefined' && Multijugador.TOKEN_KEY) || 'mariel_online_token',
        data.token
      );
      if (typeof SyncServidor !== 'undefined') {
        SyncServidor.marcarSesionOnline({
          perfilId: data.perfil?.id,
          playerId: data.player?.id
        });
      }
      return data;
    } catch (e) {
      if ((intento || 0) < 2) {
        await new Promise(res => setTimeout(res, 2000));
        return this._registrarServidor(nombre, telefono, clave, perfilId, (intento || 0) + 1);
      }
      const diag = typeof MarielDiagnosticoRed !== 'undefined'
        ? MarielDiagnosticoRed.clasificarFetch(e, base + '/api/register')
        : null;
      return {
        error: typeof MarielDiagnosticoRed !== 'undefined' && diag
          ? MarielDiagnosticoRed.mensajeUsuario(diag)
          : 'No se pudo conectar al servidor. Comprueba la red y la URL del servidor.',
        diagnostico: diag
      };
    }
  },

  async iniciarSesion() {
    const btn = document.getElementById('btn-iniciar-sesion');
    const usuario = document.getElementById('login-usuario').value.trim();
    const clave = document.getElementById('login-clave').value;
    if (!usuario) { this._mostrarAvisoAuth('login', 'Escribe tu nombre o teléfono'); return; }
    if (!clave) { this._mostrarAvisoAuth('login', 'Escribe tu contraseña'); return; }
    this._limpiarAvisoAuth('login');

    if (btn) { btn.disabled = true; btn.textContent = 'Conectando…'; }

    try {
      if (!CONFIG.servidorOnline) {
        this._mostrarAvisoAuth('login', 'Servidor no disponible. Revisa tu conexión.', 'error', {
          reintentar: () => this.iniciarSesion()
        });
        return;
      }

      const srv = await this._loginServidor(usuario, clave, 0);
      if (srv?.error) {
        let msg = Utilidades.mensajeAmigable(srv.error, 'No se pudo entrar');
        if (srv.codigo === 'no_registrado') {
          msg = 'No estás registrado. Si te borraron la cuenta, créala de nuevo o pide al admin que te restaure.';
        } else if (srv.codigo === 'cuenta_eliminada') {
          msg = 'Tu cuenta fue eliminada por el admin. Pídele que te restaure desde el panel.';
        }
        const retry = this._authPuedeReintentar(msg) ? { reintentar: () => this.iniciarSesion() } : undefined;
        this._mostrarAvisoAuth('login', msg, 'error', retry);
        return;
      }

      const perfil = {
        id: srv.perfil.id,
        nombre: srv.perfil.nombre,
        telefono: srv.perfil.telefono || '',
        telefonoCambiadoEn: 0,
        pinHash: srv.perfil.pinHash || await Utilidades.sha256('pin-perfil|' + clave),
        creado: srv.perfil.creado || Date.now()
      };
      this._incorporarJugadorEnMundo(perfil);

      if (typeof Admin !== 'undefined') {
        try {
          const ban = Admin.estadoBloqueoPara(perfil);
          if (ban) { this._mostrarAvisoAuth('login', '🚫 ' + ban.mensaje); return; }
        } catch (e) { console.warn('Ban check:', e); }
      }

      const idx = this.datos.lista.findIndex(p => p.id === perfil.id);
      if (idx >= 0) this.datos.lista[idx] = Object.assign(this.datos.lista[idx], perfil);
      else this.datos.lista.push(perfil);
      this._guardarLista();

      await this._activar(perfil);
      if (typeof SyncServidor !== 'undefined') {
        SyncServidor.guardarClavePerfil(perfil.id, clave);
      } else {
        sessionStorage.setItem('mariel_clave_servidor', clave);
        try { localStorage.setItem('mariel_clave_' + perfil.id, clave); } catch (e) { /* */ }
      }
    } catch (e) {
      console.error('Error en login:', e);
      this._mostrarAvisoAuth('login', Utilidades.mensajeAmigable(e, 'Error al entrar'), 'error', {
        reintentar: () => this.iniciarSesion()
      });
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Entrar al juego'; }
    }
  },

  async crear() {
    const nombre = document.getElementById('registro-nombre').value.trim();
    const telefono = document.getElementById('registro-telefono').value.trim().replace(/[\s-]/g, '');
    const clave = document.getElementById('registro-clave').value;
    const clave2 = document.getElementById('registro-clave2').value;

    if (nombre.length < 2) { this._mostrarAvisoAuth('registro', 'Escribe tu nombre (mínimo 2 letras)'); return; }
    if (!this.telefonoValido(telefono)) {
      this._mostrarAvisoAuth('registro', 'Número inválido: solo números, mínimo 6 dígitos.');
      return;
    }
    const errClave = Utilidades.claveCuentaValida(clave);
    if (errClave) { this._mostrarAvisoAuth('registro', errClave); return; }
    if (clave !== clave2) { this._mostrarAvisoAuth('registro', 'Las contraseñas no coinciden'); return; }
    this._limpiarAvisoAuth('registro');

    if (typeof Admin !== 'undefined') {
      try { await Admin.actualizarJugadoresGlobales(); } catch (e) {}
      const errorRegistro = Admin.validarRegistro(nombre, telefono, null);
      if (errorRegistro) { this._mostrarAvisoAuth('registro', errorRegistro); return; }
    }

    const perfil = {
      id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      nombre,
      telefono,
      telefonoCambiadoEn: 0,
      pinHash: await Utilidades.sha256('pin-perfil|' + clave),
      creado: Date.now()
    };

    if (!CONFIG.servidorOnline) {
      this._mostrarAvisoAuth('registro', 'Servidor no disponible. No se puede crear cuenta.', 'error', {
        reintentar: () => this.crear()
      });
      return;
    }

    const btnReg = document.getElementById('btn-crear-perfil');
    if (btnReg) { btnReg.disabled = true; btnReg.textContent = 'Creando cuenta…'; }
    try {
      const srv = await this._registrarServidor(nombre, telefono, clave, perfil.id);
      if (srv?.error) {
        const msg = Utilidades.mensajeAmigable(srv.error, 'No se pudo crear la cuenta');
        const retry = this._authPuedeReintentar(msg) ? { reintentar: () => this.crear() } : undefined;
        this._mostrarAvisoAuth('registro', msg, 'error', retry);
        return;
      }
      if (srv?.perfil?.id) perfil.id = srv.perfil.id;

      this.datos.lista.push(perfil);
      this._guardarLista();
      this._registrarEnAdminLocal(perfil);
      const snap = await this._partidaInicialRegistro();
      await MundoPublico.guardarCuenta(perfil, snap);
      await this._activar(perfil);
      if (typeof SyncServidor !== 'undefined') {
        SyncServidor.guardarClavePerfil(perfil.id, clave);
      } else {
        sessionStorage.setItem('mariel_clave_servidor', clave);
        try { localStorage.setItem('mariel_clave_' + perfil.id, clave); } catch (e) { /* */ }
      }
    } catch (e) {
      this._mostrarAvisoAuth('registro', Utilidades.mensajeAmigable(e, 'Error al crear cuenta'), 'error', {
        reintentar: () => this.crear()
      });
    } finally {
      if (btnReg) { btnReg.disabled = false; btnReg.textContent = 'Registrarme'; }
    }
  },

  async _activar(perfil) {
    this.datos.activo = perfil.id;
    this.datos.sesionId = perfil.id;
    this.perfilActivo = perfil;
    this._sesionCerrada = false;
    if (typeof Amigos !== 'undefined') Amigos._asegurarCuenta();
    document.body.classList.remove('sesion-cerrada');
    const token = this._generarTokenSesion();
    perfil.sesionToken = token;
    perfil.sesionT = Date.now();
    this._sesionRecienActivada = perfil.sesionT;
    this._guardarLista();
    this._ocultarAuth();
    if (window.MarielBoot) MarielBoot.enfrente('Cargando tu partida…');
    if (this._resolver) {
      this._resolver();
      this._resolver = null;
    } else {
      // Arranque ya terminó sin sesión (p. ej. tras actualizar): recargar con perfil guardado
      location.reload();
      return;
    }
    this._publicarSesionEnFondo(perfil, token).catch(() => {});
    if (typeof Opciones !== 'undefined') Opciones._refrescarAdmin?.();
    if (typeof SyncServidor !== 'undefined') {
      SyncServidor.asegurarSesionServidor({}).then((ok) => {
        if (ok) SyncServidor.registrarCuenta(perfil, null).catch(() => {});
        if (ok && typeof Admin !== 'undefined' && Admin.esAdminJugador && Admin.esAdminJugador()) {
          setTimeout(() => {
            if (Admin._publicarParaTodos) Admin._publicarParaTodos(true);
          }, 2500);
        }
      }).catch(() => {});
    }
  },

  iniciarVigilanciaSesion() {
    if (this._vigilanciaSesion) return;
    this._vigilanciaSesion = setInterval(() => this.verificarSesionRemota(), 3000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.verificarSesionRemota();
    });
    setTimeout(() => this.verificarSesionRemota(), 800);
  },

  _buscarSesionGlobal() {
    if (!this.perfilActivo) return null;
    if (typeof Admin !== 'undefined' && Admin.jugadoresGlobales) {
      const lista = Admin.jugadoresGlobales();
      const id = this.perfilActivo.id;
      const canon = Admin._idCanonicoJugador ? Admin._idCanonicoJugador(id) : id;
      let g = lista.find(j => j?.id === id);
      if (!g && canon !== id) g = lista.find(j => j?.id === canon);
      if (!g) {
        const nom = String(this.perfilActivo.nombre || '').trim().toLowerCase();
        if (nom) {
          const coinciden = lista.filter(j =>
            String(j?.nombre || '').trim().toLowerCase() === nom
          );
          if (coinciden.length === 1) g = coinciden[0];
        }
      }
      if (g) return g;
    }
    return null;
  },

  _sesionMeAfecta(data) {
    if (!this.perfilActivo || !data?.sesionToken) return false;
    if (data.sesionToken === this.perfilActivo.sesionToken) return false;

    const remId = data.perfilId;
    const mioId = this.perfilActivo.id;
    if (remId && typeof Admin !== 'undefined' && Admin._mismaCuentaJugador) {
      if (Admin._mismaCuentaJugador(remId, mioId)) return true;
    } else if (remId && remId === mioId) {
      return true;
    }

    const mioNom = String(this.perfilActivo.nombre || '').trim().toLowerCase();
    const remNom = String(data.nombre || '').trim().toLowerCase();
    return !!(mioNom && remNom && mioNom === remNom);
  },

  async verificarSesionRemota() {
    if (!this.perfilActivo || this._sesionCerrada) return;
    if (!this.perfilActivo.sesionToken) return;
    if (this._sesionRecienActivada && Date.now() - this._sesionRecienActivada < 15000) return;

    try {
      if (typeof Admin !== 'undefined') await Admin.actualizarJugadoresGlobales();
      let global = this._buscarSesionGlobal();
      if (!global && typeof MundoPublico !== 'undefined') {
        global = await MundoPublico.buscarJugadorPorLogin(this.perfilActivo.nombre);
        if (global && typeof Admin !== 'undefined' && Admin._mismaCuentaJugador &&
          !Admin._mismaCuentaJugador(global.id, this.perfilActivo.id)) {
          global = null;
        }
      }
      if (!global || !global.sesionToken) return;
      if (global.sesionToken === this.perfilActivo.sesionToken) return;
      if ((global.sesionT || 0) <= (this.perfilActivo.sesionT || 0)) return;
      this._mostrarSesionCerrada();
    } catch (e) {}
  },

  _mostrarSesionCerrada() {
    if (this._sesionCerrada) return;
    this._sesionCerrada = true;
    document.body.classList.add('sesion-cerrada');
    document.querySelectorAll('.ventana').forEach(v => v.classList.add('oculto'));
    const pant = document.getElementById('pantalla-sesion-remota');
    if (pant) pant.classList.remove('oculto');
    const cuenta = document.getElementById('sesion-remota-cuenta');
    if (cuenta && this.perfilActivo) {
      const nom = this.perfilActivo.nombre || 'Jugador';
      const id = this.perfilActivo.id || '';
      cuenta.textContent = 'Sesión de: ' + nom + (id ? ' (' + id + ')' : '');
    }
  },

  aplicarSesionRemotaDesdeSocket(data) {
    if (!this.perfilActivo || this._sesionCerrada) return;
    if (!this._sesionMeAfecta(data)) return;
    if ((data.sesionT || 0) <= (this.perfilActivo.sesionT || 0)) return;
    this._mostrarSesionCerrada();
  },

  _cuentaMeAfecta(data) {
    if (!this.perfilActivo) return false;
    if (data?.perfilId && data.perfilId === this.perfilActivo.id) return true;
    const nom = String(data?.nombre || '').trim().toLowerCase();
    const mio = String(this.perfilActivo.nombre || '').trim().toLowerCase();
    return !!(nom && mio && nom === mio);
  },

  _coincidePerfilJugador(j) {
    if (!this.perfilActivo || !j) return false;
    if (typeof Admin !== 'undefined' && Admin._mismaCuentaJugador) {
      return Admin._mismaCuentaJugador(j.id, this.perfilActivo.id);
    }
    const id = this.perfilActivo.id;
    const nom = String(this.perfilActivo.nombre || '').trim().toLowerCase();
    return j.id === id || String(j.nombre || '').trim().toLowerCase() === nom;
  },

  _incorporarJugadorEnMundo(jugador) {
    if (!jugador?.id || typeof Admin === 'undefined' || !Admin.publicado) return;
    const lista = Admin.publicado.jugadores || [];
    const ix = lista.findIndex(j => j && j.id === jugador.id);
    if (ix >= 0) lista[ix] = Object.assign({}, lista[ix], jugador);
    else lista.push(Object.assign({}, jugador));
    Admin.publicado.jugadores = lista;
    if (Admin._desmarcarJugadorBorrado) Admin._desmarcarJugadorBorrado(jugador);
  },

  async verificarCuentaEnMundo() {
    if (!this.perfilActivo || this._cuentaEliminada || this.esAdministrador()) return;

    if (typeof Admin !== 'undefined' && Admin.actualizarJugadoresGlobales) {
      try { await Admin.actualizarJugadoresGlobales(); } catch (e) { /* */ }
    }

    if (typeof Admin !== 'undefined') {
      const globals = Admin.jugadoresGlobales
        ? Admin.jugadoresGlobales()
        : (Admin.publicado?.jugadores || []);
      if (globals.some(j => this._coincidePerfilJugador(j))) return;
    }

    if (CONFIG.servidorOnline) {
      const tokenKey = (typeof Multijugador !== 'undefined' && Multijugador.TOKEN_KEY)
        ? Multijugador.TOKEN_KEY : 'mariel_online_token';
      const tieneToken = !!localStorage.getItem(tokenKey);
      try {
        const base = CONFIG.servidorOnline.replace(/\/$/, '');
        const q = encodeURIComponent(this.perfilActivo.nombre || this.perfilActivo.id);
        const r = await Utilidades.fetchConTimeout(
          base + '/api/public/buscar-cuenta?q=' + q, { cache: 'no-store' }, 8000);
        const data = await r.json().catch(() => ({}));
        if (data.ok && data.jugador && this._coincidePerfilJugador(data.jugador)) {
          this._incorporarJugadorEnMundo(data.jugador);
          return;
        }
      } catch (e) {
        // Sin red: no expulsar si la cuenta sigue en la lista local
        if (this.datos.lista.some(p => p.id === this.perfilActivo.id)) return;
        if (tieneToken) return;
      }
      if (tieneToken) return;
    }

    if (typeof Admin === 'undefined' || !Admin.publicado) return;
    const remotos = Admin.publicado.jugadores || [];
    if (!remotos.length) return;
    if (!remotos.some(j => this._coincidePerfilJugador(j))) {
      this.expulsarCuentaEliminada();
    }
  },

  expulsarCuentaEliminada() {
    if (this._cuentaEliminada) return;
    this._cuentaEliminada = true;
    const tokenKey = (typeof Multijugador !== 'undefined' && Multijugador.TOKEN_KEY)
      ? Multijugador.TOKEN_KEY : 'mariel_online_token';
    localStorage.removeItem(tokenKey);
    sessionStorage.removeItem('mariel_clave_servidor');
    if (typeof Multijugador !== 'undefined' && Multijugador.socket) {
      Multijugador.socket.disconnect();
      Multijugador.activo = false;
    }
    if (this.perfilActivo) {
      const id = this.perfilActivo.id;
      this.datos.lista = (this.datos.lista || []).filter(p => p.id !== id);
      localStorage.removeItem(CONFIG.claveGuardado + '::' + id);
      this.datos.activo = null;
      this.datos.sesionId = null;
      this.perfilActivo = null;
      this._guardarLista();
    }
    document.body.classList.add('cuenta-eliminada');
    document.querySelectorAll('.ventana').forEach(v => v.classList.add('oculto'));
    const pantalla = document.getElementById('pantalla-cuenta-eliminada');
    if (pantalla) pantalla.classList.remove('oculto');
    if (window.MarielBoot) MarielBoot.ocultar();
  },

  salirCuentaEliminada() {
    this._cuentaEliminada = false;
    document.body.classList.remove('cuenta-eliminada');
    const pantalla = document.getElementById('pantalla-cuenta-eliminada');
    if (pantalla) pantalla.classList.add('oculto');
    document.body.classList.add('en-auth');
    this.mostrarLogin();
  },

  cerrarSesion() {
    sessionStorage.removeItem('mariel_clave_servidor');
    if (typeof SyncServidor !== 'undefined') {
      SyncServidor.limpiarSesionOnline();
    } else if (typeof Multijugador !== 'undefined' && Multijugador.socket) {
      Multijugador.socket.disconnect();
      Multijugador.activo = false;
    }
    if (this.perfilActivo) {
      MundoPublico.registrarJugadorEnMundo(this.perfilActivo, {
        sesionToken: null,
        sesionT: Date.now()
      }).catch(() => {});
    }
    this.datos.sesionId = null;
    this.datos.activo = null;
    if (typeof Amigos !== 'undefined') Amigos.invalidarCuenta();
    this.perfilActivo = null;
    this._guardarLista();
    if (typeof Guardado !== 'undefined') {
      Guardado.guardarAhora().catch(() => {}).finally(() => {
        if (window.MarielBoot) MarielBoot.mostrar('Cerrando sesión…');
        location.reload();
      });
      return;
    }
    if (window.MarielBoot) MarielBoot.mostrar('Cerrando sesión…');
    location.reload();
  },

  cambiarJugador() { this.cerrarSesion(); },

  async cambiarTelefono() {
    const perfil = this.perfilActivo;
    if (!perfil) return;
    const yaTiene = !!perfil.telefono;
    const gastadoEn = perfil.telefonoCambiadoEn || 0;
    const faltanMs = this.UN_MES_MS - (Date.now() - gastadoEn);

    if (yaTiene && gastadoEn > 0 && faltanMs > 0 && !this.esAdministrador()) {
      const cuando = Utilidades.fechaLegible(gastadoEn + this.UN_MES_MS);
      Notificaciones.mostrar('📱 Podrás cambiar tu número el ' + cuando, 'alerta', 6000);
      return;
    }

    const nuevo = prompt('Nuevo número de teléfono:', perfil.telefono || '');
    if (nuevo === null) return;
    const limpio = nuevo.trim().replace(/[\s-]/g, '');
    if (!this.telefonoValido(limpio)) { alert('Número inválido'); return; }
    if (typeof Admin !== 'undefined') {
      await Admin.actualizarJugadoresGlobales();
      const err = Admin.validarRegistro(perfil.nombre, limpio, perfil.id);
      if (err) { alert(err); return; }
    }
    perfil.telefono = limpio;
    if (!this.esAdministrador()) perfil.telefonoCambiadoEn = Date.now();
    this._guardarLista();
    if (typeof Admin !== 'undefined') Admin.registrarJugador(perfil);
    MundoPublico.registrarJugadorEnMundo(perfil, { pinHash: perfil.pinHash }).catch(() => {});
    Notificaciones.mostrar('📱 Número actualizado: ' + limpio, 'exito', 5000);
  },

  _claveDevRandy() {
    return localStorage.getItem('mariel_dev_clave_randy')
      || sessionStorage.getItem('mariel_clave_servidor')
      || '';
  },

  async entrarComoRandyDev() {
    const usuario = 'randy';
    let clave = this._claveDevRandy();
    if (!clave) {
      clave = prompt('Contraseña de randy (se guarda solo en este navegador):', '') || '';
      if (!clave) return;
      localStorage.setItem('mariel_dev_clave_randy', clave);
    }
    const campoUsuario = document.getElementById('login-usuario');
    const campoClave = document.getElementById('login-clave');
    if (campoUsuario) campoUsuario.value = usuario;
    if (campoClave) campoClave.value = clave;
    await this.iniciarSesion();
  },

  UN_MES_MS: 30 * 24 * 60 * 60 * 1000
};

document.addEventListener('DOMContentLoaded', () => {
  const irReg = document.getElementById('btn-ir-registro');
  const irLog = document.getElementById('btn-ir-login');
  const btnLog = document.getElementById('btn-iniciar-sesion');
  const btnDevRandy = document.getElementById('btn-dev-login-randy');
  const btnReg = document.getElementById('btn-crear-perfil');
  const btnSalirRemoto = document.getElementById('btn-sesion-remota-salir');
  const btnCuentaEliminada = document.getElementById('btn-cuenta-eliminada-ok');
  if (irReg) irReg.addEventListener('click', () => Usuarios.mostrarRegistro());
  if (irLog) irLog.addEventListener('click', () => Usuarios.mostrarLogin());
  if (btnLog) btnLog.addEventListener('click', () => Usuarios.iniciarSesion());
  if (btnDevRandy) btnDevRandy.addEventListener('click', () => Usuarios.entrarComoRandyDev());
  if (btnReg) btnReg.addEventListener('click', () => Usuarios.crear());
  if (btnSalirRemoto) btnSalirRemoto.addEventListener('click', () => Usuarios.cerrarSesion());
  if (btnCuentaEliminada) btnCuentaEliminada.addEventListener('click', () => Usuarios.salirCuentaEliminada());
});
