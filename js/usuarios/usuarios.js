// ============================================================
// USUARIOS — login, registro, sesión única
// ============================================================
const Usuarios = {
  CLAVE: 'mariel_perfiles_v2',
  datos: null,
  perfilActivo: null,
  _resolver: null,
  _sesionCerrada: false,

  iniciar() {
    return new Promise(resolver => {
      this._resolver = resolver;
      try {
        this.datos = JSON.parse(localStorage.getItem(this.CLAVE) || 'null');
      } catch (e) { this.datos = null; }
      if (!this.datos) this.datos = { lista: [], activo: null, sesionId: null };

      const sesion = this.datos.sesionId && this.datos.lista.find(p => p.id === this.datos.sesionId);
      if (sesion) {
        this.perfilActivo = sesion;
        this.datos.activo = sesion.id;
        document.body.classList.remove('en-auth');
        if (this._resolver) { this._resolver(); this._resolver = null; }
        return;
      }
      document.body.classList.add('en-auth');
      this.mostrarLogin();
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

  mostrarLogin() {
    const carga = document.getElementById('pantalla-carga');
    if (carga) carga.classList.add('oculto');
    document.body.classList.add('en-auth');
    document.getElementById('pantalla-registro').classList.add('oculto');
    document.getElementById('pantalla-login').classList.remove('oculto');
    document.getElementById('login-usuario').value = '';
    document.getElementById('login-clave').value = '';
    this._enlazarOjos();
  },

  mostrarRegistro() {
    document.getElementById('pantalla-login').classList.add('oculto');
    document.getElementById('pantalla-registro').classList.remove('oculto');
    ['registro-nombre', 'registro-telefono', 'registro-clave', 'registro-clave2'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    this._enlazarOjos();
  },

  _enlazarOjos() {
    document.querySelectorAll('.btn-ojo-clave').forEach(btn => {
      btn.onclick = () => {
        const input = document.getElementById(btn.dataset.campo);
        if (!input) return;
        const oculto = input.type === 'password';
        input.type = oculto ? 'text' : 'password';
        btn.textContent = oculto ? '🙈' : '👁️';
      };
    });
  },

  telefonoValido(t) {
    return /^\+?\d{6,15}$/.test(t);
  },

  esAdministrador() {
    if (!this.perfilActivo || !this.perfilActivo.nombre || !CONFIG.adminNombre) return false;
    return this.perfilActivo.nombre.trim().toLowerCase() === CONFIG.adminNombre.toLowerCase();
  },

  _buscarPorLogin(usuario) {
    const u = usuario.trim().toLowerCase();
    const limpio = usuario.trim().replace(/[\s-]/g, '');
    return this.datos.lista.find(p =>
      p.nombre.toLowerCase() === u || (p.telefono && p.telefono === limpio));
  },

  _buscarGlobal(usuario) {
    if (typeof Admin === 'undefined') return null;
    const u = usuario.trim().toLowerCase();
    const limpio = usuario.trim().replace(/[\s-]/g, '');
    return Admin.jugadoresGlobales().find(j =>
      (j.nombre && j.nombre.toLowerCase() === u) ||
      (j.telefono && j.telefono === limpio));
  },

  _generarTokenSesion() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  },

  async _publicarSesion(perfil, token) {
    perfil.sesionToken = token;
    perfil.sesionT = Date.now();
    this._guardarLista();
    MundoPublico.registrarJugadorEnMundo(perfil, {
      pinHash: perfil.pinHash,
      sesionToken: token,
      sesionT: perfil.sesionT
    }).catch(() => {});
    if (typeof Admin !== 'undefined') {
      Admin.registrarJugador(perfil, true);
      if (Admin.esAdminJugador()) Admin._publicarParaTodos();
    }
  },

  async iniciarSesion() {
    const usuario = document.getElementById('login-usuario').value.trim();
    const clave = document.getElementById('login-clave').value;
    if (!usuario) { alert('Escribe tu nombre o teléfono'); return; }
    if (!clave) { alert('Escribe tu contraseña'); return; }

    if (typeof Admin !== 'undefined') await Admin.actualizarJugadoresGlobales();

    let perfil = this._buscarPorLogin(usuario);
    const hash = await Utilidades.sha256('pin-perfil|' + clave);

    if (!perfil) {
      const global = this._buscarGlobal(usuario);
      if (!global) {
        alert('No existe esa cuenta.\nComprueba nombre/teléfono o regístrate.');
        return;
      }
      if (!global.pinHash) {
        alert('Esta cuenta aún no tiene contraseña en el servidor.\nCrea una cuenta nueva o pide al admin que publique el mundo.');
        return;
      }
      if (hash !== global.pinHash) { alert('Contraseña incorrecta'); return; }
      perfil = {
        id: global.id,
        nombre: global.nombre,
        telefono: global.telefono || '',
        telefonoCambiadoEn: 0,
        pinHash: global.pinHash,
        creado: global.creado || Date.now()
      };
      const idx = this.datos.lista.findIndex(p => p.id === perfil.id);
      if (idx >= 0) this.datos.lista[idx] = Object.assign(this.datos.lista[idx], perfil);
      else this.datos.lista.push(perfil);
      this._guardarLista();
    } else {
      if (!perfil.pinHash) {
        alert('Esta cuenta es antigua. Crea una cuenta nueva.');
        return;
      }
      if (hash !== perfil.pinHash) { alert('Contraseña incorrecta'); return; }
    }

    if (typeof Admin !== 'undefined') {
      const err = Admin.validarRegistro(perfil.nombre, perfil.telefono, perfil.id);
      if (err) { alert(err); return; }
      const ban = Admin.estadoBloqueoPara(perfil);
      if (ban) { alert('🚫 ' + ban.mensaje); return; }
    }
    await this._activar(perfil);
  },

  async crear() {
    const nombre = document.getElementById('registro-nombre').value.trim();
    const telefono = document.getElementById('registro-telefono').value.trim().replace(/[\s-]/g, '');
    const clave = document.getElementById('registro-clave').value;
    const clave2 = document.getElementById('registro-clave2').value;

    if (nombre.length < 2) { alert('Escribe tu nombre (mínimo 2 letras)'); return; }
    if (!this.telefonoValido(telefono)) {
      alert('Número inválido: solo números, mínimo 6 dígitos.');
      return;
    }
    const errClave = Utilidades.claveCuentaValida(clave);
    if (errClave) { alert(errClave); return; }
    if (clave !== clave2) { alert('Las contraseñas no coinciden'); return; }

    if (typeof Admin !== 'undefined') await Admin.actualizarJugadoresGlobales();
    const errorRegistro = typeof Admin !== 'undefined'
      ? Admin.validarRegistro(nombre, telefono, null) : null;
    if (errorRegistro) { alert(errorRegistro); return; }

    const perfil = {
      id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      nombre,
      telefono,
      telefonoCambiadoEn: 0,
      pinHash: await Utilidades.sha256('pin-perfil|' + clave),
      creado: Date.now()
    };
    this.datos.lista.push(perfil);
    MundoPublico.registrarJugadorEnMundo(perfil, { pinHash: perfil.pinHash }).catch(() => {});
    await this._activar(perfil);
  },

  async _activar(perfil) {
    this.datos.activo = perfil.id;
    this.datos.sesionId = perfil.id;
    this.perfilActivo = perfil;
    this._sesionCerrada = false;
    const token = this._generarTokenSesion();
    await this._publicarSesion(perfil, token);
    this._ocultarAuth();
    if (this._resolver) { this._resolver(); this._resolver = null; }
  },

  iniciarVigilanciaSesion() {
    if (this._vigilanciaSesion) return;
    this._vigilanciaSesion = setInterval(() => this.verificarSesionRemota(), 5000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.verificarSesionRemota();
    });
  },

  async verificarSesionRemota() {
    if (!this.perfilActivo || this._sesionCerrada) return;
    if (typeof Admin === 'undefined') return;
    try {
      await Admin.actualizarJugadoresGlobales();
      const global = Admin.jugadoresGlobales().find(j => j.id === this.perfilActivo.id);
      if (!global || !global.sesionToken) return;
      if (global.sesionToken !== this.perfilActivo.sesionToken) {
        this._mostrarSesionCerrada();
      }
    } catch (e) {}
  },

  _mostrarSesionCerrada() {
    if (this._sesionCerrada) return;
    this._sesionCerrada = true;
    document.body.classList.add('sesion-cerrada');
    document.querySelectorAll('.ventana').forEach(v => v.classList.add('oculto'));
    document.getElementById('pantalla-sesion-remota').classList.remove('oculto');
  },

  cerrarSesion() {
    if (this.perfilActivo) {
      MundoPublico.registrarJugadorEnMundo(this.perfilActivo, {
        sesionToken: null,
        sesionT: Date.now()
      }).catch(() => {});
    }
    this.datos.sesionId = null;
    this.datos.activo = null;
    this.perfilActivo = null;
    this._guardarLista();
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
    Notificaciones.mostrar('📱 Número actualizado: ' + limpio, 'exito', 5000);
  },

  UN_MES_MS: 30 * 24 * 60 * 60 * 1000
};

document.addEventListener('DOMContentLoaded', () => {
  const irReg = document.getElementById('btn-ir-registro');
  const irLog = document.getElementById('btn-ir-login');
  const btnLog = document.getElementById('btn-iniciar-sesion');
  const btnReg = document.getElementById('btn-crear-perfil');
  const btnSalirRemoto = document.getElementById('btn-sesion-remota-salir');
  if (irReg) irReg.addEventListener('click', () => Usuarios.mostrarRegistro());
  if (irLog) irLog.addEventListener('click', () => Usuarios.mostrarLogin());
  if (btnLog) btnLog.addEventListener('click', () => Usuarios.iniciarSesion());
  if (btnReg) btnReg.addEventListener('click', () => Usuarios.crear());
  if (btnSalirRemoto) btnSalirRemoto.addEventListener('click', () => Usuarios.cerrarSesion());
});
