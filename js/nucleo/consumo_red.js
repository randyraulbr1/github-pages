// Medición de consumo de red hacia Render (sesión actual).
const MarielConsumoRed = {
  _inicioMs: 0,
  _fetchEnganchado: false,
  _fetchOriginal: null,
  httpBajada: 0,
  httpSubida: 0,
  socketBajada: 0,
  socketSubida: 0,
  ahorroEstimado: 0,
  porTipo: {},
  _socketEnganchado: false,

  iniciarSesion() {
    this._inicioMs = Date.now();
    this.httpBajada = 0;
    this.httpSubida = 0;
    this.socketBajada = 0;
    this.socketSubida = 0;
    this.ahorroEstimado = 0;
    this.porTipo = {};
    this._engancharFetch();
  },

  _urlRender(url) {
    const u = String(url || '');
    if (!u) return false;
    try {
      const host = new URL(u, location.origin).hostname;
      if (/onrender\.com$/i.test(host)) return true;
      const srv = (typeof MarielRed !== 'undefined' && MarielRed.urlServidor()) ||
        (typeof CONFIG !== 'undefined' && CONFIG.servidorOnline) || '';
      if (srv) {
        const h2 = new URL(srv).hostname;
        return host === h2;
      }
    } catch (e) { /* */ }
    return false;
  },

  _tipoHttp(url) {
    const u = String(url || '');
    if (u.includes('/api/public/mundo/version')) return 'poll_mundo_version';
    if (u.includes('/api/public/mundo')) return 'mundo_http';
    if (u.includes('/api/public/version')) return 'poll_version';
    if (u.includes('/api/login-game')) return 'login';
    if (u.includes('/api/login')) return 'login';
    if (u.includes('/api/register')) return 'registro';
    if (u.includes('/sync-partida')) return 'sync_partida';
    if (u.includes('/health')) return 'health';
    if (u.includes('socket.io')) return 'socket_io_js';
    if (u.includes('/api/player/')) return 'player_api';
    return 'http_otro';
  },

  _sumar(tipo, bajada, subida) {
    if (!this.porTipo[tipo]) {
      this.porTipo[tipo] = { bajada: 0, subida: 0, eventos: 0 };
    }
    this.porTipo[tipo].bajada += bajada || 0;
    this.porTipo[tipo].subida += subida || 0;
    this.porTipo[tipo].eventos += 1;
  },

  registrarAhorro(bytes, motivo) {
    this.ahorroEstimado += Math.max(0, bytes || 0);
    this._sumar('ahorro_' + (motivo || 'otro'), 0, 0);
  },

  registrarRecursos(tipo, bytes) {
    this.httpBajada += bytes || 0;
    this._sumar(tipo || 'recurso', bytes || 0, 0);
  },

  registrarSocket(direccion, evento, bytes) {
    const n = Math.max(0, bytes || 0);
    const tipo = 'socket_' + String(evento || 'otro').replace(/[^a-z0-9:_-]/gi, '_');
    if (direccion === 'send') {
      this.socketSubida += n;
      this._sumar(tipo, 0, n);
    } else {
      this.socketBajada += n;
      this._sumar(tipo, n, 0);
    }
  },

  _engancharFetch() {
    if (this._fetchEnganchado || typeof window === 'undefined' || !window.fetch) return;
    this._fetchEnganchado = true;
    this._fetchOriginal = window.fetch.bind(window);
    const self = this;
    window.fetch = async function (url, opciones) {
      const respuesta = await self._fetchOriginal(url, opciones);
      const u = typeof url === 'string' ? url : (url && url.url) || '';
      if (self._urlRender(u)) {
        let sub = 0;
        try {
          if (opciones && opciones.body) {
            const cuerpo = opciones.body;
            sub = typeof cuerpo === 'string'
              ? new TextEncoder().encode(cuerpo).length
              : (cuerpo.byteLength || 0);
          }
        } catch (e) { /* */ }
        self.httpSubida += sub;
        try {
          const clon = respuesta.clone();
          const buf = await clon.arrayBuffer();
          const baj = buf.byteLength || 0;
          self.httpBajada += baj;
          self._sumar(self._tipoHttp(u), baj, sub);
        } catch (e) { /* */ }
      }
      return respuesta;
    };
  },

  enlazarSocket(socket) {
    if (!socket || this._socketEnganchado) return;
    this._socketEnganchado = true;
    const self = this;

    if (typeof socket.onAny === 'function') {
      socket.onAny((evento, payload) => {
        let n = String(evento || '').length;
        try { n += JSON.stringify(payload ?? {}).length; } catch (e) { n += 64; }
        self.registrarSocket('recv', evento, n);
      });
    }

    const emitir = socket.emit.bind(socket);
    socket.emit = function (evento, ...args) {
      const ultimoFn = args.length && typeof args[args.length - 1] === 'function'
        ? args.length - 1 : args.length;
      let n = String(evento || '').length;
      try { n += JSON.stringify(args.slice(0, ultimoFn)).length; } catch (e) { n += 48; }
      self.registrarSocket('send', evento, n);
      return emitir(evento, ...args);
    };
  },

  _duracionSeg() {
    if (!this._inicioMs) return 0;
    return Math.max(1, Math.round((Date.now() - this._inicioMs) / 1000));
  },

  totalBytes() {
    return this.httpBajada + this.httpSubida + this.socketBajada + this.socketSubida;
  },

  formatearBytes(bytes) {
    const n = Math.max(0, bytes || 0);
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(2) + ' MB';
  },

  resumen() {
    const seg = this._duracionSeg();
    const total = this.totalBytes();
    const min = Math.max(1, seg / 60);
    const mbHora = (total / 1048576) / (seg / 3600);
    const top = Object.entries(this.porTipo)
      .filter(([k]) => !k.startsWith('ahorro_'))
      .sort((a, b) => (b[1].bajada + b[1].subida) - (a[1].bajada + a[1].subida))
      .slice(0, 5)
      .map(([k, v]) => k.replace(/^socket_/, '⚡ ').replace(/^poll_/, '📡 ') +
        ' ' + this.formatearBytes(v.bajada + v.subida))
      .join(' · ');

    return {
      segundos: seg,
      totalBytes: total,
      totalTexto: this.formatearBytes(total),
      httpTexto: this.formatearBytes(this.httpBajada + this.httpSubida),
      socketTexto: this.formatearBytes(this.socketBajada + this.socketSubida),
      mbPorHora: mbHora.toFixed(2),
      mbPorMin: (total / 1048576 / min).toFixed(3),
      ahorroTexto: this.formatearBytes(this.ahorroEstimado),
      topTipos: top || 'Sin tráfico aún',
      proyectado30d: this.formatearBytes(total / seg * 86400 * 30)
    };
  }
};
