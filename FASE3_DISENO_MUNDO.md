# FASE 3 — Diseño: una sola fuente de verdad del mundo

**Autor:** Claude
**Fecha:** 2026-07-08
**Estado:** 3.1+3.2 **IMPLEMENTADOS** en v276; 3.3+3.4 en v277; **3.5 IMPLEMENTADO** en v278 (`js/admin/admin.js`, `js/online/sync_servidor.js`). Pendiente: 3.6 (render cliente).
**Relacionado:** `IA_TEAM_REVIEW.md` (P3/P5), `CHATGPT_REVIEW.md` (P3), `CHATGPT_CURSOR_REVIEW.md`.

---

## 1. Objetivo

Que **todos los jugadores vean exactamente el mismo mundo** y que **lo que crea el admin no se pierda ni se duplique**, con el servidor como autoridad única. Sin romper el cliente en vivo y sin gastar más datos (regla 5).

**Principio (consenso ChatGPT + Claude):**
> La **base de datos del servidor = el mundo real**. El blob (`world_snapshot` / `datos/mundo.json`) y GitHub = **solo respaldo / proyección**. Nunca dos mundos distintos.

---

## 2. Estado actual REAL (leído del código v275, no suposiciones)

Importante: no es un caos total. Parte del camino **ya existe**.

**Lo que YA funciona bien:**
- `syncMundoFromJson` (server) **ya proyecta** `objetos` y `enemigos` del blob a la tabla `world_objects` con `upsertWorldObject(...)`.
- El cliente ya recibe `worldObjects` (desde la tabla) en `game:init` y los pinta con `MundoOnline` (`js/online/mundo_online.js`).
- Ya existen **eventos delta**: `world:updateObject`, `world:removeObject`, `world:cutTree`, `world:pickup`. O sea, la infraestructura de "actualizar un objeto sin reenviar todo" ya está.

**Lo que NO está unificado (el problema real):**
1. La **autoridad sigue siendo "el admin sube el mundo ENTERO"** (`POST /api/player/sync-mundo` → `syncMundoFromJson`), con merge last-writer-wins. Aunque luego proyecte a tablas, el punto de entrada es el blob completo.
2. **Tesoros, cofres, misiones, precios, `tiendasAdmin`, `tiendasStock`, mantenimiento, baneados, mensajes** viven **solo en el blob**; el cliente los lee del `mundoSnapshot`, no de tablas. No tienen tabla ni delta propio.
3. **`eliminados`** es un array plano en el blob. Al re-publicar el mundo entero, un objeto borrado puede "resucitar" si el merge no respeta bien `eliminados` → riesgo de duplicado/reaparición (justo el problema de "objetos del mapa" del creador).
4. La tabla `world_objects` y el blob pueden **divergir** si algo escribe uno y no el otro.

**Conclusión:** No hay que reescribir todo. Hay que (a) extender lo que ya funciona para objetos/enemigos a los demás tipos, y (b) cambiar la escritura del admin de "mundo entero" a "por objeto".

---

## 3. Opciones (sistema de decisión del equipo)

### Opción A — Normalizar TODO en tablas de golpe (big-bang)
Crear tablas para cada tipo (tesoros, cofres, misiones, tiendas...) y cambiar cliente y admin a la vez.
- **Ventajas:** arquitectura limpia final.
- **Desventajas:** refactor enorme en un PR; toca render del cliente, admin y sync juntos; **alto riesgo de romper el juego en vivo**. Va contra "no tocar muchas cosas a la vez".

### Opción B — Dejar el blob como única verdad (quitar tablas)
Ignorar `world_objects`/`missions` y que todo viva en el blob.
- **Ventajas:** menos código, cambio pequeño.
- **Desventajas:** el blob **no escala** (reescribe/reenvía el mundo entero); sigue el last-writer-wins; no da updates por objeto; malo para conexión lenta. **Contradice el principio del consenso.**

### Opción C — Incremental: tablas = verdad, blob = proyección generada *(RECOMENDADA)*
Extender el patrón que ya existe. La BD pasa a ser la verdad; el blob se **genera desde la BD** (no al revés) y se sigue enviando al cliente igual que hoy, así el cliente **no cambia** al principio.
- **Ventajas:** bajo riesgo, por pasos, sin romper el cliente; ataca last-writer-wins y duplicados; permite deltas y menos datos; reversible por paso.
- **Desventajas:** fase de transición con doble escritura (hay que verificar consistencia).

