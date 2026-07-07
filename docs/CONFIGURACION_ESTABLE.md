# Configuración estable — tcodm.com (v191+)

**Estado verificado (v194–v195):** jugadores en vivo, mapa del admin visible en **cualquier dispositivo** tras limpiar caché, Amigos y Sincronizar funcionando. Organizar pines solo con el cuadrito azul ⊞.

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
6. **Borrar caché / nuevo dispositivo** → el servidor es la fuente de verdad; el cliente descarga el mundo completo. El admin no debe perder pins locales si el servidor llega con menos contenido (v194).

---

## Multi-dispositivo y persistencia del mapa (v194+)

| Protección | Dónde |
|------------|-------|
| No sobrescribir mapa local si el servidor tiene menos objetos | `Admin.refrescarMundoTrasLogin` + `_contarMapaAdminCompleto` |
| Backup del admin antes de actualizar | `mariel_admin_backup_v1` en `version_app.js` |
| Caché de amigos entre sesiones | `mariel_amigos_social_v1` en `amigos.js` |
| Aviso «Actualizar» al instante | `version.json` en `main` + `MarielVersion` |

**Comprobación:** Randy sincroniza → otro móvil borra caché → entra → ve mapa y jugadores en vivo.

---

## HUD izquierdo (barras + botones)

Estructura en `index.html`:

- `#hud-nucleo-fijo` → barras de vida/hambre/XP + botones ⚙️👤🔔 (tamaño **fijo**).
- `#letrero-misiones` y `#letrero-pin-chat` → **fuera** del núcleo, debajo, sin estirar las barras.

CSS (`css/estilos.css`): `#hud-nucleo-fijo` con `width` / `min-width` / `max-width` iguales; Wi‑Fi en `position: absolute; right: -22px`.

---

## Admin: organizar pines (cuadrito azul ⊞)

Modo **Organizar** (`Admin.entrarModo('organizar')`):

1. Cada pin muestra **⊞ cuadrito azul** (`.admin-pin-grip`) y **✕ rojo** (`.admin-pin-x`).
2. **Solo** al tocar/arrastrar el cuadrito azul se activa el movimiento (no arrastrar el icono directamente).
3. En móvil, el mismo gesto desde el cuadrito inicia el arrastre Leaflet.
4. Texto en pantalla: «⊞ Arrastra con el cuadrito · ✕ borra el pin».

Archivos: `js/admin/admin.js` → `_arrastreOrganizarMarcador`; `css/estilos.css` → `.admin-pin-grip`.

---

## Ataúdes ⚰️ en el mapa

Al tocar un ataúd (`Multijugador.cuerposMarcadores`):

1. Se abre un popup con **🩹 Revivir** (requiere botiquín y estar a ≤50 m).
2. Si el muerto tenía objetos, lista cada ítem con botón **Saquear** (cualquier jugador vivo cerca).
3. Tras salir del modo Organizar admin, los ataúdes recuperan el toque (`_restaurarToqueAtaud`).

Archivos: `js/online/multijugador.js` → `_enlazarToqueAtaud`, `saquearMuerto`, `revivirJugador`.

---

## Archivos clave (no romper)

| Archivo | Rol |
|---------|-----|
| `js/online/sync_servidor.js` | Token propio, modal contraseña, `publicar`, `asegurarSesionServidor` |
| `js/online/multijugador.js` | Socket.io, jugadores en mapa, polling mundo |
| `js/online/amigos.js` | Panel amigos + caché social |
| `js/admin/admin.js` | `_syncMapaServidor`, `publicarMundo`, Sincronizar, organizar pines |
| `js/principal.js` | Arranque: `Amigos.iniciarUI()`, token servidor, multijugador |
| `js/usuarios/usuarios.js` | Login guarda clave; admin auto-sync tras entrar |
| `js/nucleo/version_app.js` | Aviso actualizar + backup admin |
| `js/config/config.js` | `version`, `servidorOnline`, `adminNombre` / `adminAlias` |
| `sw.js` | `CACHE = mariel-explorer-v###` — subir versión al publicar |
| `css/estilos.css` | HUD fijo + estilos pin admin |
| `index.html` | Estructura `#hud-nucleo-fijo` |

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

*Última configuración estable documentada: v196 (jul 2026).*
