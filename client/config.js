/**
 * Configuración Mariel Online — tcodm.com + servidor API
 */
(function () {
  const host = window.location.hostname;
  const enCarpetaClient = window.location.pathname.includes('/client');

  let serverUrl = '';
  if (host === 'tcodm.com' || host === 'www.tcodm.com') {
    serverUrl = 'https://api.tcodm.com';
  } else if (host === 'localhost' || host === '127.0.0.1') {
    serverUrl = window.location.origin;
  }

  window.MARIEL_ONLINE = {
    SERVER_URL: serverUrl,
    LIB_BASE: enCarpetaClient ? '../lib' : '/lib',

    mapCenter: [22.9936, -82.7539],
    mapZoom: 16,
    mapMinZoom: 14,
    mapMaxZoom: 20,
    mapBounds: [
      [22.9650, -82.7900],
      [23.0250, -82.7150]
    ]
  };
})();
