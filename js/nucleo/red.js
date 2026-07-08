// URLs de red — un solo dominio tcodm.com (Oracle + Nginx). Cuba sin VPN.
const MarielRed = {
  esProduccion() {
    const h = (typeof location !== 'undefined' && location.hostname) || '';
    return h === 'tcodm.com' || h === 'www.tcodm.com' || h === 'api.tcodm.com';
  },

  esMismoDominio() {
    const h = (typeof location !== 'undefined' && location.hostname) || '';
    return h === 'tcodm.com' || h === 'www.tcodm.com';
  },

  urlServidor() {
    try {
      if (typeof CONFIG !== 'undefined' && CONFIG.hostingUnificado && this.esMismoDominio()) {
        return (location.origin || '').replace(/\/$/, '');
      }
      const cfg = (typeof CONFIG !== 'undefined' && CONFIG.servidorOnline || '').replace(/\/$/, '');
      if (cfg) return cfg;
    } catch (e) { /* */ }
    if (typeof location !== 'undefined' && location.origin) {
      if (this.esMismoDominio()) return location.origin.replace(/\/$/, '');
      if (location.hostname === 'api.tcodm.com') return location.origin.replace(/\/$/, '');
    }
    return 'https://api.tcodm.com';
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
    if (srv && srv !== origen.replace(/\/$/, '')) {
      urls.push(srv + '/api/public/version?_=' + t);
    } else if (srv) {
      urls.push(srv + '/api/public/version?_=' + t);
    }
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
