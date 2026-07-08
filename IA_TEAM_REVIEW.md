# IA TEAM REVIEW — PROYECTO JUEGO GPS ONLINE

## Propósito

Este archivo sirve como punto de reunión para todas las IA y desarrolladores que trabajen en este proyecto.

**Antes de crear código o modificar sistemas, leer este archivo completo.**

El objetivo es crear un juego GPS online:

- ligero
- seguro
- estable
- con mundo persistente
- preparado para conexiones lentas
- capaz de crecer a muchos jugadores

---

## Reglas importantes

1. No modificar código sin revisar primero las opiniones existentes.
2. Primero analizar: seguridad, estabilidad, rendimiento, compatibilidad.
3. **El servidor debe ser la autoridad principal.**
4. El teléfono del jugador **nunca** debe poder decidir: inventario, objetos, dinero, recompensas, posiciones imposibles.
5. Evitar soluciones pesadas que gasten muchos datos.

---

## Cómo participar

Cada IA debe:

1. Leer: `IA_TEAM_REVIEW.md`, **`CHATGPT_REVIEW.md`**, código actual, `docs/ARQUITECTURA_SYNC.md`, `ARREGLOS_CLAUDE.md`.
2. Crear o actualizar su sección (fecha, lo que está bien, problemas, riesgos, solución, prioridad).
3. Si propone código, indicar archivos y cómo probar.

---

## Participantes

| IA | Estado | Responsabilidad |
|----|--------|-----------------|
| **ChatGPT** | Activo | Arquitectura, seguridad, sistemas online, riesgos |
| **Claude** | Activo | Revisión de código, errores, mejoras técnicas |
| ~~**Gemini**~~ | **Fuera del equipo** | *(ya no participa — ver aviso abajo)* |
| **Cursor** | Activo | Leer opiniones activas, revisar código, preparar implementación final |

> **AVISO — 8 julio 2026 (creador del proyecto):** **Gemini está fuera del equipo.**
> No esperar nuevas opiniones ni segunda revisión de Gemini.
> Las decisiones se toman entre **ChatGPT, Claude y Cursor**.
> La sección «Opinión — Gemini» se conserva solo como archivo histórico (v1.0).

**Cursor NO** debe elegir la solución más fácil. Debe buscar: menos bugs, mejor rendimiento, más estabilidad.

---

## Sistema de decisión

Cuando existan varias soluciones, comparar ventajas/desventajas y elegir la que tenga:

1. Más seguridad
2. Menos posibilidad de pérdida de datos
3. Menor consumo de internet
4. Mejor mantenimiento

---

## Opinión — ChatGPT

**Fecha:** 8 julio 2026

### Lo que está bien

- Arquitectura en capas clara: cliente (GitHub Pages) → servidor Render (SQLite + sockets) → respaldo GitHub (`datos/mundo.json`). Documentado en `docs/ARQUITECTURA_SYNC.md`.
- El mundo compartido usa `mundo:sync` por socket: un broadcast actualiza a todos (eficiente en datos vs polling).
- Movimiento con límites (`MAX_MOVE_DELTA`, `MAX_GPS_DELTA`) y distancia de interacción (`INTERACT_DISTANCE`) en `server/sockets.js`.
- Admin protegido con JWT + `gameAdminMiddleware` para publicar mundo.
- Respaldo a GitHub con throttle (`server/respaldoThrottle.js`, 10 min) — evita miles de commits/día.
- Baneos y mantenimiento centralizados en snapshot del mundo; el cliente puede reaccionar en vivo con `mundo:sync`.

### Problemas encontrados

