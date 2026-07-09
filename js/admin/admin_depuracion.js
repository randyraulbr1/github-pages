// ============================================================
// FASE 10 — Panel de depuración admin (solo owner/admin)
// Versión, ping, servidor, jugadores, objetos, zona, errores, sync, datos
// ============================================================
const AdminDepuracion = {
  _admin: null,
  _enlazado: false,
  _refreshId: null,
  _ultimoPingMs: null,

  iniciar(admin) {
    this._admin = admin;
    if (this._enlazado) return;
    this._enlazado = true;
    document.getElementById('admin-depuracion')?.addEventListener('click', () => this.abrir());
    document.getElementById('btn-admin-depuracion-refrescar')?.addEventListener('click', () => this._pintar());
    document.getElementById('admin-depuracion-historial')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-restaurar-historial]');
      if (!btn) return;
      const id = btn.getAttribute('data-restaurar-historial');
      if (id) this._restaurarHistorial(id);
    });
  },

  abrir() {
    if (!this._admin?.esAdminJugador?.()) return;
    this._admin._mostrarPanelDerecho('admin-vista-depuracion', '🔧 Depuración');
    this._pintar();
    this._iniciarRefresh();
  },

  _iniciarRefresh() {
    this._detenerRefresh();
    this._refreshId = setInterval(() => {
      const v = document.getElementById('admin-vista-depuracion');
      if (!v || v.classList.contains('oculto')) {
        this._detenerRefresh();
        return;
      }
      this._pintar();
    }, 5000);
  },

  _detenerRefresh() {
    if (this._refreshId) {
      clearInterval(this._refreshId);
      this._refreshId = null;
    }
  },

  _versionJuego() {
    if (typeof MarielVersion !== 'undefined' && MarielVersion.versionCargada) {
      return 'v' + MarielVersion.versionCargada();
    }
    return 'v' + (CONFIG?.version || window.__MARIEL_EMBEDDED__ || '?');
  },

  _baseServidor() {
    if (typeof SyncServidor !== 'undefined' && SyncServidor._base) {
      return SyncServidor._base();
    }
    return (CONFIG?.servidorOnline || '').replace(/\/$/, '');
  },

  async _medirPing() {
    const base = this._baseServidor();
    if (!base) return { ok: false, ms: null, detalle: 'Sin URL de servidor' };
    if (typeof MarielDiagnosticoRed !== 'undefined') {
      const diag = await MarielDiagnosticoRed.probarConexion(base, { timeoutMs: 15000 });
      const ms = diag.latenciaMs != null ? diag.latenciaMs : null;
      if (diag.ok) {
        this._ultimoPingMs = ms;
        return { ok: true, ms, detalle: ms != null ? ms + ' ms' : 'OK', diagnostico: diag };
      }
      const det = typeof MarielDiagnosticoRed !== 'undefined'
        ? MarielDiagnosticoRed.mensajeCorto(diag)
        : 'Sin respuesta';
      return { ok: false, ms, detalle: det, diagnostico: diag };
    }
    const t0 = performance.now();
    try {
      const r = await Utilidades.fetchConTimeout(base + '/health', { cache: 'no-store' }, 15000);
      const ms = Math.round(performance.now() - t0);
      this._ultimoPingMs = ms;
      return { ok: r.ok, ms, detalle: r.ok ? ms + ' ms' : 'HTTP ' + r.status };
    } catch (e) {
      const ms = Math.round(performance.now() - t0);
      this._ultimoPingMs = ms;
      return { ok: false, ms, detalle: 'Sin respuesta' };
    }
  },

  _estadoConexion() {
    if (typeof Multijugador === 'undefined') return { texto: '—', clase: '' };
    if (Multijugador._reconectando) return { texto: '🟡 Reconectando…', clase: 'warn' };
    if (Multijugador.activo && Multijugador.socket?.connected) {
      return { texto: '🟢 Socket conectado', clase: 'ok' };
    }
    if (Multijugador.activo) return { texto: '🟡 Activo (socket débil)', clase: 'warn' };
    return { texto: '🔴 Desconectado', clase: 'err' };
  },

  _jugadoresOnline() {
    const lista = (typeof Multijugador !== 'undefined' && Multijugador.online) ? Multijugador.online : [];
    const nombres = lista
      .map(p => p.nombre || ('#' + p.playerId))
      .filter(Boolean);
    return {
      total: lista.length,
      detalle: nombres.length ? nombres.join(', ') : 'Nadie visible en mapa'
    };
  },

  _objetosCargados() {
    const local = this._admin?.objetosTodos?.().length ?? 0;
    const pub = this._admin?.publicado?.objetos?.length ?? 0;
    return { local, publicados: pub, detalle: local + ' en cliente' };
  },

  _zonaActual() {
    const pos = (typeof GPS !== 'undefined' && GPS.posicion) ? GPS.posicion : null;
    if (!pos || !Array.isArray(pos)) return { texto: 'Sin GPS', detalle: 'Activa ubicación o usa pin de prueba' };
    const lat = (+pos[0]).toFixed(5);
    const lng = (+pos[1]).toFixed(5);
    let extra = '';
    if (typeof CONFIG !== 'undefined' && CONFIG.centro && typeof Utilidades !== 'undefined') {
      const d = Utilidades.distanciaMetros(pos, CONFIG.centro);
      extra = Math.round(d) + ' m del centro de Mariel';
    }
    return { texto: lat + ', ' + lng, detalle: extra };
  },

  _resumenConsumo() {
    if (typeof MarielConsumoRed === 'undefined' || !MarielConsumoRed._inicioMs) {
      return {
        totalTexto: '—',
        detalle: 'Conecta al servidor para medir',
        proyectado30d: '—',
        ahorroTexto: '—',
        clase: ''
      };
    }
    const r = MarielConsumoRed.resumen();
    const min = Math.max(1, Math.round(r.segundos / 60));
    return {
      totalTexto: r.totalTexto,
      detalle: 'HTTP ' + r.httpTexto + ' · Socket ' + r.socketTexto + ' · ' + min + ' min · ' + r.mbPorHora + ' MB/h · ' + r.topTipos,
      proyectado30d: r.proyectado30d + ' (1 jugador)',
      ahorroTexto: r.ahorroTexto,
      clase: parseFloat(r.mbPorHora) > 50 ? 'warn' : 'ok'
    };
  },

  _tamanoDatos() {
    let ls = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        ls += (k?.length || 0) + (localStorage.getItem(k)?.length || 0);
      }
    } catch (e) { /* */ }
    let mundo = 0;
    try {
      if (this._admin?.publicado) mundo = JSON.stringify(this._admin.publicado).length;
    } catch (e) { /* */ }
    const fmt = (n) => {
      if (n < 1024) return n + ' B';
      if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
      return (n / 1048576).toFixed(2) + ' MB';
    };
    return {
      texto: fmt(ls + mundo),
      detalle: 'localStorage ' + fmt(ls) + ' · mundo ' + fmt(mundo)
    };
  },

  _formatearFecha(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '—';
    const hace = Math.max(0, Math.round((Date.now() - ts) / 1000));
    let rel = '';
    if (hace < 60) rel = 'hace ' + hace + ' s';
    else if (hace < 3600) rel = 'hace ' + Math.round(hace / 60) + ' min';
    else rel = 'hace ' + Math.round(hace / 3600) + ' h';
    return d.toLocaleString('es-ES', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
      + ' (' + rel + ')';
  },

  _ultimoSyncTexto(status) {
    const partes = [];
    if (typeof Multijugador !== 'undefined' && Multijugador.mundoServidorTs) {
      partes.push('Mundo servidor: ' + this._formatearFecha(Multijugador.mundoServidorTs));
    }
    const pubTs = this._admin?.publicado?.actualizadoEn;
    if (pubTs) partes.push('Mundo local: ' + this._formatearFecha(pubTs));
    if (status?.ultimaSyncOk?.at) {
      partes.push('GitHub OK: ' + this._formatearFecha(status.ultimaSyncOk.at));
    }
    if (status?.actualizadoEn) {
      partes.push('SQLite: ' + this._formatearFecha(status.actualizadoEn));
    }
    return partes.length ? partes.join('\n') : 'Sin registro de sync';
  },

  _tarjeta(etiqueta, valor, detalle, clase) {
    return '<div class="admin-dep-tarjeta' + (clase ? ' ' + clase : '') + '">'
      + '<div class="admin-dep-etiq">' + etiqueta + '</div>'
      + '<div class="admin-dep-valor">' + (valor || '—') + '</div>'
      + (detalle ? '<div class="admin-dep-detalle">' + detalle + '</div>' : '')
      + '</div>';
  },

  async _pintar() {
    const grid = document.getElementById('admin-depuracion-grid');
    const errBox = document.getElementById('admin-depuracion-errores');
    if (!grid) return;

    grid.innerHTML = '<p class="admin-dep-cargando">Consultando métricas…</p>';

    const ping = await this._medirPing();
    const conn = this._estadoConexion();
    const jug = this._jugadoresOnline();
    const obj = this._objetosCargados();
    const zona = this._zonaActual();
    const datos = this._tamanoDatos();

    let status = null;
    let eventos = [];
    if (typeof SyncServidor !== 'undefined' && SyncServidor.puedePublicar?.()) {
      const data = await SyncServidor.obtenerEstadoSync();
      status = data?.status || null;
      eventos = data?.eventos || [];
    } else if (typeof SyncServidor !== 'undefined' && SyncServidor.asegurarSesionServidor) {
      const ok = await SyncServidor.asegurarSesionServidor({});
      if (ok) {
        const data = await SyncServidor.obtenerEstadoSync();
        status = data?.status || null;
        eventos = data?.eventos || [];
      }
    }

    const srvTexto = ping.ok
      ? '🟢 Servidor responde'
      : (CONFIG?.servidorOnline ? '🔴 Servidor no responde' : '⚪ Sin servidor configurado');
    const srvClase = ping.ok ? 'ok' : (CONFIG?.servidorOnline ? 'err' : '');

    const pingDetalle = ping.detalle || (this._ultimoPingMs != null ? this._ultimoPingMs + ' ms' : '—');
    const srvJug = status?.jugadores != null ? status.jugadores + ' en BD' : '';
    const srvObj = status?.objetos != null ? status.objetos + ' objetos BD' : '';
    const consumo = this._resumenConsumo();

    grid.innerHTML =
      this._tarjeta('Versión del juego', this._versionJuego(), CONFIG?.servidorOnline ? 'Servidor: ' + this._baseServidor().replace(/^https?:\/\//, '') : '') +
      this._tarjeta('Consumo Render (sesión)', consumo.totalTexto, consumo.detalle, consumo.clase) +
      this._tarjeta('Proyección 30 días', consumo.proyectado30d, 'Al ritmo actual de esta sesión', consumo.clase) +
      this._tarjeta('Ahorro estimado', consumo.ahorroTexto, 'Polls y cargas evitadas en esta sesión', 'ok') +
      this._tarjeta('Ping /health', pingDetalle, ping.ok ? 'Latencia al servidor' : (ping.diagnostico?.detalle || 'Revisa red o URL del servidor'), ping.ok ? 'ok' : 'warn') +
      this._tarjeta('Estado servidor', srvTexto, conn.texto, srvClase) +
      this._tarjeta('Jugadores online', String(jug.total), jug.detalle + (srvJug ? ' · ' + srvJug : '')) +
      this._tarjeta('Objetos cargados', String(obj.local), obj.detalle + (srvObj ? ' · ' + srvObj : '')) +
      this._tarjeta('Zona actual', zona.texto, zona.detalle) +
      this._tarjeta('Último sync', status?.ultimaSyncOk ? '✅ GitHub' : '⚠️ Sin sync OK', this._ultimoSyncTexto(status)) +
      this._tarjeta('Datos descargados', datos.texto, datos.detalle);

    if (errBox) {
      const lineas = [];
      if (status?.ultimoError?.error) {
        lineas.push('[' + this._formatearFecha(status.ultimoError.at) + '] ' + status.ultimoError.error);
      }
      for (const e of (status?.erroresRecientes || []).slice(-8).reverse()) {
        lineas.push(e);
      }
      for (const ev of (eventos || []).slice(0, 12)) {
        const t = ev.t ? new Date(ev.t).toLocaleTimeString('es-ES') : '?';
        lineas.push('[' + t + '] ' + (ev.tipo || 'evento') + ': ' + (ev.detalle || ''));
      }
      if (!lineas.length) {
        errBox.innerHTML = '<p class="admin-dep-sin-errores">✅ Sin errores recientes en servidor</p>';
      } else {
        errBox.innerHTML = '<div class="admin-dep-errores-titulo">Errores y eventos recientes</div>'
          + '<pre class="admin-dep-errores-lista">' + lineas.map(l => this._esc(l)).join('\n') + '</pre>';
      }
    }

    await this._pintarHistorial();
  },

  async _pintarHistorial() {
    const box = document.getElementById('admin-depuracion-historial');
    if (!box) return;
    if (typeof SyncServidor === 'undefined' || !SyncServidor.puedePublicar?.()) {
      box.innerHTML = '';
      return;
    }
    const data = await SyncServidor.obtenerAdminHistorial();
    const lista = data?.historial || [];
    if (!lista.length) {
      box.innerHTML = '<p class="admin-dep-sin-errores">Sin acciones admin registradas aún</p>';
      return;
    }
    const filas = lista.slice(0, 20).map((h) => {
      const t = h.t ? new Date(h.t).toLocaleString('es-ES', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : '?';
      const puede = ['upsert', 'delete', 'config'].includes(h.accion);
      const btn = puede
        ? '<button type="button" class="ui-btn ui-btn-secondary admin-dep-restore" data-restaurar-historial="' + this._esc(h.id) + '">↩ Restaurar</button>'
        : '';
      return '<div class="admin-dep-hist-fila">'
        + '<div class="admin-dep-hist-meta">[' + t + '] v' + this._esc(h.version || '?') + ' · ' + this._esc(h.accion) + '</div>'
        + '<div class="admin-dep-hist-det">' + this._esc((h.quien || '') + (h.refId ? ' · ' + h.refId : '') + (h.detalle ? ' — ' + h.detalle : '')) + '</div>'
        + btn
        + '</div>';
    }).join('');
    box.innerHTML = '<div class="admin-dep-errores-titulo">Historial admin (últimas acciones)</div>' + filas;
  },

  async _restaurarHistorial(historialId) {
    if (!historialId) return;
    if (typeof UIDialog !== 'undefined') {
      const ok = await UIDialog.confirmar({
        titulo: 'Restaurar acción',
        texto: '¿Volver al estado anterior de esta entrada del historial?',
        okText: 'Restaurar',
        okVariant: 'danger'
      });
      if (!ok) return;
    } else if (!confirm('¿Restaurar esta acción del historial?')) return;

    if (typeof SyncServidor === 'undefined') return;
    const r = await SyncServidor.restaurarAdminHistorial(historialId);
    if (r.ok) {
      if (typeof Notificaciones !== 'undefined') {
        Notificaciones.mostrar('↩ Acción restaurada', 'exito', 4000);
      }
      if (typeof Admin !== 'undefined' && Admin._revisarActualizacion) {
        await Admin._revisarActualizacion();
      }
      this._pintar();
    } else if (typeof Notificaciones !== 'undefined') {
      Notificaciones.mostrar(Utilidades.mensajeAmigable(r.error, 'No se pudo restaurar'), 'error', 5000);
    }
  },

  _esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
};