**Recomendación de Claude: Opción C.** Coincide con ChatGPT (BD = mundo real, snapshot = backup) y con el criterio de Cursor de no mezclar un refactor gigante con lo demás.

---

## 4. Diseño propuesto (Opción C)

### 4.1 Modelo de datos: una tabla genérica de contenido del mundo

En vez de muchas tablas (una por tipo), una sola tabla con **soft-delete (tombstone)** para resolver el problema de `eliminados`/duplicados de raíz:

```sql
CREATE TABLE IF NOT EXISTS world_content (
  id           TEXT PRIMARY KEY,      -- id estable del objeto (el mismo que usa el admin)
  type         TEXT NOT NULL,         -- 'item' | 'enemy' | 'treasure' | 'chest' | 'mission' | 'shop'
  x            REAL,
  y            REAL,
  state        TEXT NOT NULL DEFAULT 'active',
  data_json    TEXT NOT NULL DEFAULT '{}',
  deleted      INTEGER NOT NULL DEFAULT 0,   -- tombstone: 1 = borrado (no reaparece)
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by   TEXT                          -- playerId admin que lo cambió (auditoría)
);
CREATE INDEX IF NOT EXISTS idx_world_content_type ON world_content(type, deleted);
```

- **Tombstone** (`deleted=1`) en vez de borrar la fila: si el admin re-publica, un id borrado **no resucita**. Elimina el problema de "objeto borrado que vuelve" y de duplicados.
- Config global (precios, mantenimiento, baneados, mensajes, `tiendasStock`) que no son "objetos con posición" van en una tabla `world_config(key, value_json)` aparte (clave-valor), no en `world_content`.
- `players`, `partidas`, amigos, chat: **no se tocan** (ya están normalizados/aparte).

### 4.2 El "proyector": BD → blob (compatibilidad con el cliente)

Función nueva `construirSnapshotDesdeBD()` que arma el `mundoSnapshot` con **exactamente la misma forma** que hoy, leyendo de `world_content` + `world_config` + `players`/`partidas`. El servidor sigue:
- enviando `mundoSnapshot` en `game:init`,
- emitiendo `world:updateObject` / `world:removeObject` en cada cambio,
- respaldando a GitHub el blob generado.

→ **El cliente no cambia en esta fase.** Solo cambia de dónde sale el blob (ahora de la BD).

### 4.3 Escritura del admin: de "mundo entero" a "por objeto"

Nuevos endpoints/eventos autoritativos (protegidos por `gameAdminMiddleware` / `isGameAdminPlayer`):
- `world:adminUpsert { type, id, x, y, data }` → `upsert` en `world_content`, regenera proyección, emite delta a todos.
- `world:adminDelete { id }` → tombstone `deleted=1`, emite `world:removeObject`.
- `world:adminConfig { key, value }` → `world_config`.

El endpoint viejo `POST /sync-mundo` (mundo entero) se **mantiene temporalmente** como compatibilidad, pero internamente hace upsert por objeto respetando tombstones (no revive borrados). Se retira al final de la fase.

### 4.4 Migración (una sola vez, idempotente)

Al arrancar, si `world_content` está vacía: leer el blob actual (`world_snapshot` / `mundo.json`) y volcar cada `objeto/enemigo/tesoro/cofre/misión/tienda` a `world_content`, y precios/mantenimiento/baneados a `world_config`. A partir de ahí, la BD manda y el blob se genera.

---

## 5. Seguridad y NO pérdida de datos (regla clave del creador)

1. **Doble lectura en transición:** durante 1–2 versiones, comparar `construirSnapshotDesdeBD()` vs el blob viejo y loguear diferencias antes de confiar solo en la BD. No borrar el blob.
2. **Nunca vaciar `world_content` por un sync malo** (misma regla que la purga de cuentas de Fase 1: si la fuente entrante trae menos que lo que hay, no borrar; marcar y conservar).
3. **Tombstones**: borrar = marcar, no eliminar fila. Historial recuperable.
4. **Respaldo GitHub sigue igual** (respalda el blob generado + per-jugador). El throttle de 10 min no cambia.
5. **Fallback**: si la BD falla al arrancar, seguir sirviendo el último blob de GitHub (como hoy).

---

## 6. Plan por pasos (un PR pequeño por paso)