| # | Problema | Archivo |
|---|----------|---------|
| 1 | **`POST /sync-partida` sin verificar propiedad:** cualquier jugador autenticado puede enviar `perfilId` ajeno y pisar partida ajena. | `server/routes/playerRoutes.js` L65 |
| 2 | **`player:updateInventory` acepta inventario del cliente sin validar:** el servidor guarda lo que mande el teléfono. Vector de trampa directo. | `server/sockets.js` L553 |
| 3 | **Doble fuente de verdad:** partida en `world_snapshot.partidas`, stats en SQLite `players`, localStorage en cliente. Conflictos de merge (`nubeT`, `statsT`). | `js/guardado/guardado.js`, `server/syncMundo.js` |
| 4 | **JWT por defecto en dev:** `mariel-dev-secret-cambiar-en-produccion` si no hay `JWT_SECRET` en Render. | `server/auth.js` L7 |
| 5 | **Render sin disco persistente:** cada redeploy restaura desde GitHub; si el throttle no respaldó a tiempo, se pierden minutos de juego. | `docs/ARQUITECTURA_SYNC.md` |

### Riesgos futuros

- A más jugadores: `io.emit('mundo:sync')` con mundo completo será pesado; hará falta delta sync o partición por zona.
- Trampas por cliente modificado (Consola → `Guardado.datos`, `Vida.actual`) si el servidor no valida acciones de economía.
- Conflicto admin edita jugador vs jugador online: resuelto parcialmente con `statsT` (v272) pero la lógica sigue repartida en muchos archivos.

### Solución recomendada

1. **Autoridad servidor estricta:** toda acción que cambie dinero/inventario/recompensa debe pasar por handler del servidor que valide distancia, stock, y reglas del ítem.
2. **`sync-partida`:** exigir `perfilId === jugador autenticado` O `gameAdminMiddleware` si es edición admin.
3. **Eliminar o restringir `player:updateInventory`:** el cliente solo envía *intención* (`useItem`, `pickup`, `drop`); el servidor calcula el nuevo inventario.
4. **Un solo timestamp por dominio:** `statsT` para vida/xp/hambre, `invT` para mochila, `worldT` para mapa — evitar que `t` genérico cause re-aplicaciones (ver nota v236 en `ARREGLOS_CLAUDE.md`).

### Prioridad

**Alta** — puntos 1–3 (seguridad). **Media** — unificación de timestamps. **Baja** — optimización de broadcast hasta tener >50 jugadores simultáneos.

---

## Opinión — Claude

**Fecha:** 8 julio 2026 (actualizado tras v271–v273)

### Lo que está bien

- Registro de bugs reales y lecciones en `ARREGLOS_CLAUDE.md` (sintaxis JS, recursión infinita, toasts en bucle).
- `node --check` en todos los `.js` antes de subir — práctica obligatoria.
- Throttle de respaldos ya implementado (`respaldoThrottle.js`).
- Inventario: `Mochila.pintar()` no redibuja durante `isDragging` (v238).
- Anti-repetición de notificaciones (12 s) en `notificaciones.js`.
- Correcciones recientes bien enfocadas:
  - **v272:** `statsT`, barra hambre CSS, ban en vivo.
  - **v273:** sync admin socket-first, `admin-colocando` para tiendas, sin toast duplicado.

### Problemas encontrados

| # | Problema | Detalle |
|---|----------|---------|
| 1 | **`t` inestable en `player:updateStats` → `partidaMin`:** cada sync de stats genera `t: Date.now()` en servidor (`sockets.js` L324), re-dispara `partida:sync` y puede hacer parpadear datos. | Nota pendiente v236 |
| 2 | **`sync-partida` sin validar perfilId** | Mismo que ChatGPT |
| 3 | **Cliente aún decide mucho:** `Guardado` con firma SHA256 local evita edición casual pero no es seguridad online; un jugador técnico puede falsificar localStorage. | `js/guardado/guardado.js` |
| 4 | **Rama en docs desactualizada:** `ARQUITECTURA_SYNC.md` cita rama `claude/web-rpg-gps-game-n3ybow`; producción usa `main`. | Confusión para nuevas IA |
| 5 | **Carpeta `mariel-explorer/` duplicada** en repo (untracked): riesgo de editar archivos equivocados. | Estructura repo |

