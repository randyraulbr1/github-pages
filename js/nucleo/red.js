// URLs de red — juego en tcodm.com (GitHub Pages), API en Render.
const MarielRed = {
  RENDER_DEFAULT: 'https://mariel-online.onrender.com',

  esProduccion() {
    const h = (typeof location !== 'undefined' && location.hostname) || '';
    return h === 'tcodm.com' || h === 'www.tcodm.com';
  },

  esMismoDominio() {
    const h = (typeof location !== 'undefined' && location.hostname) || '';
    return h === 'tcodm.com' || h === 'www.tcodm.com';
  },

  urlServidor() {
    try {
      const cfg = (typeof CONFIG !== 'undefined' && CONFIG.servidorOnline || '').replace(/\/$/, '');
      if (cfg) return cfg;
    } catch (e) { /* */ }
    return this.RENDER_DEFAULT;
  },

  servidorActivo() {
    return !!this.urlServidor();
  },

  urlsVersion(ts) {
    const t = ts || Date.now();
    const origen = (typeof location !== 'undefined' && location.origin) ? location.origin : '';
    const urls = [];
    if (origen) urls.push(origen + '/version.json?_=' + t);
    urls.push('version.json?_=' + t);
    const srv = this.urlServidor();
    if (srv) urls.push(srv + '/api/public/version?_=' + t);
    if (!this.esProduccion() && typeof CONFIG !== 'undefined' &&
        CONFIG.repoPublicacion && CONFIG.ramaPublicacion) {
      urls.push('https://raw.githubusercontent.com/' + CONFIG.repoPublicacion + '/' +
        CONFIG.ramaPublicacion + '/version.json?_=' + t);
    }
    return urls;
  },

  urlsMundoJson(ts) {
    const t = ts || Date.now();
    const origen = (typeof location !== 'undefined' && location.origin) ? location.origin : '';
    const urls = [];
    if (origen) urls.push(origen + '/datos/mundo.json?t=' + t);
    urls.push('datos/mundo.json?t=' + t);
    const srv = this.urlServidor();
    if (srv) urls.push(srv + '/api/public/mundo?t=' + t);
    if (!this.esProduccion() && typeof CONFIG !== 'undefined' &&
        CONFIG.repoPublicacion && CONFIG.ramaPublicacion) {
      urls.push('https://raw.githubusercontent.com/' + CONFIG.repoPublicacion + '/' +
        CONFIG.ramaPublicacion + '/datos/mundo.json?t=' + t);
    }
    return urls;
  }
};
