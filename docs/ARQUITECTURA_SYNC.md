# Arquitectura de sincronización — Mariel Explorer (v105)

Referencia para depurar errores de cuentas, mapa y respaldo.  
**Última revisión:** julio 2026 — plan Render gratis (sin disco persistente).

---

## Vista general

```
┌─────────────────┐     HTTPS/WSS      ┌──────────────────────┐
│  Cliente (web)  │ ◄────────────────► │  Servidor (Render)   │
│  tcodm.com      │   JWT + sockets    │  mariel-online       │
│  GitHub Pages   │                    │  SQLite efímero      │
└────────┬────────┘                    └──────────┬───────────┘
         │                                        │
         │  lectura pública                       │ push/pull
         ▼                                        ▼
┌─────────────────────────────────────────────────────────────┐
│  GitHub: randyraulbr1/github-pages                          │
│  Rama: claude/web-rpg-gps-game-n3ybow                       │
│  Archivo maestro: datos/mundo.json                          │
└─────────────────────────────────────────────────────────────┘
```

| Capa | Rol |
|------|-----|
| **Cliente** | UI, mapa Leaflet, panel admin, localStorage |
| **Servidor Render** | Fuente en vivo (sockets + REST), SQLite en memoria/disco efímero |
| **GitHub `mundo.json`** | Respaldo persistente gratis; se restaura tras cada redeploy |

**Regla de oro:** el admin debe tener **sesión JWT** en el servidor (`SyncServidor.puedePublicar()`) para que crear/borrar llegue a Render y GitHub.

---

## Archivos clave

### Cliente (`js/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `config/config.js` | `servidorOnline`, `repoPublicacion`, `ramaPublicacion`, `version` |
| `admin/admin.js` | Panel admin, pins del mapa, `_jsonMundo()`, `publicarMundo()`, `_eliminarPin()` |
| `mundo/mundo_publico.js` | Descarga mundo (`descargar()`), `mundoEsValido()`, cuentas |
| `online/sync_servidor.js` | `publicar()` → POST `/api/player/sync-mundo`, `obtenerMundo()` |
| `online/multijugador.js` | Socket.io, evento `mundo:sync` |
| `usuarios/usuarios.js` | Login/registro, `cerrarSesion()` → `location.reload()` |

### Servidor (`server/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `server.js` | Arranque → `restaurarMundoAlArranque()` |
| `importSnapshot.js` | Descarga `mundo.json` de GitHub al iniciar |
| `githubMundo.js` | `fetchMundoFromGitHub()`, `pushMundoToGitHub()` |
| `syncMundo.js` | `syncMundoFromJson()` — aplica mundo del admin a SQLite |
| `syncCuentas.js` | Reconciliación jugadores, `purgarCuentasFueraDeSnapshot()` |
| `db.js` | SQLite: `users`, `players`, `world_snapshot`, `world_objects`, chat |
| `routes/playerRoutes.js` | `POST /sync-mundo`, `POST /registrar-cuenta` |
| `routes/authRoutes.js` | `POST /login-game`, `GET /public/mundo`, `GET /public/cuentas` |

### Datos

| Ruta | Contenido |
|------|-----------|
| `datos/mundo.json` | Snapshot global: mapa + jugadores + partidas + config |

---

## Estructura de `datos/mundo.json`

```json
{
  "actualizadoEn": 1234567890,
  "misiones": [],
  "tesoros": [],
  "objetos": [],
  "enemigos": [],
  "tiendasAdmin": [],
  "posiciones": { "id_pin": [lat, lng] },
  "eliminados": ["id_borrado"],
  "jugadores": [{ "id", "nombre", "telefono", "pinHash", "creado" }],
  "partidas": { "perfilId": { "datos": {...}, "t": timestamp } },
  "cofres": [],
  "precios": {},
  "itemsNuevos": [],
  "baneados": [],
  "mensajes": [],
  "enemigosEstado": {},
  "objetosEstado": {},
  "tesorosEstado": {},
  "tiendasStock": {},
  "combate": {},
  "mantenimiento": { "activo": false, "mensaje": "" }
}
```

