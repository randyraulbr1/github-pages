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

1. Leer: `IA_TEAM_REVIEW.md`, código actual, `docs/ARQUITECTURA_SYNC.md`, `ARREGLOS_CLAUDE.md`.
2. Crear o actualizar su sección (fecha, lo que está bien, problemas, riesgos, solución, prioridad).
3. Si propone código, indicar archivos y cómo probar.

---

## Participantes

| IA | Responsabilidad |
|----|-----------------|
| **ChatGPT** | Arquitectura, seguridad, sistemas online, riesgos |
| **Claude** | Revisión de código, errores, mejoras técnicas |
| **Gemini** | Segunda opinión, comparar soluciones, alternativas |
| **Cursor** | Leer todas las opiniones, revisar código, preparar implementación final |

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

## Opinión — Gemini

**Fecha:** 8 julio 2026

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

- [x] Cursor leyó opiniones de ChatGPT, Claude y Gemini (este documento).
- [x] Existe decisión clara para trabajo inmediato (seguridad `sync-partida` + inventario).
- [ ] **Pendiente:** implementar fases 1–2 y obtener OK del creador antes de refactor grande.
- [ ] Verificar que el cambio no rompe: login, guardar mapa admin, editor jugador, multijugador en móvil.

---

## Decisión final

**Responsable:** Cursor (con consenso ChatGPT + Claude + Gemini)  
**Fecha:** 8 julio 2026

### Qué se eligió

1. **Mantener v273** (socket-first para edición admin de jugadores) como solución actual de sync rápida.
2. **Próximo trabajo obligatorio:** cerrar huecos de seguridad en servidor (no más parches solo en cliente).
3. **No** reintroducir HTTP doble en cada guardado admin.
4. **Documentar** en este archivo antes de cada sprint grande.

### Por qué

- v273 cumple: menos datos, respuesta rápida, mismo patrón que `mundo:sync`.
- Los huecos de `sync-partida` e `updateInventory` violan las reglas del proyecto y son explotables.
- Unificar en API admin (solución C) es correcto pero demasiado invasivo para un solo PR; se planifica en fase 2.

### Archivos ya modificados recientemente (referencia)

| Versión | PR | Cambio principal |
|---------|-----|------------------|
| v272 | #101 | `statsT`, barras vida/hambre/xp, ban instantáneo |
| v273 | #102 | Sync admin rápida, tiendas, UI `admin-colocando` |

### Próximos archivos a modificar (seguridad)

- `server/routes/playerRoutes.js`
- `server/sockets.js`
- `server/auth.js` (helper `canEditPartida(req, perfilId)`)
- Tests manuales: intentar `sync-partida` con perfilId ajeno → debe fallar 403.

### Cómo probar que funciona

1. Admin edita inventario de jugador online → le llega al instante (socket).
2. Admin coloca tienda → Confirmar funciona; botones inferiores vivos al terminar.
3. Jugador normal llama `POST /sync-partida` con otro `perfilId` → **403**.
4. Consola no puede usar `player:updateInventory` para darse ítems (rechazado o ignorado).
5. `node --check` en todos los `js/` del cliente y servidor sin errores.

---

## DECISIÓN PARA EL CREADOR

**Problema:** El juego funciona en producción pero tiene huecos de seguridad (cualquier jugador podría pisar partidas ajenas o inventario si manipula sockets/HTTP). La sync admin ya es rápida (v273) pero la autoridad del servidor no es total.

**Solución elegida:**

- **Ya aplicado:** v272 + v273 (stats, ban, sync admin, tiendas, UI).
- **Siguiente paso recomendado:** 1–2 días de trabajo en servidor para validar `sync-partida` y cerrar `updateInventory`.

**Motivo:** Cumple las reglas 3 y 4 de este documento sin romper lo que ya juegan los usuarios.

**Cambios necesarios:** Ver tabla fases 1–2 en opinión Cursor.

**Riesgos:** Si solo mergeamos v273 sin seguridad, un jugador avanzado podría hacer trampas. Si implementamos seguridad sin avisar, cuentas con clientes muy viejos podrían fallar al sync (mitigar con versión mínima).

**Prueba recomendada:** Mergear #101 y #102 → Actualizar en móvil → Probar editor jugador + tienda → Luego aplicar fix de seguridad en servidor y redeploy Render.

---

## Historial de revisiones

| Fecha | Versión doc | Participantes | Notas |
|-------|-------------|---------------|-------|
| 2026-07-08 | 1.0 | ChatGPT, Claude, Gemini, Cursor | Documento inicial; estado post v273 |

---

## Objetivo final

Crear un juego GPS online donde:

- los jugadores vean el mismo mundo
- el ADM pueda crear contenido sin perderlo
- funcione con internet lento
- sea seguro contra trampas
- sea fácil de mantener

**Nuevas IA:** añadir fila en «Historial» y sección «Opinión — [nombre]» antes de tocar código.
