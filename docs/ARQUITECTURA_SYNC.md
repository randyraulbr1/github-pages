# Arquitectura de sincronización — Mariel Explorer (v275)

Referencia para depurar errores de cuentas, mapa y respaldo.  
**Última revisión:** 8 julio 2026 — rama `main`, Fases 1–2 seguridad/estabilidad.

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
│  Rama: main                                                 │
│  Archivo maestro: datos/mundo.json                          │
└─────────────────────────────────────────────────────────────┘
```

| Capa | Rol |
|------|-----|
| **Cliente** | UI, mapa Leaflet, panel admin, localStorage |
| **Servidor Render** | Fuente en vivo (sockets + REST), SQLite en memoria/disco efímero |
| **GitHub `mundo.json`** | Respaldo persistente gratis; se restaura tras cada redeploy |

**Regla de oro:** el servidor es la autoridad. El cliente envía intención; el servidor valida y empuja cambios (`mundo:sync`, `partida:sync`).

**Admin (v275):** permisos por `users.role = 'admin'` en SQLite + JWT con `role: 'admin'`. Los nombres reservados (`randy`, `SoyCaos`) siguen bloqueados en registro pero ya no son la única fuente de permisos.

---

## Archivos clave

### Cliente (`js/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `config/config.js` | `servidorOnline`, `repoPublicacion`, `ramaPublicacion`, `version` |
| `admin/admin.js` | Panel admin, pins del mapa, `_jsonMundo()`, `publicarMundo()`, `_eliminarPin()` |
| `mundo/mundo_publico.js` | Descarga mundo (`descargar()`), `mundoEsValido()`, cuentas |
| `online/sync_servidor.js` | `publicar()` → POST `/api/player/sync-mundo`, `obtenerMundo()` |
| `online/multijugador.js` | Socket.io, evento `mundo:sync`, merge `statsT` |
| `guardado/guardado.js` | Partida local, `statsT`, sync stats al servidor |
| `usuarios/usuarios.js` | Login/registro, `cerrarSesion()` → `location.reload()` |

### Servidor (`server/`)

| Archivo | Responsabilidad |
|---------|-----------------|
| `server.js` | Arranque, `assertProductionSecrets()`, purga blindada |
| `auth.js` | JWT, `users.role`, `canEditPartida`, `gameAdminMiddleware` |
| `db.js` | SQLite: `users` (con `role`), `players`, `world_snapshot`, chat |
| `playerStats.js` | Topes HP/hambre/XP autoritativos (Fase 2.3) |
| `auditLog.js` | Auditoría ediciones admin sobre partidas ajenas (Fase 2.4) |
| `syncMundo.js` | `actualizarPartidaEnSnapshot()` — no emite si datos iguales |
| `syncCuentas.js` | Reconciliación jugadores, purga con guardas |
| `routes/playerRoutes.js` | `POST /sync-partida` (auth dueño o admin) |
| `routes/authRoutes.js` | `POST /register` (bloquea nombres admin), login |
| `sockets.js` | Multijugador, `player:updateStats`, admin sockets |

### Datos

| Ruta | Contenido |
|------|-----------|
| `datos/mundo.json` | Snapshot global: mapa + jugadores + partidas + config |

---

## Roles y seguridad (v274–v275)

| Mecanismo | Qué hace |
|-----------|----------|
| `users.role` | `'player'` o `'admin'`; migración automática al arrancar |
| JWT `role` | Incluido en token al login/registro |
| `POST /register` | Rechaza nombres reservados de admin |
| `POST /sync-partida` | Solo dueño del `perfilId` o admin (`partidaAuthMiddleware`) |
| `player:updateInventory` | **Rechazado** — cliente no manda inventario crudo |
| `player:updateStats` | Servidor acota HP/hambre/XP; `partidaMin` validado |
| `actualizarPartidaEnSnapshot` | No guarda ni emite `partida:sync` si datos JSON iguales (fix parpadeo v236) |
| Purga cuentas | Omitida si snapshot &lt; SQLite; `soloAdmin` solo con `ALLOW_SOLO_ADMIN_PURGE=1` |
| Auditoría | `eventLog` tipo `admin_partida_edit` cuando admin edita partida ajena |