- **`eliminados`**: IDs de pins que el admin borró pero que existían en versiones anteriores.
- **`actualizadoEn`**: timestamp de la última publicación; el cliente usa el más reciente.
- Los pins nuevos del admin suelen tener id `admx_*` (borrador local hasta publicar).

---

## Flujos principales

### 1. Arranque del servidor (Render redeploy)

```
server.js
  → restaurarMundoAlArranque()
      → fetchMundoFromGitHub()     # lectura pública, sin token
      → merge jugadores + partidas
      → saveWorldSnapshot()        # SQLite
  → reconciliarCuentasEnSnapshot()
```

SQLite se vacía en cada redeploy; **GitHub es la memoria a largo plazo**.

### 2. Registro / login de jugador

```
Cliente: POST /api/login-game o /api/register
  → authRoutes: bcrypt o pinHash legacy en snapshot
  → respaldarCuentasEnGitHub()   # requiere GITHUB_TOKEN en Render
```

### 3. Admin publica el mundo (mapa o cuentas)

```
Admin.guardar() / _eliminarPin() / _guardarCrearJugador()
  → _publicarParaTodos()
      → publicarMundo()
          → _jsonMundo()           # filtra eliminados, junta listas
          → SyncServidor.publicar()
              → POST /api/player/sync-mundo  (JWT admin)
                  → syncMundoFromJson()
                      → actualiza world_snapshot + world_objects
                      → pushMundoToGitHub()
                      → io.emit('mundo:sync')
```

**Requisito:** token en `localStorage` (`Multijugador.TOKEN_KEY`) = admin logueado en servidor.

### 4. Jugador entra / cambia de cuenta

```
Usuarios.cerrarSesion() → location.reload()
  → Admin.cargar() / MundoPublico.descargar()
      → GET /api/public/mundo  (o /api/player/mundo con token)
      → si falla servidor → fallback GitHub raw
  → Admin._aplicarMundoRemoto() → pinta pins en mapa
```

### 5. Borrar pin del mapa

```
Admin._eliminarPin()
  → quita de datos.misiones/tesoros/objetos/enemigos/tiendasAdmin
  → añade id a datos.eliminados (si ya estaba publicado)
  → borra posiciones[id]
  → _publicarParaTodos(true)
```

Al publicar, `_jsonMundo()` **no incluye** items en `eliminados` y limpia `posiciones` huérfanas.

### 6. Crear / eliminar jugador (panel admin)

| Acción | Cliente | Servidor |
|--------|---------|----------|
| Crear | `MundoPublico.guardarCuenta()` + `_publicarParaTodos()` | `registrarCuentaEnSnapshot` + `sync-mundo` + GitHub |
| Eliminar | `_eliminarJugadorCuenta()` + `_publicarParaTodos({ confiarLocal: true })` | Lista `jugadores[]` manda; `purgarCuentasFueraDeSnapshot()` borra SQLite |

---

## Variables de entorno (Render)

| Variable | Uso |
|----------|-----|
| `GITHUB_TOKEN` | Subir `mundo.json` tras cambios (obligatorio para respaldo) |
| `GITHUB_REPO` | `randyraulbr1/github-pages` |
| `GITHUB_BRANCH` | `claude/web-rpg-gps-game-n3ybow` |
| `JWT_SECRET` | Tokens de sesión |
| `CORS_ORIGINS` | `https://tcodm.com`, GitHub Pages, etc. |

Sin `GITHUB_TOKEN`: el servidor funciona en vivo, pero **nuevas cuentas/cambios no persisten** tras redeploy.

---

## localStorage del cliente

| Clave | Contenido |
|-------|-----------|
| `mariel_admin_v1` | Borradores admin: `misiones`, `tesoros`, `objetos`, `eliminados`, `posiciones` |
| `mariel_explorer_v1` | Lista de perfiles locales |
| `mariel_explorer_v1::{id}` | Partida guardada por jugador |
| Token JWT | `Multijugador.TOKEN_KEY` — sesión servidor |

