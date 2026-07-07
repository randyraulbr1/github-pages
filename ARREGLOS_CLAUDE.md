# 🔧 Arreglos hechos por Claude (para Cursor)

Registro de errores que rompían el juego en vivo y cómo se arreglaron.
Todos verificados en un navegador real antes de subir.

> **Antes de trabajar en Cursor: haz `git pull`** para tener estos arreglos.
> El servidor de Render hace commits automáticos (`sync jugador...`) todo el
> tiempo, así que la rama cambia sola: siempre `git pull` antes de editar.

---

## v234 — El mapa no cargaba

**Archivo:** `js/notificaciones/notificaciones.js` (función `_mostrarToast`)

**Qué pasaba:** la variable `txt` estaba declarada **dos veces con `const`
en el mismo bloque** (líneas ~164 y ~173):
```js
const txt = this._toastEl.querySelector('.notif-texto');   // línea 164
...
const txt = this._toastEl.querySelector('.notif-texto');   // línea 173  ← duplicada
```
Eso es un **error de sintaxis** (`Identifier 'txt' has already been declared`).
Como el archivo carga al principio, el error **cortaba la carga de todos los
scripts siguientes** → el mapa (Leaflet) no arrancaba.

**Arreglo:** se eliminó la segunda declaración (la variable ya existía).

**Lección:** un solo `const` repetido rompe TODO el juego. Revisar con
`node --check archivo.js` antes de subir.

---

## v235 — El mapa cargaba pero los botones no abrían

**Archivos:** `js/admin/admin.js` (`_esCuentaProtegida`) y
`js/usuarios/usuarios.js` (`esAdministrador`)

**Qué pasaba:** **recursión infinita** entre dos funciones:
- `Usuarios.esAdministrador()` llamaba a `Admin._esCuentaProtegida(p)`
- `Admin._esCuentaProtegida(p)` volvía a llamar a `Usuarios.esAdministrador()`
- → bucle infinito → `Maximum call stack size exceeded`

Ese error reventaba el arranque **justo antes de enchufar los botones**, por
eso el mapa se veía pero los botones estaban muertos.

**Arreglo:** en `_esCuentaProtegida` se quitó la llamada de vuelta a
`Usuarios.esAdministrador()`. Ahora comprueba si la cuenta es admin
directamente (nombre, alias, `adminId`, `jugadoresPinAdmin`), sin recursión.

**Lección:** si la función A llama a B y B llama a A, hay que asegurarse de
que una de las dos corta el círculo con una comprobación directa.

---

## v236 — Notificación "El administrador actualizó tu personaje" en bucle

**Archivo:** `js/online/multijugador.js` (`_aplicarPartidaAdminEnMi`)

**Qué pasaba:** cuando el servidor reenvía la partida del jugador (cosa que
hace a menudo, con una hora `t` nueva cada vez), se mostraba el aviso
*"✏️ El administrador actualizó tu personaje"*. Como el reenvío es frecuente,
**el aviso salía una y otra vez en bucle**.

**Arreglo:** se eliminó esa notificación. El cambio del personaje se sigue
aplicando en silencio (dinero/vida/mochila), solo que ya no muestra el toast.

**Nota para revisar más adelante (opcional):** la causa de fondo es que el
servidor reenvía la partida con `t = Date.now()` nuevo cada vez, así que el
guardia `if (t <= nubeT) return;` nunca frena. Si en el futuro se ve que el
dinero/vida "parpadea" o se revierte solo, conviene que el servidor mande un
`t` **estable** (que solo cambie cuando el admin edita de verdad), no en cada
reenvío. Así el guardia funcionaría y no se re-aplicaría en cada ciclo.

---

## Cómo evitar que se repita

1. Antes de subir, correr en la carpeta del proyecto:
   ```
   for f in $(find js -name '*.js'); do node --check "$f" || echo "ROTO: $f"; done
   ```
   Si algo sale "ROTO", hay un error de sintaxis que romperá el juego.
2. Subir la `version` (en `sw.js`, `js/config/config.js` y `version.json`)
   en cada cambio, para que los jugadores reciban la versión nueva.

---

## v237 — Escudo anti-repetición de notificaciones

**Archivo:** `js/notificaciones/notificaciones.js`

**Qué se añadió:** un freno de tiempo (`_estaThrottled`): la MISMA
notificación no se vuelve a mostrar en pantalla si salió hace menos de 12
segundos. Así no se repiten en bucle las mismas.