---

## Timestamps de partida

| Campo | Uso |
|-------|-----|
| `t` | Timestamp general de la partida en snapshot |
| `statsT` | Vida/hambre/XP/nivel — merge en cliente prioriza el más reciente |
| `nubeT` | Sync de inventario/mochila |

**v275:** si `statsT` sube pero los `datos` no cambian, el servidor **no** re-emite `partida:sync` (evita revertir curas en el cliente).

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
  "partidas": { "perfilId": { "datos": {...}, "t": timestamp, "statsT": timestamp } },
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

---

## Flujos principales

### 1. Arranque del servidor (Render redeploy)

```
server.js
  → assertProductionSecrets()
  → initDb() + migrate users.role
  → restaurarMundoAlArranque()
  → reconciliarCuentasEnSnapshot() (con guardas anti-purga)
```

### 2. Registro / login

```
POST /api/register → role 'player' (nombres admin bloqueados)
POST /api/login-game → JWT con role desde users.role
```

Admin existente (`randy`/`SoyCaos`): migración asigna `role='admin'` al arrancar.

### 3. Admin publica el mundo

```
SyncServidor.publicar() → POST /api/player/sync-mundo (JWT role=admin)
  → syncMundoFromJson() → push GitHub → io.emit('mundo:sync')
```

### 4. Sync stats jugador

```
Cliente: player:updateStats + partidaMin + statsT
  → servidor valida HP/hambre/XP
  → actualizarPartidaEnSnapshot (solo si datos cambiaron)
  → partida:sync a todos (si hubo cambio)
```

### 5. Admin edita jugador

```
admin:updatePlayerPartida o POST /sync-partida
  → canEditPartida (admin OK)
  → auditLog admin_partida_edit si perfil ajeno
```

---

## Variables de entorno (Render)

| Variable | Uso |
|----------|-----|
| `JWT_SECRET` | **Obligatorio** en producción (no usar default dev) |
| `GITHUB_TOKEN` | Subir `mundo.json` tras cambios |
| `GITHUB_REPO` | `randyraulbr1/github-pages` |
| `GITHUB_BRANCH` | `main` |
| `GAME_ADMIN_NAME` / `GAME_ADMIN_ALIASES` | Nombres para migración role=admin |
| `ALLOW_SOLO_ADMIN_PURGE` | `1` para habilitar purga solo-admin (peligroso) |
| `CORS_ORIGINS` | `https://tcodm.com`, GitHub Pages |

---

## Endpoints REST útiles

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/health` | No | Estado del servidor |
| GET | `/api/public/mundo` | No | Snapshot completo |
| GET | `/api/public/cuentas` | No | Lista jugadores para login |
| POST | `/api/login-game` | No | Login (JWT con role) |
| POST | `/api/register` | No | Registro (sin nombres admin) |
| POST | `/api/player/sync-mundo` | Admin JWT | Publicar mundo |
| POST | `/api/player/sync-partida` | JWT dueño/admin | Sync vida/partida PWA |
| POST | `/api/player/registrar-cuenta` | JWT | Actualizar cuenta en snapshot |

---

## Roadmap arquitectura (IA_TEAM_REVIEW.md)

| Fase | Estado | Objetivo |
|------|--------|----------|
| 1 Seguridad v274 | ✅ | sync-partida, JWT, purga, updateInventory |
| 2 Estabilidad v275 | ✅ | roles, stats estables, tope HP, auditoría |
| 3 Mundo fuente única v276+ | 🔄 | 3.1+3.2 hechos: `world_content`, proyector BD→blob, doble lectura |
| 4 Rendimiento GPS v277+ | 📋 | Interest management, deltas |

---

## Versión y despliegue

- Versión actual: **v276** (`js/config/config.js`, `version.json`)
- Frontend: GitHub Pages — rama **`main`** (`tcodm.com`)
- Backend: Render auto-deploy desde `main` (carpeta `server/`)
- Ver también: `docs/RENDER_GRATIS.md`, `IA_TEAM_REVIEW.md`
