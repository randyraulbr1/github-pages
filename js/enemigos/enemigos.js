// ============================================================
// ENEMIGOS — combate en el mapa (compartido vía mundo.json)
// 3 zonas: exterior (aviso 75m, sin dibujo) → roja (aggro) → amarilla (ataque)
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
  _interp: {},
  /** Posición en vivo del servidor (no confundir con spawn en mundo.json) */
  _posViva: {},
  COOLDOWN_ATAQUE_MS: 3000,
  HUIR_INVISIBLE_MS: 120000,
  PROB_FALLO_BASE: 12,
  PASO_PERSECUCION_M: 1.5,
  PASO_ATAQUE_M: 2.0,
  PASO_ORIGEN_M: 1.1,
  _ultimoAtaqueJugador: 0,
  _objetivoHud: null,

  _online() {
    return typeof Multijugador !== 'undefined' && Multijugador.activo;
  },

  _entidadVisibleEnRango(distancia) {
    if (typeof Admin !== 'undefined' && Admin.entidadVisibleEnRango) {
      return Admin.entidadVisibleEnRango(distancia);
    }
    const max = CONFIG.distanciaVerEntidades || 500;
    return CONFIG.optimizarVisibilidad === false || distancia <= max;
  },

  _distanciaEnemigo(e) {
    if (!GPS.posicion || !e?.pos) return Infinity;
    return Utilidades.distanciaMetros(GPS.posicion, e.pos);
  },

  /** Distancia al marcador en mapa (más fiable con interpolación del servidor). */
  _distanciaJugadorEnemigo(e) {
    if (!GPS.posicion) return Infinity;
    const pos = this._posDesdeMarcador(e) || e.pos;
    if (!pos || pos.length < 2) return Infinity;
    return Utilidades.distanciaMetros(GPS.posicion, pos);
  },

  /** Histéresis: barra grande solo con jugador en zona roja; pequeña al salir o enemigo en spawn. */
  _estadoBarraEnemigo(e) {
    if (this._jugadorImuneEnemigos() || !GPS.posicion) {
      return { enZona: false, vidaGrande: false };
    }
    const d = this._distanciaJugadorEnemigo(e);
    const r = this._radioZona(e);
    const MARGEN_SALIDA = 14;
    const enZona = d <= r;
    let vidaGrande = false;
    if (e._vidaGrande) {
      vidaGrande = d <= r + MARGEN_SALIDA;
    } else {
      vidaGrande = d <= r;
    }
    if (e.posOrigen?.length >= 2) {
      const pos = this._posDesdeMarcador(e) || e.pos;
      const enSpawn = Utilidades.distanciaMetros(pos, e.posOrigen) <= 3;
      if (enSpawn && d > r) vidaGrande = false;
    }
    if (this._online() && e.facingDeg == null && d > r) {
      vidaGrande = false;
    }
    return { enZona, vidaGrande };
  },

  _aplicarEstadoBarraEnemigo(e) {
    const st = this._estadoBarraEnemigo(e);
    e._enZona = st.enZona;
    e._vidaGrande = st.vidaGrande;
    return st;
  },

  _marcadorVisible(id) {
    const m = this._marcadores[id];
    return !!(m && Mapa.mapa && Mapa.mapa.hasLayer(m));
  },

  _ocultarMarcadorEnemigo(e) {
    const id = e.id;
    const m = this._marcadores[id];
    if (m && Mapa.mapa && Mapa.mapa.hasLayer(m)) Mapa.mapa.removeLayer(m);
    this._actualizarVisibilidadZonas(e, Infinity);
  },

  _mostrarMarcadorEnemigo(e) {
    if (!this._marcadores[e.id]) {
      this._crearEnMapa(e);
      return;
    }
    const m = this._marcadores[e.id];
    if (Mapa.mapa && !Mapa.mapa.hasLayer(m)) m.addTo(Mapa.mapa);
    this._actualizarMarcador(e);
  },

  _aplicarVisibilidadMarcador(e, distancia) {
    if (!e?.id) return;
    const d = typeof distancia === 'number' ? distancia : this._distanciaEnemigo(e);
    if (this._entidadVisibleEnRango(d)) this._mostrarMarcadorEnemigo(e);
    else this._ocultarMarcadorEnemigo(e);
  },

  refrescarVisibilidadDistancia() {
    if (!GPS.posicion) return;
    for (const e of this.lista) {
      if (!e?.pos) continue;
      this._aplicarVisibilidadMarcador(e, this._distanciaEnemigo(e));
    }
  },

  _spawnEnemigo(e, posAdmin) {
    if (e.posOrigen?.length >= 2) return e.posOrigen.slice();
    if (e.origenX != null && e.origenY != null) return [e.origenX, e.origenY];
    if (posAdmin?.length >= 2) return posAdmin.slice();
    return null;
  },

  _posDesdeMarcador(e) {
    const m = this._marcadores[e?.id];
    if (!m) return null;
    const ll = m.getLatLng();
    return [ll.lat, ll.lng];
  },

  _sincronizarZonas(e) {
    const centro = this._centroZona(e);
    if (!centro) return;
    const ll = L.latLng(centro[0], centro[1]);
    if (this._zonas[e.id]) this._zonas[e.id].setLatLng(ll);
    if (this._zonasAtaque[e.id]) this._zonasAtaque[e.id].setLatLng(ll);
  },

  iniciar() {
    this._recargar();
    if (this._tickId) clearInterval(this._tickId);
    this._tickId = setInterval(() => this._tick(), 500);
    const enlazar = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };
    enlazar('btn-combate-atacar', () => this._atacar());
    enlazar('btn-combate-huir', () => this._huir());
    enlazar('btn-hud-atacar', () => this._atacarHud());
    enlazar('btn-hud-huir', () => this._huirMapa());
    this.aplicarLayoutCombate();
  },

  /** Daño total del jugador vs enemigos (base por nivel + arma equipada). */
  rangoAtaqueJugador() {
    const r = this._rangoDanoNivel();
    const arma = typeof Mochila !== 'undefined' ? Mochila.danoArmaEquipada() : 0;
    const armaId = typeof Mochila !== 'undefined' ? Mochila.armaEquipadaId() : null;
    const itemArma = armaId && typeof Items !== 'undefined' ? Items.seguro(armaId) : null;
    return {
      baseLo: r.lo,
      baseHi: r.hi,
      arma,
      totalLo: r.lo + arma,
      totalHi: r.hi + arma,
      armaNombre: itemArma?.nombre || null,
      armaIcono: itemArma?.icono || null
    };
  },

  textoAtaqueJugador() {
    const d = this.rangoAtaqueJugador();
    const nv = typeof Vida !== 'undefined' ? Vida.nivel : 1;
    if (d.arma > 0) {
      return '⚔️ ' + d.totalLo + '–' + d.totalHi + ' (Nv ' + nv + ' · ' +
        (d.armaIcono || '⚔️') + ' +' + d.arma + ' + base ' + d.baseLo + '–' + d.baseHi + ')';
    }
    return '⚔️ ' + d.totalLo + '–' + d.totalHi + ' (Nv ' + nv + ' · sin arma)';
  },

  aplicarLayoutCombate() {
    const hud = document.getElementById('hud-combate-flotante');
    const wrapAtk = document.getElementById('btn-hud-atacar-wrap');
    const btnAtk = document.getElementById('btn-hud-atacar');
    const btnHuir = document.getElementById('btn-hud-huir');
    if (!hud || !wrapAtk || !btnAtk || !btnHuir) return;
    const pos = (Guardado.datos?.preferencias?.posBtnAtacar === 'der') ? 'der' : 'izq';
    hud.classList.toggle('pos-atk-izq', pos === 'izq');
    hud.classList.toggle('pos-atk-der', pos === 'der');
    if (pos === 'der') {
      hud.appendChild(btnHuir);
      hud.appendChild(wrapAtk);
    } else {
      hud.appendChild(wrapAtk);
      hud.appendChild(btnHuir);
    }
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
    const cfgEn = (typeof Admin !== 'undefined' && Admin.combateEnemigosConfig)
      ? Admin.combateEnemigosConfig() : null;
    const nv = this._nivelEnemigo(e);
    const factor = cfgEn ? (1 + (nv - 1) * (cfgEn.factorPorNivel || 0.06)) : (1 + (nv - 1) * 0.06);
    let lo = e.danoMin;
    let hi = e.danoMax;
    if (lo == null || hi == null) {
      const base = Math.max(1, e.dano || 10);
      if (cfgEn) {
        const ref = Math.max(1, cfgEn.nivelReferencia || 1);
        const fRef = 1 + (ref - 1) * (cfgEn.factorPorNivel || 0.06);
        lo = Math.round((cfgEn.danoMin || 5) * (factor / fRef));
        hi = Math.round((cfgEn.danoMax || 8) * (factor / fRef));
      } else {
        lo = Math.round(base * 0.65 * factor);
        hi = Math.round(base * factor);
      }
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

  _centroZona(e) {
    if (e?.pos?.length >= 2) return e.pos;
    return (e?.posOrigen?.length >= 2) ? e.posOrigen : null;
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
    const vivos = new Map();
    for (const e of this.lista) {
      if (!e?.id) continue;
      const desdeMarcador = this._posDesdeMarcador(e);
      vivos.set(e.id, {
        pos: desdeMarcador || this._posViva[e.id]?.slice() || e.pos?.slice(),
        posOrigen: e.posOrigen?.slice(),
        facingDeg: e.facingDeg,
        _enZona: e._enZona
      });
    }
    const todos = (typeof Admin !== 'undefined' && Admin.enemigosTodos)
      ? Admin.enemigosTodos() : [];
    const porId = new Map();
    for (const e of todos) {
      if (e?.id && !porId.has(e.id)) porId.set(e.id, e);
    }
    this.lista = [...porId.values()];
    const ids = new Set(this.lista.map(e => e.id));
    for (const id of Object.keys(this._marcadores)) {
      if (!ids.has(id)) this._quitarMarcador(id);
    }
    const online = this._online();
    for (const e of this.lista) {
      if (Admin.eliminado && Admin.eliminado(e.id)) continue;
      if (!this._enemigoEstaVivo(e)) {
        this._quitarMarcador(e.id);
        continue;
      }
      const posAdmin = (typeof Admin._posItem === 'function')
        ? Admin._posItem(e) : Admin.pos(e.id, e.pos);
      const spawn = this._spawnEnemigo(e, posAdmin);
      if (!spawn) continue;

      const prev = vivos.get(e.id);
      if (!e.posOrigen?.length) e.posOrigen = spawn.slice();

      const viva = this._posViva[e.id] || prev?.pos;
      const desdeMarcador = this._posDesdeMarcador(e);
      if (online && (viva?.length >= 2 || desdeMarcador)) {
        e.pos = (desdeMarcador || viva).slice();
      } else if (desdeMarcador) {
        e.pos = desdeMarcador.slice();
      } else if (prev?.pos?.length >= 2) {
        e.pos = prev.pos.slice();
      } else {
        e.pos = spawn.slice();
      }

      if (prev) {
        e.facingDeg = prev.facingDeg;
        e._enZona = prev._enZona;
      }
      const st = this._estadoGlobal()[e.id];
      if (st && st.ocultoHasta && Date.now() < st.ocultoHasta) {
        this._quitarMarcador(e.id);
        continue;
      }
      if (st && st.vida != null && st.vida <= 0 && !st.ocultoHasta) {
        this._quitarMarcador(e.id);
        continue;
      }
      if (st && st.ocultoHasta && Date.now() >= st.ocultoHasta) {
        st.ocultoHasta = 0;
        st.vida = this._vidaMaxEnemigo(e);
        st.ultimoGolpe = 0;
        if (e.posOrigen) e.pos = e.posOrigen.slice();
      }
      this._aplicarEstadoRemoto(e);
      const dVis = GPS.posicion ? this._distanciaEnemigo(e) : Infinity;
      this._aplicarVisibilidadMarcador(e, dVis);
      if (!this._marcadorVisible(e.id)) continue;
      if (!this._adminOrganizando()) {
        this._sincronizarZonas(e);
        this._actualizarMarcador(e);
      }
    }
    this._actualizarPrioridadAdmin();
  },

  _estadoGlobal() {
    if (!Admin.publicado) return {};
    if (!Admin.publicado.enemigosEstado) Admin.publicado.enemigosEstado = {};
    return Admin.publicado.enemigosEstado;
  },

  _vidaMaxEnemigo(e) {
    if (e?.vidaMax) return e.vidaMax;
    if (typeof Admin !== 'undefined' && Admin.vidaEnemigoPorNivel) {
      return Admin.vidaEnemigoPorNivel(this._nivelEnemigo(e));
    }
    return 50;
  },

  _vidaActual(e) {
    const st = this._estadoGlobal()[e.id];
    if (st && typeof st.vida === 'number') return st.vida;
    return this._vidaMaxEnemigo(e);
  },

  _enemigoEstaVivo(e) {
    if (!e?.id) return false;
    if (typeof Admin !== 'undefined' && Admin.eliminado && Admin.eliminado(e.id)) return false;
    const st = this._estadoGlobal()[e.id];
    if (st?.ocultoHasta && Date.now() < st.ocultoHasta) return false;
    return this._vidaActual(e) > 0;
  },

  _probFalloAtaque(e) {
    const nvEn = this._nivelEnemigo(e);
    const nvJug = typeof Vida !== 'undefined' ? Math.max(1, Vida.nivel) : 1;
    const diff = Math.max(0, nvEn - nvJug);
    return Math.min(45, this.PROB_FALLO_BASE + diff * 4);
  },

  _ataqueFallido(e) {
    return Math.random() * 100 < this._probFalloAtaque(e);
  },

  _aplicarEstadoEnemigoRemoto(enemyId, estado, eliminado) {
    if (!enemyId || typeof Admin === 'undefined') return;
    Admin.publicado.enemigosEstado = Admin.publicado.enemigosEstado || {};
    if (estado) Admin.publicado.enemigosEstado[enemyId] = Object.assign({}, estado);
    if (eliminado) {
      Admin.datos.eliminados = Admin.datos.eliminados || [];
      if (!Admin.datos.eliminados.includes(enemyId)) Admin.datos.eliminados.push(enemyId);
      Admin.guardar();
      this._quitarMarcador(enemyId);
      return;
    }
    if (estado?.ocultoHasta && Date.now() < estado.ocultoHasta) {
      this._quitarMarcador(enemyId);
      return;
    }
    const e = this.lista.find(x => x.id === enemyId);
    if (!e) return;
    if (estado?.vida != null && estado.vida <= 0) {
      this._quitarMarcador(enemyId);
      return;
    }
    this._actualizarBarra(e);
    this._actualizarConoDOM(e);
  },

  _procesarMuerteEnemigo(e, opts) {
    if (!e?.id) return;
    const est = this._estadoGlobal();
    const respawn = e.respawnMin || 0;
    const desdeRemoto = !!opts?.desdeRemoto;
    const silencioso = !!opts?.silencioso;

    if (!desdeRemoto) {
      const xpGanada = this._xpEnemigo(e);
      if (xpGanada) Vida.ganarXp(xpGanada, 'Enemigo derrotado');
      if (e.dinero) void Dinero.ganar(e.dinero, 'Botín: ' + e.nombre);
      for (const it of (e.recItems || [])) {
        Mochila.agregar(it.id, it.cantidad || 1, { silencioso: true });
      }
      if (!silencioso) {
        Notificaciones.mostrar('💀 ¡Derrotaste a ' + (e.nombre || 'Enemigo') + '!', 'exito', 5000);
      }
    }

    if (respawn > 0) {
      est[e.id] = {
        vida: this._vidaMaxEnemigo(e),
        ultimoGolpe: 0,
        ocultoHasta: Date.now() + respawn * 60000
      };
      if (e.posOrigen) e.pos = e.posOrigen.slice();
      this._quitarMarcador(e.id);
    } else {
      Admin.datos.eliminados = Admin.datos.eliminados || [];
      if (!Admin.datos.eliminados.includes(e.id)) Admin.datos.eliminados.push(e.id);
      delete est[e.id];
      this._quitarMarcador(e.id);
    }
    if (!desdeRemoto) {
      Admin.guardar();
      if (!this._online() && Admin._publicarParaTodos) Admin._publicarParaTodos(true);
    }
    this._cerrarCombate();
  },

  _aplicarEstadoRemoto(e) {
    const cfg = this._config();
    const st = this._estadoGlobal()[e.id];
    if (!st) return;
    const sinGolpes = Date.now() - (st.ultimoGolpe || 0) > cfg.curacionMs;
    if (sinGolpes && st.vida < this._vidaMaxEnemigo(e)) {
      st.vida = this._vidaMaxEnemigo(e);
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
    const max = this._vidaMaxEnemigo(e);
    const actual = this._vidaActual(e);
    const pct = Math.max(0, Math.min(100, (actual / max) * 100));
    const grande = !!e._vidaGrande;
    const mostrarCono = e.facingDeg != null && e._enZona;
    const cono = mostrarCono
      ? '<div class="enemigo-cono-wrap" style="transform:rotate(' + e.facingDeg + 'deg)">' +
        '<div class="enemigo-cono"></div></div>' : '';
    const calavera = letal
      ? '<span class="mjo-calavera" title="Nv ' + nv + ' · 10× tu nivel">💀</span>' : '';
    return '<div class="marcador-enemigo-map enemigo-pin' + (letal ? ' enemigo-letal' : '') + '">' +
      cono +
      '<div class="mjo-etiqueta">' +
      calavera +
      '<span class="mjo-nombre mjo-nombre-enemigo">' + (e.nombre || 'Enemigo') + '</span>' +
      '<span class="mjo-nivel">Nv ' + nv + '</span>' +
      '</div>' +
      '<div class="enemigo-barra-wrap">' +
      '<div class="mjo-barra mjo-barra-enemigo' + (grande ? ' mjo-barra-cerca' : '') + '" role="progressbar" aria-valuenow="' + actual + '" aria-valuemax="' + max + '">' +
      '<div class="mjo-barra-fill" style="width:' + pct + '%"></div>' +
      '<span class="mjo-vida-num" aria-hidden="' + (grande ? 'false' : 'true') + '">' + actual + '/' + max + '</span></div></div>' +
      '<span class="enemigo-emoji">' + (e.icono || '👹') + '</span>' +
      '</div>';
  },

  _iconoMarcador(e) {
    return L.divIcon({
      className: '',
      html: this._htmlMarcador(e),
      iconSize: [92, 76],
      iconAnchor: [46, 68]
    });
  },

  _refrescarIconoMarcador(e) {
    if (this._adminOrganizando()) return;
    const m = this._marcadores[e.id];
    if (!m) return;
    m.setIcon(this._iconoMarcador(e));
    this._actualizarBarra(e);
    this._actualizarConoDOM(e);
  },

  /** Actualiza el cono de visión sin recrear el icono Leaflet (evita parpadeo). */
  _actualizarConoDOM(e) {
    const m = this._marcadores[e.id];
    if (!m) return;
    const el = m.getElement?.();
    if (!el) return;
    const pin = el.querySelector('.marcador-enemigo-map') || el;
    let wrap = pin.querySelector('.enemigo-cono-wrap');
    const mostrar = e.facingDeg != null && e._enZona;
    if (!mostrar) {
      if (wrap) wrap.remove();
      return;
    }
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'enemigo-cono-wrap';
      wrap.innerHTML = '<div class="enemigo-cono"></div>';
      pin.insertBefore(wrap, pin.firstChild);
    }
    wrap.style.transform = 'rotate(' + Math.round(e.facingDeg) + 'deg)';
  },

  _adminOrganizando() {
    return typeof Admin !== 'undefined' && Admin.modo === 'organizar';
  },

  _adminPrioridadPin() {
    return (typeof Admin !== 'undefined' && Admin.puedeMoverPinJugador && Admin.puedeMoverPinJugador()) ||
      this._adminOrganizando();
  },

  _actualizarPrioridadAdmin(activo) {
    const organizando = this._adminOrganizando();
    const moverPin = typeof Admin !== 'undefined' && Admin.puedeMoverPinJugador && Admin.puedeMoverPinJugador();
    const bloquearClics = activo != null ? (activo && !organizando) : (moverPin && !organizando);
    for (const m of Object.values(this._marcadores)) {
      if (!m) continue;
      if (organizando) {
        m.options.interactive = true;
        m.setZIndexOffset(14000);
        const el = m.getElement();
        if (el) {
          el.style.pointerEvents = 'auto';
          el.classList.add('admin-pin-organizar');
        }
      } else {
        m.options.interactive = !bloquearClics;
        m.setZIndexOffset(0);
        const el = m.getElement();
        if (el) {
          el.style.pointerEvents = bloquearClics ? 'none' : '';
          el.classList.remove('admin-pin-organizar', 'admin-pin-armado', 'admin-pin-moviendo');
        }
      }
    }
    this._actualizarZonasOrganizar();
  },

  _actualizarZonasOrganizar() {
    const organizando = this._adminOrganizando();
    for (const id of Object.keys(this._zonas)) {
      const z = this._zonas[id];
      const za = this._zonasAtaque[id];
      if (!z || !Mapa.mapa) continue;
      if (organizando) {
        if (Mapa.mapa.hasLayer(z)) Mapa.mapa.removeLayer(z);
        if (za && Mapa.mapa.hasLayer(za)) Mapa.mapa.removeLayer(za);
      } else {
        const e = this.lista.find(x => x.id === id);
        if (!e || !this._marcadores[id]) continue;
        const centro = this._centroZona(e) || e.pos;
        const d = (typeof GPS !== 'undefined' && GPS.posicion && centro?.length >= 2)
          ? Utilidades.distanciaMetros(GPS.posicion, centro)
          : Infinity;
        this._actualizarVisibilidadZonas(e, d);
      }
    }
  },

  _ocultarTodasLasZonas() {
    if (!Mapa.mapa) return;
    for (const id of Object.keys(this._zonas)) {
      const z = this._zonas[id];
      const za = this._zonasAtaque[id];
      if (z && Mapa.mapa.hasLayer(z)) Mapa.mapa.removeLayer(z);
      if (za && Mapa.mapa.hasLayer(za)) Mapa.mapa.removeLayer(za);
    }
  },

  _limpiarVisionHaciaJugador() {
    for (const e of this.lista) {
      if (e.facingDeg == null && !e._enZona) continue;
      e.facingDeg = null;
      e._enZona = false;
      e._vidaGrande = false;
      this._actualizarConoDOM(e);
      this._actualizarBarra(e);
    }
  },

  _crearEnMapa(e) {
    const marcador = L.marker(e.pos, {
      icon: this._iconoMarcador(e),
      draggable: false,
      autoPan: true
    }).addTo(Mapa.mapa);
    this._marcadores[e.id] = marcador;

    const radioZona = this._radioZona(e);
    const radioAtaque = this._radioAtaque(e);
    const centro = this._centroZona(e);
    this._zonas[e.id] = L.circle(centro, {
      radius: radioZona, color: '#ff453a', weight: 2,
      fillColor: '#ff453a', fillOpacity: 0.1, dashArray: '4 6', interactive: false
    });
    this._zonasAtaque[e.id] = L.circle(centro, {
      radius: radioAtaque, color: '#ffd60a', weight: 2,
      fillColor: '#ffd60a', fillOpacity: 0.14, dashArray: '2 4', interactive: false
    });

    const puntoExistente = Mapa.puntosInteractivos.find(x => x.id === e.id);
    if (puntoExistente) {
      puntoExistente.marcador = marcador;
      puntoExistente.posicion = e.pos;
      puntoExistente.alTocar = () => this._abrirCombate(e);
      puntoExistente.alCambiarDistancia = d => this._alCambiarDistancia(e, d);
    } else {
      Mapa.registrarPunto({
        id: e.id,
        posicion: e.pos,
        radio: CONFIG.distanciaInteraccion,
        marcador,
        alTocar: () => this._abrirCombate(e),
        alCambiarDistancia: d => this._alCambiarDistancia(e, d)
      });
    }
    this._actualizarBarra(e);
    if (GPS.posicion) {
      const dZ = Utilidades.distanciaMetros(GPS.posicion, centro);
      this._actualizarVisibilidadZonas(e, dZ);
    }
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
    const pi = Mapa.puntosInteractivos.findIndex(p => p.id === id);
    if (pi >= 0) Mapa.puntosInteractivos.splice(pi, 1);
    delete this._ultimoGolpeAuto[id];
    delete this._posViva[id];
    delete this._interp[id];
  },

  /** Posición/vida sincronizada desde el servidor (enemigo compartido en vivo). */
  actualizarDesdeServidor(origenId, lat, lng, data) {
    if (this._adminOrganizando()) return;

    let e = this.lista.find(x => x.id === origenId);
    if (!e && typeof Admin !== 'undefined' && Admin.enemigosTodos) {
      const def = Admin.enemigosTodos().find(x => x.id === origenId);
      if (def) {
        e = Object.assign({}, def);
        if (!e.posOrigen?.length) {
          const sp = this._spawnEnemigo(e, e.pos);
          if (sp) e.posOrigen = sp.slice();
        }
        e.pos = e.posOrigen?.slice() || [lat, lng];
        this.lista.push(e);
      }
    }
    if (!e) return;
    if (e._adminMovidoEn && Date.now() - e._adminMovidoEn < 10000) return;

    if (data?.eliminado || (data?.hp != null && data.hp <= 0 && !data?.ocultoHasta)) {
      if (typeof Admin !== 'undefined') {
        Admin.datos.eliminados = Admin.datos.eliminados || [];
        if (!Admin.datos.eliminados.includes(origenId)) Admin.datos.eliminados.push(origenId);
      }
      this._quitarMarcador(origenId);
      return;
    }
    if (data?.ocultoHasta && Date.now() < data.ocultoHasta) {
      Admin.publicado.enemigosEstado = Admin.publicado.enemigosEstado || {};
      Admin.publicado.enemigosEstado[origenId] = Object.assign(
        Admin.publicado.enemigosEstado[origenId] || {},
        { ocultoHasta: data.ocultoHasta, vida: data.hp != null ? data.hp : this._vidaMaxEnemigo(e) }
      );
      this._quitarMarcador(origenId);
      return;
    }

    this._posViva[origenId] = [lat, lng];
    const desde = this._posDesdeMarcador(e) || e.pos?.slice() || [lat, lng];
    const hasta = [lat, lng];
    const saltoM = Utilidades.distanciaMetros(desde, hasta);
    const prev = this._interp[origenId];
    const base = (prev && Date.now() < prev.inicio + prev.duracion)
      ? (this._posDesdeMarcador(e) || prev.desde?.slice() || desde)
      : desde;
    const duracion = Math.max(850, Math.min(1500, 700 + saltoM * 28));
    this._interp[origenId] = { desde: base.slice(), hasta: hasta.slice(), inicio: Date.now(), duracion };

    if (typeof Admin !== 'undefined') {
      if (data?.origenX != null && data?.origenY != null) {
        e.posOrigen = [data.origenX, data.origenY];
      }
      if (data?.hp != null) {
        Admin.publicado.enemigosEstado = Admin.publicado.enemigosEstado || {};
        Admin.publicado.enemigosEstado[origenId] = Object.assign(
          Admin.publicado.enemigosEstado[origenId] || {},
          { vida: data.hp, ultimoGolpe: Date.now() }
        );
        if (data.hpMax != null) e.vidaMax = data.hpMax;
        if (data.hp <= 0) {
          this._quitarMarcador(origenId);
          return;
        }
      }
      if (data?.facingDeg != null) {
        e.facingDeg = data.facingDeg;
      }
      if (data?.targetPlayerId != null) {
        e._targetPlayerId = data.targetPlayerId;
      }
    }

    if (!this._marcadores[origenId]) this._crearEnMapa(e);
    else {
      this._aplicarEstadoBarraEnemigo(e);
      this._actualizarConoDOM(e);
      this._actualizarBarra(e);
    }
  },

  _aplicarInterp(e) {
    const it = this._interp[e.id];
    if (!it) return false;
    const t = Math.min(1, (Date.now() - it.inicio) / (it.duracion || 900));
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const lat = it.desde[0] + (it.hasta[0] - it.desde[0]) * ease;
    const lng = it.desde[1] + (it.hasta[1] - it.desde[1]) * ease;
    e.pos = [lat, lng];
    this._moverEnemigo(e, lat, lng, true);
    if (t >= 1) {
      e.pos = it.hasta.slice();
      this._moverEnemigo(e, it.hasta[0], it.hasta[1], true);
      delete this._interp[e.id];
    }
    return true;
  },

  _actualizarMarcador(e) {
    const m = this._marcadores[e.id];
    if (m) m.setLatLng(e.pos);
    this._sincronizarZonas(e);
    const d = this._distanciaJugadorEnemigo(e);
    this._aplicarEstadoBarraEnemigo(e);
    this._actualizarVisibilidadZonas(e, d);
    this._actualizarConoDOM(e);
    this._actualizarBarra(e);
  },

  _actualizarVisibilidadZonas(e, d) {
    if (!Mapa.mapa) return;
    const enZona = d <= this._radioZona(e);
    const enAtaque = d <= this._radioAtaque(e);
    const zR = this._zonas[e.id];
    const zA = this._zonasAtaque[e.id];
    if (zR) {
      if (enZona && !Mapa.mapa.hasLayer(zR)) zR.addTo(Mapa.mapa);
      else if (!enZona && Mapa.mapa.hasLayer(zR)) Mapa.mapa.removeLayer(zR);
    }
    if (zA) {
      if (enZona && enAtaque && !Mapa.mapa.hasLayer(zA)) zA.addTo(Mapa.mapa);
      else if ((!enZona || !enAtaque) && Mapa.mapa.hasLayer(zA)) Mapa.mapa.removeLayer(zA);
    }
  },

  _actualizarBarra(e) {
    const m = this._marcadores[e.id];
    if (!m) return;
    const el = m.getElement?.();
    const max = this._vidaMaxEnemigo(e);
    const actual = this._vidaActual(e);
    const pct = Math.max(0, Math.min(100, (actual / max) * 100));
    const quiereGrande = !!e._vidaGrande;
    if (el) {
      const fill = el.querySelector('.mjo-barra-fill');
      const num = el.querySelector('.mjo-vida-num');
      const barra = el.querySelector('.mjo-barra-enemigo');
      if (fill) fill.style.width = pct + '%';
      if (num) {
        num.textContent = actual + '/' + max;
        num.setAttribute('aria-hidden', quiereGrande ? 'false' : 'true');
      }
      if (barra) {
        barra.classList.toggle('mjo-barra-cerca', quiereGrande);
        barra.setAttribute('aria-valuenow', String(actual));
        barra.setAttribute('aria-valuemax', String(max));
      }
      return;
    }
    this._refrescarIconoMarcador(e);
  },

  _alCambiarDistancia(e, dMarcador) {
    this._aplicarVisibilidadMarcador(e, dMarcador);
    if (!this._marcadorVisible(e.id)) return;
    this._actualizarVisibilidadZonas(e, dMarcador);
    if (this._jugadorImuneEnemigos()) return;
    const enExterior = dMarcador <= this._radioExterior(e);
    if (enExterior && !e._avisoZona) {
      e._avisoZona = true;
      Notificaciones.mostrar('⚠️ Zona de ' + (e.nombre || 'enemigo') + ' — ¡cuidado!', 'alerta', 3500);
    } else if (!enExterior) {
      e._avisoZona = false;
    }
  },

  fijarPosicion(e, pos, opts) {
    if (!e || !pos || pos.length < 2) return;
    const p = [+pos[0], +pos[1]];
    e.pos = p.slice();
    e.posOrigen = p.slice();
    delete this._posViva[e.id];
    delete this._interp[e.id];
    e.facingDeg = null;
    e._enZona = false;
    e._avisoZona = false;
    if (!opts?.silencioso) e._adminMovidoEn = Date.now();
    this._moverEnemigo(e, p[0], p[1]);
    if (!this._adminOrganizando() && !opts?.silencioso) {
      this._sincronizarZonas(e);
      this._refrescarIconoMarcador(e);
    }
  },

  _moverEnemigo(e, nlat, nlng, silencioso) {
    const m = this._marcadores[e.id];
    if (!m) return;
    m.setLatLng([nlat, nlng]);
    e.pos[0] = nlat;
    e.pos[1] = nlng;
    this._sincronizarZonas(e);
    const pi = typeof Mapa !== 'undefined'
      ? Mapa.puntosInteractivos.find(x => x.id === e.id) : null;
    if (pi && pi.posicion) {
      pi.posicion[0] = nlat;
      pi.posicion[1] = nlng;
    }
    if (!silencioso) this._actualizarBarra(e);
  },

  _avanzarHaciaMetros(e, destLat, destLng, metrosMax) {
    const m = this._marcadores[e.id];
    if (!m) return;
    const ll = m.getLatLng();
    const distM = Utilidades.distanciaMetros([ll.lat, ll.lng], [destLat, destLng]);
    if (distM < 0.4) return;
    const paso = Math.min(metrosMax, Math.max(0.5, distM * 0.22));
    const t = Math.min(1, paso / distM);
    const nlat = ll.lat + (destLat - ll.lat) * t;
    const nlng = ll.lng + (destLng - ll.lng) * t;
    this._moverEnemigo(e, nlat, nlng, true);
  },

  _angulosCercanos(a, b) {
    const d = Math.abs((a - b + 180) % 360 - 180);
    return d;
  },

  _estaInvisible() {
    if (typeof Guardado !== 'undefined' && Guardado.datos.invisibleHasta) {
      if (Guardado.datos.invisibleHasta <= Date.now()) {
        Guardado.datos.invisibleHasta = 0;
        Guardado.guardar();
        return false;
      }
      return true;
    }
    return false;
  },

  _enProteccionRevivir() {
    return typeof Vida !== 'undefined' && Vida.enProteccionRevivir && Vida.enProteccionRevivir();
  },

  _jugadorImuneEnemigos() {
    return this._estaInvisible() || this._enProteccionRevivir();
  },

  _pctVidaJugador() {
    if (typeof Vida === 'undefined') return 100;
    const max = Vida.vidaMaxima();
    return max > 0 ? (Vida.actual / max) * 100 : 100;
  },

  _cooldownRestante() {
    return Math.max(0, this.COOLDOWN_ATAQUE_MS - (Date.now() - (this._ultimoAtaqueJugador || 0)));
  },

  _enemigoMasCercanoEnZona() {
    if (!GPS.posicion || this._jugadorImuneEnemigos()) return null;
    let mejor = null;
    let mejorD = Infinity;
    for (const e of this.lista) {
      if (!this._enemigoEstaVivo(e)) continue;
      if (!this._marcadorVisible(e.id)) continue;
      const d = Utilidades.distanciaMetros(GPS.posicion, e.pos);
      if (d <= this._radioZona(e) && d < mejorD) {
        mejorD = d;
        mejor = e;
      }
    }
    return mejor;
  },

  _posOffsetMetros(lat, lng, metros, anguloRad) {
    const dLat = (metros * Math.cos(anguloRad)) / 111320;
    const dLng = (metros * Math.sin(anguloRad)) / (111320 * Math.cos(lat * Math.PI / 180));
    return [lat + dLat, lng + dLng];
  },

  async _dejarObjetosAlHuir() {
    if (!GPS.posicion || typeof Mochila === 'undefined') return 0;
    const indices = [];
    Mochila.slots.forEach((sl, i) => { if (sl?.id) indices.push(i); });
    if (!indices.length) return 0;
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const n = Math.min(indices.length, 2);
    const items = [];
    for (let k = 0; k < n; k++) {
      const sl = Mochila.slots[indices[k]];
      if (!sl?.id) continue;
      items.push({ id: sl.id, cantidad: sl.cantidad || 1 });
    }
    if (!items.length) return 0;

    const ocultoHasta = Date.now() + this.HUIR_INVISIBLE_MS;
    const miId = typeof Multijugador !== 'undefined' ? Multijugador._miPlayerId() : -1;

    if (typeof Multijugador !== 'undefined' && Multijugador.activo && CONFIG.servidorOnline) {
      const bolsa = await Multijugador.soltarBolsa({
        pos: GPS.posicion.slice(),
        items,
        ocultoHasta,
        ocultoParaPlayerId: miId > 0 ? miId : null,
        recogibleDesde: ocultoHasta,
        soloDropper: true
      });
      if (bolsa) {
        if (typeof Bolsas !== 'undefined') Bolsas.aplicarBolsaRemota(bolsa);
        for (const it of items) Mochila.quitar(it.id, it.cantidad, 'Huir: dejado en el suelo');
        Guardado.guardar();
        return items.length;
      }
    }

    if (typeof Bolsas !== 'undefined') {
      for (const it of items) Mochila.quitar(it.id, it.cantidad, 'Huir: dejado en el suelo');
      const ok = await Bolsas.soltar(items, 'Huir');
      if (ok) {
        const lista = Bolsas.todas();
        const ultima = lista[lista.length - 1];
        if (ultima) {
          ultima.ocultoHasta = ocultoHasta;
          ultima.ocultoParaPlayerId = miId > 0 ? miId : null;
          ultima.recogibleDesde = ocultoHasta;
          ultima.soloDropper = true;
          if (typeof Admin !== 'undefined') Admin._revisarBolsa(ultima);
        }
        return items.length;
      }
    }
    return 0;
  },

  _xpEnemigo(e) {
    if (e?.xp != null && e.xp > 0) return e.xp;
    if (typeof Admin !== 'undefined' && Admin.xpEnemigoPorNivel) {
      return Admin.xpEnemigoPorNivel(this._nivelEnemigo(e));
    }
    return 30;
  },

  _aplicarCooldownAnillo(wrap, restCd, mostrar) {
    if (!wrap) return;
    const pct = mostrar ? ((1 - restCd / this.COOLDOWN_ATAQUE_MS) * 100) : 0;
    wrap.style.setProperty('--cd-pct', String(Math.max(0, Math.min(100, pct))));
    wrap.classList.toggle('mostrando-cd', mostrar);
  },

  _actualizarHudCombate() {
    const btnAtacar = document.getElementById('btn-hud-atacar');
    const wrapHud = document.getElementById('btn-hud-atacar-wrap');
    const wrapModal = document.getElementById('btn-combate-atacar-wrap');
    const btnHuir = document.getElementById('btn-hud-huir');
    const btnModalAtacar = document.getElementById('btn-combate-atacar');
    const bannerHuida = document.getElementById('banner-huida');
    const hudFlotante = document.getElementById('hud-combate-flotante');
    const muerto = typeof Vida !== 'undefined' && Vida.estaMuerto();
    const restCd = this._cooldownRestante();
    const enCooldown = restCd > 0;

    if (this._estaInvisible()) {
      if (bannerHuida) {
        bannerHuida.classList.remove('oculto');
        const rest = Math.max(0, Guardado.datos.invisibleHasta - Date.now());
        const seg = Math.ceil(rest / 1000);
        const m = Math.floor(seg / 60);
        const s = seg % 60;
        bannerHuida.textContent = '👻 Invisible para enemigos · ' + m + ':' + String(s).padStart(2, '0');
      }
      if (wrapHud) wrapHud.classList.add('oculto');
      if (btnHuir) btnHuir.classList.add('oculto');
      this._aplicarCooldownAnillo(wrapHud, 0, false);
      this._aplicarCooldownAnillo(wrapModal, 0, false);
      if (hudFlotante) hudFlotante.classList.add('oculto');
      return;
    }

    if (this._enProteccionRevivir()) {
      if (bannerHuida) {
        bannerHuida.classList.remove('oculto');
        const rest = Math.max(0, (Guardado.datos.proteccionRevivirHasta || 0) - Date.now());
        const seg = Math.ceil(rest / 1000);
        const m = Math.floor(seg / 60);
        const s = seg % 60;
        bannerHuida.textContent = '🩹 Recuperándote · sin atacar ni huir · ' + m + ':' + String(s).padStart(2, '0');
      }
      if (wrapHud) wrapHud.classList.add('oculto');
      if (btnHuir) btnHuir.classList.add('oculto');
      this._aplicarCooldownAnillo(wrapHud, 0, false);
      this._aplicarCooldownAnillo(wrapModal, 0, false);
      if (hudFlotante) hudFlotante.classList.add('oculto');
      return;
    }

    if (bannerHuida) bannerHuida.classList.add('oculto');
    const enemigo = this._enemigoMasCercanoEnZona();
    this._objetivoHud = enemigo;
    const pctVida = this._pctVidaJugador();
    const enZonaRoja = !!enemigo;
    const puedeHuir = !muerto && enZonaRoja && pctVida <= 30;
    const mostrarAtaque = enZonaRoja && !muerto;
    const modalAbierto = !document.getElementById('ventana-combate')?.classList.contains('oculto');
    const showCd = (mostrarAtaque || modalAbierto) && enCooldown;

    if (wrapHud && btnAtacar) {
      if (mostrarAtaque) {
        wrapHud.classList.remove('oculto');
        btnAtacar.disabled = enCooldown;
        btnAtacar.classList.toggle('en-cooldown', enCooldown);
        btnAtacar.textContent = enCooldown
          ? '⏳ ' + Math.ceil(restCd / 1000) + ' s'
          : '⚔️ ATK';
        this._aplicarCooldownAnillo(wrapHud, restCd, showCd);
      } else {
        wrapHud.classList.add('oculto');
        btnAtacar.disabled = false;
        btnAtacar.classList.remove('en-cooldown');
        this._aplicarCooldownAnillo(wrapHud, 0, false);
      }
    }
    if (btnModalAtacar && modalAbierto) {
      btnModalAtacar.disabled = enCooldown;
      btnModalAtacar.classList.toggle('en-cooldown', enCooldown);
      btnModalAtacar.textContent = enCooldown
        ? '⏳ ' + Math.ceil(restCd / 1000) + ' s'
        : '⚔️ Atacar';
      this._aplicarCooldownAnillo(wrapModal, restCd, showCd);
    } else {
      this._aplicarCooldownAnillo(wrapModal, 0, false);
    }
    if (btnHuir) {
      btnHuir.classList.toggle('oculto', !puedeHuir);
      if (puedeHuir) btnHuir.textContent = '🏃 HUIR';
    }
    if (hudFlotante) {
      const visible = mostrarAtaque || puedeHuir;
      hudFlotante.classList.toggle('oculto', !visible);
      const prefDer = Guardado.datos?.preferencias?.posBtnAtacar === 'der';
      let alinearDer = prefDer;
      if (puedeHuir && !mostrarAtaque) alinearDer = !prefDer;
      hudFlotante.classList.toggle('pos-atk-izq', !alinearDer);
      hudFlotante.classList.toggle('pos-atk-der', alinearDer);
    }
  },

  _atacarHud() {
    if (this._enProteccionRevivir()) return;
    if (this._cooldownRestante() > 0) return;
    const e = this._objetivoHud || this._enemigoMasCercanoEnZona();
    if (!e || typeof Vida !== 'undefined' && Vida.estaMuerto()) return;
    const d = Utilidades.distanciaMetros(GPS.posicion, e.pos);
    if (d > this._radioZona(e)) {
      Notificaciones.mostrar('Saliste de la zona roja', 'alerta', 2500);
      return;
    }
    this._enCombate = e;
    this._atacar();
  },

  async _huirMapa() {
    if (typeof Vida !== 'undefined' && Vida.enProteccionRevivir && Vida.enProteccionRevivir()) return;
    if (typeof Vida === 'undefined' || Vida.estaMuerto()) return;
    if (this._pctVidaJugador() > 30) return;
    if (!this._enemigoMasCercanoEnZona()) return;
    if (!GPS.posicion) return;
    const dropped = this._dejarObjetosAlHuir();
    Guardado.datos.invisibleHasta = Date.now() + this.HUIR_INVISIBLE_MS;
    Guardado.guardar();
    this._cerrarCombate();
    this._limpiarVisionHaciaJugador();
    this._ocultarTodasLasZonas();
    if (typeof Multijugador !== 'undefined') Multijugador.enviarStats(true);
    const msg = dropped > 0
      ? '🏃 Huiste. Invisible 2 min. Dejaste ' + dropped + ' objeto(s) en el suelo.'
      : '🏃 Huiste. Invisible 2 min (sin objetos en la mochila).';
    Notificaciones.mostrar(msg, 'exito', 6000);
    this._actualizarHudCombate();
  },

  _golpeAutomatico(e) {
    if (Vida.estaMuerto()) return;
    if (this._jugadorImuneEnemigos()) return;
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
    if (this._adminOrganizando()) return;

    const muerto = typeof Vida !== 'undefined' && Vida.estaMuerto();
    if (muerto) {
      this._limpiarVisionHaciaJugador();
      this._ocultarTodasLasZonas();
      this._actualizarHudCombate();
      return;
    }

    if (!GPS.posicion) return;
    const online = this._online();
    const invisible = this._jugadorImuneEnemigos();
    for (const e of this.lista) {
      if (!this._enemigoEstaVivo(e)) {
        if (this._marcadores[e.id]) this._quitarMarcador(e.id);
        continue;
      }
      const d = this._distanciaJugadorEnemigo(e);
      this._aplicarVisibilidadMarcador(e, d);
      if (!this._marcadorVisible(e.id)) continue;
      this._aplicarEstadoRemoto(e);

      const radioZona = this._radioZona(e);
      const radioAtaque = this._radioAtaque(e);
      const stBarra = this._aplicarEstadoBarraEnemigo(e);
      const enZona = stBarra.enZona;
      const enAtaque = !invisible && d <= radioAtaque;
      this._actualizarVisibilidadZonas(e, d);

      if (online) {
        if (this._interp[e.id]) this._aplicarInterp(e);
        this._actualizarConoDOM(e);
        this._actualizarBarra(e);
        continue;
      }

      if (!invisible && enZona && GPS.posicion) {
        const nuevoFacing = this._bearingDeg(e.pos[0], e.pos[1], GPS.posicion[0], GPS.posicion[1]);
        if (e.facingDeg == null || this._angulosCercanos(e.facingDeg, nuevoFacing) > 12) {
          e.facingDeg = nuevoFacing;
          this._actualizarConoDOM(e);
        }
      } else if (!enZona && e.facingDeg != null) {
        e.facingDeg = null;
        this._actualizarConoDOM(e);
      }

      if (enZona && d > 3) {
        const paso = enAtaque ? this.PASO_ATAQUE_M : this.PASO_PERSECUCION_M;
        this._avanzarHaciaMetros(e, GPS.posicion[0], GPS.posicion[1], paso);
      } else if (!enZona && e.posOrigen) {
        const o = e.posOrigen;
        const distOrigen = Utilidades.distanciaMetros([e.pos[0], e.pos[1]], o);
        if (distOrigen > 2) {
          this._avanzarHaciaMetros(e, o[0], o[1], this.PASO_ORIGEN_M);
        }
      }

      if (!invisible && enAtaque && enZona && !this._enCombate) this._golpeAutomatico(e);
      this._actualizarBarra(e);
    }
    this._actualizarHudCombate();
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
    const max = this._vidaMaxEnemigo(e);
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
    this._actualizarHudCombate();
  },

  _cerrarCombate() {
    this._enCombate = null;
    document.getElementById('ventana-combate').classList.add('oculto');
  },

  _huir() {
    if (this._enProteccionRevivir()) return;
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
    if (this._enProteccionRevivir()) return;
    const e = this._enCombate;
    if (!e || !this._enemigoEstaVivo(e)) return;
    const restCd = this._cooldownRestante();
    if (restCd > 0) {
      this._actualizarHudCombate();
      return;
    }
    const d = Utilidades.distanciaMetros(GPS.posicion, e.pos);
    if (d > this._radioZona(e) + 2) {
      Notificaciones.mostrar('Saliste de la zona roja del enemigo', 'alerta');
      this._cerrarCombate();
      return;
    }
    this._ultimoAtaqueJugador = Date.now();

    if (this._online()) {
      const res = await Multijugador.attackEnemy(e.id, GPS.posicion);
      if (!res?.ok) {
        Notificaciones.mostrar(res?.error || 'No se pudo atacar', 'alerta', 2500);
        this._actualizarHudCombate();
        return;
      }
      if (res.miss) {
        Notificaciones.mostrar('💨 ¡Fallaste el ataque!', 'alerta', 2500);
        this._actualizarHudCombate();
        return;
      }
      const est = this._estadoGlobal();
      if (!est[e.id]) est[e.id] = { vida: this._vidaMaxEnemigo(e), ultimoGolpe: 0 };
      est[e.id].vida = res.hp;
      est[e.id].ultimoGolpe = Date.now();
      const max = res.hpMax || this._vidaMaxEnemigo(e);
      const actual = res.hp;
      if (res.hpMax) e.vidaMax = res.hpMax;
      this._actualizarUiCombate(e, actual, max);
      Notificaciones.mostrar('⚔️ -' + (res.damage || 0) + ' a ' + e.nombre, 'info', 2000);
      if (res.muerto) {
        const xpGanada = this._xpEnemigo(e);
        if (xpGanada) Vida.ganarXp(xpGanada, 'Enemigo derrotado');
        if (e.dinero) await Dinero.ganar(e.dinero, 'Botín: ' + e.nombre);
        for (const it of (e.recItems || [])) {
          Mochila.agregar(it.id, it.cantidad || 1, { silencioso: true });
        }
        Notificaciones.mostrar('💀 ¡Derrotaste a ' + (e.nombre || 'Enemigo') + '!', 'exito', 5000);
        this._procesarMuerteEnemigo(e, { silencioso: true, desdeRemoto: true });
        return;
      }
      const contra = this._danoEnemigo(e);
      Vida.recibirDano(contra, null, e.nombre || 'Enemigo');
      this._finAtaque(e);
      return;
    }

    if (this._ataqueFallido(e)) {
      Notificaciones.mostrar('💨 ¡Fallaste el ataque!', 'alerta', 2500);
      this._actualizarHudCombate();
      return;
    }

    const golpe = this.danoJugador();
    const est = this._estadoGlobal();
    if (!est[e.id]) est[e.id] = { vida: this._vidaMaxEnemigo(e), ultimoGolpe: 0 };
    est[e.id].vida = Math.max(0, (est[e.id].vida ?? e.vidaMax) - golpe);
    est[e.id].ultimoGolpe = Date.now();
    est[e.id].ultimoAtacante = Usuarios.perfilActivo ? Usuarios.perfilActivo.id : '';

    const max = this._vidaMaxEnemigo(e);
    const actual = est[e.id].vida;
    this._actualizarUiCombate(e, actual, max);
    Notificaciones.mostrar('⚔️ -' + golpe + ' a ' + e.nombre, 'info', 2000);

    if (actual <= 0) {
      this._procesarMuerteEnemigo(e);
      return;
    }

    const contra = this._danoEnemigo(e);
    Vida.recibirDano(contra, null, e.nombre || 'Enemigo');
    this._finAtaque(e);
  },

  _actualizarUiCombate(e, actual, max) {
    const elTxt = document.getElementById('combate-vida-texto');
    const elBar = document.getElementById('combate-vida-relleno');
    if (elTxt) elTxt.textContent = actual + '/' + max;
    if (elBar) elBar.style.width = (actual / max * 100) + '%';
    this._actualizarBarra(e);
  },

  _finAtaque(e) {
    if (typeof Admin !== 'undefined') {
      Admin.guardar();
      // En multijugador el servidor ya guardó el estado del ataque
      if (!this._online() && Admin._publicarParaTodos) Admin._publicarParaTodos(true);
    }
    const modal = document.getElementById('ventana-combate');
    if (modal && modal.classList.contains('oculto')) this._enCombate = null;
    this._actualizarHudCombate();
  },

  agregarAdmin(e) {
    if (!e.posOrigen) e.posOrigen = e.pos.slice();
    if (!e.nivel) e.nivel = 1;
    this.lista.push(e);
    this._crearEnMapa(e);
  }
};
