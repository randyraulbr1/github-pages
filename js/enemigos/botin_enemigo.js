// ============================================================
// BOTÍN ENEMIGO — recompensa compartida según daño infligido
// Icono en mapa 5 min; menú con reparto; reclamar si cabe en mochila
// ============================================================
const BotinEnemigo = {
  _abierto: null,
  _marcadores: {},

  ttlMs() {
    return 5 * 60 * 1000;
  },

  _miId() {
    if (typeof Multijugador !== 'undefined' && Multijugador.activo) {
      const id = Multijugador._miPlayerId();
      if (id > 0) return String(id);
    }
    if (typeof Usuarios !== 'undefined' && Usuarios.perfilActivo?.id) {
      return String(Usuarios.perfilActivo.id);
    }
    return 'local';
  },

  _miNombre() {
    if (typeof Usuarios !== 'undefined' && Usuarios.perfilActivo?.nombre) {
      return Usuarios.perfilActivo.nombre;
    }
    return 'Tú';
  },

  _mapaBotines() {
    const out = {};
    const remoto = (typeof Admin !== 'undefined' && Admin.publicado?.botinesEnemigo) || {};
    const local = (typeof Guardado !== 'undefined' && Guardado.datos?.botinesEnemigo) || {};
    for (const [id, b] of Object.entries(local)) if (b?.id) out[id] = b;
    for (const [id, b] of Object.entries(remoto)) if (b?.id) out[id] = Object.assign({}, out[id] || {}, b);
    return out;
  },

  todas() {
    this.limpiarExpiradas();
    return Object.values(this._mapaBotines());
  },

  obtener(id) {
    return this._mapaBotines()[id] || null;
  },

  limpiarExpiradas() {
    const now = Date.now();
    const listas = [];
    if (typeof Admin !== 'undefined' && Admin.publicado?.botinesEnemigo) {
      listas.push(Admin.publicado.botinesEnemigo);
    }
    if (typeof Guardado !== 'undefined' && Guardado.datos?.botinesEnemigo) {
      listas.push(Guardado.datos.botinesEnemigo);
    }
    for (const mapa of listas) {
      for (const [id, b] of Object.entries(mapa)) {
        if (!b || now > (b.expiraEn || 0)) {
          delete mapa[id];
          this._quitarMarcador(id);
        }
      }
    }
  },

  _guardarLocal(botin) {
    if (!botin?.id) return;
    if (typeof Admin !== 'undefined') {
      if (!Admin.publicado.botinesEnemigo) Admin.publicado.botinesEnemigo = {};
      Admin.publicado.botinesEnemigo[botin.id] = botin;
    }
    if (!this._online() && typeof Guardado !== 'undefined') {
      if (!Guardado.datos.botinesEnemigo) Guardado.datos.botinesEnemigo = {};
      Guardado.datos.botinesEnemigo[botin.id] = botin;
      Guardado.guardar();
    }
  },

  _online() {
    return typeof Multijugador !== 'undefined' && Multijugador.activo && CONFIG.servidorOnline;
  },

  participa(botin) {
    if (!botin?.participantes) return false;
    return !!botin.participantes[this._miId()];
  },

  yaReclamo(botin) {
    const p = botin?.participantes?.[this._miId()];
    return !!p?.reclamado;
  },

  visibleParaMi(botin) {
    if (!botin?.pos) return false;
    if (!this.participa(botin)) return false;
    if (this.yaReclamo(botin)) return false;
    if (Date.now() > (botin.expiraEn || 0)) return false;
    return true;
  },

  distanciaVer() {
    return (typeof CONFIG !== 'undefined' && CONFIG.distanciaVerBolsa) || 80;
  },

  _calcularRecompensas(enemy, danoPorJugador) {
    if (typeof calcularBotinEnemigo === 'function') {
      return calcularBotinEnemigo(enemy, danoPorJugador, {});
    }
    const participantes = Object.entries(danoPorJugador || {})
      .filter(([, d]) => (d || 0) > 0)
      .map(([id, dano]) => ({
        id: String(id),
        dano,
        nombre: id === this._miId() ? this._miNombre() : ('Jugador ' + id)
      }));
    if (!participantes.length) return null;

    const xpTotal = typeof Enemigos !== 'undefined' ? Enemigos._xpEnemigo(enemy) : (enemy.xp || 30);
    const dineroTotal = enemy.dinero || 0;
    const recItems = enemy.recItems || [];
    const danoTotal = participantes.reduce((s, p) => s + p.dano, 0);

    const dividir = (total) => {
      const n = Math.max(0, parseInt(total, 10) || 0);
      const out = {};
      for (const p of participantes) out[p.id] = 0;
      if (!n) return out;
      const parts = participantes.map((p) => {
        const exact = (n * p.dano) / danoTotal;
        return { id: p.id, exact, floor: Math.floor(exact) };
      });
      let assigned = 0;
      for (const p of parts) { out[p.id] = p.floor; assigned += p.floor; }
      let rem = n - assigned;
      const sorted = [...parts].sort((a, b) => b.exact - a.exact);
      for (let i = 0; rem > 0 && i < sorted.length; i++, rem--) out[sorted[i].id]++;
      return out;
    };

    const xpDiv = dividir(xpTotal);
    const oroDiv = dividir(dineroTotal);
    const itemsDiv = {};
    for (const p of participantes) itemsDiv[p.id] = [];
    const stacks = (recItems || []).map((it) => ({
      id: it.id,
      cantidad: Math.max(1, parseInt(it.cantidad, 10) || 1)
    }));
    const totalUnits = stacks.reduce((s, it) => s + it.cantidad, 0);
    const quotas = dividir(totalUnits);
    const orden = [...participantes].sort((a, b) => b.dano - a.dano);
    const remaining = Object.assign({}, quotas);
    for (const stack of stacks) {
      let qty = stack.cantidad;
      while (qty > 0) {
        let best = null;
        for (const p of orden) {
          if ((remaining[p.id] || 0) > 0 && (!best || remaining[p.id] > remaining[best.id])) best = p;
        }
        if (!best) break;
        const give = Math.min(qty, remaining[best.id]);
        const ex = itemsDiv[best.id].find((x) => x.id === stack.id);
        if (ex) ex.cantidad += give;
        else itemsDiv[best.id].push({ id: stack.id, cantidad: give });
        remaining[best.id] -= give;
        qty -= give;
      }
    }

    const recompensas = {};
    const partMap = {};
    for (const p of participantes) {
      const nombre = p.id === this._miId() ? this._miNombre() : p.nombre;
      recompensas[p.id] = {
        xp: xpDiv[p.id] || 0,
        dinero: oroDiv[p.id] || 0,
        items: itemsDiv[p.id] || []
      };
      partMap[p.id] = { playerId: p.id, nombre, dano: p.dano, reclamado: false };
    }
    return { participantes: partMap, recompensas, danoTotal };
  },

  crearDesdeEnemigo(enemy, danoPorJugador, pos) {
    if (!enemy?.id || !pos?.length) return null;
    const calc = this._calcularRecompensas(enemy, danoPorJugador);
    if (!calc) return null;
    const tieneAlgo = Object.values(calc.recompensas).some((r) =>
      (r.xp || 0) > 0 || (r.dinero || 0) > 0 || (r.items || []).length > 0
    );
    if (!tieneAlgo) return null;

    const now = Date.now();
    const botin = {
      id: 'botin_' + enemy.id + '_' + now.toString(36),
      enemyId: enemy.id,
      enemyNombre: enemy.nombre || 'Enemigo',
      enemyIcono: enemy.icono || '💀',
      pos: [+pos[0], +pos[1]],
      creadoEn: now,
      expiraEn: now + this.ttlMs(),
      danoTotal: calc.danoTotal,
      participantes: calc.participantes,
      recompensas: calc.recompensas
    };
    this._guardarLocal(botin);
    this._crearMarcador(botin);
    return botin;
  },

  aplicarBotin(botin) {
    if (!botin?.id) return;
    this._guardarLocal(botin);
    if (this.visibleParaMi(botin)) this._crearMarcador(botin);
  },

  aplicarBotinActualizado(botin) {
    if (!botin?.id) return;
    if (this.yaReclamo(botin)) {
      this.aplicarBotinEliminado(botin.id);
      return;
    }
    this.aplicarBotin(botin);
    if (this._abierto === botin.id) this.abrirMenu(botin.id);
  },

  aplicarBotinEliminado(botinId) {
    if (!botinId) return;
    if (typeof Admin !== 'undefined' && Admin.publicado?.botinesEnemigo) {
      delete Admin.publicado.botinesEnemigo[botinId];
    }
    if (typeof Guardado !== 'undefined' && Guardado.datos?.botinesEnemigo) {
      delete Guardado.datos.botinesEnemigo[botinId];
      Guardado.guardar();
    }
    this._quitarMarcador(botinId);
    if (this._abierto === botinId) this.cerrarMenu();
  },

  aplicarTodosDesdeMundo(mapa) {
    if (!mapa || typeof mapa !== 'object') return;
    if (typeof Admin !== 'undefined') {
      Admin.publicado.botinesEnemigo = Object.assign({}, mapa);
    }
    for (const b of Object.values(mapa)) {
      if (this.visibleParaMi(b)) this._crearMarcador(b);
    }
  },

  _tiempoRestante(botin) {
    const ms = (botin?.expiraEn || 0) - Date.now();
    if (ms <= 0) return '0:00';
    const s = Math.ceil(ms / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ':' + String(r).padStart(2, '0');
  },

  _htmlRejilla(items, bloqueada) {
    const lista = (items || []).slice(0, 6);
    let html = '<div class="mision-recompensa-rejilla">';
    for (const it of lista) {
      const item = Items.seguro(it.id);
      html += '<div class="slot mision-recompensa-slot' + (bloqueada ? ' bloqueada' : '') + '" title="' +
        item.nombre + '">' + item.icono + '<span class="cantidad">' + it.cantidad + '</span></div>';
    }
    for (let i = lista.length; i < 6; i++) {
      html += '<div class="slot mision-recompensa-slot vacia"></div>';
    }
    html += '</div>';
    return html;
  },

  _puedeRecibir(rec) {
    if (!rec) return true;
    const items = (rec.items || []).slice();
    if (!items.length) return true;
    return typeof Mochila !== 'undefined' && Mochila.puedeRecibirRecompensa(items);
  },

  abrirMenu(botinId) {
    const botin = typeof botinId === 'string' ? this.obtener(botinId) : botinId;
    if (!botin) return;
    if (!this.participa(botin)) return;

    this._abierto = botin.id;
    const overlay = document.getElementById('overlay-botin-enemigo');
    if (!overlay) return;

    const titulo = document.getElementById('botin-titulo');
    const resumen = document.getElementById('botin-resumen');
    const participantes = document.getElementById('botin-participantes');
    const miRec = document.getElementById('botin-mi-recompensa');
    const otros = document.getElementById('botin-otros');
    const avisoLleno = document.getElementById('botin-aviso-lleno');
    const btnReclamar = document.getElementById('btn-botin-reclamar');

    if (titulo) {
      titulo.textContent = (botin.enemyIcono || '💀') + ' Botín: ' + (botin.enemyNombre || 'Enemigo');
    }
    if (resumen) {
      resumen.innerHTML = '<p class="botin-resumen-texto">Reparto según daño · expira en <b>' +
        this._tiempoRestante(botin) + '</b></p>';
    }

    const miId = this._miId();
    const parts = Object.values(botin.participantes || {}).sort((a, b) => (b.dano || 0) - (a.dano || 0));
    if (participantes) {
      let html = '<div class="botin-tabla-titulo">⚔️ Daño en el combate</div><div class="botin-tabla">';
      for (const p of parts) {
        const pct = botin.danoTotal > 0 ? Math.round((p.dano / botin.danoTotal) * 100) : 0;
        const yo = p.playerId === miId ? ' botin-fila-yo' : '';
        const estado = p.reclamado ? ' <span class="botin-estado-reclamado">✓ reclamó</span>' : '';
        html += '<div class="botin-fila' + yo + '"><span class="botin-nombre">' + p.nombre + '</span>' +
          '<span class="botin-dano">-' + p.dano + ' (' + pct + '%)</span>' + estado + '</div>';
      }
      html += '</div>';
      participantes.innerHTML = html;
    }

    const recMi = botin.recompensas?.[miId];
    const lleno = !this._puedeRecibir(recMi);
    const yaReclamo = this.yaReclamo(botin);

    if (miRec) {
      let html = '<div class="mision-recompensa-preview desbloqueada"><div class="mision-recompensa-titulo">🎁 Tu parte</div>';
      if (recMi?.xp) html += '<div class="botin-stat">⭐ +' + recMi.xp + ' XP</div>';
      if (recMi?.dinero) html += '<div class="botin-stat">💰 +' + recMi.dinero + ' oro</div>';
      if ((recMi?.items || []).length) html += this._htmlRejilla(recMi.items, false);
      else if (!recMi?.xp && !recMi?.dinero) html += '<p class="botin-sin-items">Sin objetos para ti</p>';
      html += '</div>';
      miRec.innerHTML = html;
    }

    if (otros) {
      let html = '<div class="botin-otros-titulo">👥 Partes de los demás</div>';
      for (const p of parts) {
        if (p.playerId === miId) continue;
        const rec = botin.recompensas?.[p.playerId];
        html += '<div class="botin-otro-bloque"><div class="botin-otro-nombre">' + p.nombre +
          (p.reclamado ? ' ✓' : '') + '</div>';
        if (rec?.xp) html += '<div class="botin-stat-mini">⭐ ' + rec.xp + ' XP</div>';
        if (rec?.dinero) html += '<div class="botin-stat-mini">💰 ' + rec.dinero + '</div>';
        if ((rec?.items || []).length) html += this._htmlRejilla(rec.items, true);
        html += '</div>';
      }
      otros.innerHTML = html;
    }

    if (avisoLleno) avisoLleno.classList.toggle('oculto', !lleno || yaReclamo);
    if (btnReclamar) {
      btnReclamar.disabled = yaReclamo || lleno;
      btnReclamar.textContent = yaReclamo ? 'Ya reclamaste' : 'Reclamar mi parte';
    }

    overlay.classList.remove('oculto');
  },

  cerrarMenu() {
    this._abierto = null;
    const overlay = document.getElementById('overlay-botin-enemigo');
    if (overlay) overlay.classList.add('oculto');
  },

  async reclamar(botin) {
    const b = typeof botin === 'string' ? this.obtener(botin) : botin;
    if (!b?.id) return false;
    if (!this.participa(b) || this.yaReclamo(b)) return false;

    const rec = b.recompensas?.[this._miId()];
    if (!this._puedeRecibir(rec)) {
      Notificaciones.mostrar('🎒 Inventario lleno — libera espacio para reclamar', 'alerta', 5000);
      this.abrirMenu(b.id);
      return false;
    }

    if (this._online()) {
      const pos = b.pos || (typeof GPS !== 'undefined' ? GPS.posicion : null);
      const res = await Multijugador.reclamarBotinEnemigo(b.id, pos);
      if (!res?.ok) {
        Notificaciones.mostrar(res?.error || 'No se pudo reclamar', 'alerta', 4000);
        return false;
      }
      await this._aplicarRecompensa(res.recompensa, b.enemyNombre);
      if (res.todosReclamaron || !res.botin) {
        this.aplicarBotinEliminado(b.id);
      } else if (res.botin) {
        this.aplicarBotinActualizado(res.botin);
      }
      this.cerrarMenu();
      Notificaciones.mostrar('🎁 Reclamaste tu parte del botín', 'exito', 4000);
      return true;
    }

    const miId = this._miId();
    b.participantes[miId].reclamado = true;
    await this._aplicarRecompensa(rec, b.enemyNombre);
    const todos = Object.values(b.participantes).every((p) => p.reclamado);
    if (todos) this.aplicarBotinEliminado(b.id);
    else this._guardarLocal(b);
    this.cerrarMenu();
    Notificaciones.mostrar('🎁 Reclamaste tu parte del botín', 'exito', 4000);
    return true;
  },

  async _aplicarRecompensa(rec, nombreEnemigo) {
    if (!rec) return;
    if (rec.xp && typeof Vida !== 'undefined') {
      Vida.ganarXp(rec.xp, 'Botín: ' + (nombreEnemigo || 'Enemigo'));
    }
    if (rec.dinero && typeof Dinero !== 'undefined') {
      await Dinero.ganar(rec.dinero, 'Botín: ' + (nombreEnemigo || 'Enemigo'));
    }
    for (const it of (rec.items || [])) {
      if (typeof Mochila !== 'undefined') {
        Mochila.agregar(it.id, it.cantidad || 1, { silencioso: true });
      }
    }
  },

  _quitarMarcador(id) {
    const m = this._marcadores[id];
    if (m) {
      try { m.remove(); } catch (e) { /* */ }
      delete this._marcadores[id];
    }
    if (typeof Admin !== 'undefined' && Admin._liberarMarcadorBotin) {
      Admin._liberarMarcadorBotin(id);
    }
  },

  _crearMarcador(botin) {
    if (!this.visibleParaMi(botin) || !botin?.pos) return;
    if (this._marcadores[botin.id]) return;

    if (typeof Admin !== 'undefined' && Admin._crearMarcadorBotin) {
      Admin._crearMarcadorBotin(botin);
      return;
    }

    if (typeof Mapa === 'undefined') return;
    const marcador = Mapa.crearMarcadorEmoji(botin.pos, '🎁', 30);
    const el = marcador.getElement?.();
    if (el) el.classList.add('marcador-botin-enemigo');
    this._marcadores[botin.id] = marcador;
    marcador.on('click', () => this.abrirMenu(botin.id));
  },

  refrescarMapa() {
    this.limpiarExpiradas();
    for (const b of this.todas()) {
      if (this.visibleParaMi(b)) {
        if (!this._marcadores[b.id] && typeof Admin !== 'undefined' && Admin._crearMarcadorBotin) {
          Admin._crearMarcadorBotin(b);
        } else if (!this._marcadores[b.id]) {
          this._crearMarcador(b);
        }
      } else {
        this._quitarMarcador(b.id);
      }
    }
  },

  iniciar() {
    const cerrar = document.getElementById('botin-cerrar');
    const btnCerrar = document.getElementById('btn-botin-cerrar');
    const btnReclamar = document.getElementById('btn-botin-reclamar');
    const overlay = document.getElementById('overlay-botin-enemigo');

    if (cerrar) cerrar.onclick = () => this.cerrarMenu();
    if (btnCerrar) btnCerrar.onclick = () => this.cerrarMenu();
    if (btnReclamar) {
      btnReclamar.onclick = () => {
        if (this._abierto) void this.reclamar(this._abierto);
      };
    }
    if (overlay) {
      overlay.addEventListener('click', (ev) => {
        if (ev.target === overlay) this.cerrarMenu();
      });
    }

    if (typeof Admin !== 'undefined' && Admin.publicado?.botinesEnemigo) {
      this.aplicarTodosDesdeMundo(Admin.publicado.botinesEnemigo);
    }
    this.refrescarMapa();
  }
};
