# faces - Plan maestro de fases, bugs e ideas

Este archivo es la guia principal para organizar las fases, bugs, ideas, pruebas y decisiones del proyecto Kingdom GPS / juego GPS online.

Regla principal: Cursor implementa. ChatGPT solo agrega ideas, revisiones y documentacion cuando Randy lo pida. No tocar codigo desde este archivo.

---

## Reglas para Cursor

1. Trabajar una fase a la vez.
2. No empezar una fase nueva hasta terminar o pausar claramente la anterior.
3. Cuando complete una fase, marcarla como: ✅ Completada.
4. Si una fase esta en proceso, marcarla como: 🚧 En progreso.
5. Si una fase aun no empieza, marcarla como: ⏳ Pendiente.
6. Al completar una fase, dejar una nota corta de 2 a 5 lineas maximo.
7. La nota debe decir que se hizo y si quedo algo pendiente.
8. No escribir notas largas si no hace falta.
9. Si aparece un bug durante una fase, agregarlo en Bugs conocidos.
10. No agregar nuevas funciones grandes antes de cerrar seguridad, estabilidad y mundo persistente.

## Regla anti-conflictos al editar este archivo

`faces.md` lo tocan varias ramas y agentes a la vez. Para evitar conflictos de merge:

1. **Una sección por cambio** — solo editar la fase o bloque en el que trabajas (ej. Fase 6). No reescribir todo el archivo.
2. **No mover fases** — no cambiar el orden ni renombrar encabezados de fase.
3. **Cambios mínimos** — actualizar solo `Estado:` y `Nota:` de tu fase. No tocar el estado de otras fases (salvo un bug nuevo en *Bugs conocidos*).
4. **Partir de main** — antes de editar, traer la última versión (`git pull origin main` o rebase sobre `main`).
5. **Un tema por commit** — no mezclar en el mismo commit actualizaciones de fases distintas si se puede evitar.
6. **Si hay conflicto de merge** — conservar la versión con más fases actualizadas; fusionar a mano solo las líneas `Estado:` y `Nota:` de la fase que implementaste.
7. **Ideas de Randy/ChatGPT** — agregar al final (*Ideas*, *Bugs*) o en la fase indicada; Cursor no reformatea secciones enteras.

Formato recomendado al completar:

Estado: ✅ Completada

Nota: Se implemento y se probo en PC/Android. Queda pendiente revisar rendimiento con mas jugadores.

---

## Prioridades generales

1. No perder cuentas ni jugadores.
2. No perder el mundo creado por el ADM.
3. Todos los jugadores deben ver el mismo mundo.
4. Funcionar con internet lento y telefonos normales.
5. Interfaz clara, comoda y sin bugs de capas.
6. No agregar funciones nuevas si rompen estabilidad.

---

# FASE 1 - Seguridad critica del servidor

Estado: ✅ Completada (codigo v274+)

Objetivo: cerrar huecos donde un jugador pueda volverse admin, modificar datos ajenos o romper el servidor.

Incluye:

- Reservar nombres de administrador.
- No usar JWT_SECRET por defecto en produccion.
- Validar que un jugador solo edite su propia partida.
- Rechazar cambios de inventario enviados directamente desde cliente.
- Proteger contra borrado accidental de cuentas.

Nota: `partidaAuthMiddleware`, `player:updateInventory` rechazado, `assertProductionSecrets`, nombre admin reservado en registro. Pendiente checklist post-deploy en Render.

Pruebas:

- Intentar registrar nombre admin como jugador normal debe fallar.
- Intentar modificar partida ajena debe fallar.
- Intentar actualizar inventario desde cliente debe fallar.
- Servidor no debe arrancar con secreto de desarrollo.

---

# FASE 2 - Estabilidad del servidor

Estado: 🚧 En progreso

Objetivo: hacer el servidor mas estable antes de agregar funciones nuevas.

Incluye:

- Roles reales en base de datos: owner, admin, moderador, tester, jugador.
- JWT con role.
- Permisos por rol, no por nombre.
- Validar HP, hambre, XP y otros stats en servidor.
- Log de auditoria cuando el admin edita partida ajena.
- Evitar sincronizaciones repetidas si no hay cambios reales.

