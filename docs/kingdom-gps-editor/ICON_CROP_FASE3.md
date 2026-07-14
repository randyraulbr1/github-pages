# Fase 3 — Recorte de icono en Objetos

> Entrega para aplicar en `randyraulbr1/kingdom-gps-editor`.
> Rama base de Claude: `claude/kingdom-gps-editor-setup-7i6utj`
> Rama de este trabajo: `cursor/continuar-recursos-7abe` (commit `08def1e`)
> Versión: **0.11.0** (para que "Buscar actualizaciones" detecte la Release)

## Qué hace

Al asignar un icono a un Objeto puedes seleccionar una **región** de la imagen
(como RPG Maker), no solo la imagen entera.

## Aplicar

```bash
cd kingdom-gps-editor
git fetch origin
git checkout claude/kingdom-gps-editor-setup-7i6utj
git pull
git checkout -b cursor/continuar-recursos-7abe
git am path/to/kingdom-gps-editor-icon-crop-010.patch
git push -u origin cursor/continuar-recursos-7abe
```

Luego dispara Actions → Compilar instalador Windows, y publica tag:

```bash
git tag v0.11.0
git push origin v0.11.0
```

Sin ese tag/Release, la app 0.10.0 seguirá diciendo “estás en la última versión”.

## Archivos clave

- `010_items_icon_crop.ts` — columna `icon_crop`
- `IconCrop` / `normalizeIconCrop` en `shared-types/item.ts`
- `IconCropPicker.tsx` + `ItemInspector` (botón Recortar región…)
- `IconThumbnail` renderiza el recorte en grid/lista/tabla

## Verificado

`npm run typecheck` OK · **198/198** tests · `electron-vite build` OK