**Excepción:** las de recoger objetos/recompensas SIEMPRE se muestran
(`_CLAVES_SIEMPRE`: inventario:recoger, inventario:saqueo, tesoro,
mision:completada, vida:nivel, vida:revivir).

Para cambiar el tiempo, editar `_MS_ANTIREPETICION` (en milisegundos).

## Nota sobre el inventario (v237)

Probado en navegador (ratón y táctil): MOVER y USAR objetos FUNCIONAN.
- Mover: arrastrar el objeto de una casilla a otra.
- Usar consumible: arrastrarlo y soltarlo sobre el botón ✔️ que aparece
  mientras arrastras (tocar la casilla sola NO abre menú en esta versión).
Si un jugador dice que "no funciona", casi seguro tiene la versión ROTA
en caché (la recursión de v235 impedía que se enchufaran los controles).
Solución: actualizar del todo (cerrar app, abrir 2 veces, o borrar caché).

---

# 📢 PARA CURSOR — Estado y única tarea pendiente

## ✅ YA ESTÁ TODO ARREGLADO (por Claude, en `main` v238)

- v234: mapa no cargaba (variable `txt` duplicada en notificaciones.js) → resuelto
- v235: botones muertos (recursión `esAdministrador ↔ _esCuentaProtegida`) → resuelto
- v236: notificación "El administrador actualizó tu personaje" en bucle → quitada
- v237: escudo anti-repetición de notificaciones (12s, salvo recoger/recompensas)
- v238: inventario no se podía mover/usar en el móvil → **resuelto**
  (el redibujado del servidor cortaba el arrastre; ahora `Mochila.pintar()`
   no redibuja mientras `isDragging`)
- `main` unificado con la rama de trabajo, versiones consistentes (238),
  sintaxis verificada en los 33 archivos del cliente y 24 del servidor.

**No hace falta re-arreglar nada de lo anterior. Todo está en `main`.**

## 🔴 ÚNICA TAREA PENDIENTE — bajar los respaldos del servidor

**Problema:** el servidor hace ~4.373 commits/día a GitHub (~3/min) porque
respalda en CADA acción del jugador (y se mueven por GPS constantemente).
Esto gasta minutos de Actions, ensucia el historial y puede hacer que
**GitHub bloquee los push por exceso**. Fue la raíz de los bugs de hoy.

**Solución — respaldo con freno (throttle):** respaldar como mucho cada
10 minutos, no en cada acción. Solo respaldar al instante los eventos
importantes (registro de cuenta, admin publica mundo, borrar cuenta).

**Pasos concretos:**

1. Crear `server/respaldoThrottle.js`:
```js
let pendiente = false;
const MIN_MS = 10 * 60 * 1000; // 10 min

function pedirRespaldo() { pendiente = true; }

async function _ejecutar() {
  if (!pendiente) return;
  pendiente = false;
  try {
    const { getWorldSnapshot } = require('./db');
    const snap = getWorldSnapshot();
    if (!snap) return;
    const { pushMundoToGitHub } = require('./githubMundo');
    const { respaldarJugadoresEnGitHub } = require('./jugadoresBackup');
    await pushMundoToGitHub(snap).catch(() => {});
    await respaldarJugadoresEnGitHub(snap).catch(() => {});
  } catch (e) { /* */ }
}

function iniciarRespaldoThrottle() { setInterval(_ejecutar, MIN_MS); }
async function respaldoInmediato() { pendiente = true; await _ejecutar(); }

module.exports = { pedirRespaldo, iniciarRespaldoThrottle, respaldoInmediato };
```

2. En `server/server.js` (arranque): llamar `iniciarRespaldoThrottle()`.

3. En las rutas/paths FRECUENTES (movimiento, stats, `sync-partida`,
   `syncMundoFromJson` en `syncMundo.js`): cambiar las llamadas directas
   `respaldarJugadoresEnGitHubAsync(mundo)` / `pushMundoToGitHub(mundo)`
   por `pedirRespaldo()`.

4. Dejar respaldo INMEDIATO (`respaldoInmediato()` o la llamada directa)
   SOLO en: registro de cuenta nueva (authRoutes), admin publica el mundo
   (`/api/player/sync-mundo`), y borrar cuenta.

**Resultado:** de ~4.373 commits/día a máximo ~144/día, y solo cuando algo
cambió de verdad. (Extra recomendado: que la partida se reenvíe al cliente
con una hora `t` estable, que solo cambie cuando el admin edita, no en cada
ciclo — así se evita todo repintado innecesario.)