Nota: Stats validados (`playerStats.js`), audit log parcial, `statsT` estable. Falta roles DB completos y permisos por rol.

Como hacerlo:

- Agregar columna role a users.
- Mantener compatibilidad con cuentas existentes.
- Crear helpers de permisos: isOwner, isAdmin, isModerator.
- Registrar acciones admin importantes.

Pruebas:

- Cuenta normal no puede abrir funciones admin.
- Admin real conserva permisos.
- Jugador no puede ponerse vida/XP imposible.
- Se guarda log cuando admin edita algo.

---

# FASE 3 - Fuente unica del mundo

Estado: 🚧 En progreso

Objetivo: evitar que algunos jugadores vean objetos y otros no.

Problema a evitar:

- Mundo en tablas de base de datos.
- Mundo en snapshot JSON.
- Dos fuentes pueden causar diferencias.

Regla:

Base de datos = mundo oficial.
Snapshot = backup/recuperacion.

Nota: Tabla `world_content`, migracion, deltas admin (v276–279), inventario autoritativo v282–283. Falta cerrar confianza en sync-partida para economia.

Incluye:

- Definir una fuente unica para objetos, misiones, cofres, enemigos y pines.
- Publicar cambios por objeto, no subir el mundo completo cada vez.
- Mantener historial de cambios.
- Permitir restaurar una version anterior.

Pruebas:

- ADM crea un cofre y dos jugadores lo ven.
- Reiniciar servidor y el cofre sigue.
- Borrar cache del telefono y el mundo carga igual.
- Si snapshot falla, la base de datos no borra mundo.

---

# FASE 4 - Rendimiento GPS para Cuba

Estado: ✅ Completada (v280)

Objetivo: que el juego sea ligero y funcione con internet lento.

Nota: `interest.js` 500 m, `emitirACercanos`, rate-limit chat/amigos/register, coalesce movimientos.

Incluye:

- No enviar movimientos a todos los jugadores.
- Enviar solo jugadores cercanos.
- Usar zonas/chunks.
- Actualizar por distancia o cada pocos segundos.
- Reducir datos repetidos.

Regla:

El cliente solo debe recibir lo que necesita ver cerca.

Pruebas:

- 2 jugadores cerca se ven.
- 2 jugadores lejos no reciben datos innecesarios.
- Con 20 jugadores no se dispara el consumo.
- En internet lento el juego reconecta sin romperse.

---

# FASE 5 - Estandar de interfaz UI/UX

Estado: 🚧 En progreso (v286)

Objetivo: que toda la interfaz se vea igual, sea facil de tocar y no tenga bugs visuales.

Referencia visual:

Usar el inventario actual como base porque esta bien logrado.

Nota v286: `user-select: none` en HUD/botones/ventanas; toasts 2 s y contador +N; `Utilidades.mensajeAmigable` para errores de red.

Reglas:

- No cambiar tamano del inventario sin razon.
- Botones con tamanos consistentes.
- No usar scroll si no hace falta.
- Botones tactiles grandes aunque el icono sea pequeno.
- Separacion clara entre botones.
- Mismo estilo para ventanas, carteles, barras y menus.

En PC:

- Aplicar user-select: none a botones, HUD, inventario, paneles y menus.
- No permitir seleccionar texto al dejar clic apretado.
- Excepcion: inputs, chat, cajas de texto.

Toques/clicks:

- Un toque debe hacer una sola accion.
- No permitir que un click atraviese un menu y toque el mapa detras.
- No permitir que dos botones reciban el mismo toque.
- Al abrir una ventana, debe capturar foco.

Mensajes/carteles:

- No mostrar carteles repetidos.
- Agrupar mensajes iguales.
- Ejemplo: en vez de 3 carteles de madera, mostrar +3 madera.
- Tiempo recomendado: 1 a 2 segundos.

---

# FASE 5.1 - Bugs de capas y ventanas

Estado: ✅ Completada (v299)

Bug detectado:

Cuando el administrador mueve un PIN, a veces el cartel/boton para confirmar queda detras de otra capa y no se puede tocar.

Solucion esperada:

- Todo dialogo de confirmacion debe estar encima de todas las ventanas.
- Ninguna capa invisible debe bloquear los toques.
- Si hay dialogo abierto, el resto de la UI queda bloqueada detras.
- Revisar z-index / orden de render / pointer-events.

