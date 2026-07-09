# Revisión faces — 9 jul 2026 (v304)

Documento de continuidad: qué creó ChatGPT en `faces/`, qué está hecho y qué falta para **terminar el juego** antes de corregir errores.

---

## 1. Inventario de documentación faces

### Archivos en `faces/` (repo actual)

| Archivo | Origen | Uso |
|---------|--------|-----|
| `fase-8-validacion-movil-v299.md` | ChatGPT + Cursor | 🔴 **Checklist móvil — hacer ahora** |
| `fase-15-optimizacion-consumo-red.md` | ChatGPT + Cursor | Red Render v303–304 |
| `fase-13-catalogo-objetos-admin.md` | ChatGPT | Referencia catálogo ✅ |
| `nota-chatgpt-orden-pruebas-prs-114-117.md` | ChatGPT | Histórico PRs (parcialmente obsoleto) |
| `ROADMAP-TERMINAR-JUEGO.md` | Cursor | Prioridades para terminar |
| `REVISION-FACES-2026-07-09.md` | Cursor | Este documento |

### Plan maestro (raíz)

| Archivo | Contenido |
|---------|-----------|
| `faces.md` | **Todas las fases 1–15B** — ChatGPT escribió la mayoría aquí, no en archivos sueltos |
| `FASE3_DISENO_MUNDO.md` | Diseño técnico Fase 3 (mundo único) |
| `docs/ORACLE_MIGRACION.md` | Fase 15 Oracle — pausada |

**No hay** `fase-14-*.md` ni `fase-1-seguridad.md` … `fase-7-errores.md` como archivos separados; eso vive en `faces.md`.

---

## 2. Coherencia entre documentos

### Alineado con código v304
- Render único (`servidorOnline` → `mariel-online.onrender.com`)
- Enemigos por cercanía 500 m
- `mundo:sync` delta
- Panel admin MB/sesión
- Diagnóstico login (`MarielDiagnosticoRed`)

### Desactualizado / corregido hoy
- `faces.md` decía Fase 8 “pendiente” sin bloqueo explícito → **corregido**
- Fase 15 Oracle como “próximo” → **pausada**
- Fase 15B red marcada solo “pendiente” → **parcial v304**

### Duplicación menor
- Fase 12 y 13 comparten tema “catálogo objetos” — no bloquea; ambas ✅.

---

## 3. Orden para terminar el juego (Randy)

```
1. Fase 8 manual (móvil + 2 jugadores)     ← AHORA
2. Fixes puntuales por cada ❌ de la guía
3. Cerrar Fase 2 (roles) en PR pequeño
4. Cerrar Fase 3 (mundo único) en PR pequeño
5. Fase 5 UI solo si queda bug tras F8
6. Modo “solo errores” — sin features grandes
```

**No hacer hasta Fase 8 ✅:**
- Oracle Cloud
- Refactors UI grandes
- Nuevas mecánicas de juego

---

## 4. Checklist Fase 8 (resumen)

Ver [`fase-8-validacion-movil-v299.md`](fase-8-validacion-movil-v299.md).

Mínimo para declarar juego “terminado”:
- [ ] Login `randy` en móvil con v304
- [ ] Mapa + GPS estable
- [ ] 2 jugadores ven pines mutuos
- [ ] Combate enemigo + botín
- [ ] Revivir + ataúd
- [ ] Amigos + chat
- [ ] Admin PIN en móvil
- [ ] Actualizar → v304 sin caché rota

---

## 5. Errores conocidos (corregir después de F8)

| Síntoma | Dónde mirar |
|---------|-------------|
| Login falla | `diagnostico_red.js`, Render logs, cuenta en `jugadores/` |
| Mapa vacío | `multijugador.js` `game:init`, `loadWorld` |
| Pines no sync | socket `player:update`, token sesión |
| Botín no aparece | `enemigos.js`, `worldBroadcast.js` |
| UI tapa mapa | `ui-manager.js`, `hud.css` |
| Mucho consumo Render | panel depuración admin, `consumo_red.js` |

---

## 6. PRs relacionados con faces (historial)

| PR | Face |
|----|------|
| #117–118 | Fase 7 errores |
| #119 | Fase 10 depuración |
| #120–121 | Fase 11 admin |
| #122–123 | Fase 12–13 catálogo |
| #124–127 | Fase 15 Oracle (pausada) |
| #128–131 | Conexión + red v302–304 |

---

## 7. Próximo paso concreto

**Randy:** ejecutar Fase 8 en 2 móviles, anotar ❌, enviar lista.  
**Cursor:** un fix por ítem ❌, sin abrir fases nuevas.
