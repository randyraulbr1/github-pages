// ============================================================
// BOLSAS — objetos tirados al eliminar del inventario
// Visibles solo para jugadores cercanos (~60 m); recogida parcial según mochila.
// Desaparecen si quedan vacías o tras 5 min sin que nadie recoja nada.
// ============================================================
const Bolsas = {
  ttlMs() {
    return ((typeof CONFIG !== 'undefined' && CONFIG.bolsaDropMinutos) || 5) * 60 * 1000;
  },

  _esBolsa(o) {
    return !!(o && (o.esBolsa || String(o.id || '').startsWith('bolsa_')));
  },

  _posJugador() {
    if (typeof GPS !== 'undefined' && GPS.posicion) return GPS.posicion.slice();
    if (typeof Guardado !== 'undefined' && Guardado.datos?.posicionJugador) {
      return Guardado.datos.posicionJugador.slice();
    }
    return null;
  },

  limpiarExpiradas() {
    const listas = [];
    if (typeof Admin !== 'undefined' && Admin.publicado?.bolsasDrop) {
      listas.push(Admin.publicado.bolsasDrop);
    }
    if (typeof Guardado !== 'undefined' && Guardado.datos?.bolsasDrop) {
      listas.push(Guardado.datos.bolsasDrop);
    }
    const now = Date.now();
    for (const lista of listas) {
      for (let i = lista.length - 1; i >= 0; i--) {
        const b = lista[i];
        if (!b?.items?.length) {
          lista.splice(i, 1);
          if (typeof Admin !== 'undefined') Admin._liberarMarcadorBolsa(b?.id);
          continue;
        }
        if (!b.ultimoRecogidoEn && now - (b.creadoEn || 0) >= this.ttlMs()) {
          lista.splice(i, 1);
          if (typeof Admin !== 'undefined') Admin._liberarMarcadorBolsa(b.id);
        }
      }
    }
  },

  todas() {
    this.limpiarExpiradas();
    const mapa = {};
    const local = (typeof Guardado !== 'undefined' && Guardado.datos?.bolsasDrop) || [];
    const remoto = (typeof Admin !== 'undefined' && Admin.publicado?.bolsasDrop) || [];
    for (const b of local) if (b?.id) mapa[b.id] = b;
    for (const b of remoto) if (b?.id) mapa[b.id] = Object.assign({}, mapa[b.id] || {}, b);
    return Object.values(mapa).filter((b) => b?.items?.length);
  },

  distanciaVer() {
    return (typeof CONFIG !== 'undefined' && CONFIG.distanciaVerBolsa) || 60;
  },

  visibleCerca(b, distancia) {
    if (!b?.items?.length || !b?.pos) return false;
    if (this._ocultaParaMi(b)) return false;
    if (!b.ultimoRecogidoEn && Date.now() - (b.creadoEn || 0) >= this.ttlMs()) return false;
    const d = typeof distancia === 'number'
      ? distancia
      : (typeof GPS !== 'undefined' && GPS.posicion
        ? Utilidades.distanciaMetros(GPS.posicion, b.pos)
        : Infinity);
    return d <= this.distanciaVer();
  },

  disponible(b) {
    if (!b?.items?.length) return false;
    if (!b.ultimoRecogidoEn && Date.now() - (b.creadoEn || 0) >= this.ttlMs()) return false;
    if (b.recogibleDesde && Date.now() < b.recogibleDesde) return false;
    if (b.soloDropper && b.dropperPlayerId) {
      const miId = typeof Multijugador !== 'undefined' ? Multijugador._miPlayerId() : -1;
      if (miId > 0 && miId !== b.dropperPlayerId) return false;
    }
    return true;
  },

  _ocultaParaMi(b) {
    if (!b?.ocultoParaPlayerId || !b.ocultoHasta) return false;
    if (Date.now() >= b.ocultoHasta) return false;
    const miId = typeof Multijugador !== 'undefined' ? Multijugador._miPlayerId() : -1;
    return miId > 0 && miId === b.ocultoParaPlayerId;
  },

  /** Suelta una bolsa en el mapa (al eliminar del inventario). */
  async soltar(items, motivo) {
    const lista = (items || []).filter((it) => it?.id && (it.cantidad || 1) > 0);
    if (!lista.length) return false;
    const pos = this._posJugador();
    if (!pos) {
      if (typeof Notificaciones !== 'undefined') {
        Notificaciones.mostrar('📍 Sin posición GPS para dejar la bolsa', 'alerta', 3000);
      }
      return false;
    }
    const distDrop = (typeof CONFIG !== 'undefined' && CONFIG.distanciaBolsaDropMetros) || 5;
    const dropPos = Utilidades.desplazarMetros(pos, distDrop);

    const payload = {
      pos: dropPos,
      items: lista.map((it) => ({ id: it.id, cantidad: it.cantidad || 1 }))
    };

    if (typeof Multijugador !== 'undefined' && Multijugador.activo && CONFIG.servidorOnline) {
      const bolsa = await Multijugador.soltarBolsa(payload);
      if (!bolsa) return false;
      this._aplicarBolsa(bolsa);
      return true;
    }

    const bolsa = {
      id: 'bolsa_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
      pos: [+dropPos[0].toFixed(6), +dropPos[1].toFixed(6)],
      items: payload.items,
      creadoEn: Date.now(),
      esBolsa: true
    };
    if (!Guardado.datos.bolsasDrop) Guardado.datos.bolsasDrop = [];
    Guardado.datos.bolsasDrop.push(bolsa);
    Guardado.guardar();
    this._aplicarBolsa(bolsa);
    if (typeof Notificaciones !== 'undefined') {
      const n = lista.map((it) => Items.seguro(it.id).nombre).join(', ');
      Notificaciones.mostrar('🎒 Dejaste en el suelo: ' + n, 'info', 2500);
    }
    return true;
  },

  _aplicarBolsa(bolsa) {
    if (!bolsa?.id) return;
    if (typeof Admin !== 'undefined') {
      if (!Admin.publicado.bolsasDrop) Admin.publicado.bolsasDrop = [];
      const i = Admin.publicado.bolsasDrop.findIndex((b) => b.id === bolsa.id);
      if (i >= 0) Admin.publicado.bolsasDrop[i] = bolsa;
      else Admin.publicado.bolsasDrop.push(bolsa);
      Admin._crearMarcadorBolsa(bolsa);
    }
  },

  aplicarBolsaRemota(bolsa) {
    if (!bolsa?.id) return;
    this._aplicarBolsa(bolsa);
  },

  aplicarBolsaEliminada(bolsaId) {
    if (!bolsaId) return;
    if (Admin?.publicado?.bolsasDrop) {
      Admin.publicado.bolsasDrop = Admin.publicado.bolsasDrop.filter((b) => b.id !== bolsaId);
    }
    if (Guardado?.datos?.bolsasDrop) {
      Guardado.datos.bolsasDrop = Guardado.datos.bolsasDrop.filter((b) => b.id !== bolsaId);
      Guardado.guardar();
    }
    if (typeof Admin !== 'undefined') Admin._liberarMarcadorBolsa(bolsaId);
  },

  /** Recoge lo que quepa en la mochila. */
  async recoger(bolsa) {
    if (!bolsa || !bolsa.items?.length) return false;
    if (bolsa.recogibleDesde && Date.now() < bolsa.recogibleDesde) {
      const seg = Math.ceil((bolsa.recogibleDesde - Date.now()) / 1000);
      Notificaciones.mostrar('⏳ Podrás recoger en ' + seg + ' s', 'info', 2500);
      return false;
    }
    if (!this.disponible(bolsa)) return false;
    if (!GPS.posicion || !bolsa.pos) return false;
    const d = Utilidades.distanciaMetros(GPS.posicion, bolsa.pos);
    if (d > CONFIG.distanciaInteraccion) {
      Notificaciones.mostrar('📍 Acércate más para recoger (' + Math.round(d) + ' m)', 'info', 3500);
      return false;
    }

    const recogidos = [];
    for (const it of (bolsa.items || [])) {
      const r = Mochila.agregarHasta(it.id, it.cantidad || 1, { silencioso: true });
      if (r.agregado > 0) recogidos.push({ id: it.id, cantidad: r.agregado });
    }
    if (!recogidos.length) {
      Notificaciones.mostrar('🎒 No cabe nada más en tu mochila', 'error', 3000);
      return false;
    }

    if (typeof Multijugador !== 'undefined' && Multijugador.activo && CONFIG.servidorOnline) {
      const res = await Multijugador.recogerBolsa(bolsa.id, recogidos, bolsa.pos);
      if (!res?.ok) {
        for (const r of recogidos) Mochila.quitar(r.id, r.cantidad, 'Revertir recogida');
        return false;
      }
      if (res.vacia) this.aplicarBolsaEliminada(bolsa.id);
      else if (res.bolsa) this.aplicarBolsaRemota(res.bolsa);
    } else {
      for (const r of recogidos) {
        const idx = bolsa.items.findIndex((it) => it.id === r.id);
        if (idx < 0) continue;
        bolsa.items[idx].cantidad -= r.cantidad;
        if (bolsa.items[idx].cantidad <= 0) bolsa.items.splice(idx, 1);
      }
      bolsa.ultimoRecogidoEn = Date.now();
      if (!bolsa.items.length) this.aplicarBolsaEliminada(bolsa.id);
      else if (typeof Admin !== 'undefined') Admin._revisarBolsa(bolsa);
      Guardado.guardar();
    }

    Mochila.guardar();
    const nombres = recogidos.map((r) => Items.seguro(r.id).nombre + ' x' + r.cantidad).join(', ');
    Notificaciones.mostrar('🎒 Recogiste: ' + nombres, 'exito', 3000);
    const punto = Mapa.mapa?.latLngToContainerPoint(bolsa.pos);
    if (punto && recogidos[0]) {
      Utilidades.volarHaciaMochila(Items.seguro(recogidos[0].id).icono, punto.x, punto.y);
    }
    return true;
  }
};
