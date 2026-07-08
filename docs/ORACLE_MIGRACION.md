# Fase 15 — Migración profesional a Oracle Cloud Free

Estado: 🚧 En progreso

## Comparativa (¿por qué Oracle?)

| Opción | Coste | Ancho de banda | Cuba sin VPN | Un solo dominio | Veredicto |
|--------|-------|----------------|--------------|-----------------|-----------|
| **Oracle Always Free** | $0 | ~10 TB/mes | ✅ US East cerca | ✅ Nginx | **Elegida** |
| Render Hobby | $0→$ | 5 GB/mes | ⚠️ | ⚠️ | ❌ Agotado |
| Fly.io free | $0 créditos | Limitado | ⚠️ | ⚠️ | Insuficiente largo plazo |
| Railway | $0 créditos | Limitado | ⚠️ | ⚠️ | Pago rápido |
| PC + Cloudflare Tunnel | $0 | Depende ISP | ⚠️ PC encendido | ⚠️ | Solo dev/pruebas |
| GitHub Pages + Render | $0 | Pages OK / API no | ⚠️ 2 dominios | ❌ | Actual roto |

**Conclusión:** Oracle es la mejor opción **gratis** para multijugador GPS con crecimiento a 1000+ cuentas (~100–300 GB/mes).

---

## Arquitectura objetivo (un solo dominio)

```
                    ┌─────────────────────────────────────┐
                    │  Oracle VM — US East (Ashburn)      │
                    │  Ubuntu 22.04 · 1 OCPU · 6 GB RAM   │
                    └─────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │  Nginx :443 (HTTPS + gzip)        │
                    │  tcodm.com + www.tcodm.com        │
                    └─────────────────┬─────────────────┘
           ┌──────────────────────────┼──────────────────────────┐
           │                          │                          │
    /  static PWA              /api/*  → Node:3000      /socket.io/*
    /var/www/tcodm             Express REST              Socket.IO
                               SQLite WAL                JWT + rate limits
                                      │
                               GITHUB_TOKEN (backup)
                               datos/mundo.json en GitHub
                               (solo respaldo, no runtime)
```

**GitHub:** código fuente + backup `mundo.json`. **No ejecuta el juego.**

**Render:** se mantiene en repo como **rollback documentado** hasta validar Oracle (no borrar aún).

---

## Fases de migración (gradual)

| Fase | Qué | Estado |
|------|-----|--------|
| **15.1** | Scripts Oracle + Nginx + docs | 🚧 |
| **15.2** | VM Oracle + `api.tcodm.com` pruebas | ☐ Randy |
| **15.3** | Probar login, GPS, chat, admin internamente | ☐ |
| **15.4** | Probar 2–3 jugadores reales | ☐ |
| **15.5** | DNS `tcodm.com` → Oracle (un dominio) | ☐ |
| **15.6** | Validar 48 h estables | ☐ |
| **15.7** | Desactivar Render warmup / marcar obsoleto | ☐ |
| **15.8** | Fase 8 checklist completa en móvil | ☐ |

### Rollback (si falla)

1. DNS `tcodm.com` → GitHub Pages (registros anteriores).
2. `servidorOnline: 'https://api.tcodm.com'` o reactivar Render si pagas.
3. GitHub `datos/mundo.json` restaura cuentas al reiniciar API.

---

## Dependencias actuales (inventario)

### Cliente (tcodm.com)

| Recurso | Hoy | Tras migración |
|---------|-----|----------------|
| HTML/JS/CSS | GitHub Pages | Oracle `/var/www/tcodm` |
| `version.json` | Mismo origen | Mismo origen |
| `datos/mundo.json` | Mismo origen (fallback) | Mismo origen |
| API REST | `api.tcodm.com` | `tcodm.com/api` |
| WebSocket | `api.tcodm.com` | `tcodm.com/socket.io` |
| Map tiles | cartocdn.com, OSM | Sin cambio (opcional proxy futuro) |
| raw.githubusercontent | Dev only | Eliminado en producción |

### Servidor (Node)

| Módulo | Función |
|--------|---------|
| `server/server.js` | Express + Socket.IO |
| `server/db.js` | SQLite WAL |
| `server/sockets.js` | GPS, combate, chat live |
| `server/syncMundo.js` | Mundo autoritativo |
| `server/syncCuentas.js` | Cuentas + GitHub backup |
| `server/rateLimit.js` | Anti-spam |
| `server/adminHistorial.js` | Historial admin |

### Variables de entorno (`/etc/mariel-api.env`)

Ver `server/.env.example`. Críticas: `JWT_SECRET`, `GITHUB_TOKEN`, `CORS_ORIGINS`, `GITHUB_BRANCH=main`.

---

## Instalación (Oracle VM)

```bash
# 1. Crear VM Always Free — US East, Ubuntu 22.04
# 2. DNS: api.tcodm.com → IP (fase prueba) luego tcodm.com → IP
# 3. En la VM:
git clone https://github.com/randyraulbr1/github-pages.git
cd github-pages
sudo bash deploy/install-oracle.sh
sudo nano /etc/mariel-api.env   # GITHUB_TOKEN + revisar JWT
sudo bash deploy/update-app.sh
curl https://api.tcodm.com/health
```

Guía rápida Cuba: `docs/ORACLE_DEPLOY_CUBA.md`

---

## Operación diaria

| Tarea | Comando |
|-------|---------|
| Actualizar código | `sudo bash deploy/update-app.sh` |
| Respaldo manual | `sudo bash deploy/backup-server.sh` |
| Ver logs | `journalctl -u mariel-api -f` |
| Reinicio | `sudo systemctl restart mariel-api` |
| Estado | `sudo systemctl status mariel-api nginx` |

---

## Optimización (Cuba + bajo ancho de banda)

- Sync jugadores: **12 s** (configurable `SYNC_INTERVAL_MS`)
- Poll mundo cliente: **6 s** (solo si socket caído)
- Nginx **gzip** en JSON estático
- Socket.IO interest management (jugadores cercanos)
- GitHub backup throttle **10 min** (no cada movimiento)
- `MarielRed`: mismo origen, sin GitHub raw en producción

---

## Seguridad

- JWT obligatorio en producción (`assertProductionSecrets`)
- Servidor **rechaza** inventario directo del cliente
- Rate limits: movimiento, chat, registro, admin
- Nginx: headers básicos, solo 443 público
- UFW: 22, 80, 443
- Logs: journald + logrotate
- **No geobloquear Cuba**

---

## Capacidad estimada (Oracle free)

| Métrica | Free tier | Juego |
|---------|-----------|-------|
| Ancho de banda | ~10 TB/mes | 100–300 GB con ~100 online |
| RAM | 6 GB VM | Node ~200–500 MB |
| Disco | 200 GB boot | SQLite < 1 GB años |
| CPU | 1 OCPU | OK hasta ~100–150 concurrentes* |

*Más allá: escalar VM de pago o 2.º nodo — no rehacer arquitectura.

---

## Notas de implementación (Cursor)

- v301: Nginx unificado, `servidorOnline` vacío = mismo origen en tcodm.com
- Render **no eliminado** — rollback hasta fase 15.6
- GitHub Pages workflow **activo** — rollback DNS
