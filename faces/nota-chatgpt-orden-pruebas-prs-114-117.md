# Nota ChatGPT - Orden y pruebas antes de seguir

Fecha: 2026-07-08 (actualizado 21:10 UTC)

## Resumen

PR #114–#120 ya están mergeados en `main` (v295–v299). La prioridad ahora es **cerrar PRs viejos**, **pruebas Fase 8** y **deploy estable** — no abrir fases nuevas.

## Mergeados en main (orden)

| PR | Versión | Contenido |
|----|---------|-----------|
| #116 | v295 | Fase 13 catálogo, consumibles, equipo, armas, cocinar |
| #117 | v296 | Fase 10 panel depuración admin |
| #118 | v297 | Fase 11 anti-spam / rate limits |
| #119 | v298 | Fase 12 UI components + patrón inventario |
| #120 | v299 | Fix confirmación PIN + historial Fase 9 |

## PRs abiertos — CERRAR (superseded, CONFLICTING)

El bot de Cursor **no tiene permiso** `closePullRequest`. Randy debe cerrarlos en GitHub o con:

```bash
for pr in 113 114 88 19 17 16 10; do
  gh pr close $pr --comment "Superseded: cambios ya en main v299."
done
```

| PR | Rama | Motivo |
|----|------|--------|
| #113 | `cursor/faces-md-7abe` | v286 en main (`3b7f7ddd5`) |
| #114 | `cursor/ui-manager-ventanas-7abe` | v288 UIManager en main (`70e936e01`); docs fase-13/14 desactualizados |
| #88 | `cursor/fix-amigos-carpeta-expandida-7abe` | `friend-menu-carpeta` ya en main (v260+) |
| #19 | `cursor/fix-cuentas-no-borrar-7abe` | `fusionarJugadoresPublicacion` en `server/syncMundo.js` |
| #17 | `cursor/fix-pin-cancel-quitar-7abe` | `cancelarColocacionPin` en `js/chat/chat.js` |
| #16 | `cursor/fix-enemigo-teleport-7abe` | `fijarPosicion` / `_posViva` en `js/enemigos/enemigos.js` |
| #10 | `cursor/chat-mockup-cache-7abe` | Gradiente HUD en `css/ui_components.css` |

**No mergear ni rebasear** ninguno — causarían regresiones.

## Deploy

- `version.json` en GitHub: **299**
- tcodm.com: meta `mariel-version` **299** (verificado 2026-07-08)
- Smoke: `bash scripts/smoke-v299.sh` — OK

## Pendiente Fase 8 (manual)

- Login, GPS, inventario, amigos, chat en Android real
- Admin mover PIN (fix v299 en código)
- Borrar caché / otro teléfono / mala conexión

## Prioridad

1. Cerrar los 7 PRs obsoletos
2. Checklist Fase 8 manual (móvil)
3. Deploy solo si pruebas críticas pasan
4. Luego funciones nuevas (Fase 14+, etc.)

- ChatGPT / Cursor
