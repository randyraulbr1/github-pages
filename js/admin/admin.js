// ============================================================
// MODO ADMINISTRADOR (solo para el dueño del juego)
// Protegido con PIN propio. Permite:
//  - Crear misiones con texto propio, condición de inventario
//    y recompensa de dinero + objetos
//  - Crear tesoros visibles o invisibles (los invisibles avisan
//    los metros aproximados si el jugador lleva el objeto elegido)
//  - Dejar objetos en el mapa para que los jugadores los recojan
//  - Organizar (mover) los pines arrastrándolos
//  - Eliminar pines del mapa
// Todo se guarda automáticamente en este dispositivo.
// ============================================================
const Admin = {
  CLAVE: 'mariel_admin_v1',
  datos: null,      // borradores locales del admin (solo en este teléfono)
  publicado: null,  // mundo oficial descargado de datos/mundo.json (lo ven todos)
  modo: null,       // null | 'colocar' | 'organizar' | 'eliminar'
  _colocacion: null,  // { tipo, valores, marcador }
  _fantasmas: [],     // marcadores temporales de tesoros base en modo admin

  // ---------- CARGA (llamar antes que tiendas/pesca/tesoros/misiones) ----------
  // Carga los borradores locales Y el mundo publicado en GitHub.
  async cargar() {
    try {
      this.datos = JSON.parse(localStorage.getItem(this.CLAVE) || 'null');
    } catch (e) { this.datos = null; }
    if (!this.datos) {
      this.datos = { pinHash: null, misiones: [], tesoros: [], objetos: [], posiciones: {}, eliminados: [] };
    }
    if (!this.datos.precios) this.datos.precios = {};
    if (!this.datos.itemsNuevos) this.datos.itemsNuevos = [];
    if (!this.datos.baneados) this.datos.baneados = [];
    if (!this.datos.mensajes) this.datos.mensajes = [];
    if (!this.datos.jugadoresExtra) this.datos.jugadoresExtra = [];
    if (!this.datos.misiones) this.datos.misiones = [];
    if (!this.datos.tesoros) this.datos.tesoros = [];
    if (!this.datos.objetos) this.datos.objetos = [];
    if (!this.datos.posiciones) this.datos.posiciones = {};
    if (!this.datos.eliminados) this.datos.eliminados = [];
    if (this.datos.mantenimiento === undefined) this.datos.mantenimiento = null;

    // El mundo oficial vive en GitHub: al actualizar datos/mundo.json,
    // todos los jugadores reciben las misiones nuevas al recargar el juego
    this.publicado = { misiones: [], tesoros: [], objetos: [], posiciones: {}, eliminados: [], precios: {}, itemsNuevos: [], jugadores: [] };
    this._crudoPublicado = null;
    try {
      const texto = await MundoPublico.descargar();
      if (texto) {
        this._crudoPublicado = texto;
        this.publicado = Object.assign(this.publicado, JSON.parse(texto));
      }
    } catch (e) { /* sin conexión: se sigue con lo guardado */ }
    if (!this.publicado.precios) this.publicado.precios = {};
    if (!this.publicado.itemsNuevos) this.publicado.itemsNuevos = [];
    if (!this.publicado.baneados) this.publicado.baneados = [];
    if (!this.publicado.mensajes) this.publicado.mensajes = [];
    if (!this.publicado.mantenimiento) this.publicado.mantenimiento = { activo: false, mensaje: '' };
    if (!this.publicado.jugadores) this.publicado.jugadores = [];
    if (!Array.isArray(this.publicado.misiones)) this.publicado.misiones = [];
    if (!Array.isArray(this.publicado.tesoros)) this.publicado.tesoros = [];
    if (!Array.isArray(this.publicado.objetos)) this.publicado.objetos = [];
    if (!this.publicado.posiciones) this.publicado.posiciones = {};
    if (!Array.isArray(this.publicado.eliminados)) this.publicado.eliminados = [];

    // Aplicar al catálogo los objetos nuevos y precios globales
    const nuevosPorId = new Map();
    for (const it of this.publicado.itemsNuevos) nuevosPorId.set(it.id, it);
    for (const it of this.datos.itemsNuevos) nuevosPorId.set(it.id, it);
    Items.aplicarMundo([...nuevosPorId.values()],
      Object.assign({}, this.publicado.precios, this.datos.precios));

    // Todos los jugadores vigilan el mundo desde que arranca el juego
    this.iniciarVigilancia();
  },

  // ---------- VISTA COMBINADA: publicado en GitHub + borradores locales ----------
  _combinar(publicados, locales) {
    const porId = new Map();
    for (const e of (publicados || [])) porId.set(e.id, e);
    for (const e of (locales || [])) porId.set(e.id, e);
    return [...porId.values()].filter(e => e && e.id && !this.eliminado(e.id));
  },
  misionesTodas() {
    if (this.esAdminJugador()) {
      return this._combinar(this.publicado.misiones || [], this.datos.misiones || []);
    }
    return (this.publicado.misiones || []).filter(e => !this.eliminado(e.id));
  },
  tesorosTodos() {
    if (this.esAdminJugador()) {
      return this._combinar(this.publicado.tesoros || [], this.datos.tesoros || []);
    }
    return (this.publicado.tesoros || []).filter(e => !this.eliminado(e.id));
  },
  objetosTodos() {
    if (this.esAdminJugador()) {
      return this._combinar(this.publicado.objetos || [], this.datos.objetos || []);
    }
    return (this.publicado.objetos || []).filter(e => !this.eliminado(e.id));
  },

  guardar() {
    // Las claves que empiezan con "_" son estado temporal (marcadores de
    // Leaflet, avisos) y no deben guardarse
    localStorage.setItem(this.CLAVE, JSON.stringify(this.datos,
      (clave, valor) => clave.startsWith('_') ? undefined : valor));
    this._autoPublicar();
  },

  // ---------- PUBLICACIÓN AUTOMÁTICA AL EDITAR ----------
  // Si el admin tiene su clave configurada, CUALQUIER cambio suyo se sube
  // solo al archivo global (con una espera corta para agrupar cambios).
  // Los jugadores lo reciben al momento por la vigilancia del mundo.
  _autoPublicar() {
    if (!MundoPublico.puedePublicar()) return;
    clearTimeout(this._tempPublicar);
    this._tempPublicar = setTimeout(() => {
      const json = this._jsonMundo();
      if (json === this._ultimoPublicado) return;
      this.publicarMundo();
    }, 2000);
  },

  // Sube el mapa a GitHub para que TODOS los jugadores lo vean
  async _publicarParaTodos() {
    if (!MundoPublico.puedePublicar()) {
      Notificaciones.mostrar(
        '⚠️ Configura la 🔑 clave de GitHub en Admin\n' +
        '(🛠️ → Configurar clave de publicación)',
        'alerta', 12000
      );
      return false;
    }
    clearTimeout(this._tempPublicar);
    await this.publicarMundo();
    return true;
  },

  // ---------- ADMINISTRADOR (solo el jugador "randy") ----------
  esAdminJugador() {
    return typeof Usuarios !== 'undefined' && Usuarios.esAdministrador();
  },

  jugadoresGlobales() {
    if (!this.publicado) this.publicado = { jugadores: [] };
    if (!this.datos) this.datos = { jugadoresExtra: [] };
    const porId = new Map();
    for (const j of (this.publicado.jugadores || [])) {
      if (j && j.id) porId.set(j.id, j);
    }
    for (const j of (this.datos.jugadoresExtra || [])) {
      if (j && j.id) porId.set(j.id, j);
    }
    return [...porId.values()];
  },

  async actualizarJugadoresGlobales() {
    if (!this.publicado) this.publicado = { jugadores: [] };
    try {
      const texto = await MundoPublico.descargar();
      if (!texto) return;
      const p = JSON.parse(texto);
      if (Array.isArray(p.jugadores)) this.publicado.jugadores = p.jugadores;
    } catch (e) { /* sin conexión */ }
  },

  validarRegistro(nombre, telefono, perfilIdExcluir) {
    if (!this.publicado) this.publicado = { jugadores: [] };
    if (!this.datos) this.datos = { jugadoresExtra: [] };
    const n = nombre.trim().toLowerCase();
    const adminNom = (CONFIG.adminNombre || 'randy').toLowerCase();
    if (n === adminNom) {
      const randy = this.jugadoresGlobales().find(j => j.nombre && j.nombre.toLowerCase() === adminNom);
      if (randy && perfilIdExcluir !== randy.id) {
        return 'El nombre "' + CONFIG.adminNombre + '" está reservado para el administrador';
      }
    }
    for (const j of this.jugadoresGlobales()) {
      if (j.nombre && j.nombre.toLowerCase() === n && j.id !== perfilIdExcluir) {
        return 'Ya existe un jugador llamado "' + nombre + '" en el juego';
      }
      if (j.telefono && telefono && j.telefono === telefono && j.id !== perfilIdExcluir) {
        return 'Ese número ya está registrado a "' + j.nombre + '"';
      }
    }
    for (const p of Usuarios.datos.lista) {
      if (perfilIdExcluir && p.id === perfilIdExcluir) continue;
      if (p.nombre.toLowerCase() === n) return 'Ya existe un jugador con ese nombre en este teléfono';
      if (telefono && p.telefono === telefono) return 'Ese número ya está en este teléfono (' + p.nombre + ')';
    }
    return null;
  },

  registrarJugador(perfil, silencioso) {
    if (!perfil || !perfil.id) return;
    if (!this.datos) {
      try { this.datos = JSON.parse(localStorage.getItem(this.CLAVE) || 'null'); } catch (e) {}
    }
    if (!this.datos) this.datos = { jugadoresExtra: [], misiones: [], tesoros: [], objetos: [], posiciones: {}, eliminados: [] };
    if (!this.datos.jugadoresExtra) this.datos.jugadoresExtra = [];
    const entrada = {
      id: perfil.id,
      nombre: perfil.nombre,
      telefono: perfil.telefono || '',
      creado: perfil.creado || Date.now()
    };
    const idx = this.datos.jugadoresExtra.findIndex(j => j.id === perfil.id);
    if (idx >= 0) this.datos.jugadoresExtra[idx] = entrada;
    else this.datos.jugadoresExtra.push(entrada);
    localStorage.setItem(this.CLAVE, JSON.stringify(this.datos,
      (clave, valor) => clave.startsWith('_') ? undefined : valor));
    if (!silencioso && this.esAdminJugador() && MundoPublico.puedePublicar()) {
      clearTimeout(this._tempPublicar);
      this._tempPublicar = setTimeout(() => this.publicarMundo(), 1500);
    }
  },

  _jugadoresParaPublicar() {
    const porId = new Map();
    for (const j of (this.publicado.jugadores || [])) {
      if (j && j.id) porId.set(j.id, j);
    }
    for (const j of (this.datos.jugadoresExtra || [])) {
      if (j && j.id) porId.set(j.id, j);
    }
    if (Usuarios.datos && Usuarios.datos.lista) {
      for (const p of Usuarios.datos.lista) {
        porId.set(p.id, {
          id: p.id,
          nombre: p.nombre,
          telefono: p.telefono || '',
          creado: p.creado || Date.now()
        });
      }
    }
    return [...porId.values()].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  },

  // Posición corregida de un pin (si el admin lo movió). Muta la base en sitio
  // para que todas las referencias del módulo queden sincronizadas.
  pos(id, base) {
    if (!base || !Array.isArray(base)) return base;
    const o = (this.datos.posiciones || {})[id] || (this.publicado.posiciones || {})[id];
    if (o) { base[0] = o[0]; base[1] = o[1]; }
    return base;
  },

  eliminado(id) {
    if ((this.publicado.eliminados || []).includes(id)) return true;
    return this.esAdminJugador() && (this.datos.eliminados || []).includes(id);
  },

  // Progreso del jugador actual sobre el contenido creado por el admin
  _progreso() {
    if (!Guardado.datos.admin) Guardado.datos.admin = { misiones: [], tesoros: [], objetos: [] };
    return Guardado.datos.admin;
  },

  // ---------- ARRANQUE (después de los módulos base) ----------
  iniciar() {
    this._progreso();
    if (this.esAdminJugador() && Usuarios.datos && Usuarios.datos.lista) {
      for (const p of Usuarios.datos.lista) this.registrarJugador(p, true);
    }
    // (las misiones del admin las gestiona el módulo Misiones)
    for (const t of this.tesorosTodos()) {
      if (!t || !t.pos) continue;
      this.pos(t.id, t.pos);
      this._prepararTesoro(t);
    }
    for (const o of this.objetosTodos()) {
      if (!o || !o.pos) continue;
      this.pos(o.id, o.pos);
      this._crearMarcadorObjeto(o);
    }

    // Botones del panel (solo si existen en la página)
    const enlazar = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };
    enlazar('admin-crear-mision', () => this.abrirFormulario('mision'));
    enlazar('admin-crear-tesoro', () => this.abrirFormulario('tesoro'));
    enlazar('admin-dejar-objeto', () => this.abrirFormulario('objeto'));
    enlazar('admin-precios', () => this.abrirFormulario('precio'));
    enlazar('admin-item-nuevo', () => this.abrirFormulario('item_nuevo'));
    enlazar('admin-mantenimiento', () => this.alternarMantenimiento());
    enlazar('admin-banear', () => this.banear());
    enlazar('admin-mensaje', () => this.enviarMensaje());
    enlazar('admin-inspeccionar', () => this.inspeccionar());
    enlazar('admin-organizar', () => this.entrarModo('organizar'));
    enlazar('admin-eliminar', () => this.entrarModo('eliminar'));
    enlazar('admin-exportar', () => this.exportar());
    enlazar('admin-jugadores', () => this.listarJugadores());
    enlazar('admin-ver-historial', () => {
      document.getElementById('ventana-admin').classList.add('oculto');
      Historial.abrir();
    });
    enlazar('admin-publicar', () => this.publicarMundo());
    enlazar('admin-clave-publicar', () => this.configurarPublicacion());
    enlazar('btn-admin-guardar', () => this.guardarFormulario());
    enlazar('btn-admin-confirmar', () => this.confirmarColocacion());
    enlazar('btn-admin-salir-modo', () => this.salirModo());
  },

  // ---------- VIGILANCIA DEL MUNDO ----------
  // Cada 5 segundos relee el mundo y pinta lo nuevo en el mapa.
  iniciarVigilancia() {
    if (this._vigilanciaActiva) return;
    this._vigilanciaActiva = true;
    setInterval(() => this._revisarActualizacion(), 5000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this._revisarActualizacion();
    });
  },

  async _revisarActualizacion() {
    try {
      const texto = await MundoPublico.descargar();
      if (!texto) return;
      if (this._crudoPublicado === null) { this._crudoPublicado = texto; return; }
      if (texto === this._crudoPublicado) return;
      this._aplicarMundoRemoto(texto);
    } catch (e) { /* sin conexión: se intenta en el próximo ciclo */ }
  },

  // Aplica el mundo publicado sin recargar toda la página
  _aplicarMundoRemoto(texto) {
    const idsObjetosAntes = new Set(this.objetosTodos().map(o => o.id));
    const idsTesorosAntes = new Set(this.tesorosTodos().map(t => t.id));
    const idsMisionesAntes = new Set(this.misionesTodas().map(m => m.id));
    const eliminadosAntes = new Set(this.publicado.eliminados || []);

    this._crudoPublicado = texto;
    try {
      this.publicado = Object.assign({
        misiones: [], tesoros: [], objetos: [], posiciones: {}, eliminados: [],
        precios: {}, itemsNuevos: [], baneados: [], mensajes: [], jugadores: [],
        mantenimiento: { activo: false, mensaje: '' }
      }, JSON.parse(texto));
    } catch (e) { return; }

    if (!this.publicado.precios) this.publicado.precios = {};
    if (!this.publicado.itemsNuevos) this.publicado.itemsNuevos = [];
    if (!this.publicado.baneados) this.publicado.baneados = [];
    if (!this.publicado.mensajes) this.publicado.mensajes = [];
    if (!this.publicado.mantenimiento) this.publicado.mantenimiento = { activo: false, mensaje: '' };

    const nuevosPorId = new Map();
    for (const it of this.publicado.itemsNuevos) nuevosPorId.set(it.id, it);
    for (const it of this.datos.itemsNuevos) nuevosPorId.set(it.id, it);
    Items.aplicarMundo([...nuevosPorId.values()],
      Object.assign({}, this.publicado.precios, this.datos.precios));

    for (const id of this.publicado.eliminados) {
      if (!eliminadosAntes.has(id)) this._quitarDelMapa(id);
    }

    if (typeof Misiones !== 'undefined') {
      for (const m of this.misionesTodas()) {
        if (idsMisionesAntes.has(m.id) || this.eliminado(m.id)) continue;
        this.pos(m.id, m.pos);
        Misiones.agregarAdmin(m);
      }
    }

    for (const t of this.tesorosTodos()) {
      if (idsTesorosAntes.has(t.id) || this.eliminado(t.id)) continue;
      this.pos(t.id, t.pos);
      this._prepararTesoro(t);
    }

    for (const o of this.objetosTodos()) {
      if (idsObjetosAntes.has(o.id) || this.eliminado(o.id)) continue;
      this.pos(o.id, o.pos);
      this._crearMarcadorObjeto(o);
    }

    Notificaciones.mostrar('🌍 ¡Mapa actualizado! Ya ves lo que creó el admin', 'exito', 5000);
  },

  _quitarDelMapa(id) {
    for (const o of this.objetosTodos()) {
      if (o.id !== id || !o._marcador) continue;
      o._marcador.remove();
      o._marcador = null;
    }
    for (const t of this.tesorosTodos()) {
      if (t.id !== id) continue;
      if (t._marcador) { t._marcador.remove(); t._marcador = null; }
    }
    if (typeof Misiones !== 'undefined' && Misiones._marcadores[id]) {
      Misiones._marcadores[id].remove();
      delete Misiones._marcadores[id];
      if (Misiones._lineas[id]) { Misiones._lineas[id].remove(); delete Misiones._lineas[id]; }
    }
  },

  // ---------- ACCESO CON PIN ----------
  // El PIN solo se pide la PRIMERA vez en cada teléfono; después queda
  // desbloqueado (guardado en el dispositivo del admin).
  async solicitarAcceso() {
    if (!this.esAdminJugador()) {
      alert('Solo el administrador (' + CONFIG.adminNombre + ') puede usar este panel.');
      return;
    }
    if (this.datos.pinHash && this.datos.desbloqueado) {
      document.getElementById('ventana-admin').classList.remove('oculto');
      return;
    }
    if (!this.datos.pinHash) {
      const pin1 = prompt('Crea tu PIN de administrador (4 números):');
      if (!pin1 || !/^\d{4}$/.test(pin1.trim())) { alert('Debe ser de 4 números'); return; }
      const pin2 = prompt('Repite el PIN:');
      if (pin2 === null || pin1.trim() !== pin2.trim()) { alert('No coinciden'); return; }
      this.datos.pinHash = await Utilidades.sha256('pin-admin|' + pin1.trim());
      this.guardar();
      Notificaciones.mostrar('🛠️ PIN de administrador creado', 'exito');
    } else {
      const pin = prompt('PIN de administrador:');
      if (pin === null) return;
      const hash = await Utilidades.sha256('pin-admin|' + pin.trim());
      if (hash !== this.datos.pinHash) { alert('PIN incorrecto'); return; }
    }
    this.datos.desbloqueado = true;
    this.guardar();
    document.getElementById('ventana-admin').classList.remove('oculto');
  },

  // ---------- FORMULARIOS ----------
  _opcionesItems(incluirNinguno) {
    let html = incluirNinguno ? '<option value="">(ninguno)</option>' : '';
    const ordenados = Object.entries(CATALOGO_ITEMS)
      .sort((a, b) => a[1].nombre.localeCompare(b[1].nombre));
    for (const [id, it] of ordenados) {
      html += '<option value="' + id + '">' + it.icono + ' ' + it.nombre + '</option>';
    }
    return html;
  },

  abrirFormulario(tipo) {
    document.getElementById('ventana-admin').classList.add('oculto');
    const campos = document.getElementById('admin-form-campos');
    const titulo = document.getElementById('admin-form-titulo');
    this._colocacion = { tipo, valores: null, marcador: null };

    if (tipo === 'mision') {
      titulo.textContent = '📜 Crear misión';
      campos.innerHTML =
        this._campoTexto('af-titulo', 'Título de la misión', 'Ej: El encargo del pescador') +
        this._campoArea('af-texto', 'Texto que verá el jugador', 'Ej: Tráeme 5 sardinas al muelle viejo...') +
        '<div class="campo-doble">' +
          this._campoSelect('af-req-item', 'Objeto requerido (condición)', this._opcionesItems(true)) +
          this._campoNumero('af-req-cant', 'Cantidad', 1) +
        '</div>' +
        '<div class="campo-caja"><input type="checkbox" id="af-consumir"><label for="af-consumir">Quitar esos objetos al cumplir (es una entrega)</label></div>' +
        '<div class="campo-doble">' +
          this._campoNumero('af-dinero', 'Recompensa en dinero $', 50) +
          this._campoSelect('af-rec-item', 'Objeto de recompensa', this._opcionesItems(true)) +
        '</div>' +
        this._campoNumero('af-rec-cant', 'Cantidad del objeto de recompensa', 1);
    } else if (tipo === 'tesoro') {
      titulo.textContent = '🎁 Crear tesoro';
      campos.innerHTML =
        this._campoSelect('af-visible', 'Tipo de tesoro',
          '<option value="visible">Visible en el mapa</option><option value="invisible">Invisible (avisa metros aproximados)</option>') +
        this._campoSelect('af-item-ver', 'Objeto necesario para detectarlo', this._opcionesItems(true)) +
        '<div class="campo-doble">' +
          this._campoSelect('af-rec-item', 'Objeto del tesoro', this._opcionesItems(false)) +
          this._campoNumero('af-rec-cant', 'Cantidad', 1) +
        '</div>' +
        this._campoNumero('af-dinero', 'Dinero extra $', 0);
    } else if (tipo === 'objeto') {
      titulo.textContent = '📦 Dejar objeto';
      campos.innerHTML =
        '<div class="campo-doble">' +
          this._campoSelect('af-item', 'Objeto a dejar', this._opcionesItems(false)) +
          this._campoNumero('af-cant', 'Cantidad', 1) +
        '</div>' +
        this._campoNumero('af-reaparece', 'Vuelve a aparecer a los X minutos (0 = no vuelve a salir)', 0);
    } else if (tipo === 'precio') {
      titulo.textContent = '💲 Cambiar precio global';
      campos.innerHTML =
        this._campoSelect('af-item', 'Objeto', this._opcionesItems(false)) +
        this._campoNumero('af-precio', 'Precio nuevo (entre 5 y 5000)', 100) +
        '<div class="campo-caja">El precio cambia para TODOS al publicar el mundo</div>';
      document.getElementById('btn-admin-guardar').textContent = 'Guardar precio';
    } else {
      titulo.textContent = '➕ Crear objeto nuevo';
      campos.innerHTML =
        this._campoTexto('af-nombre', 'Nombre del objeto', 'Ej: Ron añejo') +
        this._campoTexto('af-icono', 'Icono (un emoji)', 'Ej: 🍹') +
        '<div class="campo-doble">' +
          this._campoNumero('af-precio', 'Precio (5 a 5000)', 50) +
          this._campoNumero('af-cura', 'Cura vida (0 = no se usa)', 0) +
        '</div>' +
        this._campoTexto('af-desc', 'Descripción', 'Ej: Reserva especial del puerto');
      document.getElementById('btn-admin-guardar').textContent = 'Crear objeto';
    }
    if (tipo === 'mision' || tipo === 'tesoro' || tipo === 'objeto') {
      document.getElementById('btn-admin-guardar').textContent = 'Continuar → colocar en el mapa';
    }
    document.getElementById('ventana-admin-form').classList.remove('oculto');
  },

  _campoTexto(id, etiqueta, marcador) {
    return '<div class="campo-admin"><label for="' + id + '">' + etiqueta + '</label>' +
      '<input id="' + id + '" maxlength="60" placeholder="' + marcador + '"></div>';
  },
  _campoArea(id, etiqueta, marcador) {
    return '<div class="campo-admin"><label for="' + id + '">' + etiqueta + '</label>' +
      '<textarea id="' + id + '" maxlength="300" placeholder="' + marcador + '"></textarea></div>';
  },
  _campoNumero(id, etiqueta, valor) {
    return '<div class="campo-admin"><label for="' + id + '">' + etiqueta + '</label>' +
      '<input id="' + id + '" type="number" inputmode="numeric" min="0" value="' + valor + '"></div>';
  },
  _campoSelect(id, etiqueta, opciones) {
    return '<div class="campo-admin"><label for="' + id + '">' + etiqueta + '</label>' +
      '<select id="' + id + '">' + opciones + '</select></div>';
  },

  _valor(id) { const el = document.getElementById(id); return el ? el.value : ''; },
  _numero(id) { return Math.max(0, parseInt(this._valor(id), 10) || 0); },

  guardarFormulario() {
    const tipo = this._colocacion && this._colocacion.tipo;
    if (!tipo) return;
    let valores;

    if (tipo === 'crear_jugador') {
      this._colocacion = null;
      Usuarios.cambiarJugador(); // lleva a la pantalla de registro
      return;
    }

    // Los formularios de precio y objeto nuevo no colocan nada en el mapa
    if (tipo === 'precio') {
      const idItem = this._valor('af-item');
      const precio = Items._limitarPrecio(this._numero('af-precio'));
      this.datos.precios[idItem] = precio;
      CATALOGO_ITEMS[idItem].precio = precio;
      this.guardar();
      this._colocacion = null;
      document.getElementById('ventana-admin-form').classList.add('oculto');
      Notificaciones.mostrar('💲 ' + Items.seguro(idItem).nombre + ' ahora vale $' + precio, 'exito', 6000);
      this._publicarParaTodos();
      return;
    }
    if (tipo === 'item_nuevo') {
      const nombre = this._valor('af-nombre').trim();
      const icono = this._valor('af-icono').trim() || '📦';
      if (nombre.length < 2) { alert('Ponle un nombre al objeto'); return; }
      const id = 'obj_' + nombre.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '').slice(0, 16) +
        '_' + Date.now().toString(36).slice(-4);
      const nuevo = {
        id, nombre, icono,
        precio: Items._limitarPrecio(this._numero('af-precio')),
        cura: this._numero('af-cura') || undefined,
        tipo: 'especial',
        desc: this._valor('af-desc').trim()
      };
      this.datos.itemsNuevos.push(nuevo);
      Items.aplicarMundo([nuevo], {});
      this.guardar();
      this._colocacion = null;
      document.getElementById('ventana-admin-form').classList.add('oculto');
      Notificaciones.mostrar('➕ Objeto creado: ' + icono + ' ' + nombre + ' ($' + nuevo.precio +
        '). Ya puedes dejarlo en el mapa o darlo de recompensa', 'exito', 6000);
      return;
    }

    if (tipo === 'mision') {
      const titulo = this._valor('af-titulo').trim();
      if (!titulo) { alert('Ponle un título a la misión'); return; }
      valores = {
        titulo,
        texto: this._valor('af-texto').trim(),
        reqItem: this._valor('af-req-item') || null,
        reqCant: Math.max(1, this._numero('af-req-cant')),
        consumir: document.getElementById('af-consumir').checked,
        dinero: this._numero('af-dinero'),
        recItem: this._valor('af-rec-item') || null,
        recCant: Math.max(1, this._numero('af-rec-cant'))
      };
      if (!valores.dinero && !valores.recItem) { alert('Ponle alguna recompensa (dinero u objeto)'); return; }
    } else if (tipo === 'tesoro') {
      valores = {
        invisible: this._valor('af-visible') === 'invisible',
        itemParaVer: this._valor('af-item-ver') || null,
        recItem: this._valor('af-rec-item'),
        recCant: Math.max(1, this._numero('af-rec-cant')),
        dinero: this._numero('af-dinero')
      };
    } else {
      valores = {
        itemId: this._valor('af-item'),
        cantidad: Math.max(1, this._numero('af-cant')),
        reaparece: this._numero('af-reaparece')
      };
    }

    this._colocacion.valores = valores;
    document.getElementById('ventana-admin-form').classList.add('oculto');
    this._empezarColocacion();
  },

  // ---------- COLOCAR EL PIN EN EL MAPA ----------
  _empezarColocacion() {
    this.modo = 'colocar';
    const centro = Mapa.mapa.getCenter();
    const marcador = L.marker([centro.lat, centro.lng], {
      draggable: true,
      zIndexOffset: 2000,
      icon: L.divIcon({ className: '', html: '<div class="icono-admin-pin">📌</div>', iconSize: [34, 34], iconAnchor: [17, 30] })
    }).addTo(Mapa.mapa);
    this._colocacion.marcador = marcador;
    this._mostrarControles('Arrastra el pin 📌 a su lugar y confirma', true);
  },

  async confirmarColocacion() {
    const c = this._colocacion;
    if (!c || !c.marcador) return;
    const p = c.marcador.getLatLng();
    const pos = [+p.lat.toFixed(6), +p.lng.toFixed(6)];
    c.marcador.remove();

    const id = 'admx_' + c.tipo[0] + '_' + Date.now().toString(36);
    if (c.tipo === 'mision') {
      const m = Object.assign({ id, pos }, c.valores);
      this.datos.misiones.push(m);
      Misiones.agregarAdmin(m);
      Notificaciones.mostrar('📜 Misión creada: ' + m.titulo, 'exito', 5000);
    } else if (c.tipo === 'tesoro') {
      const t = Object.assign({ id, pos }, c.valores);
      this.datos.tesoros.push(t);
      this._prepararTesoro(t);
      Notificaciones.mostrar('🎁 Tesoro ' + (t.invisible ? 'invisible' : 'visible') + ' creado', 'exito');
    } else {
      const o = Object.assign({ id, pos }, c.valores);
      this.datos.objetos.push(o);
      this._crearMarcadorObjeto(o);
      const item = Items.obtener(o.itemId);
      Notificaciones.mostrar('📦 ' + item.nombre + ' x' + o.cantidad + ' dejado en el mapa', 'exito');
    }
    localStorage.setItem(this.CLAVE, JSON.stringify(this.datos,
      (clave, valor) => clave.startsWith('_') ? undefined : valor));
    await this._publicarParaTodos();
    this._colocacion = null;
    this.salirModo();
  },

  // ---------- MISIONES DEL ADMIN ----------





  // ---------- TESOROS DEL ADMIN ----------
  _prepararTesoro(t) {
    if (this._progreso().tesoros.includes(t.id)) return;
    t._marcador = null;
    Mapa.registrarPunto({
      id: t.id,
      posicion: t.pos,
      radio: CONFIG.distanciaInteraccion,
      marcador: null,
      alCambiarDistancia: d => this._revisarTesoro(t, d)
    });
    this._revisarTesoro(t, Utilidades.distanciaMetros(GPS.posicion ? GPS.posicion : CONFIG.centro, t.pos));
  },

  _puedeDetectar(t) {
    return !t.itemParaVer || Mochila.tieneItem(t.itemParaVer);
  },

  _revisarTesoro(t, distancia) {
    if (this._progreso().tesoros.includes(t.id)) return;
    const detecta = this._puedeDetectar(t);

    // Visible: el icono 🎁 se ve siempre que el jugador pueda detectarlo.
    // Invisible: el icono solo aparece a menos de 10 m (los metros van en el banner).
    const debeVerse = detecta && (!t.invisible || distancia <= CONFIG.distanciaVerTesoro);

    if (debeVerse && !t._marcador) {
      t._marcador = L.marker(t.pos, {
        icon: L.divIcon({
          className: '',
          html: '<div class="icono-tesoro">🎁</div>',
          iconSize: [34, 34], iconAnchor: [17, 17]
        })
      }).addTo(Mapa.mapa);
      t._marcador.on('click', () => {
        if (this.manejarClickPunto({ id: t.id, esTesoroAdmin: t })) return;
        this._recogerTesoro(t);
      });
    } else if (!debeVerse && t._marcador) {
      t._marcador.remove();
      t._marcador = null;
    }
  },

  // Tesoros invisibles detectables ahora mismo (para el banner de metros)
  tesorosDetectables() {
    const lista = [];
    for (const t of this.tesorosTodos()) {
      if (this._progreso().tesoros.includes(t.id)) continue;
      if (t.invisible && this._puedeDetectar(t)) lista.push(t.pos);
    }
    return lista;
  },

  // La mochila cambió: puede que ahora se vea (o deje de verse) un tesoro
  refrescarVisibles() {
    if (!GPS.posicion) return;
    for (const t of this.tesorosTodos()) {
      if (this._progreso().tesoros.includes(t.id)) continue;
      this._revisarTesoro(t, Utilidades.distanciaMetros(GPS.posicion, t.pos));
    }
  },

  async _recogerTesoro(t) {
    const d = Utilidades.distanciaMetros(GPS.posicion, t.pos);
    if (d > CONFIG.distanciaInteraccion) {
      Notificaciones.mostrar('📍 Acércate más (' + Math.round(d) + ' m)', 'alerta');
      return;
    }
    if (this._progreso().tesoros.includes(t.id)) return;
    this._progreso().tesoros.push(t.id);
    Guardado.guardar();

    const punto = Mapa.mapa.latLngToContainerPoint(t.pos);
    Utilidades.volarHaciaMochila('🎁', punto.x, punto.y);
    if (t._marcador) { t._marcador.remove(); t._marcador = null; }

    const item = Items.obtener(t.recItem);
    setTimeout(async () => {
      Mochila.agregar(t.recItem, t.recCant, { silencioso: true });
      if (t.dinero) await Dinero.ganar(t.dinero, 'Tesoro encontrado: ' + item.nombre);
      Notificaciones.mostrar('🎁 ¡Tesoro! ' + item.icono + ' ' + item.nombre + ' x' + t.recCant +
        (t.dinero ? ' + $' + t.dinero : ''), 'exito', 5000);
      if (typeof Tesoros !== 'undefined') Tesoros.refrescarBanner();
    }, 800);
  },

  // ---------- OBJETOS DEJADOS EN EL MAPA (con reaparición) ----------
  // El progreso guarda CUÁNDO se recogió cada objeto: si el admin puso
  // reaparición, pasado ese tiempo vuelve a salir para ese jugador.
  _objetosRecogidos() {
    const p = this._progreso();
    if (Array.isArray(p.objetos)) {
      const mapa = {};
      for (const id of p.objetos) mapa[id] = Date.now();
      p.objetos = mapa;
    }
    if (!p.objetos || typeof p.objetos !== 'object') p.objetos = {};
    return p.objetos;
  },

  _objetoDisponible(o) {
    const t = this._objetosRecogidos()[o.id];
    if (!t) return true;
    return (o.reaparece || 0) > 0 && Date.now() - t > o.reaparece * 60000;
  },

  _crearMarcadorObjeto(o) {
    const item = Items.obtener(o.itemId);
    if (!item) return;
    o._marcador = null;
    Mapa.registrarPunto({
      id: o.id,
      posicion: o.pos,
      radio: CONFIG.distanciaInteraccion,
      marcador: null,
      alCambiarDistancia: () => this._revisarObjeto(o)
    });
    this._revisarObjeto(o);
  },

  _revisarObjeto(o) {
    const item = Items.obtener(o.itemId);
    if (!item) return;
    const disponible = this._objetoDisponible(o);
    if (disponible && !o._marcador) {
      o._marcador = Mapa.crearMarcadorEmoji(o.pos, item.icono, 26);
      o._marcador.on('click', () => {
        if (this.manejarClickPunto({ id: o.id, marcador: o._marcador })) return;
        this._recogerObjeto(o);
      });
    } else if (!disponible && o._marcador) {
      o._marcador.remove();
      o._marcador = null;
    }
  },

  _recogerObjeto(o) {
    if (!this._objetoDisponible(o)) return;
    const d = Utilidades.distanciaMetros(GPS.posicion, o.pos);
    if (d > CONFIG.distanciaInteraccion) {
      Notificaciones.mostrar('📍 Acércate más (' + Math.round(d) + ' m)', 'alerta');
      return;
    }
    const item = Items.obtener(o.itemId);
    if (!Mochila.agregar(o.itemId, o.cantidad, { silencioso: true })) return;
    this._objetosRecogidos()[o.id] = Date.now();
    Guardado.guardar();
    const punto = Mapa.mapa.latLngToContainerPoint(o.pos);
    Utilidades.volarHaciaMochila(item.icono, punto.x, punto.y);
    Notificaciones.mostrar(item.icono + ' Recogiste ' + item.nombre + ' x' + o.cantidad +
      ((o.reaparece || 0) > 0 ? ' (volverá a salir en ' + o.reaparece + ' min)' : ''), 'exito');
    if (o._marcador) { o._marcador.remove(); o._marcador = null; }
  },

  // ---------- MODOS ORGANIZAR / ELIMINAR ----------
  entrarModo(modo) {
    document.getElementById('ventana-admin').classList.add('oculto');
    this.modo = modo;
    this._mostrarControles(
      modo === 'organizar' ? '✋ Arrastra cualquier pin para moverlo' : '🗑️ Toca un pin para eliminarlo',
      false
    );

    // Mostrar pines fantasma de los tesoros base (normalmente invisibles)
    for (const t of DATOS_TESOROS) {
      if (this.eliminado(t.id)) continue;
      const fantasma = L.marker(t.posicion, {
        draggable: modo === 'organizar',
        opacity: 0.75,
        icon: L.divIcon({ className: '', html: '<div class="icono-tesoro">✨</div>', iconSize: [30, 30], iconAnchor: [15, 15] })
      }).addTo(Mapa.mapa);
      fantasma.on('dragend', () => {
        const p = fantasma.getLatLng();
        t.posicion[0] = +p.lat.toFixed(6);
        t.posicion[1] = +p.lng.toFixed(6);
        this.datos.posiciones[t.id] = [t.posicion[0], t.posicion[1]];
        this.guardar();
      });
      fantasma.on('click', () => {
        if (this.modo === 'eliminar') this._eliminarPin({ id: t.id, marcador: fantasma, nombre: 'Tesoro oculto' });
      });
      this._fantasmas.push(fantasma);
    }

    // Igual con los tesoros invisibles del admin
    for (const t of this.tesorosTodos()) {
      if (t._marcador) continue;
      const fantasma = L.marker(t.pos, {
        draggable: modo === 'organizar',
        opacity: 0.75,
        icon: L.divIcon({ className: '', html: '<div class="icono-tesoro">🎁</div>', iconSize: [30, 30], iconAnchor: [15, 15] })
      }).addTo(Mapa.mapa);
      fantasma.on('dragend', () => {
        const p = fantasma.getLatLng();
        t.pos[0] = +p.lat.toFixed(6); t.pos[1] = +p.lng.toFixed(6);
        this.datos.posiciones[t.id] = [t.pos[0], t.pos[1]];
        this.guardar();
      });
      fantasma.on('click', () => {
        if (this.modo === 'eliminar') this._eliminarPin({ id: t.id, marcador: fantasma, nombre: 'Tesoro del admin' });
      });
      this._fantasmas.push(fantasma);
    }

    if (modo === 'organizar') {
      for (const p of Mapa.puntosInteractivos) {
        if (!p.marcador || !p.marcador.dragging) continue;
        p.marcador.dragging.enable();
        p._alSoltar = () => {
          const nueva = p.marcador.getLatLng();
          p.posicion[0] = +nueva.lat.toFixed(6);
          p.posicion[1] = +nueva.lng.toFixed(6);
          this.datos.posiciones[p.id] = [p.posicion[0], p.posicion[1]];
          this.guardar();
        };
        p.marcador.on('dragend', p._alSoltar);
      }
    }
  },

  // Interceptor de toques sobre pines cuando hay un modo admin activo.
  // Devuelve true si el toque fue consumido por el modo.
  manejarClickPunto(punto) {
    if (this.modo === 'eliminar') {
      this._eliminarPin(punto);
      return true;
    }
    return this.modo === 'organizar' || this.modo === 'colocar';
  },

  _eliminarPin(punto) {
    if (!confirm('¿Eliminar este pin del mapa?' + (punto.nombre ? ' (' + punto.nombre + ')' : ''))) return;

    if (punto.id.startsWith('admx_')) {
      // Contenido creado por el admin: se borra el borrador local, y si
      // ya estaba publicado en GitHub, se marca como eliminado
      const habiaLocal =
        this.datos.misiones.some(x => x.id === punto.id) ||
        this.datos.tesoros.some(x => x.id === punto.id) ||
        this.datos.objetos.some(x => x.id === punto.id);
      this.datos.misiones = this.datos.misiones.filter(x => x.id !== punto.id);
      this.datos.tesoros = this.datos.tesoros.filter(x => x.id !== punto.id);
      this.datos.objetos = this.datos.objetos.filter(x => x.id !== punto.id);
      if (!habiaLocal && !this.datos.eliminados.includes(punto.id)) {
        this.datos.eliminados.push(punto.id);
      }
    } else {
      // Pines base del juego: se marcan como eliminados
      if (!this.datos.eliminados.includes(punto.id)) this.datos.eliminados.push(punto.id);
    }
    this.guardar();

    if (punto.marcador) punto.marcador.remove();
    if (punto.esTesoroAdmin && punto.esTesoroAdmin._marcador) punto.esTesoroAdmin._marcador.remove();
    const i = Mapa.puntosInteractivos.findIndex(p => p.id === punto.id);
    if (i >= 0) Mapa.puntosInteractivos.splice(i, 1);
    Notificaciones.mostrar('🗑️ Pin eliminado', 'alerta');
  },

  salirModo() {
    // Cancelar colocación pendiente
    if (this._colocacion && this._colocacion.marcador) this._colocacion.marcador.remove();
    this._colocacion = null;

    // Quitar fantasmas y desactivar arrastres
    for (const f of this._fantasmas) f.remove();
    this._fantasmas = [];
    for (const p of Mapa.puntosInteractivos) {
      if (p.marcador && p.marcador.dragging) {
        p.marcador.dragging.disable();
        if (p._alSoltar) { p.marcador.off('dragend', p._alSoltar); p._alSoltar = null; }
      }
    }
    this.modo = null;
    document.getElementById('admin-controles').classList.add('oculto');
  },

  _mostrarControles(texto, conConfirmar) {
    document.getElementById('admin-modo-texto').textContent = texto;
    document.getElementById('btn-admin-confirmar').style.display = conConfirmar ? '' : 'none';
    document.getElementById('admin-controles').classList.remove('oculto');
  },

  // ---------- BLOQUEO DEL JUEGO (mantenimiento y baneos) ----------
  // Devuelve null si el jugador puede jugar, o {tipo, mensaje} si está bloqueado
  estadoBloqueo() {
    const id = Usuarios.perfilActivo ? Usuarios.perfilActivo.id : '';
    const telefono = Usuarios.perfilActivo ? (Usuarios.perfilActivo.telefono || '') : '';
    // El baneo funciona por ID de jugador O por número de teléfono
    const ban = [...this.publicado.baneados, ...this.datos.baneados]
      .find(b => b.id === id || (telefono && b.id === telefono));
    if (ban) return { tipo: 'ban', mensaje: ban.motivo || 'Contacta al administrador.' };
    const mant = this.datos.mantenimiento || this.publicado.mantenimiento;
    if (mant && mant.activo) return { tipo: 'mantenimiento', mensaje: mant.mensaje || 'Volvemos pronto.' };
    return null;
  },

  alternarMantenimiento() {
    const actual = this.datos.mantenimiento || this.publicado.mantenimiento;
    if (actual && actual.activo) {
      this.datos.mantenimiento = { activo: false, mensaje: '' };
      Notificaciones.mostrar('🟢 Mantenimiento DESACTIVADO (publica el mundo para que aplique a todos)', 'exito', 6000);
    } else {
      const mensaje = prompt('Mensaje para los jugadores durante el mantenimiento:',
        'Estamos mejorando el juego, vuelve más tarde 🌴');
      if (mensaje === null) return;
      this.datos.mantenimiento = { activo: true, mensaje };
      Notificaciones.mostrar('🚧 Mantenimiento ACTIVADO (publica el mundo para que aplique a todos)', 'alerta', 6000);
    }
    this.guardar();
  },

  banear() {
    const id = prompt('ID del jugador O su número de teléfono (lo ves en su tarjeta o en un reporte):');
    if (!id || !id.trim()) return;
    const idLimpio = id.trim();
    const yaLocal = this.datos.baneados.findIndex(b => b.id === idLimpio);
    const yaPublicado = this.publicado.baneados.some(b => b.id === idLimpio);
    if (yaLocal >= 0 || yaPublicado) {
      if (confirm('Ese jugador YA está baneado. ¿Quitarle el ban?')) {
        if (yaLocal >= 0) this.datos.baneados.splice(yaLocal, 1);
        this.publicado.baneados = this.publicado.baneados.filter(b => b.id !== idLimpio);
        this.guardar();
        Notificaciones.mostrar('🟢 Ban quitado a ' + idLimpio + ' (publica el mundo)', 'exito', 6000);
      }
      return;
    }
    const motivo = prompt('Motivo del baneo:', 'Trampas detectadas');
    if (motivo === null) return;
    this.datos.baneados.push({ id: idLimpio, motivo, t: Date.now() });
    this.guardar();
    Notificaciones.mostrar('🚫 Jugador ' + idLimpio + ' baneado (publica el mundo para que aplique)', 'alerta', 6000);
  },

  enviarMensaje() {
    const para = prompt('¿Para quién? Escribe "todos" o el ID de un jugador:', 'todos');
    if (!para || !para.trim()) return;
    const texto = prompt('Mensaje:');
    if (!texto || !texto.trim()) return;
    this.datos.mensajes.push({
      id: 'msg_' + Date.now().toString(36),
      para: para.trim(), texto: texto.trim(), t: Date.now()
    });
    this.guardar();
    Notificaciones.mostrar('✉️ Mensaje guardado (publica el mundo para que le llegue)', 'exito', 6000);
  },

  // Muestra al jugador los mensajes del admin que aún no ha visto
  mostrarMensajes() {
    if (!Guardado.datos.mensajesVistos) Guardado.datos.mensajesVistos = [];
    const id = Usuarios.perfilActivo ? Usuarios.perfilActivo.id : '';
    const todos = [...this.publicado.mensajes, ...this.datos.mensajes];
    for (const m of todos) {
      if (Guardado.datos.mensajesVistos.includes(m.id)) continue;
      if (m.para !== 'todos' && m.para !== id) continue;
      Notificaciones.mostrar('✉️ Mensaje del administrador: ' + m.texto, 'alerta', 8000);
      Guardado.datos.mensajesVistos.push(m.id);
    }
    Guardado.guardar();
  },

  // Lee la tarjeta de jugador que alguien le mandó al admin
  async inspeccionar() {
    const codigo = prompt('Pega la tarjeta del jugador (empieza con TJ.):');
    if (!codigo) return;
    const datos = await Opciones.leerTarjeta(codigo.trim());
    if (!datos) { alert('❌ Tarjeta inválida o alterada'); return; }
    const resumen =
      '🪪 TARJETA VERIFICADA (firma correcta)\n\n' +
      'Jugador: ' + datos.nombre + '\nID: ' + datos.id + '\n' +
      'Teléfono: ' + (datos.telefono || 'sin número') + '\n' +
      'Dinero: $' + datos.dinero + '\nVida: ' + datos.vida + '\n' +
      'Objetos en mochila: ' + datos.objetos + '\n' +
      'Historial íntegro: ' + (datos.integro ? 'SÍ ✅' : 'NO ⚠️ POSIBLE HACKEO') + '\n' +
      'Generada: ' + Utilidades.fechaLegible(datos.t);
    if (confirm(resumen + '\n\n¿Banear a este jugador?')) {
      const motivo = prompt('Motivo del baneo:', 'Revisión del administrador');
      if (motivo === null) return;
      this.datos.baneados.push({ id: datos.id, motivo, t: Date.now() });
      this.guardar();
      Notificaciones.mostrar('🚫 ' + datos.nombre + ' baneado (publica el mundo)', 'alerta', 6000);
    }
  },

  // ---------- JUGADORES DE ESTE TELÉFONO ----------
  listarJugadores() {
    document.getElementById('ventana-admin').classList.add('oculto');
    document.getElementById('admin-form-titulo').textContent = '👥 Jugadores registrados';
    const campos = document.getElementById('admin-form-campos');
    campos.innerHTML = '';

    const globales = this.jugadoresGlobales();
    if (globales.length) {
      const tituloGlobal = document.createElement('div');
      tituloGlobal.className = 'campo-caja';
      tituloGlobal.textContent = '🌍 Todos los jugadores del juego (' + globales.length + ')';
      campos.appendChild(tituloGlobal);
      for (const j of globales) {
        const filaG = document.createElement('div');
        filaG.className = 'fila-tienda';
        filaG.innerHTML =
          '<span class="icono">👤</span>' +
          '<div class="datos"><div class="nombre">' + j.nombre +
          (j.nombre.toLowerCase() === (CONFIG.adminNombre || 'randy').toLowerCase() ? ' 🛠️ ADM' : '') +
          '</div><div class="precio">📱 ' + (j.telefono || 'sin número') + '<br>ID: ' + j.id + '</div></div>';
        campos.appendChild(filaG);
      }
    }

    const tituloLocal = document.createElement('div');
    tituloLocal.className = 'campo-caja';
    tituloLocal.style.marginTop = '12px';
    tituloLocal.textContent = '📱 En este teléfono';
    campos.appendChild(tituloLocal);
    document.getElementById('btn-admin-guardar').textContent = '➕ Crear jugador nuevo';

    for (const perfil of Usuarios.datos.lista) {
      const guardadoCrudo = localStorage.getItem(CONFIG.claveGuardado + '::' + perfil.id);
      let dinero = '—';
      try { dinero = '$' + JSON.parse(guardadoCrudo).datos.dinero.saldo; } catch (e) {}
      const fila = document.createElement('div');
      fila.className = 'fila-tienda';
      fila.innerHTML =
        '<span class="icono">👤</span>' +
        '<div class="datos"><div class="nombre">' + perfil.nombre +
        (perfil.id === Usuarios.perfilActivo.id ? ' (activo)' : '') + '</div>' +
        '<div class="precio">' + dinero + ' · 📱 ' + (perfil.telefono || 'sin número') +
        '<br>ID: ' + perfil.id + '</div></div>';
      const acciones = document.createElement('div');
      acciones.style.cssText = 'display:flex; flex-direction:column; gap:4px;';
      for (const [texto, accion] of [
        ['💰', () => this._ajustarDinero(perfil)],
        ['🎁', () => this._darObjeto(perfil)],
        ['🗑️', () => this._eliminarJugador(perfil)]
      ]) {
        const b = document.createElement('button');
        b.textContent = texto;
        b.style.cssText = 'border:none;border-radius:8px;padding:6px 10px;cursor:pointer;background:rgba(255,255,255,.12);color:#fff;';
        b.addEventListener('click', accion);
        acciones.appendChild(b);
      }
      fila.appendChild(acciones);
      campos.appendChild(fila);
    }
    // El botón grande de abajo crea un jugador nuevo
    this._colocacion = { tipo: 'crear_jugador' };
    document.getElementById('ventana-admin-form').classList.remove('oculto');
  },

  // ----- Motor para editar la partida guardada de cualquier jugador -----
  async _editarSave(perfil, editor) {
    const clave = CONFIG.claveGuardado + '::' + perfil.id;
    let paquete;
    try { paquete = JSON.parse(localStorage.getItem(clave)); } catch (e) { paquete = null; }
    if (!paquete || !paquete.datos) { alert('Ese jugador aún no tiene partida guardada'); return; }
    await editor(paquete.datos);
    paquete.firma = await Utilidades.sha256(JSON.stringify(paquete.datos) + Guardado.SAL);
    localStorage.setItem(clave, JSON.stringify(paquete));
  },

  async _anotarHistorialSave(datosSave, tipo, detalle, monto, saldo) {
    const lista = tipo === 'dinero' ? datosSave.historialDinero : datosSave.historialObjetos;
    const anterior = lista.length ? lista[lista.length - 1].hash : 'GENESIS';
    const e = { t: Date.now(), detalle, monto, saldo: saldo ?? null,
      lugar: 'Ajuste del administrador', pos: null, hashAnterior: anterior };
    e.hash = await Utilidades.sha256(
      Guardado.SAL + '|' + e.t + '|' + e.detalle + '|' + e.monto + '|' + e.saldo + '|' +
      (e.lugar ?? '') + '|' + (e.pos ? e.pos.join(',') : '') + '|' + e.hashAnterior);
    lista.push(e);
  },

  async _ajustarDinero(perfil) {
    const v = prompt('Cantidad de dinero a AGREGAR a ' + perfil.nombre + ' (negativa para quitar):', '100');
    if (v === null) return;
    const cantidad = parseInt(v, 10);
    if (!cantidad) return;
    if (perfil.id === Usuarios.perfilActivo.id) {
      if (cantidad > 0) await Dinero.ganar(cantidad, 'Ajuste del administrador');
      else await Dinero.gastar(-cantidad, 'Ajuste del administrador');
    } else {
      await this._editarSave(perfil, async datosSave => {
        datosSave.dinero.saldo = Math.max(0, datosSave.dinero.saldo + cantidad);
        datosSave.dinero.control = await Utilidades.sha256(Guardado.SAL + '|saldo|' + datosSave.dinero.saldo);
        await this._anotarHistorialSave(datosSave, 'dinero', 'Ajuste del administrador',
          cantidad, datosSave.dinero.saldo);
      });
    }
    Notificaciones.mostrar('💰 Dinero de ' + perfil.nombre + ' ajustado (' +
      (cantidad > 0 ? '+' : '') + cantidad + ')', 'exito');
    this.listarJugadores();
  },

  async _darObjeto(perfil) {
    const id = prompt('ID del objeto (ej: sardina, cana_pescar, perla, papel):');
    if (!id || !Items.obtener(id.trim())) { if (id !== null) alert('No existe un objeto con ese ID'); return; }
    const idItem = id.trim();
    const cantidad = Math.max(1, parseInt(prompt('Cantidad:', '1') || '1', 10) || 1);
    if (perfil.id === Usuarios.perfilActivo.id) {
      Mochila.agregar(idItem, cantidad);
    } else {
      await this._editarSave(perfil, async datosSave => {
        const slots = datosSave.mochila || [];
        let restante = cantidad;
        if (!Items.obtener(idItem).unico) {
          for (const sl of slots) if (sl && sl.id === idItem && restante > 0) { sl.cantidad += restante; restante = 0; }
        }
        for (let i = 0; i < slots.length && restante > 0; i++) {
          if (!slots[i]) {
            const cuanto = Items.obtener(idItem).unico ? 1 : restante;
            slots[i] = { id: idItem, cantidad: cuanto };
            restante -= cuanto;
          }
        }
        await this._anotarHistorialSave(datosSave, 'objetos',
          'Regalo del administrador: ' + Items.seguro(idItem).nombre, cantidad);
      });
    }
    Notificaciones.mostrar('🎁 ' + Items.seguro(idItem).nombre + ' x' + cantidad + ' para ' + perfil.nombre, 'exito');
  },

  _eliminarJugador(perfil) {
    if (perfil.id === Usuarios.perfilActivo.id) { alert('No puedes eliminar al jugador activo (cambia de jugador primero)'); return; }
    if (!confirm('¿Eliminar a ' + perfil.nombre + ' y TODA su partida de este teléfono?')) return;
    Usuarios.datos.lista = Usuarios.datos.lista.filter(p => p.id !== perfil.id);
    Usuarios._guardarLista();
    localStorage.removeItem(CONFIG.claveGuardado + '::' + perfil.id);
    Notificaciones.mostrar('🗑️ Jugador ' + perfil.nombre + ' eliminado', 'alerta');
    this.listarJugadores();
  },

  // ---------- PUBLICACIÓN AUTOMÁTICA (GitHub desde el teléfono) ----------
  configurarPublicacion() {
    const token = prompt(
      '🔑 Clave de GitHub (para Cuba, sin Firebase):\n\n' +
      '1. En PC entra a github.com → tu foto → Settings\n' +
      '2. Developer settings → Fine-grained tokens → Generate\n' +
      '3. Repo: randyraulbr1/github-pages\n' +
      '4. Permiso: Contents → Read and write\n' +
      '5. Copia el token y pégalo aquí\n\n' +
      '(Solo se guarda en TU teléfono. Luego al pulsar Confirmar sube solo.)'
    );
    if (token === null) return;
    this.datos.tokenPublicar = token.trim() || null;
    this.guardar();
    Notificaciones.mostrar(this.datos.tokenPublicar
      ? '🔑 ¡Listo! Al crear en el mapa y pulsar Confirmar, todos lo verán'
      : '🔑 Clave borrada', 'exito', 8000);
  },

  async publicarMundo() {
    const json = this._jsonMundo();
    Notificaciones.mostrar('🌍 Publicando el mundo…', 'info');

    // Opción A: Firebase (automático, sin token en el teléfono)
    if (CONFIG.firebaseMundoUrl) {
      try {
        const ok = await MundoPublico.publicar(json);
        if (ok) {
          this._ultimoPublicado = json;
          this._crudoPublicado = json;
          this._aplicarMundoRemoto(json);
          Notificaciones.mostrar('🌍 ¡Listo! Los jugadores lo ven en ~5 segundos', 'exito', 8000);
        } else {
          Notificaciones.mostrar('❌ No se pudo subir a Firebase. Revisa la URL en config.js', 'error', 7000);
        }
      } catch (e) {
        Notificaciones.mostrar('❌ Sin conexión. Intenta con WiFi', 'error', 6000);
      }
      return;
    }

    // Opción B: GitHub API (token en Admin)
    if (!this.datos.tokenPublicar) {
      Notificaciones.mostrar('🔑 Configura tu clave de GitHub en Admin (🔑 Configurar clave)', 'alerta', 7000);
      return;
    }
    const url = 'https://api.github.com/repos/' + CONFIG.repoPublicacion + '/contents/datos/mundo.json';
    const cabeceras = {
      'Authorization': 'Bearer ' + this.datos.tokenPublicar,
      'Accept': 'application/vnd.github+json'
    };
    let sha = null;
    try {
      const r = await fetch(url + '?ref=' + CONFIG.ramaPublicacion, { headers: cabeceras });
      if (r.ok) sha = (await r.json()).sha;
    } catch (e) {}
    const cuerpo = {
      message: 'Publicar mundo desde el juego (admin)',
      content: btoa(unescape(encodeURIComponent(json))),
      branch: CONFIG.ramaPublicacion
    };
    if (sha) cuerpo.sha = sha;
    try {
      const r = await fetch(url, { method: 'PUT', headers: cabeceras, body: JSON.stringify(cuerpo) });
      if (r.ok) {
        this._ultimoPublicado = json;
        this._crudoPublicado = json;
        this._aplicarMundoRemoto(json);
        Notificaciones.mostrar('🌍 ¡MUNDO PUBLICADO! Todos lo ven en ~1 min (recarga si no aparece)', 'exito', 10000);
      } else if (r.status === 401 || r.status === 403) {
        Notificaciones.mostrar('❌ La clave no tiene permiso: revisa el token en GitHub', 'error', 7000);
      } else {
        Notificaciones.mostrar('❌ GitHub respondió error ' + r.status + ': intenta de nuevo', 'error', 7000);
      }
    } catch (e) {
      Notificaciones.mostrar('❌ Sin conexión con GitHub: intenta más tarde', 'error', 6000);
    }
  },

  // ---------- EXPORTAR ----------
  // Contenido COMPLETO para datos/mundo.json (publicado + cambios locales)
  _jsonMundo() {
    const quitarTemporales = (clave, valor) => clave.startsWith('_') ? undefined : valor;
    const nuevosPorId = new Map();
    for (const it of this.publicado.itemsNuevos) nuevosPorId.set(it.id, it);
    for (const it of this.datos.itemsNuevos) nuevosPorId.set(it.id, it);
    return JSON.stringify({
      misiones: this.misionesTodas(),
      tesoros: this.tesorosTodos(),
      objetos: this.objetosTodos(),
      posiciones: Object.assign({}, this.publicado.posiciones, this.datos.posiciones),
      eliminados: [...new Set([...this.publicado.eliminados, ...this.datos.eliminados])]
        .filter(id => !id.startsWith('admx_')),
      precios: Object.assign({}, this.publicado.precios, this.datos.precios),
      itemsNuevos: [...nuevosPorId.values()],
      mantenimiento: this.datos.mantenimiento || this.publicado.mantenimiento,
      baneados: (() => {
        const porId = new Map();
        for (const b of this.publicado.baneados) porId.set(b.id, b);
        for (const b of this.datos.baneados) porId.set(b.id, b);
        return [...porId.values()];
      })(),
      mensajes: (() => {
        const porId = new Map();
        for (const m of this.publicado.mensajes) porId.set(m.id, m);
        for (const m of this.datos.mensajes) porId.set(m.id, m);
        return [...porId.values()].slice(-20);
      })(),
      jugadores: this._jugadoresParaPublicar()
    }, quitarTemporales, 2);
  },

  exportar() {
    const json = this._jsonMundo();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json)
        .then(() => Notificaciones.mostrar('📋 Copiado. Pégalo en datos/mundo.json en GitHub (o mándamelo)', 'exito', 7000))
        .catch(() => prompt('Copia este texto y pégalo en datos/mundo.json en GitHub:', json));
    } else {
      prompt('Copia este texto y pégalo en datos/mundo.json en GitHub:', json);
    }
  }
};
