/**
 * Fase 3.6 — caché autoritativa de tesoros/misiones/cofres/tiendas vía deltas del servidor.
 * En online: game:init (worldObjects + missions) y world:updateObject / mission:* .
 * El blob (mundoSnapshot) solo reconcilia config/estados, no es la fuente principal del mapa.
 */
const ContenidoMundo = {
  activo: false,
  tesoros: new Map(),
  misiones: new Map(),
  cofres: new Map(),
  tiendas: new Map(),
  eliminados: new Set(),
  tesorosEstado: {},

  usarDeltas() {
    return this.activo && !!(CONFIG.servidorOnline &&
      typeof Multijugador !== 'undefined' && Multijugador.activo);
  },

  reset() {
    this.tesoros = new Map();
    this.misiones = new Map();
    this.cofres = new Map();
    this.tiendas = new Map();
    this.eliminados = new Set();
    this.tesorosEstado = {};
    this.activo = false;
  },

  inicializarDesdeInit(opts) {
    this.reset();
    const snap = opts?.mundoSnapshot || {};
    if (Array.isArray(snap.eliminados)) {
      for (const id of snap.eliminados) if (id) this.eliminados.add(id);
    }
    if (snap.tesorosEstado) {
      this.tesorosEstado = Object.assign({}, snap.tesorosEstado);
    }
    for (const obj of (opts?.worldObjects || [])) {
      this._ingestarWorldObject(obj, true);
    }
    for (const m of (opts?.missions || [])) {
      this._ingestarMision(m, true);
    }
    for (const c of (snap.cofres || [])) {
      if (!c?.id || this.eliminados.has(c.id)) continue;
      this.cofres.set(c.id, Object.assign({}, c));
    }
    this.activo = true;
  },

  /** Fallback HTTP cuando el socket aún no envió game:init (Fase 3.6). */
  inicializarDesdeSnapshot(snap) {
    if (!snap || typeof snap !== 'object') return;
    this.reset();
    if (Array.isArray(snap.eliminados)) {
      for (const id of snap.eliminados) if (id) this.eliminados.add(id);
    }
    if (snap.tesorosEstado) {
      this.tesorosEstado = Object.assign({}, snap.tesorosEstado);
    }
    for (const t of (snap.tesoros || [])) {
      if (!t?.id || this.eliminados.has(t.id)) continue;
      this.tesoros.set(t.id, Object.assign({}, t));
    }
    for (const m of (snap.misiones || [])) {
      if (!m?.id || this.eliminados.has(m.id)) continue;
      this.misiones.set(m.id, Object.assign({}, m));
    }
    for (const c of (snap.cofres || [])) {
      if (!c?.id || this.eliminados.has(c.id)) continue;
      this.cofres.set(c.id, Object.assign({}, c));
    }
    for (const t of (snap.tiendasAdmin || [])) {
      if (!t?.id || this.eliminados.has(t.id)) continue;
      const merged = Object.assign({}, t);
      const pos = t.pos || t.posicion;
      if (pos) merged.pos = pos.slice();
      this.tiendas.set(t.id, merged);
    }
    this.activo = !!(CONFIG.servidorOnline);
    this._refrescarModulos();
  },

  reconciliarDesdeSnapshot(snap) {
    if (!snap || typeof snap !== 'object') return;
    this.eliminados = new Set((snap.eliminados || []).filter(Boolean));
    if (snap.tesorosEstado) {
      this.tesorosEstado = Object.assign({}, snap.tesorosEstado);
    }
    const ids = {
      tesoros: new Set(),
      misiones: new Set(),
      cofres: new Set(),
      tiendas: new Set()
    };
    for (const t of (snap.tesoros || [])) {
      if (!t?.id || this.eliminados.has(t.id)) continue;
      ids.tesoros.add(t.id);
      const prev = this.tesoros.get(t.id);
      const merged = Object.assign({}, prev, t);
      if (t.pos) merged.pos = t.pos.slice();
      this.tesoros.set(t.id, merged);
    }
    for (const m of (snap.misiones || [])) {
      if (!m?.id || this.eliminados.has(m.id)) continue;
      ids.misiones.add(m.id);
      const merged = Object.assign({}, this.misiones.get(m.id), m);
      if (m.pos) merged.pos = m.pos.slice();
      this.misiones.set(m.id, merged);
    }
    for (const c of (snap.cofres || [])) {
      if (!c?.id || this.eliminados.has(c.id) || c.eliminado) continue;
      ids.cofres.add(c.id);
      this.cofres.set(c.id, Object.assign({}, this.cofres.get(c.id), c));
    }
    for (const t of (snap.tiendasAdmin || [])) {
      if (!t?.id || this.eliminados.has(t.id)) continue;
      ids.tiendas.add(t.id);
      const merged = Object.assign({}, this.tiendas.get(t.id), t);
      const pos = t.pos || t.posicion;
      if (pos) merged.pos = pos.slice();
      this.tiendas.set(t.id, merged);
    }
    for (const mapa of [
      [this.tesoros, ids.tesoros],
      [this.misiones, ids.misiones],
      [this.cofres, ids.cofres],
      [this.tiendas, ids.tiendas]
    ]) {
      for (const id of [...mapa[0].keys()]) {
        if (!mapa[1].has(id)) mapa[0].delete(id);
      }
    }
    for (const id of this.eliminados) {
      this.tesoros.delete(id);
      this.misiones.delete(id);
      this.cofres.delete(id);
      this.tiendas.delete(id);
    }
    this._refrescarModulos();
  },

  estaEliminado(id) {
    return !!(id && this.eliminados.has(id));
  },

  listaTesoros() {
    return [...this.tesoros.values()].filter(t => t && t.id && !this.estaEliminado(t.id));
  },

  listaMisiones() {
    return [...this.misiones.values()].filter(m => m && m.id && !this.estaEliminado(m.id));
  },

  listaCofres() {
    return [...this.cofres.values()].filter(c => c && c.id && !c.eliminado && !this.estaEliminado(c.id));
  },

  listaTiendas() {
    return [...this.tiendas.values()].filter(t => t && t.id && !this.estaEliminado(t.id));
  },

  getTesoro(id) {
    return this.tesoros.get(id) || null;
  },

  aplicarWorldObject(obj) {
    if (!obj) return;
    this._ingestarWorldObject(obj, false);
  },

  quitarPorOrigenId(origenId) {
    if (!origenId) return;
    this.eliminados.add(origenId);
    this.tesoros.delete(origenId);
    this.misiones.delete(origenId);
    this.cofres.delete(origenId);
    this.tiendas.delete(origenId);
    this._quitarEnModulos(origenId);
  },

  aplicarMision(row) {
    if (!row) return;
    this._ingestarMision(row, false);
  },

  _blobTesoro(origenId, pos, d) {
    return {
      id: origenId,
      pos: pos.slice(),
      invisible: !!d.invisible,
      itemParaVer: d.itemParaVer || null,
      iconoMapa: d.iconoMapa || '💎',
      nivelMin: d.nivelMin || 1,
      recItems: d.recItems || [],
      dinero: d.dinero || 0,
      respawnMin: d.respawnMin || 0
    };
  },

  _blobTienda(origenId, pos, d) {
    return {
      id: origenId,
      pos: pos.slice(),
      posicion: pos.slice(),
      nombre: d.nombre || 'Tienda',
      icono: d.icon || d.icono || '🏪',
      vende: d.vende || []
    };
  },

  _blobCofre(origenId, pos, d) {
    return {
      id: origenId,
      pos: pos.slice(),
      visible: d.visible !== false,
      pin: d.pin || null,
      slots: d.slots || [],
      vacioDesde: d.vacioDesde || null
    };
  },

  _blobMisionDesdeServidor(row) {
    const reward = row.reward || {};
    const origenId = reward.origenId;
    if (!origenId) return null;
    if (row.deleted || row.isActive === false) return { eliminar: origenId };
    const pos = reward.pos && reward.pos.length >= 2 ? reward.pos : null;
    if (!pos) return null;
    return {
      id: origenId,
      titulo: row.title || 'Misión',
      texto: row.description || '',
      pos: pos.slice(),
      xp: reward.xp || 25,
      dinero: reward.dinero || 0,
      reqItem: reward.reqItem || null,
      reqCant: reward.reqCant || 0,
      consumir: !!reward.consumir,
      recItems: reward.recItems || []
    };
  },

  _ingestarWorldObject(obj, silencioso) {
    const d = obj.data || {};
    const origenId = d.origenId || obj.id;
    if (!origenId) return;
    if (obj.state === 'removed') {
      this.quitarPorOrigenId(origenId);
      return;
    }
    const pos = [Number(obj.x), Number(obj.y)];
    if (!Number.isFinite(pos[0]) || !Number.isFinite(pos[1])) return;
    this.eliminados.delete(origenId);

    if (obj.type === 'treasure') {
      this.tesoros.set(origenId, this._blobTesoro(origenId, pos, d));
    } else if (obj.type === 'shop') {
      this.tiendas.set(origenId, this._blobTienda(origenId, pos, d));
    } else if (obj.type === 'chest') {
      this.cofres.set(origenId, this._blobCofre(origenId, pos, d));
    } else {
      return;
    }

    if (!silencioso) this._refrescarModulos();
  },

  _ingestarMision(row, silencioso) {
    const blob = this._blobMisionDesdeServidor(row);
    if (!blob) return;
    if (blob.eliminar) {
      this.quitarPorOrigenId(blob.eliminar);
      return;
    }
    this.eliminados.delete(blob.id);
    const prev = this.misiones.get(blob.id);
    this.misiones.set(blob.id, Object.assign({}, prev, blob));
    if (!silencioso) {
      if (typeof Misiones !== 'undefined' && Misiones.syncDesdeServidor) {
        Misiones.syncDesdeServidor(this.misiones.get(blob.id));
      } else {
        this._refrescarModulos();
      }
    }
  },

  _quitarEnModulos(origenId) {
    if (typeof Admin !== 'undefined') {
      Admin._liberarMarcadorTesoro(origenId);
      Admin._quitarPuntosInteractivos(origenId);
    }
    if (typeof Misiones !== 'undefined' && Misiones.quitarDesdeServidor) {
      Misiones.quitarDesdeServidor(origenId);
    }
    if (typeof Tiendas !== 'undefined' && Tiendas._marcadoresAdmin?.[origenId]) {
      try { Tiendas._marcadoresAdmin[origenId].remove(); } catch (e) { /* */ }
      delete Tiendas._marcadoresAdmin[origenId];
      Tiendas._listaAdmin = (Tiendas._listaAdmin || []).filter(t => t.id !== origenId);
    }
    if (typeof Cofres !== 'undefined' && Cofres._quitarMarcador) {
      Cofres._quitarMarcador(origenId);
    }
    const i = typeof Mapa !== 'undefined'
      ? Mapa.puntosInteractivos.findIndex(p => p.id === origenId) : -1;
    if (i >= 0) Mapa.puntosInteractivos.splice(i, 1);
  },

  _refrescarModulos() {
    if (typeof Admin === 'undefined') return;
    for (const t of this.listaTesoros()) {
      if (typeof Admin.pos === 'function') Admin.pos(t.id, t.pos);
      if (typeof Admin._prepararTesoro === 'function') Admin._prepararTesoro(t);
    }
    if (typeof Misiones !== 'undefined') {
      for (const m of this.listaMisiones()) {
        if (Misiones.syncDesdeServidor) Misiones.syncDesdeServidor(m);
      }
    }
    if (typeof Tiendas !== 'undefined' && Tiendas.refrescarAdmin) Tiendas.refrescarAdmin();
    if (typeof Cofres !== 'undefined' && Cofres._pintarTodos) Cofres._pintarTodos();
    if (typeof Admin.refrescarVisibles === 'function') Admin.refrescarVisibles();
  }
};
