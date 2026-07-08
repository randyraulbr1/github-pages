// ============================================================
// SERVICE WORKER — hace que el juego funcione como app:
// guarda todos los archivos en el teléfono (funciona con mala
// conexión) y va guardando los pedazos de mapa ya visitados.
// ============================================================
const CACHE = 'mariel-explorer-v266';

const ARCHIVOS = [
  './',
  './index.html',
  './version.json',
  './manifest.json',
  './css/estilos.css',
  './css/chat.css',
  './css/amigos.css',
  './css/opciones.css',
  './css/notificaciones.css',
  './datos/mundo.json',
  './lib/leaflet/leaflet.css',
  './lib/leaflet/leaflet.js',
  './iconos/icono-192.png',
  './iconos/icono-512.png',
  './js/config/config.js',
  './js/nucleo/version_app.js',
  './js/nucleo/utilidades.js',
  './js/mundo/mundo_publico.js',
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
  './js/bolsas/bolsas.js',
  './js/mapa/mapa.js',
  './js/gps/gps.js',
  './js/online/sync_servidor.js',
  './js/online/multijugador.js',
  './js/online/amigos.js',
  './js/chat/chat.js',
  './js/online/mundo_online.js',
  './js/tiendas/datos_tiendas.js',
  './js/tiendas/tiendas.js',
  './js/pesca/pesca.js',
  './js/tesoros/datos_tesoros.js',
  './js/tesoros/tesoros.js',
  './js/misiones/datos_misiones.js',
  './js/misiones/misiones.js',
  './js/cofres/cofres.js',
  './js/correo/correo.js',
  './js/enemigos/enemigos.js',
  './js/principal.js'
];

// Descarga cada archivo individualmente: si uno falla no aborta todo
async function precargar(cache) {
  let descargados = 0;
  let bytesTotal = 0;
  const total = ARCHIVOS.length;

  for (const url of ARCHIVOS) {
    try {
      const respuesta = await fetch(url);
      if (respuesta.ok) {
        const clon = respuesta.clone();
        const buffer = await clon.arrayBuffer();
        bytesTotal += buffer.byteLength;
        await cache.put(url, respuesta);
      }
    } catch (e) {
      // Archivo no disponible: continúa sin romper la instalación
    }
    descargados++;
    const porcentaje = Math.round((descargados / total) * 100);
    self.clients.matchAll().then(clientes => {
      for (const c of clientes) {
        c.postMessage({ tipo: 'progreso', descargados, total, bytesTotal, porcentaje });
      }
    });
  }
}

self.addEventListener('install', evento => {
  evento.waitUntil(
    caches.open(CACHE)
      .then(cache => precargar(cache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('message', evento => {
  if (evento.data?.tipo === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches.keys().then(claves =>
      Promise.all(claves.filter(c => c !== CACHE && !c.includes('-mapa')).map(c => caches.delete(c)))
    )      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then(clientes => {
        const v = String(CACHE).replace('mariel-explorer-v', '');
        for (const c of clientes) {
          c.postMessage({ tipo: 'nueva-version', version: v, cache: CACHE });
        }
      })
  );
});

self.addEventListener('fetch', evento => {
  const url = evento.request.url;

  // Mundo y cuentas: red primero (siempre la versión más nueva para login)
  if (url.includes('datos/mundo.json') || url.includes('datos/jugadores/indice.json')) {
    const claveCache = url.includes('indice.json')
      ? './datos/jugadores/indice.json'
      : './datos/mundo.json';
    evento.respondWith(
      fetch(evento.request, { cache: 'no-store' }).then(respuesta => {
        if (respuesta.ok) {
          const clon = respuesta.clone();
          caches.open(CACHE).then(cache => cache.put(claveCache, clon));
        }
        return respuesta;
      }).catch(() =>
        caches.open(CACHE).then(cache =>
          cache.match(claveCache).then(guardado =>
            guardado || new Response(url.includes('indice') ? '[]' : '{}', {
              headers: { 'Content-Type': 'application/json' }
            })
          )
        )
      )
    );
    return;
  }

  // Pedazos del mapa: caché primero, si no hay se descarga
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

  // Archivos del juego: red primero en index/config (actualizaciones); resto caché primero
  if (evento.request.method === 'GET' && url.startsWith(self.location.origin)) {
    let ruta;
    try { ruta = new URL(url).pathname; } catch (e) { ruta = ''; }
    const redPrimero = ruta.endsWith('/index.html') || ruta.endsWith('/') ||
      ruta.endsWith('/version.json') || ruta.endsWith('/sw.js') ||
      ruta.endsWith('/js/config/config.js') || ruta.endsWith('/js/nucleo/version_app.js');

    if (redPrimero) {
      evento.respondWith(
        fetch(evento.request, { cache: 'no-store' }).then(respuesta => {
          if (respuesta.ok) {
            if (ruta.endsWith('/version.json')) {
              respuesta.clone().text().then(txt => {
                try {
                  const j = JSON.parse(txt);
                  const rem = parseInt(j.version, 10);
                  const loc = parseInt(String(CACHE).replace('mariel-explorer-v', ''), 10);
                  if (rem > loc) {
                    self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(cs => {
                      for (const c of cs) {
                        c.postMessage({ tipo: 'nueva-version', version: j.version });
                      }
                    });
                  }
                } catch (e) { /* */ }
              }).catch(() => {});
            }
            caches.open(CACHE).then(cache => cache.put(evento.request, respuesta.clone()));
          }
          return respuesta;
        }).catch(() =>
          caches.open(CACHE).then(cache => cache.match(evento.request))
        )
      );
      return;
    }

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
