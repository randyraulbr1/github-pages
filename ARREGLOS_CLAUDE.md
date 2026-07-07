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