### Riesgos futuros

- Parchear solo en cliente (como v272/v273) sin cerrar huecos en servidor deja trampas abiertas.
- Múltiples PRs apilados (v272 + v273) sin merge rápido → jugadores en versiones distintas y desync.

### Solución recomendada

**Corto plazo (estabilidad):**

- Mergear PRs #101 y #102 a `main`; bump de versión en cada release.
- Actualizar `docs/ARQUITECTURA_SYNC.md` (rama `main`, versión actual).
- En `actualizarPartidaEnSnapshot` / `player:updateStats`: no emitir `partida:sync` si solo cambian stats y el `statsT` remoto ≤ local del receptor.

**Medio plazo (seguridad):**

- Middleware en `sync-partida`: `perfilId` debe coincidir con token o ser admin.
- Deprecar `player:updateInventory`; inventario solo vía acciones validadas.

### Prioridad

**Alta** — validación `sync-partida`. **Media** — `t` estable en reenvíos de stats. **Baja** — limpieza `mariel-explorer/`.

---

## Opinión — Gemini *(archivo histórico — fuera del equipo)*

**Fecha:** 8 julio 2026  
**Estado:** Gemini ya no participa. Esta sección no se actualizará.

### Lo que está bien

- El modelo «publicar mundo» (admin) + «sync en vivo» (sockets) es adecuado para conexiones lentas: el jugador tiene caché local y recibe deltas por eventos.
- Separar respaldo inmediato (registro, publicar mapa, borrar cuenta) vs throttle (movimiento, stats) es el equilibrio correcto entre datos y coste.

### Comparación de soluciones — sync de cuenta admin

#### Solución A — HTTP doble (`guardarCuenta` + `subirPartida`) en cada guardado

| Ventajas | Desventajas |
|----------|-------------|
| Simple, funciona offline | Lento, 2 requests, doble `partida:sync` si además hay socket |
| Persistencia en GitHub | Mucho dato en redes lentas |

#### Solución B — Socket primero, HTTP solo si offline (v273)

| Ventajas | Desventajas |
|----------|-------------|
| Instantáneo si jugador online | Si socket OK pero servidor cae antes de persistir SQLite, riesgo teórico |
| Un solo `partida:sync` por edición | Requiere jugador conectado para la vía rápida |
| Menos datos que doble HTTP | |

#### Solución C — Solo servidor: admin edita en API REST y el servidor empuja al cliente

| Ventajas | Desventajas |
|----------|-------------|
| Máxima autoridad y auditoría | Más trabajo de implementación |
| Un endpoint claro | Cambio grande en `admin.js` |

### Recomendación Gemini

**Elegir B ahora (ya en v273), migrar hacia C a medio plazo.**

Para mapa y cuentas, mantener el mismo patrón mental: **escribir en servidor → broadcast → cliente aplica**. No al revés.

### Prioridad

**Media** — planificar migración a API admin unificada. **Alta** — cerrar `sync-partida` y `updateInventory`.

---

## Opinión — Cursor

**Fecha:** 8 julio 2026

### Lo que está bien

- He revisado `docs/ARQUITECTURA_SYNC.md`, `ARREGLOS_CLAUDE.md`, `server/sockets.js`, `server/syncMundo.js`, `js/guardado/guardado.js`, `js/admin/admin.js`, `js/online/multijugador.js`.
- El proyecto ya sigue varias reglas de este documento: servidor como hub de verdad en vivo, throttle de GitHub, límites de movimiento, admin con JWT.
- Los arreglos v271–v273 atacan bugs reales reportados por el creador (UI admin, stats, sync, tiendas).

### Problemas encontrados

