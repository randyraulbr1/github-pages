/**
 * Configuración del cliente Mariel Online.
 *
 * tcodm.com (GitHub Pages) = pantalla del juego, 24/7, sin tu PC.
 * api.tcodm.com (Render/Railway) = servidor Node 24/7 en la nube, tampoco tu PC.
 */
(function () {
  const host = window.location.hostname;
  let serverUrl = '';

  // En producción tcodm.com → conectar al API en la nube
  if (host === 'tcodm.com' || host === 'www.tcodm.com') {
    serverUrl = 'https://api.tcodm.com';
  }
  // En localhost con npm start → mismo origen
  else if (host === 'localhost' || host === '127.0.0.1') {
    serverUrl = window.location.origin;
  }

  window.MARIEL_ONLINE = {
    SERVER_URL: serverUrl,

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
