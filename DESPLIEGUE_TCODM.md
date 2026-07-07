# Desplegar Mariel Online en tcodm.com (sin tu PC)

## Respuesta corta

| Qué quieres | ¿Necesitas tu PC encendido? | Dónde corre |
|-------------|----------------------------|-------------|
| **Juego GPS actual** (mundo.json) | ❌ No | `https://tcodm.com` → GitHub Pages (ya funciona) |
| **Juego tiempo real** (Socket.IO) | ❌ No, pero sí un servidor en la nube | Render / Railway / VPS (24/7 en internet) |

**GitHub Pages no puede ejecutar Node.js.** Solo sirve HTML/JS. Por eso el servidor va en otro sitio (subdominio).

---

## Arquitectura recomendada para tcodm.com

```
tcodm.com          → GitHub Pages  → pantalla del juego (/client)
api.tcodm.com      → Render/Railway → servidor Node.js 24/7
```

Los jugadores abren **tcodm.com/client/** y el juego se conecta a **api.tcodm.com**.

---

## Paso 1 — Servidor en Render (gratis para empezar)

1. Cuenta en [render.com](https://render.com)
2. **New → Web Service**
3. Conecta el repo `github-pages`, rama `claude/web-rpg-gps-game-n3ybow`
4. Configuración:
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Variables de entorno:
   ```
   JWT_SECRET=pon-un-secreto-largo-aqui
   ADMIN_PASSWORD=tu-clave-admin
   CORS_ORIGINS=https://tcodm.com,https://www.tcodm.com
   ```
6. Render te da una URL tipo `https://mariel-xxxx.onrender.com`

---

## Paso 2 — Subdominio api.tcodm.com

En el panel DNS de tu dominio (donde compraste tcodm.com):

| Tipo | Nombre | Valor |
|------|--------|-------|
| CNAME | `api` | la URL que te dio Render |

En Render → Settings → Custom Domain → añade `api.tcodm.com`

---

## Paso 3 — Configurar el cliente

En `client/config.js`:

```js
window.MARIEL_ONLINE = {
  SERVER_URL: 'https://api.tcodm.com',
  // ...
};
```

Sube el cambio a GitHub. En unos minutos estará en **https://tcodm.com/client/**

---

## URLs finales (sin PC)

| URL | Uso |
|-----|-----|
| https://tcodm.com/ | Juego GPS original |
| https://tcodm.com/client/ | Mariel Online (tiempo real) |
| https://tcodm.com/online/ | Atajo al online |
| https://api.tcodm.com/admin | Panel admin |

---

## Si no quieres pagar ni configurar servidor

Usa solo el **juego GPS con mundo.json** en tcodm.com:

- ✅ Ya online 24/7
- ✅ Cuba sin VPN
- ✅ Sin PC
- ❌ No es tiempo real instantáneo
- ❌ Admin necesita token GitHub en su teléfono

Eso es lo que ya tenías con el coco y el cangrejo guardados para siempre.

---

## Nota sobre Render gratis

El plan gratis **se duerme** si nadie entra un rato (arranque ~30 s). Para un juego serio conviene plan de pago (~7 USD/mes) o un VPS barato.