| Paso | Qué | Archivos | Rompe cliente |
|------|-----|----------|---------------|
| 3.1 | Crear `world_content` + `world_config` + migración idempotente desde el blob | `server/db.js`, `server/importMundo.js` | No |
| 3.2 | `construirSnapshotDesdeBD()` y **generar** el blob desde la BD (mismo formato) | `server/syncMundo.js` | No |
| 3.3 | Endpoints/eventos admin por objeto (`adminUpsert/adminDelete/adminConfig`) + tombstones | `server/sockets.js`, `server/routes/`, `server/auth.js` | No (se suma) |
| 3.4 | `sync-mundo` viejo pasa a upsert-por-objeto respetando tombstones (sin revivir borrados) | `server/syncMundo.js` | No |
| 3.5 | Cliente admin usa las ops por objeto en vez de publicar el mundo entero | `js/admin/admin.js` | Solo panel admin |
| 3.6 | (Opcional, más adelante) cliente lee tesoros/cofres/misiones desde deltas, no del blob | `js/online/`, `js/tesoros/`, `js/cofres/` | Sí — última, con cuidado |

Pasos 3.1–3.4 son **solo servidor** y no cambian lo que ve el jugador. 3.5 toca solo el panel admin. 3.6 es el único que toca el render y se hace al final, aislado.

---

## 7. Cómo probar (checklist Fase 3)

1. [ ] Migración: arrancar con un blob real → `world_content` queda con el mismo nº de objetos/enemigos/tesoros.
2. [ ] `construirSnapshotDesdeBD()` produce un blob **igual** al anterior (diff vacío en campos de mapa).
3. [ ] Admin crea un objeto → aparece en TODOS los jugadores online (delta) y en un jugador que entra después (game:init).
4. [ ] Admin borra un objeto → desaparece en todos y **no reaparece** tras re-publicar (tombstone).
5. [ ] Dos ediciones admin seguidas no se pisan (ya no es mundo-entero).
6. [ ] Reinicio de Render → el mundo se restaura idéntico desde BD/GitHub.
7. [ ] `node --check` en todo `server/` y `js/`.

---

## 8. Qué NO hacer

- No mezclar 3.6 (render del cliente) con los pasos de servidor.
- No borrar el blob ni las tablas viejas hasta validar la doble lectura (paso 5–6).
- No añadir features nuevas durante la Fase 3.
- No tocar `players`/`partidas`/amigos/chat (ya están bien).

---

## 9. Preguntas abiertas para el equipo

**Para ChatGPT (arquitectura):**
- ¿Tabla genérica `world_content` (mi propuesta, con tombstones) o una tabla por tipo? Yo prefiero la genérica por simplicidad y para resolver `eliminados` de raíz.
- ¿Confirmas que el blob debe quedar como *proyección generada* y no fuente?

**Para Cursor (implementación):**
- ¿Ves riesgo en generar el blob desde la BD manteniendo el MISMO formato que consume el cliente hoy? ¿Algún campo del `mundoSnapshot` que se me escape (revisar `_mundoVacio()` en `importSnapshot.js`)?
- ¿Prefieres empezar por 3.1+3.2 juntos (migración + proyector) en un PR y validar la doble lectura antes de tocar la escritura del admin?

---

## 10. Resumen para el creador

**Problema:** hoy el admin sube el mundo entero y parte del contenido (tesoros, cofres, misiones, tiendas) vive solo en el blob → riesgo de que se pierda, se duplique o que unos jugadores lo vean y otros no.

**Solución propuesta:** Opción C — la base de datos pasa a ser el mundo real; el blob se **genera** desde ella (el cliente no cambia al principio); el admin edita **por objeto** en vez de subir todo; y los borrados usan **tombstone** para que no reaparezcan.

**Por qué:** es la más segura contra pérdida de datos, la que menos datos gasta y la de menor riesgo (por pasos, sin romper el juego en vivo).

**Riesgo:** bajo si se hace por pasos (3.1–3.4 son solo servidor). El único paso delicado (3.6, render del cliente) va al final y aislado.

**Prueba:** checklist de 7 puntos arriba.

*Esperando visto bueno de ChatGPT y Cursor antes de programar.*

**Actualización 8 jul 2026:** ChatGPT y Claude aprobaron Fases 1–2. Cursor respondió las preguntas abiertas (§9) en `IA_TEAM_REVIEW.md` → «DECISIÓN CURSOR — consenso Fase 3». **Diseño cerrado** — pendiente OK del creador para programar 3.1+3.2.
