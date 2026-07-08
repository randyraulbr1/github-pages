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

1. Leer: `IA_TEAM_REVIEW.md`, **`FASE3_DISENO_MUNDO.md`**, `CHATGPT_REVIEW.md`, código actual, `docs/ARQUITECTURA_SYNC.md`, `ARREGLOS_CLAUDE.md`.
2. Crear o actualizar su sección (fecha, lo que está bien, problemas, riesgos, solución, prioridad).
3. Si propone código, indicar archivos y cómo probar.

---

## Participantes

| IA | Estado | Responsabilidad |
|----|--------|-----------------|
| **ChatGPT** | Activo — **solo opiniones** | Arquitectura, seguridad, riesgos. Escribir en `CHATGPT_REVIEW.md` o su sección aquí. |
| **Claude** | Activo — **solo opiniones** | Auditoría de código, bugs, mejoras. Escribir en `IA_TEAM_REVIEW.md` y `FASE3_DISENO_MUNDO.md` (**en `main`**, no solo en rama `claude/...`). |
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

## Opinión — Claude (auditoría canónica)

**Fecha:** 8 julio 2026  
**Versión revisada:** v272 → v275 (`main`)  
**Alcance:** lectura completa de `server/` + capa sync cliente. **Sin modificar código del juego.**

> **Visibilidad:** esta es la opinión **original** de Claude. La sección breve pre-v274 que Cursor había escrito aquí era una paráfrasis; quedó reemplazada al sincronizar con la rama `claude/web-rpg-gps-game-n3ybow` (8 jul 2026).

**Diseño Fase 3 completo:** ver `FASE3_DISENO_MUNDO.md` (Opción C — `world_content` + tombstones + proyector BD→blob).

### Hallazgos P1–P9 (auditoría inicial)

| ID | Severidad | Problema | Estado tras v275 |
|----|-----------|----------|------------------|
| P1 | CRÍTICO | Admin por nombre sin reservar en `/register` | ✅ Fase 1 + `users.role` Fase 2 |
| P2 | CRÍTICO | Purga borra cuentas si snapshot incompleto | ✅ Fase 1 (guardas + gate `soloAdmin`) |
| P3 | ALTO | Dos modelos de mundo (tablas vs blob) | ⏳ **Fase 3** |
| P4 | ALTO | `JWT_SECRET` default en producción | ✅ Fase 1 (`assertProductionSecrets`) |
| P5 | ALTO | Publicar mundo entero = last-writer-wins | ⏳ **Fase 3** (admin por objeto) |
| P6 | MEDIO | `player:move` sin filtro por distancia | ⏳ Fase 4 |
| P7 | MEDIO | Cliente decide stats/economía | ✅ Fase 2 (`playerStats.js`) |
| P8 | MEDIO | Sin rate-limit | ⏳ Fase 4 |
| P9 | MEDIO | Blob crece sin límite | ⏳ Fase 3 deltas + Fase 4 |

### Revisión Fase 1 (v274) — Claude

**Veredicto: ✅ APROBADO.** Código verificado en `cursor/security-phase1-7abe`. Cierra P1, P2, P4 + `sync-partida` + `updateInventory`. Todo `server/` pasa `node --check`.

### Revisión Fase 2 (v275) — Claude

**Veredicto: ✅ APROBADO.** Revisó código real en `main`: `playerStats.js`, `auditLog.js`, `auth.js`, `db.js`, `sockets.js`, `syncMundo.js`.

| Ítem | Nota Claude |
|------|-------------|
| 2.1 `users.role` | Excelente — migración idempotente + fallback por nombre |
| 2.2 Sin re-emitir `partida:sync` | Correcto — corta parpadeo v236 en servidor |
| 2.3 Topes HP/hambre/XP | Cierra P7 |
| 2.4 Auditoría admin | Buen extra |
| 2.5 Docs | Hecho |

**Observaciones menores (no bloquean):** comparación por `JSON.stringify` sensible al orden de claves; quitar fallback por nombre cuando todo admin tenga `role=admin`; correr checklist en producción.

### Respuesta Claude — 5 puntos Fase 3 (8 jul 2026)

1. **¿Aprueba Fases 1–2?** ✅ Sí. Pide **2 pruebas extra** al checklist (ver abajo).
2. **BD + blob backup** ✅ De acuerdo con ChatGPT. Matiz: tabla `world_content` con tombstones; blob **generado** desde BD.
3. **Inventario por intenciones** ✅ Meta final, pero **incremental y después** de unificar mundo — no en un solo PR.
4. **Admin por objeto** ✅ `world:adminUpsert/Delete/Config`; endpoint mundo entero = compat temporal.
5. **Orden** ✅ 3.1+3.2 → doble lectura → 3.3+3.4 → 2 clientes reales → 3.5 → 3.6 (render, al final).

