# Entrega: Auth + cola sync → Kingdom GPS Editor

> El agente cloud **no tiene permiso de push** a `randyraulbr1/kingdom-gps-editor`
> (token de este run solo escribe en `github-pages`). Los commits están listos en local
> y aquí como parche/bundle para aplicar a mano.

## Commits (sobre `main`)

1. `046abd8` — integrar parche Claude: Armaduras + Armas undo/export + Objetos framework
2. `7db706f` — auth admin + cola `world_sync_jobs` + menú bolita sync

## Aplicar en el repo oficial

```bash
cd kingdom-gps-editor
git checkout main
git pull --rebase
git checkout -b cursor/integrar-armaduras-sync-7abe
git am docs/…/kingdom-gps-editor-auth-sync.patch
# o:
# git fetch kingdom-gps-editor-integrar-armaduras-sync.bundle cursor/integrar-armaduras-sync-7abe:cursor/integrar-armaduras-sync-7abe
git push -u origin cursor/integrar-armaduras-sync-7abe
```

## Qué incluye

- Login admin (usuario/clave) en TitleBar, sesión con Electron `safeStorage`
- Migración `008_world_sync_jobs` + enqueue al crear/editar/mover/borrar
- Publish a `/api/player/world/upsert` y `/world/delete`
- `SyncPinMenu`: gris Subir / verde Ver+Resync / rojo Reintentar
- Docs: `SIGUIENTE_PASO.md` + `panel adm/00_ROADMAP.md`
- Tests: **39/39** + typecheck OK

## Siguiente en el editor

1. Copiar/cortar/pegar/Propiedades
2. Pin Tienda / NPC reales
3. Módulo Jugadores
4. Recursos visuales / icon crop
