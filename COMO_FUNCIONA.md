# Mariel Online — ¿Qué significa todo esto?

## En una frase

**Un servidor en internet guarda el juego.** Todos los jugadores se conectan a ese servidor y ven **el mismo mapa, los mismos objetos y las mismas misiones** al mismo tiempo.

---

## Antes (GitHub Pages + mundo.json)

```
Tu teléfono  ──lee──►  datos/mundo.json  (archivo en GitHub)
Admin        ──escribe con token──►  GitHub
```

- ✅ Funciona en Cuba sin VPN
- ❌ No es tiempo real instantáneo
- ❌ El admin necesita token complicado
- ❌ Los jugadores no se ven moverse en vivo

---

## Ahora (Servidor Node.js)

```
Jugador 1 ──┐
Jugador 2 ──┼──►  SERVIDOR (Node.js)  ──►  SQLite (base de datos)
Admin     ──┘         │
                      └── Socket.IO avisa a TODOS al instante
```

| Pieza | Qué es | Para qué sirve |
|-------|--------|----------------|
| **Frontend** (`/client`) | La pantalla del juego en el navegador | Dibuja mapa, botones, login. **No decide nada importante.** |
| **Backend** (`/server`) | Programa Node.js en un VPS/servidor | **Decide todo:** movimiento, objetos, misiones, cuentas |
| **SQLite** | Archivo de base de datos en el servidor | Guarda usuarios, jugadores, objetos, misiones |
| **Socket.IO** | Conexión en tiempo real | Cuando alguien mueve un objeto, **todos lo ven al instante** |
| **JWT** | Token de sesión propio | Login sin Firebase |

---

## Regla de oro

> **El cliente pide. El servidor decide.**

Ejemplo — cortar un árbol:
1. Tú pulsas el árbol → cliente envía: *"quiero cortar árbol #3"*
2. Servidor comprueba: ¿estás cerca? ¿existe el árbol?
3. Servidor guarda en SQLite
4. Servidor avisa a **todos**: *"árbol #3 tiene 2 HP"*
5. Todos ven el cambio

Nadie puede hacer trampa editando el navegador.

---

## Cómo arrancarlo

```bash
cd server
cp .env.example .env
npm install
npm start
```

| URL | Qué haces ahí |
|-----|---------------|
| http://localhost:3000/ | Jugar (registro + mapa) |
| http://localhost:3000/admin | Crear misiones y objetos (admin / admin123) |

---

## Desplegar para Cuba

1. **Servidor:** sube la carpeta `/server` a un VPS (Railway, Render, DigitalOcean, etc.)
2. **Juego en GitHub Pages:** abre `client/config.js` y pon la URL de tu servidor:
   ```js
   SERVER_URL: 'https://tu-servidor.com'
   ```
3. Abre: `https://randyraulbr1.github.io/github-pages/online/`

**Sin Firebase. Sin VPN. Sin tokens de GitHub para jugadores.**

---

## Dos juegos en este repo

| Carpeta | Tipo |
|---------|------|
| `/` (index.html) | Juego GPS original con mundo.json |
| `/client` + `/server` | Juego online en tiempo real (nuevo, recomendado) |

Puedes usar los dos. El online es el camino correcto para multijugador real.
