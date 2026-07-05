// ============================================================
// ENEMIGOS — combate en el mapa (compartido vía mundo.json)
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
  _barraVida: {},
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
      radioZona: 40, radioPersecucion: 20, curacionMs: 120000
    };
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
      Admin.pos(e.id, e.pos);
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

  _radioZona(e) {
    return e.radioZona || this._config().radioZona || 40;
  },

  _radioAtaque(e) {
    const cfg = this._config();
    return e.radioAtaque || e.radioPersecucion || cfg.radioPersecucion || 18;
  },

  _crearEnMapa(e) {
    const icono = e.icono || '👹';
    const marcador = Mapa.crearMarcadorEmoji(e.pos, icono, 32);
    this._marcadores[e.id] = marcador;
    const radioZona = this._radioZona(e);
    const radioAtaque = this._radioAtaque(e);
    this._zonas[e.id] = L.circle(e.pos, {
      radius: radioZona, color: '#ff453a', weight: 2, fillColor: '#ff453a', fillOpacity: 0.07, dashArray: '4 6'
    }).addTo(Mapa.mapa);
    this._zonasAtaque[e.id] = L.circle(e.pos, {
      radius: radioAtaque, color: '#ffd60a', weight: 2, fillColor: '#ffd60a', fillOpacity: 0.12, dashArray: '2 4'
    }).addTo(Mapa.mapa);

    Mapa.registrarPunto({
      id: e.id,
      posicion: e.pos,
      radio: CONFIG.distanciaInteraccion,
      marcador,
      alTocar: () => this._abrirCombate(e),
      alCambiarDistancia: d => this._alCambiarDistancia(e, d)
    });
    this._actualizarBarra(e);
  },

  _quitarMarcador(id) {
    if (this._marcadores[id]) { this._marcadores[id].remove(); delete this._marcadores[id]; }
    if (this._zonas[id]) { this._zonas[id].remove(); delete this._zonas[id]; }
    if (this._zonasAtaque[id]) { this._zonasAtaque[id].remove(); delete this._zonasAtaque[id]; }
    if (this._barraVida[id]) { this._barraVida[id].remove(); delete this._barraVida[id]; }
    delete this._ultimoGolpeAuto[id];
  },

  _actualizarMarcador(e) {
    const m = this._marcadores[e.id];
    if (m) m.setLatLng(e.pos);
    if (this._zonas[e.id]) this._zonas[e.id].setLatLng(e.pos);
    if (this._zonasAtaque[e.id]) this._zonasAtaque[e.id].setLatLng(e.pos);
    this._actualizarBarra(e);
  },

  _actualizarBarra(e) {
    const max = e.vidaMax || e.vida || 50;
    const actual = this._vidaActual(e);
    const pct = Math.max(0, Math.min(100, (actual / max) * 100));
    const m = this._marcadores[e.id];
    if (!m) return;
    let bar = this._barraVida[e.id];
    const html = '<div class="enemigo-barra-vida"><div class="enemigo-barra-relleno" style="width:' + pct + '%"></div></div>';
    if (!bar) {
      bar = L.divIcon({
        className: 'enemigo-barra-contenedor',
        html: html,
        iconSize: [40, 6],
        iconAnchor: [20, 38]
      });
      this._barraVida[e.id] = L.marker(e.pos, { icon: bar, interactive: false, zIndexOffset: 500 }).addTo(Mapa.mapa);
    } else {
      bar.setIcon(L.divIcon({
        className: 'enemigo-barra-contenedor',
        html: html,
        iconSize: [40, 6],
        iconAnchor: [20, 38]
      }));
      bar.setLatLng(m.getLatLng());
    }
  },

  _alCambiarDistancia(e, d) {
    const radioZona = this._radioZona(e);
    const enZona = d <= radioZona;
    if (enZona && !e._avisoZona) {
      e._avisoZona = true;
      Notificaciones.mostrar('⚠️ Zona de ' + (e.nombre || 'enemigo') + ' — ¡cuidado!', 'alerta', 3500);
    } else if (!enZona) {
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
    if (this._barraVida[e.id]) this._barraVida[e.id].setLatLng([nlat, nlng]);
  },

  _golpeAutomatico(e) {
    if (Vida.estaMuerto()) return;
    if (this._enCombate) return;
    const ahora = Date.now();
    const ultimo = this._ultimoGolpeAuto[e.id] || 0;
    if (ahora - ultimo < 2200) return;
    this._ultimoGolpeAuto[e.id] = ahora;
    const dano = e.dano || 10;
    Vida.cambiar(-dano, null);
    Notificaciones.mostrar('💥 ' + e.nombre + ' te alcanza (-' + dano + ')', 'alerta', 2200);
  },

  _tick() {
    if (!GPS.posicion || Vida.estaMuerto()) return;
    for (const e of this.lista) {
      this._aplicarEstadoRemoto(e);
      const d = Utilidades.distanciaMetros(GPS.posicion, e.pos);
      const radioZona = this._radioZona(e);
      const radioAtaque = this._radioAtaque(e);
      const enZona = d <= radioZona;
      const enAtaque = d <= radioAtaque;

      if (enZona && d > 3 && this._marcadores[e.id]) {
        const m = this._marcadores[e.id];
        const ll = m.getLatLng();
        const t = enAtaque ? 0.18 : 0.12;
        const nlat = ll.lat + (GPS.posicion[0] - ll.lat) * t;
        const nlng = ll.lng + (GPS.posicion[1] - ll.lng) * t;
        this._moverEnemigo(e, nlat, nlng);
      } else if (e.posOrigen && d > radioZona * 1.15) {
        const o = e.posOrigen;
        const distOrigen = Utilidades.distanciaMetros(e.pos, o);
        if (distOrigen > 2 && this._marcadores[e.id]) {
          const m = this._marcadores[e.id];
          const ll = m.getLatLng();
          const t = 0.08;
          const nlat = ll.lat + (o[0] - ll.lat) * t;
          const nlng = ll.lng + (o[1] - ll.lng) * t;
          this._moverEnemigo(e, nlat, nlng);
        }
      }

      if (enAtaque && !this._enCombate) this._golpeAutomatico(e);

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
      ? (' · Arma ' + (Mochila.armaEquipadaInfo()?.icono || '') + ' +' + arma) : '';
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
    document.getElementById('combate-nombre').textContent = (e.icono || '👹') + ' ' + (e.nombre || 'Enemigo');
    document.getElementById('combate-vida-texto').textContent = actual + '/' + max;
    document.getElementById('combate-vida-relleno').style.width = (actual / max * 100) + '%';
    const r = this._rangoDanoNivel();
    const arma = typeof Mochila !== 'undefined' ? Mochila.danoArmaEquipada() : 0;
    document.getElementById('combate-info').textContent =
      'Tu daño: ' + this._textoDanoJugador() + ' = ' + (r.lo + arma) + '–' + (r.hi + arma) +
      ' · Nv ' + Vida.nivel + ' · XP: ' + (e.xp || 0) +
      ' · Daño enemigo: ' + (e.dano || 5);
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
    const antes = Vida.actual;
    Vida.actual = Math.max(0, Vida.actual - coste);
    Guardado.datos.vida = Vida.actual;
    Vida.hambre = 0;
    Guardado.datos.hambre = 0;
    Guardado.guardar();
    Vida.pintar();
    if (Vida.actual <= 0) Vida._activarMuerte();
    Notificaciones.mostrar(
      '🏃 Huiste del combate (-' + coste + ' vida, hambre a 0)',
      'alerta', 5000
    );
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

    const contra = e.dano || 10;
    Vida.cambiar(-contra, null);
    Notificaciones.mostrar('💥 ' + e.nombre + ' te golpea (-' + contra + ')', 'alerta', 2500);
    if (typeof Admin !== 'undefined') {
      Admin.guardar();
      if (Admin._publicarParaTodos) Admin._publicarParaTodos(true);
    }
  },

  agregarAdmin(e) {
    if (!e.posOrigen) e.posOrigen = e.pos.slice();
    this.lista.push(e);
    this._crearEnMapa(e);
  }
};
