// ============================================================
// USUARIOS — registro y selección de jugador
// Cada jugador tiene su propia partida e historial separados
// (guardados bajo una clave distinta). Opcionalmente puede
// proteger su perfil con un PIN de 4 dígitos.
// ============================================================
const Usuarios = {
  CLAVE: 'mariel_perfiles_v1',
  datos: null,        // { lista: [{id, nombre, pinHash, creado}], activo: id|null }
  perfilActivo: null,
  _resolver: null,

  // Devuelve una promesa que se cumple cuando hay un jugador activo elegido
  iniciar() {
    return new Promise(resolver => {
      this._resolver = resolver;
      try {
        this.datos = JSON.parse(localStorage.getItem(this.CLAVE) || 'null');
      } catch (e) { this.datos = null; }
      if (!this.datos) this.datos = { lista: [], activo: null };

      // Seguridad: siempre elegir o crear jugador (nunca entrar solo)
      this.mostrarPantalla();
    });
  },

  _guardarLista() {
    localStorage.setItem(this.CLAVE, JSON.stringify(this.datos));
  },

  mostrarPantalla() {
    // La pantalla de carga cede el paso a la de registro
    const carga = document.getElementById('pantalla-carga');
    if (carga) carga.classList.add('oculto');
    const pantalla = document.getElementById('pantalla-usuarios');
    pantalla.classList.remove('oculto');

    // Lista de jugadores ya registrados en este teléfono
    const lista = document.getElementById('lista-perfiles');
    lista.innerHTML = '';
    for (const perfil of this.datos.lista) {
      const ficha = document.createElement('button');
      ficha.className = 'ficha-perfil' + (perfil.id === this.datos.activo ? ' activa' : '');
      ficha.innerHTML = '👤 <span>' + this._escapar(perfil.nombre) + '</span>' +
        (perfil.pinHash ? '<span class="candado">🔒</span>' : '');
      ficha.addEventListener('click', () => this.elegir(perfil));
      lista.appendChild(ficha);
    }
    document.getElementById('separador-registro').style.display =
      this.datos.lista.length ? '' : 'none';

    document.getElementById('btn-crear-perfil').onclick = () => this.crear();
  },

  _escapar(texto) {
    const d = document.createElement('div');
    d.textContent = texto;
    return d.innerHTML;
  },

  telefonoValido(t) {
    return /^\+?\d{6,15}$/.test(t);
  },

  async crear() {
    const nombre = document.getElementById('registro-nombre').value.trim();
    const telefono = document.getElementById('registro-telefono').value.trim().replace(/[\s-]/g, '');
    const pin = document.getElementById('registro-pin').value.trim();
    if (nombre.length < 2) {
      alert('Escribe tu nombre (mínimo 2 letras)');
      return;
    }
    if (!this.telefonoValido(telefono)) {
      alert('Escribe tu número de teléfono (solo números, mínimo 6 dígitos).\nA ese número llegarán tus recompensas.');
      return;
    }
    if (this.datos.lista.some(p => p.nombre.toLowerCase() === nombre.toLowerCase())) {
      alert('Ya existe un jugador con ese nombre en este teléfono');
      return;
    }
    if (pin && !/^\d{4}$/.test(pin)) {
      alert('El PIN debe ser de 4 números (o déjalo vacío)');
      return;
    }
    const perfil = {
      id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      nombre,
      telefono,
      telefonoCambiadoEn: 0, // aún no ha gastado su cambio del mes
      pinHash: pin ? await Utilidades.sha256('pin-perfil|' + pin) : null,
      creado: Date.now()
    };
    this.datos.lista.push(perfil);
    this._activar(perfil);
  },

  async elegir(perfil) {
    if (perfil.pinHash) {
      const pin = prompt('PIN de ' + perfil.nombre + ':');
      if (pin === null) return;
      const hash = await Utilidades.sha256('pin-perfil|' + pin.trim());
      if (hash !== perfil.pinHash) {
        alert('PIN incorrecto');
        return;
      }
    }
    if (!await this._asegurarTelefono(perfil)) return;
    this._activar(perfil);
  },

  // Sin número de teléfono válido no se puede jugar
  async _asegurarTelefono(perfil) {
    if (perfil.telefono && this.telefonoValido(perfil.telefono)) return true;
    const tel = prompt(
      'Para entrar, ' + perfil.nombre + ' necesita un número de teléfono\n' +
      '(ahí llegarán las recompensas):',
      perfil.telefono || ''
    );
    if (tel === null) return false;
    const limpio = tel.trim().replace(/[\s-]/g, '');
    if (!this.telefonoValido(limpio)) {
      alert('Número inválido: solo números, mínimo 6 dígitos');
      return false;
    }
    perfil.telefono = limpio;
    if (!perfil.telefonoCambiadoEn) perfil.telefonoCambiadoEn = 0;
    this._guardarLista();
    return true;
  },

  _activar(perfil) {
    this.datos.activo = perfil.id;
    this.perfilActivo = perfil;
    this._guardarLista();
    document.getElementById('pantalla-usuarios').classList.add('oculto');
    if (this._resolver) { this._resolver(); this._resolver = null; }
  },

  // Volver a la pantalla de selección (desde Opciones)
  cambiarJugador() {
    this.datos.activo = null;
    this._guardarLista();
    location.reload();
  },

  // ---------- CAMBIO DE NÚMERO DE TELÉFONO ----------
  // Solo 1 vez al mes. El administrador puede saltarse el límite con su
  // PIN (para corregir errores). Las recompensas llegan a este número.
  UN_MES_MS: 30 * 24 * 60 * 60 * 1000,

  async cambiarTelefono() {
    const perfil = this.perfilActivo;
    if (!perfil) return;

    // Perfiles antiguos sin número: siempre pueden ponerlo
    const yaTiene = !!perfil.telefono;
    const gastadoEn = perfil.telefonoCambiadoEn || 0;
    const faltanMs = this.UN_MES_MS - (Date.now() - gastadoEn);
    let cambioDeAdmin = false;

    if (yaTiene && gastadoEn > 0 && faltanMs > 0) {
      const cuando = Utilidades.fechaLegible(gastadoEn + this.UN_MES_MS);
      const esAdmin = (typeof Admin !== 'undefined' && Admin.datos && Admin.datos.pinHash) &&
        confirm('📱 Solo puedes cambiar tu número 1 vez al mes.\n' +
          'Podrás cambiarlo de nuevo el: ' + cuando + '\n\n' +
          '¿Eres el ADMINISTRADOR y fue un error? Acepta para poner el PIN de admin.');
      if (!esAdmin) {
        Notificaciones.mostrar('📱 Podrás cambiar tu número el ' + cuando, 'alerta', 6000);
        return;
      }
      const pin = prompt('PIN de administrador:');
      if (pin === null) return;
      const hash = await Utilidades.sha256('pin-admin|' + pin.trim());
      if (hash !== Admin.datos.pinHash) { alert('PIN incorrecto'); return; }
      cambioDeAdmin = true;
    }

    const nuevo = prompt('Nuevo número de teléfono (ahí llegarán tus recompensas):',
      perfil.telefono || '');
    if (nuevo === null) return;
    const limpio = nuevo.trim().replace(/[\s-]/g, '');
    if (!this.telefonoValido(limpio)) {
      alert('Número inválido: solo números, mínimo 6 dígitos');
      return;
    }
    perfil.telefono = limpio;
    // El cambio del admin no gasta el cambio mensual del jugador
    if (!cambioDeAdmin) perfil.telefonoCambiadoEn = Date.now();
    this._guardarLista();
    Notificaciones.mostrar('📱 Número actualizado: ' + limpio +
      (cambioDeAdmin ? ' (corregido por el admin)' : ''), 'exito', 5000);
    Historial.registrar('objetos', {
      detalle: '📱 Número de teléfono cambiado a ' + limpio + (cambioDeAdmin ? ' (por el admin)' : ''),
      monto: 0
    });
  }
};
