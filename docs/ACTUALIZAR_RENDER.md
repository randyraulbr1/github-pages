# Cómo actualizar el servidor en Render (paso a paso)

El juego en **https://tcodm.com** se actualiza solo desde GitHub Pages.  
El servidor multijugador (**chat, ataúdes, enemigos en vivo**) corre en **Render** y hay que redesplegarlo cuando cambia la carpeta `server/`.

---

## 1. Comprobar que GitHub ya tiene el código nuevo

1. Abre: https://github.com/randyraulbr1/github-pages/tree/claude/web-rpg-gps-game-n3ybow
2. Verifica que existan archivos recientes, por ejemplo:
   - `server/routes/chatRoutes.js` (chat v97+)
   - `js/chat/chat.js`
   - Versión en `js/config/config.js` → `version: '99'` (o la última)

Si acabas de hacer merge y no ves los archivos, espera 1 minuto y recarga.

---

## 2. Entrar a Render

1. Ve a **https://dashboard.render.com**
2. Inicia sesión con la cuenta que creó el servicio
3. Abre el servicio **`mariel-online-api`** (o el nombre que tenga tu web service)

---

## 3. Forzar un nuevo despliegue (manual)

1. En el menú del servicio, pestaña **Manual Deploy**
2. Pulsa **Deploy latest commit**
3. Rama: **`claude/web-rpg-gps-game-n3ybow`**
4. Espera a que el estado pase a **Live** (verde) — suele tardar 2–5 minutos

**Logs:** pestaña **Logs** → debe aparecer algo como:
```
Servidor escuchando en puerto ...
Importados X objetos desde datos/mundo.json
```

---

## 4. Auto-deploy (recomendado)

Para no hacerlo a mano cada vez:

1. **Settings** → **Build & Deploy**
2. **Branch:** `claude/web-rpg-gps-game-n3ybow`
3. **Root Directory:** `server`
4. **Auto-Deploy:** ON

Cada `git push` a esa rama redeploya solo.

---

## 5. Variables de entorno (revisar una vez)

En **Environment**:

| Variable | Valor |
|----------|--------|
| `JWT_SECRET` | Secreto largo (**no cambiar** si ya hay jugadores — invalida sesiones) |
| `ADMIN_PASSWORD` | Clave del panel `/admin` |
| `CORS_ORIGINS` | `https://tcodm.com,https://www.tcodm.com,https://randyraulbr1.github.io` |
| `NODE_ENV` | `production` |
| `DATABASE_DIR` | `/var/data` (con disco persistente, ver abajo) |
| `GITHUB_TOKEN` | Token con permiso `contents:write` — **respalda cuentas** en `datos/mundo.json` al registrarse |

Tras cambiar una variable, Render redeploya solo.

---

## 5b. Usuarios que desaparecen (importante)

**Causa:** En Render la base SQLite (`game.sqlite`) vivía en disco **temporal**. Cada **Manual Deploy** o reinicio **borraba todas las cuentas** creadas después del último respaldo en GitHub.

**Solución aplicada (v103+):**
1. **Disco persistente** en `render.yaml` → monta `/var/data` para la base de datos.
2. Al **registrar** cuenta, el servidor intenta respaldar jugadores en GitHub (`GITHUB_TOKEN`).
3. Al arrancar, **reconcilia** usuarios de SQLite con el snapshot del mundo.

**En Render Dashboard (una vez):**
1. **Settings** → **Disks** → Add disk → mount `/var/data` (1 GB).
2. Añade `DATABASE_DIR` = `/var/data` si no está.
3. Añade `GITHUB_TOKEN` (repo `github-pages`, permiso escritura) para respaldo automático de cuentas.

**No cambies `JWT_SECRET`** en producción sin avisar — no borra usuarios, pero cierra todas las sesiones.

---

## 6. Comprobar que funcionó

1. Abre: **https://mariel-online.onrender.com**  
   Debe responder JSON: `{"ok":true,"service":"mariel-online-server",...}`

2. En el juego (tcodm.com):
   - Inicia sesión
   - Debe salir **「📡 Conectado al servidor en vivo」**
   - Abre **💬 Chat** — debe cargar jugadores (no 「Sin conexión」)

3. Si el servidor estaba dormido (plan gratis), la primera conexión puede tardar **~30 segundos**.

---

## 7. Plan gratis — servidor dormido

Render gratis **apaga** el servicio tras inactividad. La primera petición lo despierta.

- Síntoma: chat no conecta, luego sí al rato
- Solución: plan de pago (~7 USD/mes) o un ping cada 10 min (UptimeRobot, etc.)

---

## Resumen rápido

```
GitHub push → rama claude/web-rpg-gps-game-n3ybow
     ↓
Render → Manual Deploy → Deploy latest commit
     ↓
Esperar Live → probar mariel-online.onrender.com
     ↓
tcodm.com → recargar (v99+) → chat y ataúdes en vivo
```