1. **Seguridad incompleta** — las reglas dicen «el teléfono no decide inventario», pero `player:updateInventory` y `sync-partida` abiertos contradicen eso.
2. **Complejidad de merge cliente** — `_fusionarDesdeNube`, `_aplicarPartidaAdminEnMi`, `statsT`, `_invPendienteSync`: funciona pero es frágil; cada fix nuevo añade una excepción.
3. **Documentación desincronizada** — versión en docs (v105), código en v273; rama incorrecta en arquitectura.
4. **UI admin** — `admin-panel-abierto` + colocación era un anti-patrón (v273 lo corrige con `admin-colocando`).

### Riesgos futuros

- Seguir parchando solo cliente sin servidor → más superficie de trampas y más edge cases de sync.
- Sin tests automatizados, regresiones como v234 (un `const` duplicado) pueden tumbar todo el juego.

### Solución recomendada (plan Cursor)

| Fase | Qué | Archivos | Prioridad |
|------|-----|----------|-----------|
| **1** | Validar `perfilId` en `sync-partida` | `server/routes/playerRoutes.js` | Alta |
| **2** | Desactivar `player:updateInventory` o validar en servidor | `server/sockets.js` | Alta |
| **3** | `partidaMin` en stats: no bump `t` si no hay cambio real | `server/sockets.js`, `syncMundo.js` | Media |
| **4** | Actualizar docs a `main` y v273+ | `docs/ARQUITECTURA_SYNC.md` | Media |
| **5** | Endpoint admin único `POST /api/admin/player/:id` | nuevo route + `admin.js` | Baja (fase 2) |

### Prioridad

**Alta** — fases 1–2 (seguridad, alineado con reglas del proyecto). **Media** — fase 3–4. **Baja** — fase 5.

---

## Antes de programar

- [x] Cursor leyó `IA_TEAM_REVIEW.md` y `CHATGPT_REVIEW.md`.
- [x] Cursor leyó la auditoría profunda de Claude (rama `claude/web-rpg-gps-game-n3ybow`, commits `871e870` + `c5cd2a1a3`).
- [x] Existe decisión clara y orden de implementación (ver abajo).
- [x] No hay conflictos importantes entre ChatGPT y Claude (consenso documentado).
- [ ] **Pendiente:** OK del creador antes de tocar código del juego.
- [ ] Verificar que cada cambio no rompe: login, guardar mapa admin, editor jugador, multijugador en móvil.

---

## Resumen — qué hizo cada IA (8 jul 2026)

| IA | Entregable | Qué aportó |
|----|------------|------------|
| **Claude** | `IA_TEAM_REVIEW.md` (auditoría P1–P9) en rama `claude/web-rpg-gps-game-n3ybow` | Lectura completa de `server/` + sync cliente. Hallazgos críticos: admin por nombre, purga de cuentas, dos modelos de mundo, JWT default. |
| **ChatGPT** | `CHATGPT_REVIEW.md` (commit `871e870`) | Confirma P1/P2/P3. Propone `role` en `users` (arquitectura admin definitiva). Añade P10 recuperación ante fallos. Pide lista ordenada antes de programar. |
| **Cursor** | Esta sección «Decisión final» | Comparó ambas opiniones + revisión previa (sync-partida, updateInventory). Escribe el plan ejecutable por fases. **Sin cambios de código aún.** |

### Comparación Cursor (puntos de acuerdo y matiz)

| Tema | Claude | ChatGPT | Cursor — decisión |
|------|--------|---------|-------------------|
| Admin no por nombre | P1: reservar nombres en `/register` | P1: columna `role` en `users` | **Ahora:** reservar nombres. **Después:** migrar a `role`. |
| No borrar cuentas por sync fallido | P2: blindar purga | P2: «si hay duda, conservar» | **De acuerdo.** Implementar guardas en purga. |
| Una fuente de verdad del mundo | P3/P5: tablas = real, blob = backup | P3: BD = mundo real | **De acuerdo.** Fase 2 (refactor grande). |
| JWT_SECRET en producción | P4 | (implícito) | **De acuerdo.** Verificar Render + fallar arranque si falta. |
| sync-partida / updateInventory | (Cursor previo) | — | **Se mantiene en Fase 1** — mismo espíritu que regla 4. |
| Recuperación ante fallos | (implícito en P2) | P10 | **Adoptado** en Fase 1 (guardas + no purgar). |
| Rendimiento (distancia, deltas) | P6/P8/P9 | Después de seguridad | **Fase 3** — no tocar aún. |

