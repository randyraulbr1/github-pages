# FASE 16 - Reorganizacion profesional del panel ADM e inventario responsive

Estado: 🚧 En progreso (v305 — fix persistencia equipo + CSS casillas)

## Contexto

Randy reporta problemas importantes de interfaz:

- El panel ADM tiene demasiadas funciones mezcladas y necesita organizarse mejor.
- Algunas funciones del ADM deberian estar agrupadas en secciones mas claras.
- En PC hay cuadros de objetos demasiado grandes y desiguales.
- Los textos no tienen estilo consistente.
- Los scrolls no tienen el mismo estilo que el inventario.
- El inventario esta roto visualmente.
- Al equipar botas, al recargar el juego aparecen quitadas o no se conservan bien.
- Las casillas del inventario/equipamiento estan muy grandes.
- Algunas casillas se sobreponen con las de arriba.

## Objetivo

Crear una UI profesional y consistente para:

- Panel ADM.
- Inventario.
- Equipamiento.
- Listas de objetos.
- Scrolls.
- Textos.
- Casillas.
- Responsive PC/tablet/movil.

Sin romper funciones existentes.

## Regla de prioridad por dispositivo

El juego normal debe estar pensado asi:

1. Telefono primero.
2. Tablet segundo.
3. PC tercero.

Pero el panel ADM debe estar pensado asi:

1. PC primero.
2. Tablet segundo.
3. Telefono solo como soporte basico.

Razon:

- El jugador normal juega caminando con telefono.
- El administrador normalmente organiza mundo, objetos, misiones y datos desde PC.

## Bloqueante: bug de inventario/equipamiento

Antes de pulir visualmente, corregir estos bugs:

### Botas/equipo se quitan al recargar

Problema:

- Randy equipa botas.
- Al recargar o volver a entrar, el equipo aparece quitado o no se restaura correctamente.

Revisar:

- Persistencia de equipamiento.
- Guardado local.
- Sync servidor.
- Aplicacion de bonus.
- Orden de carga al entrar.
- Si el inventario se reconstruye antes de aplicar equipo.
- Si el servidor devuelve equipo y el cliente lo pisa.

Reglas:

- Si un jugador equipa botas, casco, chaleco, arma o ropa, debe seguir equipado al recargar.
- Los bonus deben recalcularse despues de cargar.
- Si el objeto equipado ya no existe o fue eliminado, mostrar aviso y moverlo seguro al inventario o retirarlo con log.
- Nunca duplicar objetos al cargar.
- Nunca perder el objeto equipado sin razon.

Pruebas:

- Equipar botas -> recargar -> siguen equipadas.
- Equipar casco/chaleco/arma/ropa -> recargar -> siguen equipados.
- Cerrar sesion y volver -> equipo intacto.
- Probar online y offline si aplica.
- Probar Android y PC.

## Inventario profesional

Problemas a corregir:

- Casillas muy grandes.
- Casillas sobrepuestas.
- Casillas superiores tapadas.
- Diferente tamano entre objetos.
- Texto mal alineado.
- Scroll distinto al estilo del inventario.

Reglas visuales:

- Todas las casillas deben usar un tamano base consistente.
- Ninguna casilla puede superponerse.
- El grid debe adaptarse al ancho disponible.
- Iconos centrados.
- Texto corto debajo o tooltip/descripcion al tocar.
- Cantidad visible en esquina para objetos apilables.
- Equipos unicos sin contador salvo que haga falta.
- Borde claro para seleccionado/equipado.
- El inventario no debe salirse de la pantalla.
- Scroll suave y consistente.

Tamanos sugeridos:

Movil:

- Casilla inventario: 48-56 px.
- Icono: 32-40 px.
- Texto minimo, usar descripcion al tocar.

Tablet:

- Casilla inventario: 56-64 px.
- Icono: 40-48 px.

PC:

- Casilla inventario: 64-72 px.
- Icono: 48-56 px.

El tamano debe usar CSS variables, no numeros repetidos por todo el codigo.

Variables sugeridas:

- --slot-size-mobile
- --slot-size-tablet
- --slot-size-pc
- --slot-gap
- --slot-radius
- --panel-scrollbar-size

## Equipamiento

La zona de equipo debe ser clara y estable.

Slots sugeridos:

- arma
- casco
- chaleco
- ropa
- botas
- accesorio si existe despues

Reglas:

- Slots de equipo separados visualmente del inventario.
- No deben mezclarse con las casillas normales.
- No deben montarse encima de las filas del inventario.
- Deben mostrar vacio/equipado claramente.
- Al tocar un slot equipado, mostrar descripcion y opcion quitar.
- Al equipar, actualizar bonus inmediatamente.
- Al recargar, mantener equipo.

## Panel ADM profesional

El panel ADM debe reorganizarse por secciones grandes, no como una lista gigante.

Estructura recomendada en PC:

### Barra lateral izquierda

Secciones:

1. Mundo
2. Pines y mapa
3. Objetos
4. Misiones
5. Jugadores
6. Economia
7. Combate / enemigos
8. Tiendas
9. Cofres / tesoros
10. Sistema
11. Depuracion
12. Historial
13. Ajustes ADM

### Area principal derecha

Muestra solo la seccion seleccionada.

### Barra superior

- titulo de seccion
- buscador si aplica
- boton actualizar
- boton guardar/publicar si aplica
- estado de sync

### Pie o zona inferior

- errores recientes pequenos
- ultimo guardado
- version

## Organizacion por seccion

### Mundo

