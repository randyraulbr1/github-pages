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

  // Devuelve una promesa que se cumple cuando hay un jugador activo
  iniciar() {
    return new Promise(resolver => {
      this._resolver = resolver;
      try {
        this.datos = JSON.parse(localStorage.getItem(this.CLAVE) || 'null');
      } catch (e) { this.datos = null; }
      if (!this.datos) this.datos = { lista: [], activo: null };

      const activo = this.datos.lista.find(p => p.id === this.datos.activo);
      if (activo) {
        this.perfilActivo = activo;
        resolver();
        return;
      }
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
      ficha.className = 'ficha-perfil';
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

  async crear() {
    const nombre = document.getElementById('registro-nombre').value.trim();
    const pin = document.getElementById('registro-pin').value.trim();
    if (nombre.length < 2) {
      alert('Escribe tu nombre (mínimo 2 letras)');
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
    this._activar(perfil);
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
  }
};
