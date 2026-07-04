// ============================================================
// SERVICE WORKER — hace que el juego funcione como app:
// guarda todos los archivos en el teléfono (funciona con mala
// conexión) y va guardando los pedazos de mapa ya visitados.
// ============================================================
const CACHE = 'mariel-explorer-v10';

const ARCHIVOS = [
  './',
  './index.html',
  './manifest.json',
  './css/estilos.css',
  './datos/mundo.json',
  './lib/leaflet/leaflet.css',
  './lib/leaflet/leaflet.js',
  './iconos/icono-192.png',
  './iconos/icono-512.png',
  './js/config/config.js',
  './js/nucleo/utilidades.js',
  './js/notificaciones/notificaciones.js',
  './js/usuarios/usuarios.js',
  './js/opciones/opciones.js',
  './js/admin/admin.js',
  './js/guardado/guardado.js',
  './js/historial/historial.js',
  './js/dinero/dinero.js',
  './js/vida/vida.js',
  './js/items/items.js',
  './js/mochila/mochila.js',
  './js/mapa/mapa.js',
  './js/gps/gps.js',
  './js/tiendas/datos_tiendas.js',
  './js/tiendas/tiendas.js',
  './js/pesca/pesca.js',
  './js/tesoros/datos_tesoros.js',
  './js/tesoros/tesoros.js',
  './js/misiones/datos_misiones.js',
  './js/misiones/misiones.js',
  './js/correo/correo.js',
  './js/principal.js'
];

self.addEventListener('install', evento => {
  evento.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ARCHIVOS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches.keys().then(claves =>
      Promise.all(claves.filter(c => c !== CACHE).map(c => caches.delete(c)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', evento => {
  const url = evento.request.url;

  // El mundo del admin (datos/mundo.json) siempre se busca primero en la
  // red para que las misiones nuevas lleguen enseguida; sin conexión se
  // usa la última copia guardada
  if (url.includes('datos/mundo.json')) {
    evento.respondWith(
      caches.open(CACHE).then(cache =>
        fetch(evento.request).then(respuesta => {
          if (respuesta.ok) cache.put('./datos/mundo.json', respuesta.clone());
          return respuesta;
        }).catch(() => cache.match('./datos/mundo.json'))
      )
    );
    return;
  }

  // Pedazos del mapa: primero caché, si no hay se descarga y se guarda
  if (url.includes('cartocdn.com')) {
    evento.respondWith(
      caches.open(CACHE + '-mapa').then(cache =>
        cache.match(evento.request).then(guardado =>
          guardado || fetch(evento.request).then(respuesta => {
            if (respuesta.ok) cache.put(evento.request, respuesta.clone());
            return respuesta;
          })
        )
      )
    );
    return;
  }

  // Archivos del juego: primero caché, con actualización desde la red de fondo
  if (evento.request.method === 'GET' && url.startsWith(self.location.origin)) {
    evento.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(evento.request).then(guardado => {
          const red = fetch(evento.request).then(respuesta => {
            if (respuesta.ok) cache.put(evento.request, respuesta.clone());
            return respuesta;
          }).catch(() => guardado);
          return guardado || red;
        })
      )
    );
  }
});
