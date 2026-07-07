// ============================================================
// MENÚ DE OPCIONES — HUD estilo mockup gris
// ============================================================
const Opciones = {
  _pending: null,
  _toastTimer: null,

  iniciar() {
    document.getElementById('btn-opciones')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.abrir();
    });

    document.getElementById('cerrar-opciones')?.addEventListener('click', () => this.cerrar());

    const adminBtn = document.getElementById('btn-admin');
    if (adminBtn) adminBtn.addEventListener('click', () => Admin.solicitarAcceso());

    document.getElementById('opcion-admin')?.addEventListener('click', () => {
      this.cerrar();
      Admin.solicitarAcceso();
    });

    this._refrescarAdmin();

    document.getElementById('opcion-centrar')?.addEventListener('click', () => {
      Mapa.centrarEnJugador(true);
      this._toast('Mapa centrado');
      this.cerrar();
    });

    document.getElementById('opcion-restablecer-pin')?.addEventListener('click', () => {
      this._confirmar(
        'reset-pin',
        '¿Restablecer tu pin?',
        'Tu pin volverá al centro de Mariel (22.988784, -82.754494). Úsalo si quedó fuera del mapa o en un borde.'
      );
    });

    document.querySelectorAll('.opciones-toggle').forEach(btn => {
      btn.addEventListener('click', () => this._togglePref(btn));
    });

    document.querySelectorAll('.opciones-seg[data-pref-seg]').forEach(btn => {
      btn.addEventListener('click', () => this._elegirSegmento(btn));
    });

    document.getElementById('opcion-salir')?.addEventListener('click', () => {
      this._confirmar(
        'logout',
        '¿Cerrar sesión?',
        'Saldrás de tu cuenta. Puedes volver a entrar después.'
      );
    });

    document.getElementById('opcion-reportar')?.addEventListener('click', () => {
      this._confirmar(
        'report',
        '¿Reportar jugador?',
        'Se enviará un reporte para revisión.'
      );
    });

    document.getElementById('opciones-confirm-cancel')?.addEventListener('click', () => this._cerrarConfirm());
    document.getElementById('opciones-confirm-ok')?.addEventListener('click', () => this._aceptarConfirm());

    document.getElementById('opcion-tarjeta')?.addEventListener('click', () => this.copiarTarjeta());

    const ventana = document.getElementById('ventana-opciones');
    const panel = ventana?.querySelector('.opciones-panel');
    panel?.addEventListener('click', (e) => e.stopPropagation());
    ventana?.addEventListener('click', (e) => {
      if (e.target === ventana) this.cerrar();
    });

    if (!this._clickFueraOk) {
      this._clickFueraOk = true;
      const cerrarSiFuera = (e) => {
        const v = document.getElementById('ventana-opciones');
        if (!v || v.classList.contains('oculto')) return;
        if (e.target.closest('#btn-opciones')) return;
        const caja = v.querySelector('.opciones-panel');
        if (caja?.contains(e.target)) return;
        if (e.target.closest('#opciones-overlay.show')) return;
        this.cerrar();
      };
      document.addEventListener('click', cerrarSiFuera);
    }

    document.getElementById('opciones-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'opciones-overlay') this._cerrarConfirm();
    });
  },

  _togglePref(btn) {
    const clave = btn.dataset.pref;
    if (!clave) return;
    const activo = btn.classList.contains('off');
    this._setToggle(btn, activo);
    this._guardarPreferencia(clave, activo);
    const msg = clave === 'vibracionCombate'
      ? (activo ? 'Vibración activada' : 'Vibración desactivada')
      : (activo ? 'Notificación activada' : 'Notificación apagada');
    this._toast(msg);
  },

  _elegirSegmento(btn) {
    const clave = btn.dataset.prefSeg;
    const val = btn.dataset.val;
    if (!clave || !val) return;
    if (!Guardado.datos.preferencias) {
      Guardado.datos.preferencias = { notifChat: true, notifAmigos: true, vibracionCombate: true, posBtnAtacar: 'izq' };
    }
    Guardado.datos.preferencias[clave] = val;
    Guardado.guardar();
    this._pintarSegmentos();
    if (clave === 'posBtnAtacar' && typeof Enemigos !== 'undefined') {
      Enemigos.aplicarLayoutCombate();
      Enemigos._actualizarHudCombate();
    }
    this._toast(val === 'der' ? 'ATK a la derecha' : 'ATK a la izquierda');
  },

  _pintarSegmentos() {
    const prefs = Guardado.datos?.preferencias || {};
    document.querySelectorAll('.opciones-seg[data-pref-seg]').forEach(btn => {
      const clave = btn.dataset.prefSeg;
      const val = btn.dataset.val;
      const activo = (prefs[clave] || 'izq') === val;
      btn.classList.toggle('activo', activo);
    });
  },

  _setToggle(btn, on) {
    if (!btn) return;
    btn.classList.toggle('off', !on);
    btn.textContent = on ? '✓' : '';
  },

  _confirmar(accion, titulo, texto) {
    this._pending = accion;
    const tit = document.getElementById('opciones-confirm-title');
    const txt = document.getElementById('opciones-confirm-text');
    if (tit) tit.textContent = titulo;
    if (txt) txt.textContent = texto;
    const ov = document.getElementById('opciones-overlay');
    ov?.classList.remove('oculto');
    ov?.classList.add('show');
  },

  _cerrarConfirm() {
    this._pending = null;
    const ov = document.getElementById('opciones-overlay');
    ov?.classList.add('oculto');
    ov?.classList.remove('show');
  },

  _aceptarConfirm() {
    const accion = this._pending;
    this._cerrarConfirm();
    if (accion === 'logout') {
      this.cerrar();
      Usuarios.cerrarSesion();
      this._toast('Sesión cerrada');
      return;
    }
    if (accion === 'report') {
      this.reportar();
      return;
    }
    if (accion === 'reset-pin') {
      this._restablecerPin();
    }
  },

  _toast(texto) {
    const el = document.getElementById('opciones-toast');
    if (!el) return;
    el.textContent = texto;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), 1700);
  },

  _restablecerPin() {
    if (typeof GPS !== 'undefined' && GPS.restablecerPin) {
      GPS.restablecerPin(CONFIG.pinRestablecer);
    } else if (typeof Guardado !== 'undefined' && Guardado.datos) {
      Guardado.datos.posicionJugador = CONFIG.pinRestablecer.slice();
      Guardado.guardar();
      if (typeof Mapa !== 'undefined') Mapa.centrarEnJugador(true);
    }
    this._toast('Pin restablecido en Mariel');
    this.cerrar();
  },

  pintarPerfilOpciones() {
    const perfil = Usuarios.perfilActivo;
    if (!perfil) return;
    const nom = document.getElementById('opciones-nombre');
    const grid = document.getElementById('opciones-stats-grid');
    const idEl = document.getElementById('opciones-id');
    const av = document.getElementById('opciones-avatar');
    if (nom) nom.textContent = perfil.nombre || 'Jugador';
    if (av) av.textContent = (perfil.nombre || '?').charAt(0).toUpperCase();
    const nivel = (typeof Vida !== 'undefined') ? Vida.nivel : 1;
    const vida = (typeof Vida !== 'undefined') ? Vida.actual : CONFIG.vidaMaxima;
    const maxVida = (typeof Vida !== 'undefined') ? Vida.vidaMaxima() : CONFIG.vidaMaxima;
    const hambre = (typeof Vida !== 'undefined') ? Vida.hambre : CONFIG.hambreInicial;
    const oro = (typeof Dinero !== 'undefined') ? Dinero.saldo : 0;
    let ataqueTxt = '—';
    if (typeof Enemigos !== 'undefined') {
      const d = Enemigos.rangoAtaqueJugador();
      ataqueTxt = d.totalLo + '–' + d.totalHi;
    }
    if (grid) {
      grid.innerHTML =
        '<div class="opciones-stat"><div class="opciones-label">Nivel</div><div class="opciones-value">Nv ' + nivel + '</div></div>' +
        '<div class="opciones-stat"><div class="opciones-label">Vida</div><div class="opciones-value">❤️ ' + vida + '/' + maxVida + '</div></div>' +
        '<div class="opciones-stat"><div class="opciones-label">Ataque</div><div class="opciones-value">⚔️ ' + ataqueTxt + '</div></div>' +
        '<div class="opciones-stat"><div class="opciones-label">Hambre</div><div class="opciones-value">🍽️ ' + hambre + '/' + CONFIG.hambreMaxima + '</div></div>' +
        '<div class="opciones-stat"><div class="opciones-label">Oro</div><div class="opciones-value">💰 $' + oro + '</div></div>';
    }
    if (idEl) {
      idEl.textContent = (perfil.telefono ? '📱 ' + perfil.telefono + ' · ' : '') + perfil.id;
    }
  },

  abrir() {
    this._refrescarAdmin();
    this.pintarPerfilOpciones();
    this._pintarPreferencias();
    this._pintarVersion();
    this._cerrarConfirm();
    const v = document.getElementById('ventana-opciones');
    v?.classList.remove('oculto');
    v?.classList.add('show');
  },

  _pintarPreferencias() {
    const prefs = Guardado.datos?.preferencias || {};
    this._setToggle(document.getElementById('opcion-toggle-chat'), prefs.notifChat !== false);
    this._setToggle(document.getElementById('opcion-toggle-amigos'), prefs.notifAmigos !== false);
    this._setToggle(document.getElementById('opcion-toggle-vibracion'), prefs.vibracionCombate !== false);
    this._pintarSegmentos();
  },

  _pintarVersion() {
    const el = document.getElementById('opciones-version');
    if (!el) return;
    const v = window.__MARIEL_EMBEDDED__
      || (typeof MarielVersion !== 'undefined' && MarielVersion._embebida)
      || (typeof CONFIG !== 'undefined' && CONFIG.version)
      || '?';
    const guardada = localStorage.getItem('mariel_app_version');
    const alDia = !guardada || guardada === v;
    el.textContent = alDia
      ? ('Versión ' + v + ' · actualizada')
      : ('Versión ' + v + ' · hay actualización nueva');
    if (typeof MarielVersion !== 'undefined') {
      MarielVersion.comprobarRemota();
    }
  },

  _guardarPreferencia(clave, valor) {
    if (!Guardado.datos) return;
    if (!Guardado.datos.preferencias) {
      Guardado.datos.preferencias = { notifChat: true, notifAmigos: true, vibracionCombate: true, posBtnAtacar: 'izq' };
    }
    Guardado.datos.preferencias[clave] = !!valor;
    Guardado.guardar();
  },

  _refrescarAdmin() {
    const esAdmin = Usuarios.esAdministrador();
    document.getElementById('btn-admin')?.classList.toggle('oculto', !esAdmin);
    document.getElementById('opcion-admin')?.classList.toggle('oculto', !esAdmin);
  },

  cerrar() {
    const v = document.getElementById('ventana-opciones');
    v?.classList.add('oculto');
    v?.classList.remove('show');
    this._cerrarConfirm();
  },

  async generarTarjeta() {
    const malas = (await Historial.verificar('dinero')).length +
                  (await Historial.verificar('objetos')).length;
    const datos = {
      id: Usuarios.perfilActivo.id,
      nombre: Usuarios.perfilActivo.nombre,
      telefono: Usuarios.perfilActivo.telefono || '',
      dinero: Dinero.saldo,
      vida: Vida.actual,
      hambre: Vida.hambre,
      nivel: Vida.nivel,
      objetos: Mochila.slots.reduce((s, sl) => s + (sl ? sl.cantidad : 0), 0),
      integro: malas === 0 && !Guardado.integridadRota,
      t: Date.now()
    };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(datos))));
    const firma = (await Utilidades.sha256(Guardado.SAL + '|tarjeta|' + b64)).slice(0, 8);
    return 'TJ.' + b64 + '.' + firma;
  },

  async leerTarjeta(codigo) {
    const partes = codigo.split('.');
    if (partes.length !== 3 || partes[0] !== 'TJ') return null;
    const esperada = (await Utilidades.sha256(Guardado.SAL + '|tarjeta|' + partes[1])).slice(0, 8);
    if (esperada !== partes[2]) return null;
    try {
      return JSON.parse(decodeURIComponent(escape(atob(partes[1]))));
    } catch (e) { return null; }
  },

  async copiarTarjeta() {
    this._toast('Abriendo tarjeta…');
    const codigo = await this.generarTarjeta();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(codigo)
        .then(() => this._toast('Tarjeta copiada al portapapeles'))
        .catch(() => prompt('Copia tu tarjeta:', codigo));
    } else {
      prompt('Copia tu tarjeta:', codigo);
    }
  },

  reportar() {
    const idReportado = prompt('ID del jugador que quieres reportar (pídele su tarjeta o su ID):');
    if (!idReportado || !idReportado.trim()) return;
    const motivo = prompt('¿Qué hizo? Explica el motivo:');
    if (!motivo || !motivo.trim()) return;
    const texto = '🚩 REPORTE — Mariel Explorer\n' +
      'Reporta: ' + Usuarios.perfilActivo.nombre + ' (ID: ' + Usuarios.perfilActivo.id + ')\n' +
      'Reportado: ' + idReportado.trim() + '\n' +
      'Motivo: ' + motivo.trim() + '\n' +
      'Fecha: ' + Utilidades.fechaLegible(Date.now());
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto)
        .then(() => this._toast('Reporte enviado'))
        .catch(() => prompt('Copia el reporte y mándaselo al administrador:', texto));
    } else {
      prompt('Copia el reporte y mándaselo al administrador:', texto);
    }
  }
};
