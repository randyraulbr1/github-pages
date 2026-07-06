# Enemigos — movimiento online y círculos (guía de reparación)

Documento de referencia si los enemigos vuelven a **teletransportarse**, **quedarse fijos** o **no persiguen** jugadores.

## Comportamiento correcto

1. **Círculos rojo y amarillo** van **con el enemigo** (centrados en `e.pos`, no en el spawn).
2. **Zona roja**: si un jugador está dentro (medido desde la posición actual del enemigo), el servidor lo persigue.
3. **Ataque**: el más cercano dentro del círculo amarillo.
4. **Vuelta al spawn** (`posOrigen` / `origenX`/`origenY`): solo si **nadie** está en la zona roja; caminando paso a paso, sin salto.
5. **Multijugador**: el servidor mueve; los clientes solo **interpolan** (`_posViva`, `world:updateObject`). Sin movimiento local duplicado en online.

## Archivos clave

| Archivo | Rol |
|---------|-----|
| `server/enemyAI.js` | IA: persigue, ataca, vuelve al origen |
| `server/syncMundo.js` | Al sincronizar mundo **no** resetea `x/y` de enemigos existentes |
| `js/enemigos/enemigos.js` | Mapa, círculos, interpolación cliente |
| `js/online/multijugador.js` | `world:updateObject`, `game:init` → `worldObjects` |
| `js/admin/admin.js` | `_aplicarMundoRemoto` — no usar spawn de `mundo.json` como posición viva |

## Causas típicas de teletransporte (v93–v95)

### 1. `syncMundo` reseteaba posición al publicar
Cada sync ponía `x,y` del enemigo al spawn de `mundo.json`.

**Fix:** en `upsertWorldObject`, si `type === 'enemy'` y ya existe, **no** actualizar `x`/`y`.

### 2. Cliente recargaba mundo cada 4 s
`_pullMundoServidor` → `_aplicarMundoRemoto` → `Enemigos._recargar()` leía `Admin.posiciones[id]` (spawn) y saltaba al origen.

**Fix:**
- `_posViva` + posición del **marcador** como fuente de verdad en online.
- `_recargar()` nunca pisa `e.pos` si hay marcador o `_posViva`.
- No guardar posición viva del enemigo en `Admin.publicado.posiciones`.

### 3. Doble movimiento cliente + servidor
El `_tick` local perseguía o devolvía al origen mientras el servidor hacía lo mismo.

**Fix:** si `Multijugador.activo`, el cliente solo aplica `_aplicarInterp()`; sin lógica de chase/return local.

## Interpolación cliente

```text
actualizarDesdeServidor(origenId, lat, lng, data)
  → _posViva[id] = [lat, lng]
  → _interp desde marcador actual hasta [lat, lng] (~520 ms, ease-out)
  → _moverEnemigo mueve pin + círculos juntos
```

## Zona de aggro (servidor)

```javascript
// Correcto: desde posición ACTUAL del enemigo
distanceMeters(obj.x, obj.y, player.x, player.y) <= radioZona

// Incorrecto para círculos móviles: medir solo desde origen fijo
```

## Círculos en el mapa (cliente)

```javascript
_centroZona(e) → e.pos  // sigue al enemigo
_moverEnemigo() → _sincronizarZonas()  // círculos con el pin
```

`posOrigen` solo sirve para **volver a casa** cuando no hay jugadores en zona.

## Despliegue tras cambios

1. **Render**: redeploy si tocas `server/enemyAI.js` o `server/syncMundo.js`.
2. **GitHub Pages**: merge a `claude/web-rpg-gps-game-n3ybow`, subir `CONFIG.version` y `sw.js` CACHE.
3. **Jugadores**: borrar **datos del sitio** (no solo caché) por el service worker.

### 4. Admin movió enemigo en Organizar pines (v119)
Al publicar, `upsertWorldObject` no actualizaba `x/y` en SQLite — la IA seguía desde la posición vieja y el cliente recibía teletransporte.

**Fix:**
- Servidor: si `origenX/originY` cambió en `mundo.json`, resetear `x`, `y` y emitir `world:updateObject`.
- Cliente: `_adminMovidoPos` ignora posiciones obsoletas del servidor; `fijarPosicion` mantiene `_posViva` y refresca distancia al jugador.
## Versiones

- **v119**: admin mueve enemigo — servidor actualiza x/y si cambió origen; cliente anti-teletransporte.
- **v93–v94**: anti-teletransporte, zona desde origen (círculos fijos — revertido en v96).
