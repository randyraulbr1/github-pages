# Render GRATIS — guardar cuentas sin pagar

El plan **Hobby ($0)** de Render **no tiene disco persistente**. Cada redeploy borra la base SQLite local. La solución **gratis** es usar **GitHub** como almacén permanente de cuentas.

---

## Cómo funciona (v104+)

| Qué | Dónde vive (gratis) |
|-----|---------------------|
| Cuentas (nombre, teléfono, contraseña hash) | `datos/mundo.json` en GitHub |
| Partidas guardadas | `mundo.json` → `partidas` |
| Mapa, enemigos, misiones | `mundo.json` + SQLite temporal |

1. **Al registrarse** → el servidor sube la cuenta a `datos/mundo.json` en GitHub.
2. **Al reiniciar Render** → el servidor **descarga** `mundo.json` de GitHub y restaura jugadores.
3. **Al entrar** → si la BD local está vacía, el login usa la cuenta de `mundo.json` y la vuelve a crear.

**No necesitas plan Pro ni disco de pago.**

---

## Configuración en Render (solo una vez)

### 1. Crear token de GitHub (gratis)

1. GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens**
2. **Generate new token**
3. Repositorio: solo `randyraulbr1/github-pages`
4. Permisos: **Contents** → **Read and write**
5. Copia el token (empieza con `github_pat_...`)

### 2. Añadir en Render → Environment

| Variable | Valor |
|----------|--------|
| `GITHUB_TOKEN` | El token que copiaste |
| `GITHUB_REPO` | `randyraulbr1/github-pages` |
| `GITHUB_BRANCH` | `claude/web-rpg-gps-game-n3ybow` |
| `JWT_SECRET` | **No lo cambies** si ya hay jugadores |
| `CORS_ORIGINS` | `https://tcodm.com,https://www.tcodm.com` |

### 3. Manual Deploy

Rama `claude/web-rpg-gps-game-n3ybow` → **Deploy latest commit**

En los logs debe salir:
```
[mundo] Cuentas restauradas: X jugador(es) — GitHub: sí
```

Si sale `GITHUB_TOKEN no configurado` → falta el paso 2.

---

## Costes reales en Hobby

- **Workspace Hobby:** $0/mes
- **Web service (mariel-online-api):** ~$0 si entra en free tier de instancia, o unos céntimos de compute
- **GitHub:** $0 (repo público)
- **GitHub Pages (tcodm.com):** $0

**No hace falta** seleccionar Pro ($25), Scale ni disco persistente.

---

## Si un jugador “desapareció”

Solo se recupera si su cuenta quedó guardada en `datos/mundo.json` en GitHub antes del redeploy.

Comprueba: https://github.com/randyraulbr1/github-pages/blob/claude/web-rpg-gps-game-n3ybow/datos/mundo.json → busca su nombre en `jugadores`.

Si no está ahí y no tenías `GITHUB_TOKEN` configurado, esa cuenta se perdió en un redeploy anterior.

---

## Resumen

```
Jugador se registra
    → servidor guarda en SQLite (temporal)
    → servidor sube a GitHub mundo.json (permanente)

Render redeploy / reinicio
    → SQLite se borra
    → servidor lee mundo.json de GitHub
    → jugadores vuelven ✅

Jugador entra con su contraseña
    → funciona desde mundo.json
```
