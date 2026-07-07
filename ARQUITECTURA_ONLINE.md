# Mariel Online — Arquitectura servidor + cliente

Juego web compartido **sin Firebase**, **sin VPN**. El estado vive en el servidor (SQLite).

## Estructura

```
/server          → Node.js + Express + Socket.IO + SQLite
/client          → Frontend del juego (HTML/CSS/JS)
```

## Arrancar en local

```bash
cd server
cp .env.example .env
npm install
npm start
```

- **Juego:** http://localhost:3000/
- **Admin:** http://localhost:3000/admin (usuario `admin`, contraseña `admin123`)
- **API:** http://localhost:3000/api

## Endpoints REST

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/register` | Registro (username + password) |
| POST | `/api/login` | Login → JWT + datos del jugador |
| GET | `/api/player/me` | Perfil del jugador (requiere JWT) |
| GET | `/api/world/objects` | Objetos del mapa |
| GET | `/api/world/missions` | Misiones activas |
| POST | `/api/admin/login` | Login admin |
| POST | `/api/admin/missions` | Crear misión |
| POST | `/api/admin/objects` | Crear objeto del mapa |

## Eventos Socket.IO

El **cliente envía intención**, el **servidor valida y guarda**, luego emite a todos:

- `player:move` — movimiento validado
- `player:updateStats` — hp, hambre, xp, nivel
- `player:updateInventory` — mochila
- `world:cutTree` — cortar árbol (valida distancia)
- `world:pickup` — recoger objeto
- `world:updateObject` / `world:removeObject` — cambios del mapa
- `mission:create` / `mission:update` / `mission:complete`

## Despliegue

1. **Frontend estático:** sube `/client` a GitHub Pages.
2. **Backend:** despliega `/server` en un VPS accesible desde Cuba (Railway, Render, VPS propio, etc.).
3. En `client/game.js` cambia `API` al dominio del servidor, o sirve todo desde el mismo servidor Node.

## Migrar SQLite → MySQL

La capa `db.js` usa consultas parametrizadas. Para MySQL, sustituye `better-sqlite3` por `mysql2` manteniendo las mismas funciones exportadas.

## Variables de entorno

Ver `server/.env.example`:
- `JWT_SECRET` — secreto para tokens
- `ADMIN_PASSWORD` — contraseña del panel admin
- `CORS_ORIGINS` — dominios permitidos (GitHub Pages + servidor)