- Publicar mundo
- Descargar respaldo
- Importar respaldo
- Restaurar version
- Estado de mundo

### Pines y mapa

- Crear pin
- Mover pin
- Confirmar movimiento
- Cancelar movimiento
- Ver/ocultar capas
- Filtros por tipo

### Objetos

- Catalogo de objetos
- Crear objeto
- Editar objeto
- Duplicar objeto
- Desactivar objeto
- Exportar base

### Misiones

- Misiones por tipo
- Recoleccion
- Entrega
- Lucha
- Nivel
- Cocina
- NPC

### Jugadores

- Lista de jugadores
- Buscar jugador
- Ban / desban
- Ver inventario si existe permiso
- Telemetria basica

### Economia

- Monedas
- Precios
- Tiendas
- Recompensas

### Sistema

- Version
- Configuracion servidor
- Estado Render
- Variables visibles no sensibles

### Depuracion

- Ping
- consumo
- jugadores online
- errores
- descargar TXT
- no parpadear al refrescar

### Historial

- Acciones admin
- Restaurar
- Filtros
- Buscar por fecha/jugador/tipo

## Responsive del panel ADM

### PC

- Layout con sidebar fija y contenido amplio.
- Tablas y grids mas grandes.
- Paneles redimensionados bien.
- Ideal para editar objetos y misiones.

### Tablet

- Sidebar puede ser horizontal o colapsable.
- Contenido en tarjetas.
- Botones medianos.

### Movil

- No intentar mostrar todo el ADM completo como PC.
- Mostrar menu por categorias.
- Acciones peligrosas con confirmacion.
- Botones grandes.
- Formularios en una sola columna.

## Scrolls consistentes

Todos los scrolls deben verse y sentirse similares al inventario.

Aplicar a:

- inventario
- panel ADM
- listas de objetos
- listas de jugadores
- historial
- depuracion
- misiones
- tienda

Reglas:

- Mismo grosor.
- Mismos colores.
- No scroll doble innecesario.
- En movil usar scroll nativo suave.
- No cortar botones al final.
- Agregar padding inferior para que el ultimo elemento no quede tapado.

## Textos

Unificar estilos:

- Titulos.
- Subtitulos.
- Descripciones.
- Numeros.
- Estados.
- Mensajes de error.
- Botones.

Reglas:

- Nada de textos gigantes en casillas pequenas.
- Descripciones largas deben ir en panel de detalle.
- En movil truncar con opcion ver mas.
- Evitar que textos empujen botones fuera de pantalla.

## Sistema de componentes UI

Usar o mejorar los componentes existentes:

- UIPanel
- UIButton
- UIDialog
- UIToast
- UIGrid
- UIProgressBar

No crear estilos sueltos duplicados si ya existe componente.

Crear variantes si hacen falta:

- UIAdminLayout
- UISlotGrid
- UIItemSlot
- UIEquipmentSlot
- UIScrollArea
- UISectionTabs
- UIDetailPanel

## Reglas contra bugs visuales

- No usar tamanos fijos sin responsive.
- No usar z-index al azar.
- No usar position absolute si un grid/flex sirve mejor.
- No reconstruir todo el inventario si solo cambia una casilla.
- No mezclar estilos viejos y nuevos en la misma pantalla.
- No permitir superposicion entre HUD, inventario y paneles.

## Pruebas obligatorias

### Inventario

- Abrir inventario en movil.
- Abrir inventario en tablet.
- Abrir inventario en PC.
- Confirmar que casillas no se montan.
- Confirmar que equipo no tapa inventario.
- Equipar botas y recargar.
- Equipar casco/chaleco/arma/ropa y recargar.
- Confirmar bonus despues de recargar.
- Confirmar stack maximo 20.

### Panel ADM

- Abrir panel ADM en PC.
- Confirmar sidebar/secciones.
- Crear/mover pin.
- Confirmar cartel de mover pin tocable.
- Abrir catalogo de objetos.
- Ver lista con casillas iguales.
- Abrir descripcion de objeto.
- Abrir misiones.
- Abrir jugadores.
- Abrir depuracion.
- Descargar TXT.
- Confirmar que no parpadea.

### Responsive

- Probar 360x740 movil.
- Probar 390x844 movil.
- Probar tablet 768x1024.
- Probar PC 1366x768.
- Probar PC 1920x1080.

## Orden recomendado para Cursor

1. Arreglar bug de equipamiento que no persiste al recargar.
2. Arreglar casillas sobrepuestas del inventario.
3. Normalizar tamano de slots con CSS variables.
4. Unificar scrolls.
5. Reorganizar panel ADM por secciones.
6. Aplicar layout PC-first al ADM.
7. Aplicar mobile-first al juego normal.
8. Probar en todos los tamanos.
9. Actualizar faces.md con estado y nota corta.

## Criterio de completado

Esta fase solo esta completa si:

- El inventario no se rompe en movil, tablet ni PC.
- Las botas y equipos quedan guardados al recargar.
- Las casillas no se superponen.
- El panel ADM esta organizado por secciones.
- El panel ADM es comodo en PC.
- El juego normal sigue comodo en telefono.
- Scrolls y textos se ven consistentes.
- No se rompe GPS.
- No se rompe admin.
- No se pierde inventario ni equipo.

## Nota para Cursor

Esto es prioridad visual y funcional antes de agregar sistemas grandes nuevos.

No hacer una remodelacion destructiva.

Arreglar primero bugs reales: equipo que se quita al recargar y casillas sobrepuestas.

Luego reorganizar panel ADM con una estructura profesional.
