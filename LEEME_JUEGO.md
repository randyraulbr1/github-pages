# 🌴 Mariel Explorer

Juego web de exploración con GPS ambientado en **Mariel, Cuba**. Funciona directo
desde GitHub Pages, sin servidor: todo se guarda en el propio teléfono/navegador.

## Cómo jugarlo

1. En GitHub: **Settings → Pages → Source: Deploy from a branch → rama `main` → carpeta `/ (root)` → Save**.
2. Abre la dirección que te da GitHub Pages (es `https://...`, necesario para que funcione el GPS real).
3. **Arrastra el punto azul** para moverte, o toca el botón **📍** para usar tu GPS real.

> Nota: si el repositorio es privado, GitHub Pages requiere un plan de pago para
> publicar la página. Con el repo público la página funciona gratis (el código se ve,
> pero el progreso de cada jugador es privado, se guarda solo en su navegador).

## Qué hay en el juego

| Sistema | Qué hace |
|---|---|
| 🗺️ Mapa | Mariel en un cuadrado cerrado, mapa limpio **sin nombres ni iconos de calles**. Fuera de la zona todo está tapado. |
| 📍 GPS | Punto azul arrastrable (modo prueba) o GPS real del teléfono. |
| 🎒 Mochila | 25 casillas. Arrastra items entre casillas (se guarda la posición), se apilan con cantidad, se pueden usar y eliminar. |
| 🎣 Pesca | 4 muelles (🛶) en la bahía. Necesitas caña; minijuego de puntería; 15 especies con rarezas. La carnada y la red ayudan. |
| 🏪 Tiendas | 5 tiendas en el pueblo. Solo abren a menos de **20 m**. Comprar y vender. |
| ✨ Tesoros | 6 tesoros ocultos. Con el **Buscador de tesoros** en la mochila, a menos de 150 m aparece arriba «Tesoro cerca · X m» actualizándose en vivo. A menos de **10 m** aparece el icono; si te alejas se esconde. Al recogerlo vuela hacia la mochila. |
| 📜 Misiones | 5 misiones, cada una con su ubicación GPS (visitar, pescar, entregar, cazar tesoros). |
| ❤️ Vida | Baja poco a poco; se recupera comiendo (12 comidas/medicinas distintas). |
| 🪙 Dinero | Conectado a tiendas, misiones y tesoros. |
| 🧾 Historial seguro | Cada movimiento de dinero y de objetos queda en un historial **encadenado con hashes** (estilo blockchain). Si alguien edita el guardado a mano, el visor lo marca como `[MANIPULADO]` y avisa **POSIBLE HACKEO**. |
| 🔔 Notificaciones | Se deslizan desde la derecha y desaparecen solas. |

## Estructura de carpetas (una por categoría)

```
index.html                  → pantalla del juego
css/estilos.css             → estilos
js/
  config/                   → coordenadas de Mariel, límites, distancias
  nucleo/                   → utilidades (distancias GPS, hashes, animaciones)
  guardado/                 → guardar/cargar partida con firma anti-manipulación
  historial/                → historial de dinero + historial de objetos (cadena de hashes)
  dinero/                   → sistema de dinero
  vida/                     → barra de vida
  items/                    → catálogo de 50 items
  mochila/                  → mochila de 25 casillas con arrastrar y soltar
  mapa/                     → mapa limpio de Mariel con máscara
  gps/                      → punto del jugador (arrastrable + GPS real)
  tiendas/                  → datos_tiendas.js (ubicaciones) + lógica
  pesca/                    → minijuego de pesca
  tesoros/                  → datos_tesoros.js (ubicaciones) + lógica del buscador
  misiones/                 → datos_misiones.js (5 misiones con ubicación) + lógica
  principal.js              → arranque, conecta todos los módulos
```

## Sobre la seguridad del dinero

El juego corre 100 % en el navegador, así que un experto siempre podría tocar sus
propios datos. Lo que hace el sistema es que **cualquier manipulación se detecte**:

- El guardado completo lleva una **firma** (hash). Si se edita a mano, al cargar avisa.
- El saldo lleva su propio hash de control **y** se compara contra la suma del historial.
- Cada entrada del historial guarda el hash de la anterior: cambiar una rompe la cadena
  y el visor (botón 🧾) marca en rojo las entradas manipuladas.

Para revisar: botón **🧾 Historial** → pestañas **💰 Dinero** y **📦 Objetos**.
Arriba dice «✅ Historial íntegro» o «⚠️ POSIBLE HACKEO».

## Ajustar ubicaciones

Todas las coordenadas están en los archivos `datos_*.js` de cada carpeta y en
`js/config/config.js` (centro y cuadrado jugable). Cámbialas y recarga.
