# Configuración estable — tcodm.com (v191+)

**Estado verificado:** jugadores en vivo, mapa del admin visible para todos al momento, Amigos y Sincronizar funcionando.

No cambiar estos puntos sin revisar este documento.

---

## Arquitectura en producción

| Pieza | URL / valor |
|-------|-------------|
| Juego (frontend) | https://tcodm.com |
| Servidor en vivo | `https://mariel-online.onrender.com` |
| Mundo público (lectura) | `GET /api/public/mundo` |
| Publicar mapa (admin) | `POST /api/player/sync-mundo` (JWT + nombre Randy/SoyCaos) |
| Admin en juego | Randy / SoyCaos (`CONFIG.adminNombre`, `CONFIG.adminAlias`) |
| Token JWT cliente | `localStorage` → `mariel_online_token` (`SyncServidor.TOKEN_KEY`) |

---

## Despliegue GitHub Pages (CRÍTICO)

Archivo: `.github/workflows/deploy-pages.yml`

```yaml
--exclude='/online'   # ✅ CORRECTO — solo excluye la carpeta raíz /online
```

**NUNCA usar** `--exclude='online'` sin la barra inicial: eso borra **`js/online/`** del sitio y rompe:

- `js/online/amigos.js` → botón Amigos muerto
- `js/online/multijugador.js` → sin jugadores en vivo
- `js/online/sync_servidor.js` → Sincronizar falla
- `js/online/chat.js` → sin chat

- Versión canónica: rama **`main`** (`version.json`), no `claude/...` (quedaba en v185 y no avisaba de actualizar).
- Tras cada merge a `main`, el workflow **sync-claude-from-main** actualiza `claude/web-rpg-gps-game-n3ybow` para que tcodm.com no vuelva a quedar atrás.

---

## Flujo que debe seguir funcionando

1. **Jugador entra** con contraseña → `_loginServidor` guarda token + clave en `mariel_clave_<perfilId>`.
2. **Admin edita mapa** → `_autoPublicar` / `_syncMapaServidor` sube a Render con `SyncServidor.publicar`.
3. **Sin token** (p. ej. tras actualizar) → `asegurarSesionServidor` re-loguea con clave guardada o modal en pantalla (no `prompt()` en móvil).
4. **Otros jugadores** leen mundo por socket + `/api/public/mundo` y ven pins/objetos al instante.
5. **Amigos** → `Amigos.iniciarUI()` en `principal.js` (no depender solo de `Multijugador.iniciar`).

---

## Archivos clave (no romper)

| Archivo | Rol |
|---------|-----|
| `js/online/sync_servidor.js` | Token propio, modal contraseña, `publicar`, `asegurarSesionServidor` |
| `js/online/multijugador.js` | Socket.io, jugadores en mapa, polling mundo |
| `js/online/amigos.js` | Panel amigos |
| `js/admin/admin.js` | `_syncMapaServidor`, `publicarMundo`, Sincronizar manual |
| `js/principal.js` | Arranque: `Amigos.iniciarUI()`, token servidor, multijugador |
| `js/usuarios/usuarios.js` | Login guarda clave; admin auto-sync tras entrar |
| `js/config/config.js` | `version`, `servidorOnline`, `adminNombre` / `adminAlias` |
| `sw.js` | `CACHE = mariel-explorer-v###` — subir versión al publicar |

---

## Al publicar una nueva versión

1. Subir `CONFIG.version`, `version.json`, `index.html` (`?v=`), `sw.js` (`CACHE`).
2. Fusionar a `main` → GitHub Actions despliega tcodm.com.
3. Comprobar:
   - `curl https://tcodm.com/version.json`
   - `curl -I https://tcodm.com/js/online/amigos.js` → debe ser **200**
4. Randy: entrar, **Sincronizar**, verificar que `/api/public/mundo` tiene objetos > 0.

---

## Render (servidor)

- UptimeRobot o similar para mantener despierto el plan gratis.
- Variables: `CORS_ORIGINS` con `https://tcodm.com`, `GAME_ADMIN_NAME` / aliases si aplica.
- El admin del juego en SQLite debe llamarse **randy** o **SoyCaos** para poder publicar el mapa.

---

*Última configuración estable documentada: v191 (jul 2026).*
