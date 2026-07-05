/**
 * Configuración del cliente Mariel Online.
 *
 * SERVER_URL:
 *   ''  → usa el mismo sitio (cuando el servidor Node sirve el juego)
 *   'https://tu-vps.com' → cuando el juego está en GitHub Pages y el servidor en otro sitio
 */
window.MARIEL_ONLINE = {
  SERVER_URL: '',

  // Centro de Mariel, Cuba
  mapCenter: [22.9936, -82.7539],
  mapZoom: 16,
  mapMinZoom: 14,
  mapMaxZoom: 20,

  // Límites del pueblo (igual que el juego GPS original)
  mapBounds: [
    [22.9650, -82.7900],
    [23.0250, -82.7150]
  ]
};
