# Roadmap — terminar el juego (luego corregir errores)

Actualizado: 2026-07-09 · versión código **v304** · servidor **Render Starter**

## Regla de Randy

1. **Primero:** cerrar lo esencial para que el juego sea jugable y estable en móvil.
2. **Después:** corregir errores y pulir (no features grandes).

---

## Ya está hecho (no rehacer)

| Fase | Versión | Qué |
|------|---------|-----|
| 1 Seguridad | v274+ | JWT, inventario servidor, admin reservado |
| 4 GPS rendimiento | v280 | interest 500 m, coalesce |
| 5.1 PIN confirmación | v299 | z-index organizar |
| 6 UI Manager | v288 | ventanas centralizadas |
| 7 Errores amigables | v290 | mensajeAmigable, pintarEstado |
| 9 Historial admin | v299 | restaurar acciones |
| 10 Depuración | v296+ | ping, consumo MB (v304) |
| 11 Anti-spam | v297 | rate limits |
| 12 UI patrón inventario | v298 | ui_components |
| 13 Catálogo objetos | v295 | consumibles, equipo, cocinar |
| 15B Red Render | v303–304 | delta mundo, enemigos cercanos, etc. |
| Login + Render | v302 | URL correcta, diagnóstico |

---

## BLOQUEANTE ahora — Fase 8 (Randy, ~30–45 min)

Guía: `faces/fase-8-validacion-movil-v299.md` (objetivo **v304**)

Marcar ☐ → ✅ o ❌ en la tabla. Sin esto no se considera “juego listo para pulir”.

| Prioridad | Prueba |
|-----------|--------|
| 1 | Android + GPS caminando |
| 2 | 2 jugadores se ven en mapa |
| 3 | Inventario, chat, amigos, tienda, misiones |
| 4 | Admin: mover PIN → publicar |
| 5 | Modo avión / mala conexión |

Si algo falla → anotar mensaje exacto → fix puntual (no fase nueva).

---

## En progreso en código (Cursor — después de Fase 8 ✅)

### Fase 2 — Estabilidad servidor

- Falta: roles en BD (owner/admin/mod/jugador), permisos por rol, no por nombre.
- Riesgo: medio. Hacer en PR pequeño.

### Fase 3 — Fuente única del mundo

- Hecho parcial: world_content, deltas admin, contenido_mundo.js.
- Falta: cerrar confianza sync-partida; menos dependencia del blob completo.
- Doc técnica: `FASE3_DISENO_MUNDO.md`

### Fase 5 — UI/UX general

- Hecho parcial: toasts, user-select, ui_components.
- Falta: revisar pantallas que aún no usan patrón inventario; scroll innecesario.

---

## Pausado (no tocar hasta terminar Fase 8 + 2–3)

| Tema | Motivo |
|------|--------|
| Oracle / api.tcodm.com | Render Starter activo |
| Fase 14 batalla (no definida en faces.md) | ChatGPT la mencionó; no existe spec en repo |
| GPS más agresivo | Randy pidió no tocar |
| player:updateStats global → scoped | Alto impacto red; después de validar |

---

## Fase “corregir errores” (después de Fase 8)

Orden sugerido:

1. **Bugs de la checklist Fase 8** (cada ❌ → issue + fix).
2. **Fase 2** roles JWT (seguridad antes de más jugadores).
3. **Fase 3** cerrar sync mundo (menos bugs “no veo el cofre”).
4. **Fase 5** UI residual (tiendas/amigos si algo se ve distinto).
5. **Fase 15B** medir Render 48 h; solo optimizar si sigue alto.
6. **Deuda técnica:** `admin.js` grande (~266 KB), duplicar `mariel-explorer/` en repo.

---

## Archivos faces (ChatGPT / equipo)

| Archivo | Uso |
|---------|-----|
| `faces.md` | Plan maestro — leer siempre primero |
| `faces/fase-8-validacion-movil-v299.md` | Checklist móvil **← hacer ahora** |
| `faces/fase-15-optimizacion-consumo-red.md` | Red Render — mayoría hecha |
| `faces/fase-13-catalogo-objetos-admin.md` | Referencia catálogo ✅ |
| `faces/nota-chatgpt-orden-pruebas-prs-114-117.md` | Histórico PRs (obsoleto tras v304) |
| `FASE3_DISENO_MUNDO.md` | Diseño técnico mundo único |
| `faces/ROADMAP-TERMINAR-JUEGO.md` | Este documento |

---

## Siguiente paso concreto

**Randy:** ejecutar Sesión A + B de Fase 8 en v304 y marcar resultados en `faces.md`.

**Cursor:** cuando Randy pase checklist o reporte ❌, o bien cerrar Fase 2/3 en PRs pequeños — **sin features nuevas** hasta Fase 8 ✅.
