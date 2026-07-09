// Diagnóstico de conexión al servidor — mensajes concretos (no genéricos).
const MarielDiagnosticoRed = {
  ultimo: null,

  CODIGOS: {
    OK: 'ok',
    DNS: 'dns',
    RED_OFFLINE: 'red_offline',
    TIMEOUT: 'timeout',
    HTTPS: 'https',
    BACKEND: 'backend',
    SOCKET_IO: 'socket_io',
    SERVIDOR_INICIANDO: 'servidor_iniciando',
    AUTH: 'auth',
    DESCONOCIDO: 'desconocido'
  },

  _hostDe(url) {
    try {
      return new URL(url).hostname;
    } catch (e) {
      return String(url || '').replace(/^https?:\/\//, '').split('/')[0] || url;
    }
  },

  _guardar(diag) {
    this.ultimo = diag;
    try {
      window.dispatchEvent(new CustomEvent('mariel-diagnostico-red', { detail: diag }));
    } catch (e) { /* */ }
    return diag;
  },

  _fetchTimeout(url, opciones, ms) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, Object.assign({}, opciones || {}, { signal: ctrl.signal }))
      .finally(() => clearTimeout(id));
  },

  clasificarFetch(err, url, httpStatus) {
    const host = this._hostDe(url || '');
    const msg = String(
      (err && (err.message || err.name)) || err || ''
    ).toLowerCase();
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

    if (offline) {
      return this._guardar({
        codigo: this.CODIGOS.RED_OFFLINE,
        titulo: 'Sin internet',
        detalle: 'El dispositivo no tiene conexión de red.',
        sugerencia: 'Activa Wi‑Fi o datos móviles e inténtalo de nuevo.',
        url: url || '',
        host
      });
    }

    if (httpStatus === 401 || httpStatus === 403) {
      return this._guardar({
        codigo: this.CODIGOS.AUTH,
        titulo: 'Sesión inválida',
        detalle: 'El servidor rechazó el token (HTTP ' + httpStatus + ').',
        sugerencia: 'Cierra sesión y vuelve a entrar con tu contraseña.',
        url: url || '',
        host,
        httpStatus
      });
    }

    if (httpStatus >= 500) {
      return this._guardar({
        codigo: this.CODIGOS.BACKEND,
        titulo: 'Error del backend',
        detalle: 'El servidor respondió HTTP ' + httpStatus + '.',
        sugerencia: 'Revisa los logs en Render o espera unos segundos.',
        url: url || '',
        host,
        httpStatus
      });
    }

    if (httpStatus >= 400 && httpStatus < 500) {
      return this._guardar({
        codigo: this.CODIGOS.BACKEND,
        titulo: 'Error del backend',
        detalle: 'HTTP ' + httpStatus + ' en ' + host + '.',
        sugerencia: 'Comprueba la URL del servidor en la configuración.',
        url: url || '',
        host,
        httpStatus
      });
    }

    if (msg.includes('abort') || msg.includes('timeout') || err?.name === 'AbortError') {
      return this._guardar({
        codigo: this.CODIGOS.TIMEOUT,
        titulo: 'Timeout',
        detalle: 'No hubo respuesta a tiempo de ' + host + '.',
        sugerencia: 'Comprueba la red o si el servidor está arrancando.',
        url: url || '',
        host
      });
    }

    if (/failed to fetch|networkerror|network error|load failed|err_name_not_resolved|enotfound|could not resolve|dns/i.test(msg)) {
      const esDns = /not_resolved|resolve|dns|enotfound|could not resolve/i.test(msg);
      return this._guardar({
        codigo: esDns ? this.CODIGOS.DNS : this.CODIGOS.RED_OFFLINE,
        titulo: esDns ? 'DNS: dominio no encontrado' : 'Error de red',
        detalle: esDns
          ? ('No existe DNS para «' + host + '». Comprueba CONFIG.servidorOnline en config.js.')
          : ('No se pudo alcanzar ' + host + '.'),
        sugerencia: esDns
          ? 'La URL correcta ahora es mariel-online.onrender.com (Render Starter).'
          : 'Revisa Wi‑Fi/datos o firewall.',
        url: url || '',
        host
      });
    }

    if (/ssl|certificate|cert|tls|https/i.test(msg)) {
      return this._guardar({
        codigo: this.CODIGOS.HTTPS,
        titulo: 'Error HTTPS',
        detalle: 'Problema con el certificado o TLS de ' + host + '.',
        sugerencia: 'Comprueba que la URL use https:// válido.',
        url: url || '',
        host
      });
    }

    return this._guardar({
      codigo: this.CODIGOS.DESCONOCIDO,
      titulo: 'Error de conexión',
      detalle: msg || 'Fallo desconocido al contactar ' + host + '.',
      sugerencia: 'Toca el cartel para recargar o revisa la consola del navegador.',
      url: url || '',
      host
    });
  },

  clasificarSocket(err, url) {
    const host = this._hostDe(url || '');
    const msg = String((err && (err.message || err.description || err.type)) || err || '').toLowerCase();

    if (/timeout|timed out/i.test(msg)) {
      return this._guardar({
        codigo: this.CODIGOS.TIMEOUT,
        titulo: 'Timeout Socket.IO',
        detalle: 'Socket.IO no conectó a tiempo con ' + host + '.',
        sugerencia: 'Comprueba que el servidor Node esté en marcha en Render.',
        url: url || '',
        host
      });
    }

    if (/websocket|xhr poll|transport|polling/i.test(msg)) {
      return this._guardar({
        codigo: this.CODIGOS.SOCKET_IO,
        titulo: 'Error de Socket.IO',
        detalle: 'No se pudo establecer el canal en tiempo real (' + (err?.message || msg) + ').',
        sugerencia: 'Prueba recargar. Si /health responde pero esto falla, revisa CORS o el proxy.',
        url: url || '',
        host
      });
    }

    if (/unauthorized|auth|jwt|token/i.test(msg)) {
      return this._guardar({
        codigo: this.CODIGOS.AUTH,
        titulo: 'Socket.IO: sesión rechazada',
        detalle: 'El servidor rechazó la conexión WebSocket.',
        sugerencia: 'Cierra sesión y vuelve a entrar.',
        url: url || '',
        host
      });
    }

    return this.clasificarFetch(err, url);
  },

  mensajeUsuario(diag) {
    if (!diag) return 'No se pudo conectar al servidor.';
    const partes = [diag.titulo];
    if (diag.detalle) partes.push(diag.detalle);
    if (diag.sugerencia) partes.push(diag.sugerencia);
    return partes.join(' — ');
  },

  mensajeCorto(diag) {
    if (!diag) return 'Sin conexión al servidor';
    return diag.titulo + (diag.host ? ' (' + diag.host + ')' : '');
  },

  /**
   * Prueba /health, /api/public/version y script socket.io.
   * Devuelve diagnóstico detallado con pasos.
   */
  async probarConexion(base, opciones) {
    const opts = opciones || {};
    const url = String(base || '').replace(/\/$/, '');
    const host = this._hostDe(url);
    const pasos = [];
    const t0 = performance.now();

    if (!url) {
      return this._guardar({
        codigo: this.CODIGOS.DESCONOCIDO,
        titulo: 'Sin URL de servidor',
        detalle: 'CONFIG.servidorOnline está vacío.',
        sugerencia: 'Configura la URL en js/config/config.js.',
        url: '',
        host: '',
        pasos,
        ok: false
      });
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const d = this.clasificarFetch(new Error('offline'), url + '/health');
      d.pasos = pasos;
      d.ok = false;
      return d;
    }

    // 1. Health
    let healthOk = false;
    let healthMs = null;
    try {
      const t1 = performance.now();
      const r = await this._fetchTimeout(url + '/health', { cache: 'no-store' }, opts.timeoutMs || 22000);
      healthMs = Math.round(performance.now() - t1);
      healthOk = r.ok;
      pasos.push({
        paso: 'health',
        ok: r.ok,
        ms: healthMs,
        http: r.status,
        detalle: r.ok ? 'OK ' + healthMs + ' ms' : 'HTTP ' + r.status
      });
      if (!r.ok) {
        const d = this.clasificarFetch(null, url + '/health', r.status);
        d.pasos = pasos;
        d.ok = false;
        d.latenciaMs = healthMs;
        return d;
      }
    } catch (e) {
      healthMs = Math.round(performance.now() - t0);
      pasos.push({ paso: 'health', ok: false, ms: healthMs, detalle: e?.message || 'fallo' });
      const d = this.clasificarFetch(e, url + '/health');
      d.pasos = pasos;
      d.ok = false;
      d.latenciaMs = healthMs;
      if (healthMs >= 12000 && /abort|timeout/i.test(String(e?.message || e?.name || ''))) {
        d.codigo = this.CODIGOS.SERVIDOR_INICIANDO;
        d.titulo = 'Servidor iniciando';
        d.detalle = 'El servidor tardó más de ' + Math.round(healthMs / 1000) + ' s en responder.';
        d.sugerencia = 'En plan Starter no debería dormir; si tarda mucho, revisa el deploy en Render.';
      }
      return d;
    }

    // 2. API version
    try {
      const t2 = performance.now();
      const r = await this._fetchTimeout(url + '/api/public/version', { cache: 'no-store' }, 12000);
      const ms = Math.round(performance.now() - t2);
      pasos.push({
        paso: 'api_version',
        ok: r.ok,
        ms,
        http: r.status,
        detalle: r.ok ? 'OK ' + ms + ' ms' : 'HTTP ' + r.status
      });
      if (!r.ok) {
        const d = this.clasificarFetch(null, url + '/api/public/version', r.status);
        d.pasos = pasos;
        d.ok = false;
        return d;
      }
    } catch (e) {
      pasos.push({ paso: 'api_version', ok: false, detalle: e?.message || 'fallo' });
      const d = this.clasificarFetch(e, url + '/api/public/version');
      d.pasos = pasos;
      d.ok = false;
      return d;
    }

    // 3. Socket.IO handshake (polling)
    try {
      const t3 = performance.now();
      const r = await this._fetchTimeout(
        url + '/socket.io/?EIO=4&transport=polling',
        { cache: 'no-store' },
        12000
      );
      const ms = Math.round(performance.now() - t3);
      const texto = await r.text().catch(() => '');
      const socketOk = r.ok && /^[0-9]+\{/.test(texto);
      pasos.push({
        paso: 'socket_io',
        ok: socketOk,
        ms,
        http: r.status,
        detalle: socketOk ? 'Handshake OK ' + ms + ' ms' : 'Respuesta inválida'
      });
      if (!socketOk) {
        const d = this._guardar({
          codigo: this.CODIGOS.SOCKET_IO,
          titulo: 'Error de Socket.IO',
          detalle: 'El handshake de Socket.IO no fue válido (HTTP ' + r.status + ').',
          sugerencia: 'Revisa que server.js exponga Socket.IO en el mismo puerto.',
          url,
          host,
          pasos,
          ok: false
        });
        return d;
      }
    } catch (e) {
      pasos.push({ paso: 'socket_io', ok: false, detalle: e?.message || 'fallo' });
      const d = this.clasificarSocket(e, url);
      d.pasos = pasos;
      d.ok = false;
      return d;
    }

    const totalMs = Math.round(performance.now() - t0);
    return this._guardar({
      codigo: this.CODIGOS.OK,
      titulo: 'Conexión OK',
      detalle: host + ' responde en ' + totalMs + ' ms.',
      sugerencia: '',
      url,
      host,
      pasos,
      ok: true,
      latenciaMs: healthMs
    });
  }
};
