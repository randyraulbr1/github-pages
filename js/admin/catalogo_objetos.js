// ============================================================
// FASE 13 — Catálogo de objetos en panel ADM
// Lista, detalle, editar, duplicar, desactivar, exportar
// ============================================================
const AdminCatalogo = {
  _admin: null,
  _selId: null,
  _filtro: { q: '', tipo: '', rareza: '' },
  _enlazado: false,

  iniciar(admin) {
    this._admin = admin;
    if (this._enlazado) return;
    this._enlazado = true;
    document.getElementById('admin-cat-bdd')?.addEventListener('click', () => this.abrir());
    document.getElementById('admin-catalogo-buscar')?.addEventListener('input', (e) => {
      this._filtro.q = e.target.value || '';
      this.pintarRejilla();
    });
    document.getElementById('admin-catalogo-filtro-tipo')?.addEventListener('change', (e) => {
      this._filtro.tipo = e.target.value || '';
      this.pintarRejilla();
    });
    document.getElementById('admin-catalogo-filtro-rareza')?.addEventListener('change', (e) => {
      this._filtro.rareza = e.target.value || '';
      this.pintarRejilla();
    });
    document.getElementById('btn-catalogo-crear')?.addEventListener('click', () => {
      this._admin.abrirFormulario('item_nuevo');
    });
    document.getElementById('btn-catalogo-editar')?.addEventListener('click', () => {
      if (this._selId) this._admin.abrirFormularioItemEditar(this._selId);
    });
    document.getElementById('btn-catalogo-duplicar')?.addEventListener('click', () => {
      if (this._selId) this._admin.duplicarCatalogoItem(this._selId);
    });
    document.getElementById('btn-catalogo-desactivar')?.addEventListener('click', () => {
      if (this._selId) this.desactivarSeleccionado();
    });
    document.getElementById('btn-catalogo-exportar-json')?.addEventListener('click', () => {
      this.exportar('json');
    });
    document.getElementById('btn-catalogo-exportar-txt')?.addEventListener('click', () => {
      this.exportar('txt');
    });
  },

  abrir() {
    this._admin._mostrarPanelDerecho('admin-vista-catalogo-bdd', '📦 Catálogo de objetos');
    const buscar = document.getElementById('admin-catalogo-buscar');
    if (buscar) buscar.value = this._filtro.q;
    this.pintarRejilla();
    if (this._selId) this.mostrarDetalle(this._selId);
    else this._vaciarDetalle();
  },

  _itemsNuevos() {
    return this._admin.datos.itemsNuevos || [];
  },

  pintarRejilla() {
    const rej = document.getElementById('admin-catalogo-rejilla');
    const cont = document.getElementById('admin-catalogo-contador');
    if (!rej) return;
    const lista = Items.listarParaAdmin(this._itemsNuevos(), this._filtro);
    if (cont) cont.textContent = lista.length + ' objeto' + (lista.length === 1 ? '' : 's');
    rej.innerHTML = '';
    if (!lista.length) {
      rej.innerHTML = '<div class="admin-catalogo-vacio">No hay objetos con ese filtro.</div>';
      this._selId = null;
      this._actualizarBotones();
      return;
    }
    for (const item of lista) {
      const cel = document.createElement('button');
      cel.type = 'button';
      cel.className = 'slot admin-catalogo-slot' +
        (item.id === this._selId ? ' sel' : '') +
        (item.estado === 'oculto' ? ' oculto' : '');
      cel.title = item.nombre + ' (' + item.id + ')';
      cel.innerHTML = '<span class="admin-catalogo-ico">' + (item.icono || '📦') + '</span>' +
        '<span class="admin-catalogo-nom">' + this._esc(item.nombre) + '</span>';
      cel.addEventListener('click', () => {
        this._selId = item.id;
        this.pintarRejilla();
        this.mostrarDetalle(item.id);
      });
      rej.appendChild(cel);
    }
    this._actualizarBotones();
  },

  mostrarDetalle(id) {
    const panel = document.getElementById('admin-catalogo-detalle');
    if (!panel) return;
    const meta = Items.metaDe(this._itemsNuevos(), id);
    const item = Object.assign({}, Items.seguro(id), meta, { id, esBase: Items.esBase(id) && !meta });
    let html = '<div class="admin-catalogo-det-titulo">' + (item.icono || '📦') + ' ' +
      this._esc(item.nombre) + '</div>';
    if (item.desc) {
      html += '<p class="admin-catalogo-det-desc">' + this._esc(item.desc) + '</p>';
    }
    if (item.descLarga) {
      html += '<p class="admin-catalogo-det-desc-larga">' + this._esc(item.descLarga) + '</p>';
    }
    html += '<dl class="admin-catalogo-det-dl">';
    for (const [k, v] of Items.resumenDetalle(item)) {
      html += '<dt>' + this._esc(k) + '</dt><dd>' + this._esc(String(v)) + '</dd>';
    }
    html += '</dl>';
    if (item.esBase) {
      html += '<p class="admin-catalogo-det-nota">Objeto base del juego. Puedes duplicarlo o cambiar su precio global.</p>';
    }
    panel.innerHTML = html;
    this._selId = id;
    this._actualizarBotones();
  },

  _vaciarDetalle() {
    const panel = document.getElementById('admin-catalogo-detalle');
    if (panel) {
      panel.innerHTML = '<p class="admin-clave-ayuda">Toca una casilla para ver la descripción y los datos del objeto.</p>';
    }
    this._actualizarBotones();
  },

  _actualizarBotones() {
    const id = this._selId;
    const meta = id ? Items.metaDe(this._itemsNuevos(), id) : null;
    const editable = id && !!meta;
    const esBase = id && Items.esBase(id) && !meta;
    const btnEdit = document.getElementById('btn-catalogo-editar');
    const btnDup = document.getElementById('btn-catalogo-duplicar');
    const btnOff = document.getElementById('btn-catalogo-desactivar');
    if (btnEdit) {
      btnEdit.disabled = !editable;
      btnEdit.title = editable ? 'Editar objeto personalizado' : 'Solo se editan objetos creados por el ADM';
    }
    if (btnDup) btnDup.disabled = !id;
    if (btnOff) {
      btnOff.disabled = !editable || meta?.estado === 'eliminado';
      btnOff.textContent = meta?.estado === 'oculto' ? 'Reactivar' : 'Ocultar';
    }
  },

  desactivarSeleccionado() {
    const id = this._selId;
    if (!id) return;
    const lista = this._admin.datos.itemsNuevos || [];
    const idx = lista.findIndex(x => x.id === id);
    if (idx < 0) return;
    const actual = lista[idx].estado || 'activo';
    const siguiente = actual === 'oculto' ? 'activo' : 'oculto';
    const msg = siguiente === 'oculto'
      ? '¿Ocultar este objeto? No aparecerá en tiendas ni en ADM ∞ hasta reactivarlo.'
      : '¿Reactivar este objeto?';
    if (!confirm(msg)) return;
    lista[idx].estado = siguiente;
    lista[idx].modificadoEn = Date.now();
    this._admin._reaplicarCatalogoItems();
    this._admin.guardar();
    this._admin._publicarParaTodos(true);
    Notificaciones.mostrar(siguiente === 'oculto' ? '👁️ Objeto oculto' : '✅ Objeto reactivado', 'exito', 4000);
    this.pintarRejilla();
    this.mostrarDetalle(id);
  },

  exportar(formato) {
    const pack = Items.exportarCatalogo(this._itemsNuevos(), formato === 'txt' ? 'txt' : 'json');
    const blob = new Blob([pack.contenido], { type: pack.mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = pack.nombre;
    a.click();
    URL.revokeObjectURL(url);
    Notificaciones.mostrar('💾 Exportado: ' + pack.nombre, 'exito', 4500);
  },

  _esc(t) {
    return String(t)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  },

  refrescarSiAbierto() {
    const v = document.getElementById('admin-vista-catalogo-bdd');
    if (v && !v.classList.contains('oculto')) this.pintarRejilla();
  }
};
