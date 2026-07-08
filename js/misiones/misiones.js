// ============================================================
// MISIONES — sistema de aceptar y recolectar
//  - Los iconos ❗ del mapa son misiones. El jugador va al icono
//    y la ACEPTA (máximo 3 a la vez).
//  - Sus misiones activas salen en un letrero a la IZQUIERDA,
//    cada una con su color (azul, verde, naranja).
//  - Al cumplir el objetivo, aparece una LÍNEA de su color en el
//    mapa apuntando al icono: hay que volver ahí y RECOLECTAR
//    la recompensa tocando el icono.
// ============================================================
const Misiones = {
  MAX_ACTIVAS: 3,
  COLORES: ['#2f8bff', '#35d461', '#ff9f1c'], // azul, verde, naranja
  lista: [],        // todas las misiones normalizadas (base + admin)
  _lineas: {},      // id → línea dibujada en el mapa
  _marcadores: {},  // id → marcador

  // ---------- ESTADOS POR JUGADOR ----------
  // estados: disponible → aceptada → lista (objetivo cumplido) → recolectada
  _estados() {
    if (!Guardado.datos.misionesEstado) {
      Guardado.datos.misionesEstado = {};
      // Migrar partidas del sistema anterior
      const viejo = Guardado.datos.misiones || {};
      for (const [id, e] of Object.entries(viejo)) {
        if (e && e.completada) Guardado.datos.misionesEstado[id] = { estado: 'recolectada', progreso: e.progreso || 0, orden: 0 };
      }
    }
    return Guardado.datos.misionesEstado;
  },
  _estado(id) {
    return this._estados()[id] || { estado: 'disponible', progreso: 0, orden: 0 };
  },
  _poner(id, cambios) {
    const e = Object.assign({ estado: 'disponible', progreso: 0, orden: 0 }, this._estados()[id], cambios);
    this._estados()[id] = e;
    Guardado.guardar();
    return e;
  },
  activas() {
    return this.lista
      .filter(m => ['aceptada', 'lista'].includes(this._estado(m.id).estado))
      .sort((a, b) => this._estado(a.id).orden - this._estado(b.id).orden);
  },
  _colorDe(id) {
    const i = this.activas().findIndex(m => m.id === id);
    return this.COLORES[Math.max(0, i) % this.COLORES.length];
  },

  // ---------- ARRANQUE ----------
  iniciar() {
    this.lista = [];
    for (const m of DATOS_MISIONES) {
      if (Admin.eliminado(m.id)) continue;
      Admin.pos(m.id, m.posicion);
      this.lista.push({
        id: m.id, titulo: m.titulo, texto: m.descripcion, tipo: m.tipo,
        evento: m.evento, meta: m.meta,
        requiere: m.requiere || [], consumir: m.tipo === 'entregar',
        pos: m.posicion,
        dinero: (m.recompensa && m.recompensa.dinero) || 0,
        items: (m.recompensa && m.recompensa.items) || []
      });
    }
    for (const m of Admin.misionesTodas()) this.lista.push(this._normalizarAdmin(m));

    for (const m of this.lista) this._crearMarcador(m);
    this.pintarLetrero();
    document.getElementById('overlay-mision-cerrar')?.addEventListener('click', () => this._cerrarOverlay());
    document.getElementById('overlay-mision-activa')?.addEventListener('click', ev => {
      if (ev.target.id === 'overlay-mision-activa') this._cerrarOverlay();
    });
  },

  _normalizarAdmin(m) {
    Admin.pos(m.id, m.pos);
    let items = [];
    if (m.recItems && m.recItems.length) {
      items = m.recItems.filter(Boolean).map(r => ({ id: r.id, cantidad: r.cantidad || 1 }));
    } else if (m.recItem) {
      items = [{ id: m.recItem, cantidad: m.recCant || 1 }];
    }
    return {
      id: m.id, titulo: m.titulo, texto: m.texto || '',
      tipo: m.reqItem ? 'entregar' : 'visitar',
      requiere: m.reqItem ? [{ id: m.reqItem, cantidad: m.reqCant || 1 }] : [],
      consumir: !!m.consumir, pos: m.pos,
      dinero: m.dinero || 0,
      items,
      xp: m.xp || 25
    };
  },

  agregarAdmin(mAdmin) {
    const m = this._normalizarAdmin(mAdmin);
    this.lista.push(m);
    this._crearMarcador(m);
  },

  syncDesdeServidor(mAdmin) {
    if (!mAdmin?.id) return;
    const m = this._normalizarAdmin(mAdmin);
    const idx = this.lista.findIndex(x => x.id === m.id);
    if (idx < 0) {
      this.lista.push(m);
      this._crearMarcador(m);
      return;
    }
    this.lista[idx] = Object.assign({}, this.lista[idx], m);
    const mar = this._marcadores[m.id];
    if (mar && m.pos) {
      mar.setLatLng(m.pos);
      const p = Mapa.puntosInteractivos.find(x => x.id === m.id);
      if (p) p.posicion = m.pos.slice();
    } else if (!mar) {
      this._crearMarcador(m);
    }
    this._actualizarIconoMapa(m);
    this.pintarLetrero();
    this.actualizarLineas();
  },

  quitarDesdeServidor(id) {
    if (!id) return;
    const idx = this.lista.findIndex(m => m.id === id);
    if (idx < 0) return;
    if (this._marcadores[id]) {
      this._marcadores[id].remove();
      delete this._marcadores[id];
    }
    if (this._lineas[id]) {
      this._lineas[id].remove();
      delete this._lineas[id];
    }
    this.lista.splice(idx, 1);
    const pi = Mapa.puntosInteractivos.findIndex(p => p.id === id);
    if (pi >= 0) Mapa.puntosInteractivos.splice(pi, 1);
    this.pintarLetrero();
    this.actualizarLineas();
  },

  _crearMarcador(m) {
    if (this._estado(m.id).estado === 'recolectada') return;
    const marcador = Mapa.crearMarcadorEmoji(m.pos, '❗', 26);
    this._marcadores[m.id] = marcador;
    Mapa.registrarPunto({
      id: m.id,
      posicion: m.pos,
      radio: CONFIG.distanciaInteraccion,
      marcador,
      alTocar: () => this.abrirMision(m)
    });
    this._actualizarIconoMapa(m);
  },

  _actualizarIconoMapa(m) {
    const mar = this._marcadores[m.id];
    if (!mar) return;
    const el = mar.getElement()?.querySelector('.icono-mapa');
    if (!el) return;
    const e = this._estado(m.id);
    const premio = ['aceptada', 'lista'].includes(e.estado) && this.puedeRecolectar(m);
    el.classList.toggle('mision-premio', premio);
  },

  _actualizarIconosMapa() {
    for (const m of this.lista) this._actualizarIconoMapa(m);
  },

  // ---------- LÓGICA DE OBJETIVOS ----------
  puedeRecolectar(m) {
    const e = this._estado(m.id);
    if (!['aceptada', 'lista'].includes(e.estado)) return false;
    if (m.tipo === 'visitar') return true;
    if (m.tipo === 'contar') return e.progreso >= m.meta;
    return m.requiere.every(r => Mochila.contar(r.id) >= r.cantidad);
  },

  _inventarioLlenoRecompensa(m) {
    return (m.items || []).length > 0 && !Mochila.puedeRecibirRecompensa(m.items);
  },

  refrescar() {
    for (const m of this.lista) {
      const e = this._estado(m.id);
      if (e.estado === 'aceptada' && this.puedeRecolectar(m)) this._poner(m.id, { estado: 'lista' });
      if (e.estado === 'lista' && !this.puedeRecolectar(m)) this._poner(m.id, { estado: 'aceptada' });
    }
    this.pintarLetrero();
    this.actualizarLineas();
    this._actualizarIconosMapa();
  },

  evento(nombre) {
    for (const m of this.lista) {
      if (m.tipo !== 'contar' || m.evento !== nombre) continue;
      const e = this._estado(m.id);
      if (e.estado !== 'aceptada') continue;
      const progreso = e.progreso + 1;
      this._poner(m.id, { progreso, estado: progreso >= m.meta ? 'lista' : 'aceptada' });
      if (progreso >= m.meta) {
        Notificaciones.mostrar('🎯 ¡' + m.titulo + ' cumplida! Sigue la línea para recoger tu premio', 'exito', 5000);
      } else {
        Notificaciones.mostrar('📜 ' + m.titulo + ': ' + progreso + '/' + m.meta, 'info');
      }
    }
    this.pintarLetrero();
    this.actualizarLineas();
    this._actualizarIconosMapa();
  },

  _textoRequisitos(m) {
    const e = this._estado(m.id);
    if (m.tipo === 'contar') return 'Progreso: ' + e.progreso + ' / ' + m.meta;
    if (m.requiere.length) {
      return 'Necesitas: ' + m.requiere.map(r =>
        Items.seguro(r.id).nombre + ' ' + Mochila.contar(r.id) + '/' + r.cantidad).join(', ');
    }
    if (m.texto) return m.texto;
    if (m.tipo === 'visitar') return 'Ve al icono ❗ de la misión en el mapa';
    return '';
  },

  _textoPremio(m) {
    const premioDinero = (m.dinero ? '💰 $' + m.dinero : '');
    const premioItems = (m.items || []).map(it =>
      Items.seguro(it.id).icono + ' ' + Items.seguro(it.id).nombre + ' x' + it.cantidad).join(' · ');
    const premioXp = (m.xp ? '⭐ ' + m.xp + ' XP' : '');
    return [premioDinero, premioItems, premioXp].filter(Boolean).join(' · ');
  },

  // ---------- VENTANA DE LA MISIÓN (al tocar el icono) ----------
  abrirMision(m) {
    const e = this._estado(m.id);
    if (e.estado === 'recolectada') return;
    const cont = document.getElementById('lista-misiones');
    cont.innerHTML = '';

    const caja = document.createElement('div');
    caja.className = 'mision';
    const requisitos = this._textoRequisitos(m);
    const puedeRecoger = this.puedeRecolectar(m);
    const inventarioLleno = puedeRecoger && this._inventarioLlenoRecompensa(m);
    let rejillaHtml = '';
    if ((m.items || []).length) {
      rejillaHtml = '<div class="mision-recompensa-preview' + (puedeRecoger ? ' desbloqueada' : '') + '">' +
        '<div class="mision-recompensa-titulo">' + (puedeRecoger ? '🎁 Recompensas' : '🔒 Recompensas (al completar)') + '</div>' +
        '<div class="mision-recompensa-rejilla">';
      const itemsMostrar = m.items.slice(0, 6);
      for (const it of itemsMostrar) {
        const item = Items.seguro(it.id);
        rejillaHtml += '<div class="slot mision-recompensa-slot' + (puedeRecoger ? '' : ' bloqueada') + '" title="' +
          item.nombre + '">' + item.icono + '<span class="cantidad">' + it.cantidad + '</span></div>';
      }
      for (let i = itemsMostrar.length; i < 6; i++) {
        rejillaHtml += '<div class="slot mision-recompensa-slot vacia"></div>';
      }
      rejillaHtml += '</div></div>';
    }
    caja.innerHTML =
      '<div class="titulo">❗ ' + m.titulo + '</div>' +
      (m.texto ? '<div class="descripcion">' + m.texto + '</div>' : '') +
      (requisitos ? '<div class="progreso">' + requisitos + '</div>' : '') +
      rejillaHtml +
      '<div class="distancia">Recompensa: ' + this._textoPremio(m) + '</div>' +
      (inventarioLleno ? '<div class="mision-aviso-lleno">🎒 Tu inventario está lleno. Libera espacio y vuelve a recoger.</div>' : '');
    cont.appendChild(caja);

    const botones = document.createElement('div');
    botones.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap;';
    if (e.estado === 'disponible') {
      botones.appendChild(this._boton('✅ Aceptar misión', '#30d158', '#05310f', () => this.aceptar(m)));
    } else if (puedeRecoger) {
      if (!inventarioLleno) {
        botones.appendChild(this._boton('🎁 Recolectar recompensa', '#ffd60a', '#3d3200', () => this.recolectar(m)));
      }
    } else {
      botones.appendChild(this._boton('✖ Abandonar', '#ff453a', '#fff', () => this.abandonar(m)));
    }
    cont.appendChild(botones);
    if (typeof UIManager !== 'undefined') UIManager.abrir('ventana-misiones');
    else document.getElementById('ventana-misiones').classList.remove('oculto');
  },

  _boton(texto, fondo, color, accion) {
    const b = document.createElement('button');
    b.textContent = texto;
    b.style.cssText = 'flex:1; border:none; border-radius:12px; padding:13px; font-weight:800; font-size:14px;' +
      'cursor:pointer; background:' + fondo + '; color:' + color + '; min-width:140px;';
    b.addEventListener('click', accion);
    return b;
  },

  aceptar(m) {
    if (this.activas().length >= this.MAX_ACTIVAS) {
      Notificaciones.mostrar('📜 Ya tienes 3 misiones activas. Termina o abandona una primero', 'alerta', 5000);
      return;
    }
    this._poner(m.id, { estado: m.tipo === 'visitar' ? 'lista' : 'aceptada', orden: Date.now(), progreso: 0 });
    if (typeof UIManager !== 'undefined') UIManager.cerrar('ventana-misiones');
    else document.getElementById('ventana-misiones').classList.add('oculto');
    Notificaciones.mostrar('📜 Misión aceptada: ' + m.titulo, 'exito');
    this.refrescar();
  },

  abandonar(m) {
    if (!confirm('¿Abandonar la misión "' + m.titulo + '"?\n\nPerderás todo el progreso de esta misión.')) return;
    this._poner(m.id, { estado: 'disponible', progreso: 0 });
    if (typeof UIManager !== 'undefined') UIManager.cerrar('ventana-misiones');
    else document.getElementById('ventana-misiones').classList.add('oculto');
    this._cerrarOverlay();
    Notificaciones.mostrar('✖ Misión abandonada: ' + m.titulo, 'alerta');
    this.refrescar();
  },

  async recolectar(m) {
    if (!this.puedeRecolectar(m)) return;
    if (this._inventarioLlenoRecompensa(m)) {
      Notificaciones.mostrar('🎒 Tu inventario está lleno. Libera espacio y vuelve a recoger tu premio.', 'alerta', 6000);
      return;
    }
    const d = Utilidades.distanciaMetros(GPS.posicion, m.pos);
    if (d > CONFIG.distanciaInteraccion) {
      Notificaciones.mostrar('📍 Ve al icono de la misión para recolectar (' + Math.round(d) + ' m)', 'alerta');
      return;
    }
    if (m.consumir) {
      for (const r of m.requiere) Mochila.quitar(r.id, r.cantidad, 'Entregado (misión)');
    }
    this._poner(m.id, { estado: 'recolectada' });
    if (typeof UIManager !== 'undefined') UIManager.cerrar('ventana-misiones');
    else document.getElementById('ventana-misiones').classList.add('oculto');
    this._cerrarOverlay();
    if (this._marcadores[m.id]) { this._marcadores[m.id].remove(); delete this._marcadores[m.id]; }
    if (this._lineas[m.id]) { this._lineas[m.id].remove(); delete this._lineas[m.id]; }

    Notificaciones.mostrar('🎉 Recompensa recolectada: ' + m.titulo, 'exito', 5000);
    if (m.dinero) await Dinero.ganar(m.dinero, 'Misión: ' + m.titulo);
    for (const it of (m.items || [])) Mochila.agregar(it.id, it.cantidad, { silencioso: true });
    if ((m.items || []).length) {
      const nombres = m.items.map(it => Items.seguro(it.id).icono + ' x' + it.cantidad).join(' ');
      Notificaciones.mostrar('🎁 ' + nombres, 'exito', 4000);
    }
    Vida.ganarXp(m.xp || 25, 'Misión completada');
    this.pintarLetrero();
    this.actualizarLineas();
    this._actualizarIconosMapa();
  },

  // ---------- CARTEL CENTRAL (al tocar letrero) ----------
  _cerrarOverlay() {
    if (typeof UIManager !== 'undefined') UIManager.cerrar('overlay-mision-activa');
    else document.getElementById('overlay-mision-activa')?.classList.add('oculto');
  },

  _mostrarOverlay(m) {
    const overlay = document.getElementById('overlay-mision-activa');
    const titulo = document.getElementById('overlay-mision-titulo');
    const texto = document.getElementById('overlay-mision-texto');
    const extra = document.getElementById('overlay-mision-extra');
    const botones = document.getElementById('overlay-mision-botones');
    if (!overlay || !titulo || !texto || !extra || !botones) return;

    const puedeRecoger = this.puedeRecolectar(m);
    const inventarioLleno = puedeRecoger && this._inventarioLlenoRecompensa(m);
    titulo.textContent = '📜 ' + m.titulo;
    texto.textContent = m.texto || this._textoRequisitos(m);
    let extraHtml = '';
    if (puedeRecoger) {
      extraHtml += '<div class="overlay-mision-estado lista">🎁 ¡Misión completada! Ve al icono ❗ y recoge tu premio.</div>';
      if (inventarioLleno) {
        extraHtml += '<div class="overlay-mision-estado lleno">🎒 Tu inventario está lleno. Tendrás que recoger cuando tengas espacio.</div>';
      }
    } else {
      const req = this._textoRequisitos(m);
      if (req && req !== texto.textContent) extraHtml += '<div class="overlay-mision-estado">' + req + '</div>';
    }
    extraHtml += '<div class="overlay-mision-premio">Recompensa: ' + this._textoPremio(m) + '</div>';
    extra.innerHTML = extraHtml;

    botones.innerHTML = '';
    if (puedeRecoger) {
      if (!inventarioLleno) {
        botones.appendChild(this._botonOverlay('🎁 Recolectar', () => {
          this._cerrarOverlay();
          this.abrirMision(m);
        }));
      }
    } else if (this._estado(m.id).estado !== 'disponible') {
      botones.appendChild(this._botonOverlay('✖ Abandonar', () => this.abandonar(m), 'peligro'));
    }
    botones.appendChild(this._botonOverlay('Cerrar', () => this._cerrarOverlay(), 'secundario'));

    if (typeof UIManager !== 'undefined') UIManager.abrir('overlay-mision-activa');
    else overlay.classList.remove('oculto');
  },

  _botonOverlay(texto, accion, tipo) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'overlay-mision-btn' + (tipo ? ' ' + tipo : '');
    b.textContent = texto;
    b.addEventListener('click', accion);
    return b;
  },

  // ---------- LETRERO IZQUIERDO ----------
  pintarLetrero() {
    const cont = document.getElementById('letrero-misiones');
    if (!cont) return;
    const activas = this.activas();
    if (!activas.length) { cont.classList.add('oculto'); return; }
    cont.classList.remove('oculto');
    cont.innerHTML = '';
    activas.slice(0, this.MAX_ACTIVAS).forEach((m, i) => {
      const e = this._estado(m.id);
      const lista = this.puedeRecolectar(m);
      let estadoTxt = '';
      if (lista) estadoTxt = '🎁 ¡Sigue la línea y recoge tu premio!';
      else if (m.tipo === 'contar') estadoTxt = e.progreso + ' / ' + m.meta;
      else if (m.requiere.length) estadoTxt = m.requiere.map(r =>
        Items.seguro(r.id).nombre + ' ' + Mochila.contar(r.id) + '/' + r.cantidad).join(', ');
      const fila = document.createElement('div');
      fila.className = 'mision-letrero' + (lista ? ' lista' : '');
      fila.innerHTML =
        '<span class="punto-color' + (lista ? ' premio' : '') + '" style="background:' + this.COLORES[i % 3] + '"></span>' +
        '<div class="datos-letrero"><div class="titulo-letrero">' + m.titulo +
        (lista ? ' ➜' : '') + '</div>' +
        (estadoTxt ? '<div class="estado-letrero">' + estadoTxt + '</div>' : '') + '</div>';
      fila.addEventListener('click', () => this._mostrarOverlay(m));
      cont.appendChild(fila);
    });
    this._actualizarIconosMapa();
  },

  _popupLetrero(m) { this._mostrarOverlay(m); },

  // ---------- LÍNEAS GUÍA EN EL MAPA ----------
  actualizarLineas() {
    if (!GPS.posicion || !Mapa.mapa) return;
    const activas = this.activas();
    for (const [id, linea] of Object.entries(this._lineas)) {
      const m = activas.find(x => x.id === id);
      if (!m || !this.puedeRecolectar(m)) { linea.remove(); delete this._lineas[id]; }
    }
    activas.forEach((m, i) => {
      if (!this.puedeRecolectar(m)) return;
      const color = this.COLORES[i % 3];
      const puntos = [GPS.posicion, m.pos];
      if (this._lineas[m.id]) {
        this._lineas[m.id].setLatLngs(puntos);
        this._lineas[m.id].setStyle({ color });
      } else {
        this._lineas[m.id] = L.polyline(puntos, {
          color, weight: 4, opacity: .85, dashArray: '10 12', interactive: false
        }).addTo(Mapa.mapa);
      }
    });
  }
};
