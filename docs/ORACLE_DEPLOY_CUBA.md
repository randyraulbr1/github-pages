# Oracle Cloud GRATIS — servidor para Cuba (sin VPN)

**Coste:** $0/mes (Always Free) · **Ancho de banda:** ~10 TB/mes · **Región:** US East (Ashburn) — cerca de Cuba y de Florida.

Render Hobby solo da 5 GB/mes (ya agotado). Oracle es la mejor opción gratis para multijugador GPS.

---

## Arquitectura

```
Jugador en Cuba
    ↓ HTTPS / WSS puerto 443
https://tcodm.com          → juego (GitHub Pages) — ya funciona
https://api.tcodm.com      → Node + Socket.IO (Oracle VM)
    ↓
datos/mundo.json en GitHub ← respaldo cuentas (GITHUB_TOKEN)
```

**No geobloquear Cuba** en ningún panel (Oracle, DNS, Cloudflare si lo usas).

---

## Paso 1 — Cuenta Oracle (gratis)

1. [cloud.oracle.com](https://cloud.oracle.com) → Sign Up → **Always Free**.
2. Puede pedir tarjeta para verificación ($0); no cobra si solo usas recursos Always Free.
3. **Home region:** elige **US East (Ashburn)**.

---

## Paso 2 — Crear VM

1. **Compute → Instances → Create instance**
2. Nombre: `mariel-api`
3. Image: **Ubuntu 22.04**
4. Shape: **Ampere A1 Flex** → **1 OCPU, 6 GB RAM** (Always Free)
5. Red: asignar IP pública
6. SSH key: descarga la clave privada
7. Create

Anota la **IP pública** (ej. `123.45.67.89`).

---

## Paso 3 — DNS (en tu registrador de tcodm.com)

| Tipo | Nombre | Valor |
|------|--------|-------|
| A | `api` | IP de la VM Oracle |

Espera 5–30 min. Prueba: `ping api.tcodm.com`

---

## Paso 4 — Instalar en la VM

Conéctate por SSH y ejecuta (o usa el script del repo):

```bash
curl -fsSL https://raw.githubusercontent.com/randyraulbr1/github-pages/main/deploy/install-oracle.sh | bash
```

O manualmente: clona el repo, `npm install` en `server/`, copia `deploy/mariel-api.service` y `deploy/Caddyfile`, configura variables.

---

## Paso 5 — Variables de entorno

Archivo `/etc/mariel-api.env`:

```bash
NODE_ENV=production
PORT=3000
JWT_SECRET=tu-secreto-largo-no-cambiar
CORS_ORIGINS=https://tcodm.com,https://www.tcodm.com,https://randyraulbr1.github.io
GITHUB_TOKEN=github_pat_...
GITHUB_REPO=randyraulbr1/github-pages
GITHUB_BRANCH=main
```

Ver `docs/RENDER_GRATIS.md` para crear `GITHUB_TOKEN`.

---

## Paso 6 — Comprobar

```bash
curl https://api.tcodm.com/health
curl https://api.tcodm.com/api/public/version
```

Debe responder `{"ok":true,...}`.

En el móvil: tcodm.com → login → debe conectar sin VPN.

---

## Consumo estimado (Oracle free)

| Uso | GB/mes aprox. |
|-----|----------------|
| Pruebas (2 personas) | 1–5 |
| 50 jugadores online pico | 30–80 |
| 1000 cuentas (~80 online) | 100–250 |

**10 TB/mes gratis** — sobra para crecer mucho antes de pagar.

---

## Cuándo pagarías

- Oracle: solo si superas Always Free o 10 TB/mes (miles de jugadores activos).
- GitHub Pages (tcodm.com): sigue $0.
- **No uses Render** para este juego (límite 5 GB/mes).

---

## Apagar cuando no pruebes

En Oracle: **Stop instance** cuando no haya jugadores — ahorra compute (ancho de banda solo se gasta con tráfico real).

---

## Problemas frecuentes

| Síntoma | Solución |
|---------|----------|
| Sin conexión al servidor | VM encendida? `systemctl status mariel-api` |
| Cuba no entra | No bloquear país; probar `api.tcodm.com/health` desde móvil |
| Cuentas perdidas | `GITHUB_TOKEN` configurado? |
| Certificado HTTPS | Caddy renueva solo; dominio `api` debe apuntar a la VM |
