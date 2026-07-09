# FASE 15 - Optimizacion de consumo de red y recursos

Estado: ⏳ Pendiente

## Contexto

Randy activo el plan Starter de Render ($7/mes). El juego ya entra y funciona en Render, por lo que no se debe migrar a otro servidor por ahora.

Durante pruebas se consumieron aproximadamente 5 GB de ancho de banda en unos 2 dias con pocos jugadores. Eso puede ser demasiado para la fase de pruebas y hay que medirlo antes de seguir agregando sistemas grandes.

## Objetivo

Reducir el consumo de ancho de banda, CPU y RAM sin romper el juego ni cambiar la experiencia del jugador.

Meta deseada:

- Reducir consumo de red entre 50% y 90% si es posible.
- Mantener el juego estable.
- No romper GPS, mapa, jugadores online, admin, inventario, misiones ni chat.
- Medir antes y despues de cada cambio.

## Regla principal

No optimizar a ciegas.

Primero medir, despues decidir, despues aplicar cambios pequenos y probar.

## Auditoria inicial obligatoria

Medir y documentar:

- MB descargados al abrir el juego por primera vez.
- MB descargados al recargar despues de cache.
- Trafico generado por Leaflet/mapa.
- Trafico generado por Socket.IO.
- Mensajes por segundo del cliente.
- Mensajes por segundo del servidor.
- Bytes por tipo de evento.
- Consumo de CPU en Render.
- Consumo de RAM en Render.
- Logs de errores.

Separar trafico por categorias:

- login / registro
- carga inicial
- mundo
- posicion GPS
- jugadores online
- chat
- amigos
- inventario
- tienda
- misiones
- admin
- cofres / tesoros
- depuracion
- otros

## Cosas a revisar

### 1. Carga inicial

Revisar si hay archivos grandes:

- JavaScript
- CSS
- imagenes
- iconos
- audios
- fuentes
- librerias no usadas

Buscar:

- archivos duplicados
- imagenes sin comprimir
- codigo muerto
- modulos cargados aunque no se usen

### 2. Cache

Verificar:

- Cache-Control correcto para JS, CSS e imagenes.
- Service Worker / PWA no descargando todo de nuevo sin necesidad.
- Versionado correcto para que actualice cuando toca, pero no cada vez.
- ETag o mecanismo equivalente.

### 3. Compresion

Verificar y activar si falta:

- gzip o brotli para archivos estaticos.
- respuestas JSON comprimidas cuando convenga.
- no comprimir cosas pequenas donde no vale la pena.

### 4. Socket.IO

Revisar eventos frecuentes:

- player:move
- game:init
- partida:sync
- world:updateObject
- world:adminUpsert
- chat
- amigos
- inventario

Buscar:

- eventos duplicados
- eventos demasiado grandes
- envios muy frecuentes
- datos que no cambiaron
- jugadores lejanos recibiendo datos innecesarios
- reconexiones infinitas
- bucles de sync

### 5. GPS

Optimizar sin romper:

- No enviar posicion si el jugador no se movio lo suficiente.
- No enviar posicion cada segundo si no hace falta.
- Usar distancia minima y tiempo minimo.
- Mantener precision razonable para el juego.
- No afectar la seguridad ni el movimiento autoritativo.

### 6. Mundo y admin

Confirmar que ya no se envia mundo completo para cambios pequenos.

Revisar:

- mover pin
- crear objeto
- editar objeto
- borrar objeto
- publicar mundo
- restaurar historial

Debe usar deltas cuando sea seguro.

### 7. Leaflet / mapa

Revisar consumo de tiles:

- Cuantos tiles descarga al abrir.
- Si el cache del navegador funciona.
- Si se esta recargando el mapa demasiado.
- Si hay capas duplicadas.
- Si se puede limitar zoom o reducir actualizaciones visuales.

No cambiar el mapa actual sin aprobacion.

### 8. Panel admin y depuracion

Evitar que el panel de depuracion consuma demasiado.

Revisar:

- refresh cada 5 segundos
- datos que descarga
- errores recientes
- historial admin

Si consume mucho, hacerlo manual o reducir frecuencia.

## Instrumentacion recomendada

Agregar medicion segura para desarrollo/admin:

- Contador de bytes enviados por Socket.IO.
- Contador de bytes recibidos.
- Conteo por evento.
- Top 10 eventos mas pesados.
- Top 10 archivos mas grandes.
- Panel admin con resumen de consumo.

No mostrar datos sensibles a jugadores normales.

## Optimizaciones permitidas si son seguras

- Cachear archivos estaticos correctamente.
- Comprimir respuestas grandes.
- Reducir frecuencia de eventos repetidos.
- Enviar solo cambios/deltas.
- Enviar datos solo a jugadores cercanos.
- Evitar reenvio de mundo completo.
- Reducir peso de imagenes/iconos.
- Minificar JS/CSS si no rompe el flujo actual.
- Reducir refresh automatico del panel depuracion si consume mucho.

## Optimizaciones que requieren cuidado

No aplicar sin explicar riesgo:

- Cambiar sistema GPS.
- Cambiar sincronizacion principal.
- Cambiar sistema de guardado.
- Cambiar Socket.IO de forma profunda.
- Cambiar service worker/PWA sin prueba de actualizacion.
- Cambiar Leaflet o proveedor de mapa.

## Informe obligatorio antes de cambios grandes

Cursor debe entregar una tabla:

| Area | Consumo actual | Problema | Cambio propuesto | Ahorro estimado | Riesgo |
|------|----------------|----------|------------------|-----------------|--------|

Tambien responder:

- Por que se consumieron 5 GB tan rapido.
- Si hay bug o bucle.
- Cuanto consume 1 jugador por hora.
- Cuanto consumen 10 jugadores por hora.
- Cuanto consumen 50 jugadores por hora.
- Cuanto podria durar Render Starter con el consumo actual.
- Cuanto podria durar despues de optimizar.

## Pruebas obligatorias

Antes y despues de optimizar:

- Abrir juego limpio sin cache.
- Abrir juego con cache.
- Entrar con 1 jugador.
- Entrar con 2 jugadores.
- Moverse con GPS.
- Usar chat.
- Abrir inventario.
- Abrir tienda.
- Crear/mover pin como admin.
- Probar misiones.
- Probar panel depuracion.
- Probar Android.

## Criterio de completado

Esta fase solo se considera completa si:

- Hay medicion antes/despues.
- Se identifica el mayor consumidor de red.
- Se aplican optimizaciones seguras.
- El juego sigue funcionando igual.
- No se rompe Android.
- No se rompe GPS.
- No se pierde mundo ni inventario.
- Randy puede ver un resumen claro del consumo.

## Nota para Cursor

Randy quiere mantener Render Starter por ahora.

No migrar servidor.

Prioridad: medir, optimizar y bajar consumo sin romper nada.

No empezar sistemas grandes nuevos hasta saber cuanto consume realmente el juego.
