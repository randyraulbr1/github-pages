// ============================================================
// ENEMIGOS — combate en el mapa (compartido vía mundo.json)
// 3 zonas: exterior (invisible) → roja → amarilla (ataque)
// ============================================================
const Enemigos = {
  NOMBRES: [
    'Tuerto del muelle', 'Bruto de la ribera', 'Sombra del malecón', 'Caimán viejo',
    'Perro rabioso', 'Pirata fantasma', 'Guardián del muelle', 'Cangrejo gigante',
    'Serpiente de manglar', 'Ladrón nocturno', 'Matón del puerto', 'Espíritu del pantano',
    'Jabalí salvaje', 'Araña de cueva', 'Lobo hambriento', 'Esqueleto marinero',
    'Bandido del camino', 'Murciélago rojo', 'Cocodrilo del río', 'Guerrero perdido'
  ],
  ICONOS: ['👹', '💀', '🦇', '🐺', '🕷️', '🧟', '👺', '🐊', '🦂', '🐍', '⚔️', '👻', '🐗', '🦞', '🐉'],

  lista: [],
  _marcadores: {},
  _zonas: {},
  _zonasAtaque: {},
  _enCombate: null,
  _tickId: null,
  _ultimoGolpeAuto: {},

  iniciar() {
    this._recargar();
    if (this._tickId) clearInterval(this._tickId);
    this._tickId = setInterval(() => this._tick(), 800);
    const enlazar = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };
    enlazar('btn-combate-atacar', () => this._atacar());
    enlazar('btn-combate-huir', () => this._huir());
  },

  _config() {
    if (typeof Admin !== 'undefined' && Admin.combateConfig) return Admin.combateConfig();
    return {
      danoMin: 5, danoMax: 8, nivelReferencia: 1,
      radioZonaExterior: CONFIG.radioZonaExterior || 75,
      radioZona: CONFIG.radioZonaEnemigo || 40,
      radioPersecucion: CONFIG.radioZonaAtaque || 18,
      curacionMs: 120000
    };
  },

  _nivelEnemigo(e) {
    return Math.max(1, Math.min(CONFIG.nivelMaximo, e.nivel || 1));
  },

  _esLetal(e) {
    const nv = Math.max(1, e.nivel || 1);
    const jugador = typeof Vida !== 'undefined' ? Math.max(1, Vida.nivel) : 1;
    return nv >= jugador * 10;
  },

  _rangoDanoEnemigo(e) {
    const nv = this._nivelEnemigo(e);
    const factor = 1 + (nv - 1) * 0.06;
    let lo = e.danoMin;
    let hi = e.danoMax;
    if (lo == null || hi == null) {
      const base = Math.max(1, e.dano || 10);
      lo = Math.round(base * 0.65 * factor);
      hi = Math.round(base * factor);
    } else {
      lo = Math.round(lo * factor);
      hi = Math.round(hi * factor);
    }
    lo = Math.max(1, lo);
    hi = Math.max(lo, hi);
    return { lo, hi, nv };
  },

  _danoEnemigo(e) {
    const r = this._rangoDanoEnemigo(e);
    if (r.hi <= r.lo) return r.lo;
    return r.lo + Math.floor(Math.random() * (r.hi - r.lo + 1));
  },

  _radioExterior(e) {
    return e.radioExterior || this._config().radioZonaExterior || CONFIG.radioZonaExterior || 75;
  },

  _radioZona(e) {
    return e.radioZona || this._config().radioZona || CONFIG.radioZonaEnemigo || 40;
  },

  _radioAtaque(e) {
    const cfg = this._config();
    return e.radioAtaque || e.radioPersecucion || cfg.radioPersecucion || CONFIG.radioZonaAtaque || 18;
  },

  _rangoDanoNivel() {
    if (typeof Admin !== 'undefined' && Admin.combateRangoNivel) {
      return Admin.combateRangoNivel(Vida.nivel);
    }
    const cfg = this._config();
    const ref = Math.max(1, cfg.nivelReferencia || 1);
    const f = Math.max(1, Vida.nivel) / ref;
    const lo = Math.max(1, Math.round(cfg.danoMin * f));
    const hi = Math.max(lo, Math.round(cfg.danoMax * f));
    return { lo, hi };
  },

  _recargar() {
    this.lista = (typeof Admin !== 'undefined' && Admin.enemigosTodos)
      ? Admin.enemigosTodos() : [];
    const ids = new Set(this.lista.map(e => e.id));
    for (const id of Object.keys(this._marcadores)) {
      if (!ids.has(id)) this._quitarMarcador(id);
    }
    for (const e of this.lista) {
      if (Admin.eliminado && Admin.eliminado(e.id)) continue;
      const pos = (typeof Admin._posItem === 'function') ? Admin._posItem(e) : Admin.pos(e.id, e.pos);
      if (!pos || pos.length < 2) continue;
      const st = this._estadoGlobal()[e.id];
      if (st && st.ocultoHasta && Date.now() < st.ocultoHasta) {
        this._quitarMarcador(e.id);
        continue;
      }
      if (st && st.ocultoHasta && Date.now() >= st.ocultoHasta) {
        st.ocultoHasta = 0;
        st.vida = e.vidaMax || e.vida;
        st.ultimoGolpe = 0;
        if (e.posOrigen) e.pos = e.posOrigen.slice();
      }
      this._aplicarEstadoRemoto(e);
      if (!this._marcadores[e.id]) this._crearEnMapa(e);
      else this._actualizarMarcador(e);
    }
  },

  _estadoGlobal() {
    if (!Admin.publicado) return {};
    if (!Admin.publicado.enemigosEstado) Admin.publicado.enemigosEstado = {};
    return Admin.publicado.enemigosEstado;
  },

  _vidaActual(e) {
    const st = this._estadoGlobal()[e.id];
    if (st && typeof st.vida === 'number') return st.vida;
    return e.vidaMax || e.vida || 50;
  },

  _aplicarEstadoRemoto(e) {
    const cfg = this._config();
    const st = this._estadoGlobal()[e.id];
    if (!st) return;
    const sinGolpes = Date.now() - (st.ultimoGolpe || 0) > cfg.curacionMs;
    if (sinGolpes && st.vida < (e.vidaMax || e.vida)) {
      st.vida = e.vidaMax || e.vida;
      st.ultimoGolpe = 0;
    }
  },

  _bearingDeg(lat1, lon1, lat2, lon2) {
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  },

  _htmlMarcador(e) {
    const nv = this._nivelEnemigo(e);
    const letal = this._esLetal(e);
    const max = e.vidaMax || e.vida || 50;
    const actual = this._vidaActual(e);
    const pct = Math.max(0, Math.min(100, (actual / max) * 100));
    const mostrarCono = e.facingDeg != null && e._enZona;
    const cono = mostrarCono
      ? '<div class="enemigo-cono-wrap" style="transform:rotate(' + e.facingDeg + 'deg)">' +
        '<div class="enemigo-cono"></div></div>' : '';
    const calavera = letal
      ? '<div class="enemigo-calavera" title="Nv ' + nv + ' · 10× tu nivel">💀</div>' : '';
    return '<div class="enemigo-pin' + (letal ? ' enemigo-letal' : '') + '">' +
      cono +
      calavera +
      '<div class="enemigo-etiqueta"><span class="enemigo-nivel">Nv ' + nv + '</span></div>' +
      '<span class="enemigo-emoji">' + (e.icono || '👹') + '</span>' +
      '<div class="enemigo-barra-vida"><div class="enemigo-barra-relleno" style="width:' + pct + '%"></div></div>' +
      '</div>';
  },

  _iconoMarcador(e) {
    return L.divIcon({
      className: '',
      html: this._htmlMarcador(e),
      iconSize: [56, 62],
      iconAnchor: [28, 54]
    });
  },

  _refrescarIconoMarcador(e) {
    const m = this._marcadores[e.id];
    if (!m) return;
    m.setIcon(this._iconoMarcador(e));
  },

  _crearEnMapa(e) {
    const marcador = L.marker(e.pos, {
      icon: this._iconoMarcador(e)
    }).addTo(Mapa.mapa);
    this._marcadores[e.id] = marcador;

    const radioZona = this._radioZona(e);
    const radioAtaque = this._radioAtaque(e);
    this._zonas[e.id] = L.circle(e.pos, {
      radius: radioZona, color: '#ff453a', weight: 2,
      fillColor: '#ff453a', fillOpacity: 0.1, dashArray: '4 6', interactive: false
    });
    this._zonasAtaque[e.id] = L.circle(e.pos, {
      radius: radioAtaque, color: '#ffd60a', weight: 2,
      fillColor: '#ffd60a', fillOpacity: 0.14, dashArray: '2 4', interactive: false
    });

    Mapa.registrarPunto({
      id: e.id,
      posicion: e.pos,
      radio: CONFIG.distanciaInteraccion,
      marcador,
      alTocar: () => this._abrirCombate(e),
      alCambiarDistancia: d => this._alCambiarDistancia(e, d)
    });
    this._actualizarBarra(e);
    if (GPS.posicion) this._actualizarVisibilidadZonas(e, Utilidades.distanciaMetros(GPS.posicion, e.pos));
  },

  _quitarMarcador(id) {
    if (this._marcadores[id]) { this._marcadores[id].remove(); delete this._marcadores[id]; }
    if (this._zonas[id]) {
      if (Mapa.mapa && Mapa.mapa.hasLayer(this._zonas[id])) Mapa.mapa.removeLayer(this._zonas[id]);
      delete this._zonas[id];
    }
    if (this._zonasAtaque[id]) {
      if (Mapa.mapa && Mapa.mapa.hasLayer(this._zonasAtaque[id])) Mapa.mapa.removeLayer(this._zonasAtaque[id]);
      delete this._zonasAtaque[id];
    }
    delete this._ultimoGolpeAuto[id];
  },

  /** Posición/vida sincronizada desde el servidor (enemigo compartido en vivo). */
  actualizarDesdeServidor(origenId, lat, lng, data) {
    let e = this.lista.find(x => x.id === origenId);
    if (!e) {
      this._recargar();
      e = this.lista.find(x => x.id === origenId);
    }
    if (!e) return;
    e.pos = [lat, lng];
    if (typeof Admin !== 'undefined') {
      Admin.publicado.posiciones = Admin.publicado.posiciones || {};
      Admin.publicado.posiciones[origenId] = [lat, lng];
      if (data?.hp != null) {
        Admin.publicado.enemigosEstado = Admin.publicado.enemigosEstado || {};
        Admin.publicado.enemigosEstado[origenId] = Object.assign(
          Admin.publicado.enemigosEstado[origenId] || {},
          { vida: data.hp }
        );
        e.vida = data.hp;
      }
      if (data?.facingDeg != null) {
        e.facingDeg = data.facingDeg;
        e._enZona = true;
      }
    }
    const m = this._marcadores[origenId];
    if (m) {
      m.setLatLng([lat, lng]);
      this._refrescarIconoMarcador(e);
      this._actualizarBarra(e);
    }
  },

  _actualizarMarcador(e) {
    const m = this._marcadores[e.id];
    if (m) {
      m.setLatLng(e.pos);
      this._refrescarIconoMarcador(e);
    }
    if (this._zonas[e.id]) this._zonas[e.id].setLatLng(e.pos);
    if (this._zonasAtaque[e.id]) this._zonasAtaque[e.id].setLatLng(e.pos);
    this._actualizarBarra(e);
  },

  _actualizarVisibilidadZonas(e, d) {
    if (!Mapa.mapa) return;
    const enExterior = d <= this._radioExterior(e);
    const enZona = d <= this._radioZona(e);
    const zR = this._zonas[e.id];
    const zA = this._zonasAtaque[e.id];
    if (zR) {
      if (enExterior && !Mapa.mapa.hasLayer(zR)) zR.addTo(Mapa.mapa);
      else if (!enExterior && Mapa.mapa.hasLayer(zR)) Mapa.mapa.removeLayer(zR);
    }
    if (zA) {
      if (enExterior && enZona && !Mapa.mapa.hasLayer(zA)) zA.addTo(Mapa.mapa);
      else if ((!enExterior || !enZona) && Mapa.mapa.hasLayer(zA)) Mapa.mapa.removeLayer(zA);
    }
  },

  _actualizarBarra(e) {
    this._refrescarIconoMarcador(e);
  },

  _alCambiarDistancia(e, d) {
    this._actualizarVisibilidadZonas(e, d);
    const enExterior = d <= this._radioExterior(e);
    if (enExterior && !e._avisoZona) {
      e._avisoZona = true;
      Notificaciones.mostrar('⚠️ Zona de ' + (e.nombre || 'enemigo') + ' — ¡cuidado!', 'alerta', 3500);
    } else if (!enExterior) {
      e._avisoZona = false;
    }
  },

  _moverEnemigo(e, nlat, nlng) {
    const m = this._marcadores[e.id];
    if (!m) return;
    m.setLatLng([nlat, nlng]);
    e.pos[0] = nlat; e.pos[1] = nlng;
    if (this._zonas[e.id]) this._zonas[e.id].setLatLng([nlat, nlng]);
    if (this._zonasAtaque[e.id]) this._zonasAtaque[e.id].setLatLng([nlat, nlng]);
  },

  _golpeAutomatico(e) {
    if (Vida.estaMuerto()) return;
    if (this._enCombate) return;
    const ahora = Date.now();
    const ultimo = this._ultimoGolpeAuto[e.id] || 0;
    if (ahora - ultimo < 2000) return;
    this._ultimoGolpeAuto[e.id] = ahora;
    const dano = this._danoEnemigo(e);
    if (typeof Vida !== 'undefined') {
      Vida.recibirDano(dano, null, e.nombre || 'Enemigo');
    }
  },

  _tick() {
    if (!GPS.posicion || Vida.estaMuerto()) return;
    const online = typeof Multijugador !== 'undefined' && Multijugador.activo;
    for (const e of this.lista) {
      if (!this._marcadores[e.id]) continue;
      this._aplicarEstadoRemoto(e);
      const d = Utilidades.distanciaMetros(GPS.posicion, e.pos);
      const enZona = d <= this._radioZona(e);
      e._enZona = enZona;
      this._actualizarVisibilidadZonas(e, d);
      if (online) {
        this._actualizarBarra(e);
        continue;
      }
      const radioExt = this._radioExterior(e);
      const radioZona = this._radioZona(e);
      const radioAtaque = this._radioAtaque(e);
      const enExterior = d <= radioExt;

      if (enZona && GPS.posicion) {
        e.facingDeg = this._bearingDeg(e.pos[0], e.pos[1], GPS.posicion[0], GPS.posicion[1]);
        this._refrescarIconoMarcador(e);
      } else if (!enZona) {
        e.facingDeg = null;
        this._refrescarIconoMarcador(e);
      }

      const enAtaque = d <= radioAtaque;

      if (enZona && d > 3) {
        const m = this._marcadores[e.id];
        const ll = m.getLatLng();
        const t = enAtaque ? 0.18 : 0.12;
        const nlat = ll.lat + (GPS.posicion[0] - ll.lat) * t;
        const nlng = ll.lng + (GPS.posicion[1] - ll.lng) * t;
        this._moverEnemigo(e, nlat, nlng);
      } else if (e.posOrigen) {
        const o = e.posOrigen;
        const distOrigen = Utilidades.distanciaMetros(e.pos, o);
        if (distOrigen > 2) {
          const m = this._marcadores[e.id];
          const ll = m.getLatLng();
          const t = 0.08;
          const nlat = ll.lat + (o[0] - ll.lat) * t;
          const nlng = ll.lng + (o[1] - ll.lng) * t;
          this._moverEnemigo(e, nlat, nlng);
        }
      }

      if (enAtaque && enZona && !this._enCombate) this._golpeAutomatico(e);
      this._actualizarBarra(e);
    }
  },

  danoJugador() {
    const r = this._rangoDanoNivel();
    const arma = typeof Mochila !== 'undefined' ? Mochila.danoArmaEquipada() : 0;
    const lo = r.lo + arma;
    const hi = r.hi + arma;
    if (hi <= lo) return lo;
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  },

  _textoDanoJugador() {
    const r = this._rangoDanoNivel();
    const arma = typeof Mochila !== 'undefined' ? Mochila.danoArmaEquipada() : 0;
    const infoArma = typeof Mochila !== 'undefined' && Mochila.armaEquipadaId()
      ? (' · Arma ' + (Items.seguro(Mochila.armaEquipadaId()).icono || '') + ' +' + arma) : '';
    return (arma ? (arma + ' + ') : '') + r.lo + '–' + r.hi + ' aleatorio' + infoArma;
  },

  _abrirCombate(e) {
    if (Vida.estaMuerto()) return;
    const d = Utilidades.distanciaMetros(GPS.posicion, e.pos);
    if (d > CONFIG.distanciaInteraccion) {
      Notificaciones.mostrar('📍 Acércate más (' + Math.round(d) + ' m)', 'alerta');
      return;
    }
    this._enCombate = e;
    const max = e.vidaMax || e.vida || 50;
    const actual = this._vidaActual(e);
    const rEn = this._rangoDanoEnemigo(e);
    const letal = this._esLetal(e);
    document.getElementById('combate-nombre').textContent =
      (letal ? '💀 ' : '') + (e.icono || '👹') + ' ' + (e.nombre || 'Enemigo') + ' · Nv ' + rEn.nv;
    document.getElementById('combate-vida-texto').textContent = actual + '/' + max;
    document.getElementById('combate-vida-relleno').style.width = (actual / max * 100) + '%';
    const r = this._rangoDanoNivel();
    const arma = typeof Mochila !== 'undefined' ? Mochila.danoArmaEquipada() : 0;
    document.getElementById('combate-info').textContent =
      'Tu daño: ' + (r.lo + arma) + '–' + (r.hi + arma) + ' · Tu Nv ' + Vida.nivel +
      ' · Vida ' + Vida.actual + '/' + Vida.vidaMaxima() +
      (letal ? ' · 💀 Enemigo 10× más fuerte' : '') +
      ' · Daño enemigo: ' + rEn.lo + '–' + rEn.hi + ' aleatorio';
    document.getElementById('ventana-combate').classList.remove('oculto');
  },

  _cerrarCombate() {
    this._enCombate = null;
    document.getElementById('ventana-combate').classList.add('oculto');
  },

  _huir() {
    const e = this._enCombate;
    if (!e) return;
    const coste = 60 + Math.floor(Math.random() * 21);
    Vida.recibirDano(coste, '🏃 Huiste (-' + coste + ' vida, hambre a 0)');
    Vida.hambre = 0;
    Guardado.datos.hambre = 0;
    Guardado.guardar();
    Vida.pintar();
    this._cerrarCombate();
  },

  async _atacar() {
    const e = this._enCombate;
    if (!e) return;
    const d = Utilidades.distanciaMetros(GPS.posicion, e.pos);
    if (d > CONFIG.distanciaInteraccion + 5) {
      Notificaciones.mostrar('El enemigo está lejos', 'alerta');
      this._cerrarCombate();
      return;
    }
    const golpe = this.danoJugador();
    const est = this._estadoGlobal();
    if (!est[e.id]) est[e.id] = { vida: e.vidaMax || e.vida, ultimoGolpe: 0 };
    est[e.id].vida = Math.max(0, (est[e.id].vida ?? e.vidaMax) - golpe);
    est[e.id].ultimoGolpe = Date.now();
    est[e.id].ultimoAtacante = Usuarios.perfilActivo ? Usuarios.perfilActivo.id : '';

    const max = e.vidaMax || e.vida || 50;
    const actual = est[e.id].vida;
    document.getElementById('combate-vida-texto').textContent = actual + '/' + max;
    document.getElementById('combate-vida-relleno').style.width = (actual / max * 100) + '%';
    this._actualizarBarra(e);
    Notificaciones.mostrar('⚔️ -' + golpe + ' a ' + e.nombre, 'info', 2000);

    if (actual <= 0) {
      Notificaciones.mostrar('💀 ¡Derrotaste a ' + e.nombre + '!', 'exito', 5000);
      if (e.xp) Vida.ganarXp(e.xp, 'Enemigo derrotado');
      if (e.dinero) await Dinero.ganar(e.dinero, 'Botín: ' + e.nombre);
      for (const it of (e.recItems || [])) {
        Mochila.agregar(it.id, it.cantidad || 1, { silencioso: true });
      }
      const respawn = e.respawnMin || 0;
      if (respawn > 0) {
        est[e.id] = {
          vida: e.vidaMax || e.vida,
          ultimoGolpe: 0,
          ocultoHasta: Date.now() + respawn * 60000
        };
        if (e.posOrigen) e.pos = e.posOrigen.slice();
        this._quitarMarcador(e.id);
      } else {
        Admin.datos.eliminados = Admin.datos.eliminados || [];
        if (!Admin.datos.eliminados.includes(e.id)) Admin.datos.eliminados.push(e.id);
        this._quitarMarcador(e.id);
      }
      Admin.guardar();
      if (Admin._publicarParaTodos) Admin._publicarParaTodos(true);
      this._cerrarCombate();
      return;
    }

    const contra = this._danoEnemigo(e);
    Vida.recibirDano(contra, null, e.nombre || 'Enemigo');
    if (typeof Admin !== 'undefined') {
      Admin.guardar();
      if (Admin._publicarParaTodos) Admin._publicarParaTodos(true);
    }
  },

  agregarAdmin(e) {
    if (!e.posOrigen) e.posOrigen = e.pos.slice();
    if (!e.nivel) e.nivel = 1;
    this.lista.push(e);
    this._crearEnMapa(e);
  }
};