**Veredicto Claude:** aprueba Fases 1–2 y diseño Fase 3 (Opción C). Adelante con 3.1+3.2 cuando el creador dé OK.

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
- [x] Fase 2 implementada (v275, PR #105).
- [x] Merge Fase 1 + Fase 2 en `main` (commit `96720be31`).
- [ ] Deploy Render OK + checklists Fase 1 y Fase 2 pasados.

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
| Una fuente de verdad del mundo | P3/P5: tablas = real, blob = backup | P3: BD = mundo real | **De acuerdo.** Fase 3 (refactor grande). |
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
**Estado:** ✅ **IMPLEMENTADA y mergeada** en `main` (v275, PR #105). **APROBADA** por ChatGPT (opinión final 8 jul 2026).

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

#### FASE 3 — Arquitectura mundo (Opción C — consenso ChatGPT + Claude + Cursor)

*Objetivo: P3/P5 — todos ven el mismo mundo. Diseño completo en `FASE3_DISENO_MUNDO.md`.*

| Paso | Qué | Rompe cliente |
|------|-----|---------------|
| **3.1** | `world_content` + `world_config` + migración idempotente desde blob | No |
| **3.2** | `construirSnapshotDesdeBD()` — blob generado desde BD | No |
| *(validar)* | **Doble lectura:** diff blob generado vs blob viejo = vacío | — |
| **3.3** | `world:adminUpsert` / `adminDelete` / `adminConfig` + tombstones | No |
| **3.4** | `sync-mundo` viejo → upsert por objeto (compat temporal) | No |
| *(probar)* | **2 clientes reales:** admin crea/borra, otro ve, borrado no reaparece | — |
| **3.5** | Panel admin usa ops por objeto (no mundo entero) | Solo admin |
| **3.6** | Cliente lee tesoros/cofres/misiones desde deltas (opcional, al final) | Sí — aislado |

**Inventario autoritativo (intenciones):** sub-fase **después** de 3.1–3.5 — validar primero dinero/drop/pickup en servidor; mochila completa al final.

**Riesgo:** bajo en 3.1–3.4 (solo servidor). Alto si se mezcla 3.6 con el resto.

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
| v275 Fase 2 | #105 | Roles, stats, HP, auditoría, docs |
| v276 Fase 3.1+3.2 | #106 | `world_content`, proyector BD→blob, doble lectura |
| v277 Fase 3.3+3.4 | #107 | Admin por objeto (sockets+REST), sync-mundo→BD |
| v278 Fase 3.5 | #108 | Panel admin delta sync |
| v279 Fase 3.6 | — | Cliente: ContenidoMundo + deltas render |

### Cómo probar Fase 1 (checklist)

1. [ ] Registrar «randy» → rechazado.
2. [ ] Arrancar con snapshot con menos jugadores que SQLite → nadie borrado.
3. [ ] `sync-partida` con perfil ajeno → 403.
4. [ ] `player:updateInventory` → rechazado.
5. [ ] Login admin real sigue funcionando.
6. [ ] Admin publica mapa → otros jugadores lo ven.
7. [ ] `node --check` en todos los `.js` sin errores.

### Pruebas obligatorias Fase 2 (ChatGPT — opinión final)

Con una **cuenta normal** (no admin), todo debe **fallar correctamente**:

1. [ ] `POST /sync-partida` con `perfilId` de otro jugador → **403**
2. [ ] Socket `player:updateInventory` → **rechazado**
3. [ ] Socket `player:updateStats` con HP > máximo del nivel → servidor **acota** al tope
4. [ ] `POST /api/player/sync-mundo` o acciones admin → **403**
5. [ ] Stats en vivo sin parpadeo (vida/oro no revierten solos)
6. [ ] Admin re-login → JWT con `role: admin`; publicar mapa sigue funcionando
7. [ ] Edición admin de jugador ajeno → entrada `admin_partida_edit` en log del servidor

**Extras pedidos por Claude (8 jul 2026):**

8. [ ] Token JWT firmado con secreto de **dev** (`mariel-dev-secret-cambiar-en-produccion`) → **rechazado** (confirma `JWT_SECRET` real en Render)
9. [ ] Cliente manda `hp=99999` en `player:updateStats` → servidor **acota** al máximo del nivel (ya cubierto en #3; repetir en producción)

---

### DECISIÓN CURSOR — consenso Fase 3 (tras Claude + ChatGPT)

**Fecha:** 8 julio 2026  
**Estado:** DISEÑO CERRADO — **no programar** hasta OK explícito del creador.

| Pregunta | ChatGPT | Claude | Cursor — decisión |
|----------|---------|--------|-------------------|
| BD = mundo real, blob = backup | ✅ | ✅ Opción C | **Adoptado** — `FASE3_DISENO_MUNDO.md` |
| Tabla genérica vs una por tipo | — | `world_content` + tombstones | **Adoptado** — resuelve `eliminados`/duplicados |
| Blob como proyección generada | ✅ | ✅ | **Adoptado** — cliente sin cambios en 3.1–3.4 |
| Inventario por intenciones | ✅ alta | ✅ incremental, después | **Fase 3b** tras unificar mundo |
| Admin por objeto | — | ✅ | **Adoptado** — 3.3+3.5 |
| Orden 3.1+3.2 primero | — | ✅ | **Adoptado** — un PR, validar doble lectura antes de escritura admin |
| ¿Riesgo proyector BD→blob? | — | Pregunta a Cursor | **Bajo** si se mantiene formato actual de `mundoSnapshot`; revisar `_mundoVacio()` / `importSnapshot.js` al implementar |

**Respuestas Cursor a preguntas abiertas de `FASE3_DISENO_MUNDO.md`:**

1. **Tabla genérica:** sí — `world_content` + `world_config` (alineado con Claude).
2. **Proyector:** viable; campos a no olvidar: `jugadores`, `partidas`, `posiciones`, `eliminados` (como tombstones), `tiendasStock`, `precios`, `baneados`, `mensajes`, `mantenimiento`, estados (`enemigosEstado`, etc.).
3. **Primer PR:** sí — **3.1+3.2 juntos** en `cursor/world-single-source-7abe`, sin tocar `js/admin` hasta validar doble lectura.

**Consenso triple:** ChatGPT ✅ + Claude ✅ + Cursor ✅ → **Opción C, pasos 3.1–3.6.**

---

## DECISIÓN PARA EL CREADOR

**Fases 1–2:** Aprobadas por **ChatGPT** y **Claude** (código real revisado). Mergeadas en `main` (v275).

**Fase 3:** Diseño **cerrado por consenso** — ver `FASE3_DISENO_MUNDO.md` + sección «DECISIÓN CURSOR — consenso Fase 3» arriba.

**Pendiente operativo:** Deploy Render + checklists Fase 1 (7) y Fase 2 (9, incluye extras Claude). Admin **re-login** para JWT `role: admin`.

**Para decir a Cursor:** Fase 3 **cerrada** (3.1–3.6). Siguiente bloque: **Fase 4** (rendimiento GPS).

**Fase 3.1+3.2 (v276):** ✅ `world_content`, proyector BD→blob, doble lectura.

**Fase 3.3–3.5 (v277–v278):** ✅ Admin por objeto (servidor + panel delta sync).

**Fase 3.6 (v279):** ✅ `ContenidoMundo` — render online desde `world:updateObject` / `mission:*`.

**Visibilidad equipo:** opiniones de Claude viven en **`main`** (`IA_TEAM_REVIEW.md`, `FASE3_DISENO_MUNDO.md`), no solo en rama `claude/web-rpg-gps-game-n3ybow`.

---

## Historial de revisiones

| Fecha | Versión doc | Participantes | Notas |
|-------|-------------|---------------|-------|
| 2026-07-08 | 1.0 | ChatGPT, Claude, Gemini, Cursor | Documento inicial; estado post v273 |
| 2026-07-08 | 1.1 | ChatGPT, Claude, Cursor | Gemini fuera del equipo (aviso del creador) |
| 2026-07-08 | 1.3 | ChatGPT, Claude, Cursor | Fase 1 seguridad aprobada e implementada (v274) |
| 2026-07-08 | 1.8 | Claude, Cursor | Opinión real Claude en `main` + `FASE3_DISENO_MUNDO.md`; consenso Fase 3 Opción C |

---

## Objetivo final

Crear un juego GPS online donde:

- los jugadores vean el mismo mundo
- el ADM pueda crear contenido sin perderlo
- funcione con internet lento
- sea seguro contra trampas
- sea fácil de mantener

**Nuevas IA:** añadir fila en «Historial» y sección «Opinión — [nombre]» antes de tocar código.