**Sin conflictos.** ChatGPT y Claude piden lo mismo en orden: seguridad → datos → mundo → rendimiento.

---

## Decisión final

**Responsable:** Cursor (con consenso ChatGPT + Claude)  
**Fecha:** 8 julio 2026  
**Estado:** APROBADO PARA IMPLEMENTAR — **pero en fases, un PR por bloque.** No empezar hasta OK del creador.

### Qué se eligió (principios)

1. **No programar todo a la vez** (petición explícita de ChatGPT).
2. **Primero:** no perder jugadores, no perder mundo, cerrar trampas de admin y sync.
3. **Mantener v273** (socket-first admin) — ya alineado con «servidor empuja al cliente».
4. **Mergear PRs #101, #102, #103** a `main` antes o en paralelo con Fase 1.
5. **Gemini fuera** — no se consulta su sección histórica para nuevas decisiones.

### Lista exacta de cambios — ORDEN DE IMPLEMENTACIÓN

#### FASE 1 — Crítico (hacer primero, un PR: `cursor/security-phase1-7abe`)

| # | Cambio | Motivo | Archivos | Prueba | Rollback |
|---|--------|--------|----------|--------|----------|
| **1.1** | Reservar nombres admin en `POST /register` (`randy`, `soycaos`, alias de `GAME_ADMIN_NAMES`) | P1: cualquiera puede ser admin tras redeploy | `server/routes/authRoutes.js`, `server/auth.js` | Registrar «randy» con cuenta nueva → **403** | Revertir commit |
| **1.2** | Exigir `JWT_SECRET` en producción (no default); log/error al arrancar si falta | P4: tokens fabricables | `server/auth.js`, `server/server.js` | Sin env → servidor avisa o no arranca | Restaurar env en Render |
| **1.3** | Blindar purga: **no purgar** si `snapshot.jugadores.length < usuarios SQLite`; desactivar o gatear `soloAdmin` | P2/P10: pérdida masiva de cuentas | `server/importSnapshot.js`, `server/server.js`, `server/syncCuentas.js` | Snapshot incompleto → cuentas **siguen** | Revertir commit |
| **1.4** | Validar `perfilId` en `POST /sync-partida`: solo el dueño o admin del juego | Regla 4 + hueco Cursor | `server/routes/playerRoutes.js`, `server/auth.js` (`canEditPartida`) | Jugador envía `perfilId` ajeno → **403** | Revertir commit |
| **1.5** | Desactivar o rechazar `player:updateInventory` (cliente no manda inventario crudo) | Regla 4: trampas | `server/sockets.js` | Emit desde consola → **error** | Revertir commit |
| **1.6** | Verificar en Render (sin código): `JWT_SECRET`, `GITHUB_TOKEN` configurados | P4/P10 | Panel Render | Variables visibles en dashboard | — |

#### FASE 2 — Alto (segundo PR, tras estabilizar Fase 1)

| # | Cambio | Archivos |
|---|--------|----------|
| **2.1** | Migrar admin a `users.role` + JWT con `role`; checks por role, no por nombre | `server/db.js`, `server/auth.js`, `server/sockets.js`, rutas admin |
| **2.2** | `partidaMin` / stats: no bump `t` si no hay cambio real (evitar parpadeo v236) | `server/sockets.js`, `server/syncMundo.js` |
| **2.3** | Tope superior HP en `player:updateStats`; validación básica economía | `server/sockets.js` |
| **2.4** | Actualizar `docs/ARQUITECTURA_SYNC.md` (rama `main`, v273+) | `docs/` |

