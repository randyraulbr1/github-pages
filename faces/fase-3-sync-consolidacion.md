# FASE 3 — Consolidación sync Render ↔ GitHub

Estado: 🚧 En progreso (v314)

## Valoración Randy / ChatGPT (jul 2026)

El proyecto avanzó en multijugador, publicación del mundo, amigos, chat y actualizaciones. **El punto más débil sigue siendo la sincronización de cuentas y mundo**: dos fuentes (Render SQLite + GitHub) con riesgo de divergencia.

## Problemas confirmados

| # | Problema | Estado v314 |
|---|----------|-------------|
| 1 | Render con `jugadores: []` tras redeploy → cuentas antiguas fallan | 🚧 Mitigado: boot fusiona `mundo.json` + `datos/jugadores/` + GitHub |
| 2 | `mundo.json` en GitHub desactualizado vs servidor vivo | 🚧 Auto-saneo al arrancar si `GITHUB_TOKEN` |
| 3 | `indice.json` y `mundo.json` divergen (ej. cuenta 33 en indice, no en mundo) | ✅ Reconciliado en repo |
| 4 | Carpeta `mariel-explorer/` duplicada | ⏳ No está en git; no tocar (regla IA_TEAM_REVIEW) |
| 5 | Claves dev en `localStorage` (`mariel_dev_clave_*`) | ⏳ Deuda: solo sesión admin; no commitear claves reales |
| 6 | Mundo en tiempo real 100 % sin depender de GitHub | ⏳ Objetivo Fase 3 largo plazo |

## Arquitectura objetivo

```
Jugador → Render (autoridad en vivo) → respaldo GitHub (persistencia tras redeploy)
                ↑
         Socket.IO + REST
                ↑
         Cliente tcodm.com
```

**GitHub NO es fuente en tiempo real.** Es disco permanente cuando Render reinicia (SQLite efímero).

## Cambios v314 (servidor)

1. `githubJugadores.js` — descarga `datos/jugadores/indice.json` + `{id}.json` de GitHub al arrancar.
2. `restaurarMundoAlArranque()` — fusiona 4 fuentes: GitHub mundo, local, carpeta, GitHub jugadores.
3. `getJugadoresPublicos()` — si snapshot < carpeta, fusiona antes de responder.
4. Auto-saneo boot — si snapshot tiene más cuentas que GitHub `mundo.json`, push inmediato (con `GITHUB_TOKEN`).

## Checklist Render (Randy)

- [ ] `GITHUB_TOKEN` configurado (contents:write)
- [ ] `GITHUB_BRANCH=main` coincide con rama con datos
- [ ] Tras deploy: log `Cuentas restauradas: N` con N ≥ cuentas activas
- [ ] `GET /api/public/cuentas` lista todas las cuentas
- [ ] Admin → Respaldo GitHub o Guardar mapa tras crear cuenta nueva

## Próximos pasos Fase 3

1. Deltas por objeto (no mundo completo cada sync).
2. `world_content` como única lectura mapa (ya migrando v309).
3. Eliminar dependencia de raw GitHub en ruta crítica del cliente (solo Render).
4. Validar: redeploy Render → todas las cuentas siguen entrando.

## Probar

1. Crear cuenta test → entrar → redeploy Render → cuenta sigue en lista login.
2. Comparar `/api/debug/world` jugadores vs `datos/mundo.json` en GitHub (deben converger tras saneo).
