# INVENTARIO_BACKUP_MARIEL — Mariel Explorer (Legacy)

> Generado para la separación definitiva de **Mariel Explorer** (`github-pages`) y **Kingdom GPS Editor** (`kingdom-gps-editor`).
> **No borrar** hasta confirmar que todas las copias funcionan.

## Punto de congelación (GitHub)

| Elemento | Valor |
|---|---|
| Repositorio origen | `https://github.com/randyraulbr1/github-pages` |
| Commit respaldado | `a9f783ab1f56e48342730132b01b525e42889237` |
| Fecha commit | 2026-07-12 00:00:49 +0000 |
| Mensaje | Merge pull request #142 from randyraulbr1/cursor/actualizar-proyecto-local-6add |
| Versión juego | `315` (`version.json`) |
| Rama permanente | `legacy-mariel-final` → mismo commit |
| Tag permanente | `mariel-final-backup` → mismo commit |

## Repositorio del panel nuevo (NO mezclar)

| Elemento | Valor |
|---|---|
| Panel nuevo | `https://github.com/randyraulbr1/kingdom-gps-editor` |
| Rama principal | `main` |
| Documento de continuidad | `SIGUIENTE_PASO.md` |

---

## Copia local esperada (Windows)

| Ruta | Contenido |
|---|---|
| `C:\Users\RANDY\Desktop\MarielExplorer_Legacy\` | Clon Git completo (con `.git` e historial) |
| `C:\Users\RANDY\Desktop\MarielExplorer_Legacy_Backup.zip` | ZIP del clon (sin secretos) |
| `C:\Users\RANDY\Desktop\MarielExplorer_Legacy\_LOCAL_NO_GIT\` | Archivos locales importantes fuera de Git |

---

## Archivos en Git (185 archivos rastreados)

### Cliente y UI
- `index.html` — pantalla principal del juego
- `css/` — estilos (estilos, chat, amigos, opciones, ui_components, etc.)
- `client/` — cliente online (`bootstrap.js`, `config.js`, `game.js`, `index.html`, `style.css`)
- `online/` — entrada online
- `js/` — lógica del juego (83 módulos verificados con typecheck)

### Módulos JS (`js/`)
| Carpeta | Contenido |
|---|---|
| `admin/` | Panel administración, catálogo objetos, depuración |
| `bolsas/` | Bolsas de drop en mapa |
| `chat/` | Chat multijugador |
| `cofres/` | Cofres |
| `config/` | Configuración general (`config.js`) |
| `correo/` | Sistema correo |
| `dinero/` | Economía |
| `enemigos/` | IA y combate enemigos |
| `gps/` | Posición jugador |
| `guardado/` | Save local con firma anti-manipulación |
| `historial/` | Historial encadenado dinero/objetos |
| `items/` | Catálogo de 50+ items |
| `mapa/` | Mapa Mariel |
| `misiones/` | 5 misiones con GPS |
| `mochila/` | Inventario 25 casillas |
| `mundo/` | Sincronización mundo |
| `notificaciones/` | Avisos HUD |
| `nucleo/` | Utilidades, UI manager, red |
| `online/` | Multijugador cliente |
| `opciones/` | Opciones |
| `pesca/` | Minijuego pesca |
| `tesoros/` | 6 tesoros ocultos |
| `tiendas/` | 5 tiendas |
| `usuarios/` | Login/registro |
| `vida/` | Barra de vida/hambre |

### Datos del juego (`datos/`)
| Archivo | Descripción |
|---|---|
| `datos/mundo.json` | Mundo compartido (objetos, misiones, mapa) |
| `datos/jugadores/indice.json` | Índice de cuentas respaldadas |
| `datos/jugadores/admin.json` | Cuenta admin |
| `datos/jugadores/srv_1.json`, `srv_2.json` | Cuentas servidor |
| `datos/jugadores/pmra42v1xlv3c5.json`, `pmrapfk1b6bc8o.json` | Cuentas jugador |
| `datos/backups/mundo-20260707-030906.json` | Backup mundo en repo |

### Servidor Node (`server/`)
- 41 archivos: Express + Socket.IO + SQLite
- Rutas: auth, player, world, friend, chat
- Módulos: economía, inventario, enemigos, backup GitHub, rate limit
- `server/.env.example` — plantilla de configuración (sin secretos)

### Assets y recursos
- `iconos/` — iconos PWA (192, 512)
- `faces/` — documentación de fases
- `lib/` — librerías externas
- `manifest.json`, `sw.js`, `version.json`, `CNAME`

### Despliegue y scripts
- `deploy/` — Oracle, Nginx, Caddy, systemd, backup servidor
- `scripts/` — smoke test, typecheck, build, actualizar-local.ps1
- `docs/` — migración Oracle, sync, Render, configuración estable
- `.github/workflows/` — CI, deploy Pages, smoke v299

### Documentación raíz
- `LEEME_JUEGO.md`, `COMO_FUNCIONA.md`, `ARQUITECTURA_ONLINE.md`
- `DESPLIEGUE_TCODM.md`, `FASE3_DISENO_MUNDO.md`, informes IA

---

## Archivos locales NO incluidos en Git (copiar aparte)

| Archivo / carpeta | Motivo | Acción |
|---|---|---|
| `server/.env` | Secretos JWT, tokens GitHub | Copiar a `_LOCAL_NO_GIT/server.env` |
| `server/data/` | SQLite en vivo (`game.sqlite`) | Copiar carpeta completa |
| `datos/clave_sync.json` | Token sync GitHub | Copiar si existe |
| `datos/clave_sync.local.json` | Token local | Copiar si existe |
| `node_modules/`, `server/node_modules/` | Regenerables | **No** incluir en ZIP |
| `MiProyectoKGPS/` (carpeta antigua) | Copia previa del usuario | Revisar manualmente antes de archivar |

---

## Respaldo remoto (FASE 2)

| Elemento | Estado |
|---|---|
| Rama `legacy-mariel-final` | Creada en `github-pages` |
| Tag `mariel-final-backup` | Creado en `github-pages` |
| Repo privado `mariel-explorer-legacy` | Pendiente — requiere creación manual por el propietario |

### Crear repo privado manualmente (si no se pudo automatizar)

```powershell
gh repo create randyraulbr1/mariel-explorer-legacy --private --description "Respaldo Mariel Explorer con historial"
git clone --mirror https://github.com/randyraulbr1/github-pages.git mariel-explorer-legacy.git
cd mariel-explorer-legacy.git
git push --mirror https://github.com/randyraulbr1/mariel-explorer-legacy.git
```

---

## Verificación mínima

```powershell
cd C:\Users\RANDY\Desktop\MarielExplorer_Legacy
git log -1 --oneline
git rev-parse HEAD
# Debe ser: a9f783ab1f56e48342730132b01b525e42889237
npm install
npm run typecheck
npm test
npm run build
npm run dev
# Abrir http://localhost:3000/
```

---

## Qué NO se ha hecho (por seguridad)

- ❌ No se borró `github-pages`
- ❌ No se modificó `kingdom-gps-editor`
- ❌ No se mezclaron historiales
- ❌ No se eliminó la rama `legacy-mariel-final` ni el tag `mariel-final-backup`

---

*Última actualización: 2026-07-12*
