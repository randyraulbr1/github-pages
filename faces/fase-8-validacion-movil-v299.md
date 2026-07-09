# FASE 8 — Validación móvil (uso real)

Estado: ⏳ **BLOQUEANTE** — no empezar funciones grandes nuevas hasta completar esto.

Versión objetivo: **v304** en tcodm.com (`meta mariel-version` = 304).

---

## Antes de probar

1. ~~Cerrar PRs obsoletos~~ ✅ hecho.
2. En el móvil: borrar caché del sitio **o** modo incógnito.
3. Pulsar **Actualizar** si sale cartel de versión.
4. Confirmar versión: debe verse **v304**. Servidor: `mariel-online.onrender.com`.

---

## Sesión A — 1 jugador caminando (GPS)

**Dispositivo:** Android real, datos móviles o WiFi, GPS activo.

| # | Prueba | Cómo | ☐/✅/❌ | Notas |
|---|--------|------|---------|-------|
| A1 | Login / cuenta | Entrar con cuenta existente o crear una | | |
| A2 | GPS propio | Caminar 1–2 min; el pin debe moverse en el mapa | | |
| A3 | Inventario 🎒 | Abrir, cerrar con ✕, no desbordar pantalla | | |
| A4 | Amigos 👥 | Abrir, menú ⋮ de un amigo, cerrar | | |
| A5 | Chat 💬 | Abrir lista, entrar a conversación, cerrar | | |
| A6 | Tienda 🏪 | Acercarse a tienda NPC, abrir, cerrar | | |
| A7 | Misiones 📋 | Abrir panel, cerrar | | |
| A8 | Opciones ⚙️ | Abrir, cerrar | | |
| A9 | Admin 🛠️ | Solo Randy: abrir panel admin, cerrar | | |
| A10 | Mover PIN admin | Organizar → mover un pin → confirmar → publicar | | fix v299 |
| A11 | Mala conexión | Modo avión 5 s ON/OFF; app no crashea | | |

**Regla GPS:** acciones largas (inventario, admin, chat largo) hacerlas **quieto**. Caminar = mapa + combate simple.

---

## Sesión B — 2 jugadores reales

**Dispositivos:** 2 teléfonos (o 1 móvil + 1 PC).

| # | Prueba | Cómo | ☐/✅/❌ | Notas |
|---|--------|------|---------|-------|
| B1 | Ver otro jugador | Ambos logueados; pin del otro visible en mapa | | |
| B2 | Posición en tiempo real | Caminar con uno; el otro ve movimiento (~10 s) | | |
| B3 | Chat entre jugadores | Enviar mensaje; llega al otro | | |
| B4 | Pin de chat | Enviar pin; el otro lo ve en mapa | | |
| B5 | Amigos / bloqueo | Solicitud o bloqueo (si aplica) | | |
| B6 | Combate / enemigo | Opcional: enemigo cerca, barra vida visible | | |

---

## Paneles críticos (Fase 12 UI)

Todos deben: abrir sin lag, caber en pantalla (~360px ancho), botón ✕ cierra, ESC cierra (si hay teclado).

| Panel | ID HTML | Automatizado smoke |
|-------|---------|-------------------|
| Inventario | `ventana-mochila` | ✅ estructura |
| Amigos | `ventana-amigos` | ✅ estructura |
| Chat | `chatPanel` | ✅ estructura |
| Tienda | `ventana-tienda` | ✅ estructura |
| Misiones | `ventana-misiones` | ✅ estructura |
| Admin | `ventana-admin` | ✅ estructura |
| Opciones | `ventana-opciones` | ☐ manual |

Viewport simulado PR #119: 390×844 — paneles ~358–367×580 px, sin desborde horizontal.

---

## Cuando terminar

1. Marcar resultados en `faces.md` Fase 8 (tabla principal).
2. Si todo ✅ → Fase 8 = Completada; se puede planear Fase 14+.
3. Si algo ❌ → abrir fix puntual (no fase grande) con versión v304+.

---

## Regla de equipo

**No empezar funciones grandes nuevas** (Fase 14 batalla, sistemas nuevos, refactors grandes) hasta que esta validación esté ✅ en uso real.