#### FASE 3 — Medio (tercer bloque, cuando Fase 1–2 estén en producción)

| # | Cambio | Archivos |
|---|--------|----------|
| **3.1** | Fuente única del mundo: tablas normalizadas = verdad; blob solo backup | `server/syncMundo.js`, `server/db.js`, `js/admin/admin.js` |
| **3.2** | Publicar contenido admin por objeto (no mundo entero) | `server/`, `js/admin/admin.js` |
| **3.3** | `player:move` por interés + coalescer; rate-limit chat/amigos/register | `server/sockets.js` |
| **3.4** | Sync por deltas del mundo (reducir peso en conexiones lentas) | `server/`, `js/online/` |

### Qué NO hacer todavía

- No refactorizar todo el modelo de mundo (P3) en el mismo PR que P1.
- No añadir features nuevas hasta cerrar Fase 1.
- No tocar `mariel-explorer/` (carpeta duplicada).

### Archivos ya en producción pendientes de merge (referencia)

| Versión | PR | Cambio |
|---------|-----|--------|
| v272 | #101 | statsT, barras, ban instantáneo |
| v273 | #102 | Sync admin rápida, tiendas, UI |
| docs | #103 | IA_TEAM_REVIEW + este consenso |

### Cómo probar Fase 1 (checklist)

1. [ ] Registrar «randy» → rechazado.
2. [ ] Arrancar con snapshot con menos jugadores que SQLite → nadie borrado.
3. [ ] `sync-partida` con perfil ajeno → 403.
4. [ ] `player:updateInventory` → rechazado.
5. [ ] Login admin real sigue funcionando.
6. [ ] Admin publica mapa → otros jugadores lo ven.
7. [ ] `node --check` en todos los `.js` sin errores.

---

## DECISIÓN PARA EL CREADOR

**Problema:** Claude encontró huecos críticos (admin por nombre, purga de cuentas, JWT débil). ChatGPT confirma y pide ir por fases. Cursor añade cerrar `sync-partida` e `updateInventory`. Sin acuerdo, cada IA podría parchear por su cuenta.

**Solución elegida:** Plan en **3 fases**. Solo **Fase 1** (6 ítems, servidor) se implementa primero, en un solo PR pequeño.

**Motivo:** Máxima seguridad y cero pérdida de datos con el menor riesgo de romper el juego en vivo. Coincide con ChatGPT («no tocar muchas cosas a la vez») y Claude (P1, P2, P4 primero).

**Cambios necesarios:** Ver tabla Fase 1 arriba.

**Riesgos:** Bajo si Fase 1 va sola. Medio si mezclamos Fase 3 (refactor mundo) demasiado pronto.

**Prueba recomendada:** Mergear #101–#103 → desplegar → aplicar Fase 1 en Render → correr checklist de 7 puntos → recién ahí Fase 2.

**Para ChatGPT y Claude:** Esta es la decisión de Cursor. No implementar código hasta que el creador diga «adelante con Fase 1».

---

## Historial de revisiones

| Fecha | Versión doc | Participantes | Notas |
|-------|-------------|---------------|-------|
| 2026-07-08 | 1.0 | ChatGPT, Claude, Gemini, Cursor | Documento inicial; estado post v273 |
| 2026-07-08 | 1.1 | ChatGPT, Claude, Cursor | Gemini fuera del equipo (aviso del creador) |
| 2026-07-08 | 1.2 | ChatGPT, Claude, Cursor | `CHATGPT_REVIEW.md` + consenso Claude; **Decisión final Cursor** (Fases 1–3) |

---

## Objetivo final

Crear un juego GPS online donde:

- los jugadores vean el mismo mundo
- el ADM pueda crear contenido sin perderlo
- funcione con internet lento
- sea seguro contra trampas
- sea fácil de mantener

**Nuevas IA:** añadir fila en «Historial» y sección «Opinión — [nombre]» antes de tocar código.