Nota v286: `--z-confirmaciones: 16000` en `#admin-controles`, `.colocacion-controles`, overlays de confirm; clase `body.ui-mapa-confirm`.

Nota v299: al entrar en modo Organizar se quita `admin-panel-abierto`; controles de mapa usan `--z-critico` y `pointer-events: auto` con `ui-mapa-confirm` / `admin-organizar`.

Prioridad de capas recomendada:

1. Errores criticos.
2. Confirmaciones.
3. Dialogos modales.
4. Inventario.
5. Tiendas.
6. Amigos/perfil/chat.
7. HUD.
8. Mapa.

Pruebas:

- Mover PIN muchas veces.
- Abrir admin y cerrar mientras se confirma.
- Abrir inventario y luego confirmacion.
- Confirmar con mouse en PC.
- Confirmar con dedo en Android.

---

# FASE 6 - Administrador de ventanas UI Manager

Estado: ✅ Completada (v288)

Objetivo: evitar bugs de ventanas, capas, foco y botones bloqueados.

Nota v288: Todas las ventanas y overlays pasan por `UIManager` — tienda, misiones, historial, avisos, correo, pesca, cofres, admin, botín enemigo, overlay misión activa. ESC cierra la ventana superior; mapa bloqueado con `ui-bloquea-mapa`.

Nota v287: `UIManager` central — abrir/cerrar ventanas, ESC, bloqueo mapa, confirmaciones. Conectado: mochila, opciones, amigos, chat, inventario confirm.

Idea:

Crear un solo sistema que controle todas las ventanas del juego.

Debe controlar:

- Que ventana esta abierta.
- Que ventana tiene foco.
- Orden de capas.
- Cierre con boton atras/ESC.
- Bloqueo de clicks al mapa cuando hay menu.
- Confirmaciones por encima de todo.

Regla:

Ninguna pantalla debe abrir otra directamente sin pasar por el UI Manager.

---

# FASE 7 - Sistema de errores amigables

Estado: ✅ Completada (v290)

Objetivo: nunca mostrar errores feos al jugador.

Nota v290: `Utilidades.pintarEstado` (cargando/error/vacío/reintentar) en login, registro y amigos. v289: mensajeAmigable en rutas del jugador. Avisos ya tenían estado vacío.

Nota v289: login/registro/GPS/amigos/chat/mochila/bolsas/combate/botín/tesoros. v288: tienda online.

No mostrar:

- undefined
- null
- 404
- 500
- stack trace

Mostrar:

- No se pudo conectar. Reintentando...
- No se pudo cargar esta ventana.
- Intentalo de nuevo.

Cada pantalla debe tener:

- estado cargando
- estado error
- boton reintentar
- estado vacio

---

# FASE 8 - Pruebas antes de publicar

Estado: 🚧 En progreso (v304 — smoke OK; **validación real móvil pendiente Randy**)

Objetivo: no publicar si una prueba crítica falla.

**Guía detallada:** `faces/fase-8-validacion-movil-v299.md` (actualizar versión objetivo a **v304** al probar).

### Pendiente bloqueante (antes de nuevas funciones)

| Item | Responsable | Estado |
|------|-------------|--------|
| Cerrar PRs obsoletos #113, #114, #88, #19, #17, #16, #10 | Randy | ✅ 2026-07-08 |
| Prueba Android caminando con GPS | Randy | ☐ |
| 2 jugadores reales en mapa | Randy | ☐ |
| Inventario, admin, chat, amigos, tienda, misiones en móvil | Randy | ☐ |
| Login Render Starter (v302+) | Randy | ✅ entra con randy |
| No empezar funciones grandes nuevas | Equipo | ⏳ hasta validar móvil |

Cómo usar: marcar cada ítem con ☐ pendiente, ✅ ok o ❌ falló (fecha + nota breve).

Checklist mínimo:

| Prueba | Estado |
|--------|--------|
| Crear cuenta | ☐ manual |
| Iniciar sesión | ☐ manual |
| GPS propio | ☐ manual (Android caminando) |
| Ver otro jugador | ☐ manual (2 jugadores reales) |
| Inventario | ☐ manual (abrir/cerrar móvil) |
| Amigos | ☐ manual (menú ⋮ carpeta) |
| Chat | ☐ manual (lista + conversación) |
| Tienda | ☐ manual (NPC + panel) |
| Misiones | ☐ manual (panel) |
| Admin panel | ☐ manual (solo Randy) |
| Bloquear jugador | ☐ manual |
| Admin crea objeto | ☐ manual |
| Admin mueve PIN | ☐ manual (fix v299 en código) |
| Admin borra objeto | ☐ manual |
| Reiniciar servidor | ✅ smoke 2026-07-08 — /health OK (local + CI) |
| Borrar caché | ☐ manual |
| Entrar desde otro teléfono | ☐ manual |
| Mala conexión | ☐ manual |
| PC | ✅ smoke 2026-07-08 — JS + versión sincronizada |
| Móvil | ✅ viewport 390×844 PR#119; ☐ toque real Android |

### Checklist rápido Android (~10 min)

1. Borrar caché del sitio o modo incógnito → debe cargar **v304**.
2. Crear cuenta o login → mapa visible con GPS.
3. Abrir inventario, amigos, chat, opciones → paneles sin desborde, botón ✕ cierra.
4. Admin (Randy): Organizar → mover PIN → confirmar → publicar.
5. Segundo teléfono o PC: ver al otro jugador en mapa.

Nota v304: optimización red Render (v303–304): sin doble carga mundo, sync-partida 90s, socket.io local, enemigos por cercanía, mundo:sync delta, panel consumo MB en Depuración.

Nota v302: fix URL Render + diagnóstico conexión; login-game HTTP 500 corregido.

Nota v300: Render plan Starter activo (`mariel-online.onrender.com`). Oracle **pausado** (docs listos en `docs/ORACLE_MIGRACION.md`).

Regla:

No publicar version si una prueba critica falla.

**No empezar funciones grandes nuevas hasta validar v304 en móvil real** (ver guía Fase 8).

---

# FASE 9 - Historial y restauracion

Estado: ✅ Completada (v299)

Objetivo: poder deshacer errores.

Guardar historial:

- ADM creo objeto.
- ADM movio PIN.
- ADM borro cofre.
- ADM cambio mision.
- Jugador recibio recompensa.

Debe guardar:

- quien
- que hizo
- fecha
- version
- datos antes
- datos despues

Nota v299: `server/adminHistorial.js` registra upsert/delete/config/publicar en `worldContent` + JSONL. API `GET/POST /api/player/admin-historial` con restaurar. Panel Depuración muestra últimas acciones y botón ↩ Restaurar.

---

# FASE 10 - Panel de depuracion admin

Estado: ✅ Completada (v296)

Objetivo: encontrar bugs rapido sin adivinar.

Mostrar solo a owner/admin:

- version del juego
- ping
- estado servidor
- jugadores online
- objetos cargados
- zona actual
- errores recientes
- ultimo sync
- tamano de datos descargados

Nota v296: panel `admin-depuracion` en menú Servidor, vista `admin-vista-depuracion`, módulo `js/admin/admin_depuracion.js` con refresh cada 5 s y eventos de `/api/player/sync-status`.

---

# FASE 11 - Anti spam y limites

Estado: ✅ Completada (v297)

Objetivo: evitar abuso y bugs por exceso de acciones.

Limites en `server/rateLimit.js`:

| Acción | Límite | Dónde |
|--------|--------|-------|
| Chat | 30/min | socket `chat:send` |
| Amigos (refresh) | 15/min | socket `friends:refresh` |
| Solicitud amistad | 12/min | REST `/api/friends/request` |
| Registro | 8/h por IP | REST `/api/register` |
| Mover posición | 100/min | socket `player:move` (sin `force`) |
| Crear/editar objetos admin | 250/min | REST `world/*` + socket `world:admin*` |
| Publicar mundo | 15/min | REST `/api/player/sync-mundo` |

Cliente: errores 429 con mensajes amigables en `sync_servidor.js` y `utilidades.js`.

---

# FASE 12 - Inventario como patron visual

Estado: ✅ Completada (v298)

Objetivo: usar el inventario actual como guia de diseno para todo.

Reglas:

- Las tiendas deben parecer del mismo juego.
- Amigos/chat/perfil deben usar bordes, sombras y botones similares.
- Los menus deben respetar el tamano de pantalla como el inventario.
- No crear cada pantalla con estilos diferentes.

Componentes en `js/nucleo/ui_components.js` + `css/ui_components.css`:

- UIPanel, UIButton, UIToast, UIDialog, UIProgressBar, UIGrid

Nota v298: tienda, misiones, pesca, historial, correo, amigos, chat, opciones y avisos usan clases `ui-panel` / `inventario-caja`. Confirmaciones unificadas con `ui-dialog`.

---

# FASE 13 - Catalogo fuerte de objetos en panel ADM

Estado: ✅ Completada (v295)

Objetivo: seccion ADM para administrar todos los objetos del juego.

Nota v291–v294: catálogo ADM, consumibles %, equipo con bonus, armas min/max, comida cruda/cocinada, validación servidor. Ver `faces/fase-13-catalogo-objetos-admin.md`.

Nota v295: cocinar en juego (🍳 + cuchillo), endpoint `player:cookItem`, equipo nv 11–20 ampliado.

---

# FASE 15 - Migracion Oracle Cloud (produccion)

Estado: ⏳ Pausada — Randy usa **Render Starter** ($7/mes). Scripts Oracle listos por si se retoma.

Objetivo: servidor estable, un dominio, Cuba sin VPN.

Documentacion maestra: `docs/ORACLE_MIGRACION.md`

| Subfase | Tarea | Estado |
|---------|-------|--------|
| 15.1 | Scripts Nginx, install/update/backup, red.js | ✅ v301 |
| 15.2–15.6 | VM Oracle, DNS, pruebas | ⏳ pausado |

**Produccion actual:** juego en tcodm.com (GitHub Pages) + API en `mariel-online.onrender.com`.

---

# FASE 15B - Optimizacion consumo red (Render)

Estado: 🚧 En progreso (v304 — optimizaciones seguras aplicadas; medicion en panel admin)

Objetivo: bajar egress Render sin romper juego.

Documentacion: `faces/fase-15-optimizacion-consumo-red.md`

| Hecho (v303–304) | Pendiente |
|------------------|-----------|
| Auditoria inicial | Medir 48 h en Render dashboard |
| Sin doble carga mundo | GPS throttle (no tocar aun) |
| sync-partida 90s | Comprimir JSON en Node |
| Poll HTTP off con socket | player:updateStats scoped |
| socket.io desde tcodm.com | Bundling admin.js |
| Enemigos por cercanía 500m | |
| mundo:sync delta | |
| Panel MB/sesion admin | |

Nota v304: PR #130–131 mergeados. Estimado ~25–55 MB/mes (1 jugador, 2 h/día) vs ~60–90 antes.

---

# Bugs conocidos / ideas pendientes

## Bug UI - Confirmacion de mover PIN queda detras

Estado: ✅ Completada (v299)

Descripcion:

Al mover un PIN como administrador, el cartel de confirmacion a veces queda debajo de otra capa y no se puede tocar.

Solucion sugerida:

- revisar z-index
- revisar pointer-events
- usar UI Manager
- confirmaciones siempre arriba

Nota v299: fix `admin-panel-abierto` + `admin-organizar`; z-index `--z-critico` en confirmaciones de mapa.

## Bug UI - Carteles repetidos

Estado: ✅ Completada (v286)

Descripcion:

Algunas acciones pueden mostrar mensajes repetidos.

Solucion sugerida:

- sistema unico de toast
- agrupar mensajes iguales
- cooldown por mensaje

Nota v286: contador +N en toast activo; duracion 2 s por defecto.

## Mejora PC - No seleccionar texto

Estado: ✅ Completada (v286)

Descripcion:

En PC, al mantener clic sobre botones o textos de menu se puede seleccionar texto.

Solucion sugerida:

- user-select: none en UI general
- permitir seleccion solo en inputs/chat

---

# Como usar este archivo

Cursor debe leer este archivo antes de proponer cambios grandes.

Cada fase debe tener:

- objetivo
- como hacerlo
- pruebas
- prioridad
- estado
- nota corta cuando se complete

Randy puede pedir: agrega esto a faces.md, y se debe actualizar este archivo sin tocar codigo del juego.