El admin combina `publicado` (servidor/GitHub) + `datos` (local). Tras publicar, `_sincronizarEstadoTrasPublicar()` alinea ambos.

---

## Errores frecuentes y dónde mirar

| Síntoma | Causa probable | Qué revisar |
|---------|----------------|-------------|
| Cambios no persisten tras redeploy | Sin `GITHUB_TOKEN` o push fallido | Logs Render `[mundo] Respaldo GitHub`, env vars |
| "Inicia sesión para publicar" | Admin sin JWT | Login como admin en el juego |
| Jugador borrado reaparece | Merge antiguo de jugadores | `syncMundo.js` línea `jugadores[]` autoritativa; PR v105 |
| Pins borrados reaparecen al entrar | Cliente ignoraba mapa vacío | `mundo_publico.js` → `mundoEsValido()`; PR v105 |
| Cuentas desaparecen tras deploy | SQLite vacío y GitHub viejo | `datos/mundo.json` en GitHub, `restaurarMundoAlArranque` |
| Mapa desincronizado en vivo | Socket caído | `mundo:sync` en consola, `/health` del servidor |

### Comprobaciones rápidas

```bash
# Servidor vivo
curl https://mariel-online.onrender.com/health

# Cuentas en snapshot
curl https://mariel-online.onrender.com/api/public/cuentas

# Mundo público
curl https://mariel-online.onrender.com/api/public/mundo
```

En GitHub: revisar `datos/mundo.json` en la rama `claude/web-rpg-gps-game-n3ybow`.

---

## Endpoints REST útiles

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/health` | No | Estado del servidor |
| GET | `/api/public/mundo` | No | Snapshot completo |
| GET | `/api/public/cuentas` | No | Lista jugadores para login |
| POST | `/api/login-game` | No | Login (devuelve JWT) |
| POST | `/api/register` | No | Registro nuevo jugador |
| POST | `/api/player/sync-mundo` | Admin JWT | Publicar mundo desde panel |
| POST | `/api/player/registrar-cuenta` | JWT | Actualizar cuenta en snapshot |
| GET | `/api/player/mundo` | JWT | Mundo con auth |

---

## Diagrama: quién manda en cada dato

```
                    ┌─────────────────────────────────────┐
                    │         datos/mundo.json            │
                    │    (persistencia entre redeploys)   │
                    └─────────────────┬───────────────────┘
                                      │
              push al publicar ◄──────┼──────► pull al arrancar
                                      │
                    ┌─────────────────▼───────────────────┐
                    │     world_snapshot (SQLite)         │
                    │     fuente en vivo + sockets        │
                    └─────────────────┬───────────────────┘
                                      │
              mundo:sync / GET mundo ◄┘
                                      │
                    ┌─────────────────▼───────────────────┐
                    │     Cliente (todos los jugadores)   │
                    └───────────────────────────────────┘
```

**En partida normal:** el servidor manda.  
**Tras redeploy:** GitHub manda al arrancar; luego el servidor vuelve a ser la fuente en vivo.

---

## Versión y despliegue

- Versión actual: `js/config/config.js` → `version: '105'`
- Frontend: GitHub Pages (`tcodm.com`) — rama `claude/web-rpg-gps-game-n3ybow`
- Backend: Render auto-deploy desde la misma rama (carpeta `server/`)
- Ver también: `docs/RENDER_GRATIS.md`, `docs/ACTUALIZAR_RENDER.md`

---

## Cambios importantes v105

1. **`syncMundoFromJson`**: si el JSON trae `jugadores[]`, esa lista es la verdad (no re-fusionar del snapshot previo).
2. **`purgarCuentasFueraDeSnapshot`**: elimina de SQLite usuarios que el admin ya quitó.
3. **`confiarLocal`** al borrar jugador: no re-descargar cuentas antes de publicar.
4. **`mundoEsValido`**: acepta mundo con mapa vacío si tiene `actualizadoEn`, `jugadores` o `eliminados`.
5. **Posiciones**: se limpian al borrar pin y al publicar.
