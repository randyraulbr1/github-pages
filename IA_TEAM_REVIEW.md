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
| **ChatGPT** | Activo — **solo opiniones** | Arquitectura, seguridad, riesgos. Escribir en `CHATGPT_REVIEW.md` o su sección aquí. |
| **Claude** | Activo — **solo opiniones** | Auditoría de código, bugs, mejoras. Escribir en su sección aquí (rama `claude/...`). |
| ~~**Gemini**~~ | **Fuera del equipo** | No participa. |
| **Cursor** | Activo — **único que implementa** | Lee opiniones, escribe decisión final, **programa** tras OK del creador. |

> ### ⚠️ REGLA PARA CHATGPT Y CLAUDE (8 jul 2026 — creador)
>
> **Solo den opiniones. No modifiquen código del juego.**
>
> - ✅ Permitido: leer repo, escribir/actualizar `IA_TEAM_REVIEW.md`, `CHATGPT_REVIEW.md`, comentarios en PR, propuestas con archivos y pruebas.
> - ❌ Prohibido: commits con cambios en `js/`, `server/`, `css/`, `index.html`, `version.json`, despliegue, merge sin Cursor/creador.
> - Cursor implementa la **Fase 1** aprobada (ver «Decisión final»). ChatGPT y Claude revisan el PR y opinan; no parchean en paralelo.
>
> Si encuentran un bug crítico, documentarlo en su sección con prioridad **CRÍTICA** y avisar al creador. Cursor lo incluirá en el siguiente sprint.

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
- [x] Cursor leyó `CHATGPT_CURSOR_REVIEW.md` (aprobación Fase 1).
- [x] Decisión Fase 2/3/4 escrita (ver abajo).
- [ ] Merge Fase 1 (#101–#104) en `main` + deploy Render.
- [ ] OK del creador: «adelante con Fase 2».

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

**Estado:** ✅ **Fase 1 COMPLETADA** (PR #104, v274) — **APROBADA** por ChatGPT en `CHATGPT_CURSOR_REVIEW.md` (8 jul 2026).

#### FASE 1 — Crítico ✅ (PR #104, `cursor/security-phase1-7abe`)

| # | Cambio | Motivo | Archivos | Prueba | Rollback |
|---|--------|--------|----------|--------|----------|
| **1.1** | Reservar nombres admin en `POST /register` (`randy`, `soycaos`, alias de `GAME_ADMIN_NAMES`) | P1: cualquiera puede ser admin tras redeploy | `server/routes/authRoutes.js`, `server/auth.js` | Registrar «randy» con cuenta nueva → **403** | Revertir commit |
| **1.2** | Exigir `JWT_SECRET` en producción (no default); log/error al arrancar si falta | P4: tokens fabricables | `server/auth.js`, `server/server.js` | Sin env → servidor avisa o no arranca | Restaurar env en Render |
| **1.3** | Blindar purga: **no purgar** si `snapshot.jugadores.length < usuarios SQLite`; desactivar o gatear `soloAdmin` | P2/P10: pérdida masiva de cuentas | `server/importSnapshot.js`, `server/server.js`, `server/syncCuentas.js` | Snapshot incompleto → cuentas **siguen** | Revertir commit |
| **1.4** | Validar `perfilId` en `POST /sync-partida`: solo el dueño o admin del juego | Regla 4 + hueco Cursor | `server/routes/playerRoutes.js`, `server/auth.js` (`canEditPartida`) | Jugador envía `perfilId` ajeno → **403** | Revertir commit |
| **1.5** | Desactivar o rechazar `player:updateInventory` (cliente no manda inventario crudo) | Regla 4: trampas | `server/sockets.js` | Emit desde consola → **error** | Revertir commit |
| **1.6** | Verificar en Render (sin código): `JWT_SECRET`, `GITHUB_TOKEN` configurados | P4/P10 | Panel Render | Variables visibles en dashboard | — |

**Revisión ChatGPT:** `CHATGPT_CURSOR_REVIEW.md` — *Aprobado con observaciones.* Fase 1 no debe detenerse; siguiente foco = estabilidad del mundo online.

---

### DECISIÓN CURSOR — FASE 2 (tras leer `CHATGPT_CURSOR_REVIEW.md`)

**Fecha:** 8 julio 2026  
**Estado:** PLANIFICADA — **no implementar hasta merge de Fase 1 en `main` + deploy Render OK.**

ChatGPT prioriza en **Alta:** (1) unificar fuente del mundo, (2) roles admin reales, (3) validar economía/inventario en servidor.  
Cursor **reordena** para no mezclar un refactor enorme con parches pequeños en el mismo PR:

| Bloque | Nombre | PR sugerido | Versión | Tamaño |
|--------|--------|-------------|---------|--------|
| **Fase 2** | Estabilidad servidor | `cursor/stability-phase2-7abe` | v275 | Mediano |
| **Fase 3** | Arquitectura mundo (una sola verdad) | `cursor/world-single-source-7abe` | v276+ | Grande |
| **Fase 4** | Rendimiento GPS / datos | `cursor/perf-sync-phase4-7abe` | v277+ | Mediano |

#### FASE 2 — Estabilidad servidor (siguiente PR, v275)

*Objetivo: cerrar huecos que quedan tras Fase 1 sin re-arquitecturar todo el mundo. Sin features nuevas de juego.*

| # | Cambio | Motivo (ChatGPT / Claude) | Archivos | Prueba |
|---|--------|---------------------------|----------|--------|
| **2.1** | `users.role` (`player` \| `admin`) + JWT con `role`; checks por role, no solo por nombre | ChatGPT alta #2; cierra P1 definitivo | `server/db.js`, `server/auth.js`, `server/sockets.js`, `server/routes/*`, migración al arranque | Admin con role publica mapa; jugador no |
| **2.2** | `partidaMin` / stats: no emitir `partida:sync` si datos no cambiaron (`statsT` estable) | Claude v236 parpadeo | `server/sockets.js`, `server/syncMundo.js`, `js/online/multijugador.js` | Stats en vivo sin revertir vida/oro |
| **2.3** | Validación servidor en `player:updateStats`: tope HP/hambre/XP; rechazar valores imposibles | ChatGPT alta #3 (parcial) | `server/sockets.js` | Cliente no puede mandar HP > max |
| **2.4** | Log/auditoría cuando admin edita partida ajena (socket + REST) | Trazabilidad | `server/sockets.js`, `server/eventLog.js` | Entrada en log tras edición admin |
| **2.5** | Actualizar `docs/ARQUITECTURA_SYNC.md` (rama `main`, v275, flujo roles) | Docs desactualizadas | `docs/ARQUITECTURA_SYNC.md` | — |

**Qué NO va en Fase 2:** unificar tablas vs blob (eso es Fase 3), GPS por distancia (Fase 4), features nuevas (tiendas extra, misiones, UI).

#### FASE 3 — Arquitectura mundo (después de Fase 2, PR grande)

*Objetivo: ChatGPT alta #1 + Claude P3/P5 — «todos ven lo mismo».*

| # | Cambio |
|---|--------|
| **3.1** | Documento de diseño `docs/MUNDO_FUENTE_UNICA.md` (qué lee cada endpoint, plan migración) |
| **3.2** | Tablas normalizadas (`world_objects`, `missions`, …) = **lectura en vivo** (`game:init`, mapa) |
| **3.3** | `world_snapshot` / GitHub = **solo backup** (throttle 10 min + eventos críticos) |
| **3.4** | Admin publica **por objeto** (crear/editar/borrar pin), no subir mundo entero 15 MB |
| **3.5** | Cliente deja de depender de merge blob conflictivo para pins nuevos |

**Riesgo:** alto si se hace de golpe. Fase 3 requiere plan escrito + prueba con 2 clientes antes de producción.

#### FASE 4 — Rendimiento (conexión lenta Cuba)

| # | Cambio |
|---|--------|
| **4.1** | `player:move` solo a jugadores cercanos (interest management) |
| **4.2** | Coalescer movimientos en tick `players:sync` (8 s) |
| **4.3** | Sync mundo por deltas / por zona |
| **4.4** | Rate-limit: chat, amigos, register |

#### Regla hasta terminar Fase 3

**Prohibido** (salvo bugfix crítico acordado con creador):

- Nuevas mecánicas de juego
- Parches solo-cliente de dinero/inventario
- Subir tamaño del blob mundo sin deltas

#### FASE 2 — Alto (plan original, reemplazado por tabla arriba)

### Qué NO hacer todavía

- No mezclar Fase 2 con Fase 3 en un solo PR.
- No añadir **features nuevas** hasta cerrar Fase 3 (arquitectura mundo).
- No tocar `mariel-explorer/` (carpeta duplicada).
- ChatGPT y Claude: **solo opiniones** en `CHATGPT_CURSOR_REVIEW.md` / comentarios PR — no código.

### Archivos ya en producción pendientes de merge (referencia)

| Versión | PR | Cambio |
|---------|-----|--------|
| v272 | #101 | statsT, barras, ban instantáneo |
| v273 | #102 | Sync admin rápida, tiendas, UI |
| v274 Fase 1 | #104 | Seguridad servidor |

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

**Fase 1:** Aprobada por ChatGPT (`CHATGPT_CURSOR_REVIEW.md`). Mergear PR #104 y desplegar en Render.

**Fase 2 (siguiente):** Estabilidad servidor (v275) — roles admin, stats estables, validación HP, docs. **Sin features nuevas.**

**Fase 3 (después):** Una sola fuente de verdad del mundo (lo que ChatGPT marca como prioridad alta #1).

**Motivo del orden:** ChatGPT pide arquitectura del mundo antes de muchas funciones nuevas, pero mezclar eso con roles/stats en un PR rompería el juego en vivo. Fase 2 cierra seguridad restante; Fase 3 ataca el desync «un jugador ve cosas que otro no».

**Para decir a Cursor:** «Adelante con Fase 2» cuando Fase 1 esté en producción y el checklist de 7 puntos pase.

**Para ChatGPT y Claude:** Opinen sobre el plan Fase 2/3 en comentarios o nueva sección en `CHATGPT_CURSOR_REVIEW.md`. No implementen código.

---

## Historial de revisiones

| Fecha | Versión doc | Participantes | Notas |
|-------|-------------|---------------|-------|
| 2026-07-08 | 1.0 | ChatGPT, Claude, Gemini, Cursor | Documento inicial; estado post v273 |
| 2026-07-08 | 1.1 | ChatGPT, Claude, Cursor | Gemini fuera del equipo (aviso del creador) |
| 2026-07-08 | 1.3 | ChatGPT, Claude, Cursor | Fase 1 seguridad aprobada e implementada (v274) |
| 2026-07-08 | 1.4 | ChatGPT, Cursor | ChatGPT aprueba Fase 1 (`CHATGPT_CURSOR_REVIEW.md`); Cursor define Fase 2/3/4 |

---

## Objetivo final

Crear un juego GPS online donde:

- los jugadores vean el mismo mundo
- el ADM pueda crear contenido sin perderlo
- funcione con internet lento
- sea seguro contra trampas
- sea fácil de mantener

**Nuevas IA:** añadir fila en «Historial» y sección «Opinión — [nombre]» antes de tocar código.
