# Recorte de icono en Objetos (Kingdom GPS Editor — Fase 3)

## Qué hace

Al asignar un icono de la biblioteca a un **Objeto**, se puede seleccionar una **región (recorte)** de la imagen como icono, no la imagen entera.

## Cómo se guarda

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `icon_id` | INTEGER | Icono de la biblioteca (ya existía) |
| `icon_crop` | TEXT JSON o NULL | `{ x, y, width, height }` en píxeles; `null` = imagen completa |

Migración: `007_items_icon_crop.ts` → `ALTER TABLE items ADD COLUMN icon_crop TEXT`

Tipo TS: `IconCrop` + `item.iconCrop` en `src/shared-types/item.ts`

## UI

1. En el inspector del objeto, arrastra un icono desde la Biblioteca.
2. Pulsa **Recortar región…**
3. Arrastra sobre la imagen (Shift = cuadrado).
4. **Aplicar recorte** o **Usar imagen completa**.

`IconThumbnail` pinta solo la región en listas/grillas/inspector.

## Estado

- Claude empezó inspeccionando migraciones/repo (sesión local) pero **no llegó a `main`**.
- Cursor completó migración + schema + repo + picker + render + tests (33/33 OK, typecheck OK).
- **Push a `randyraulbr1/kingdom-gps-editor` denegado** (token del cloud agent solo tiene acceso a `github-pages`).

## Cómo aplicar en tu PC

```bat
cd C:\ruta\a\kingdom-gps-editor
git checkout -b cursor/item-icon-crop-7abe
git apply path\to\item-icon-crop.diff
npm test
npm run typecheck
git add -A
git commit -m "feat(items): recorte de región como icono del objeto (Fase 3)"
git push -u origin cursor/item-icon-crop-7abe
```

El diff completo está en `docs/kingdom-gps-editor/item-icon-crop.diff` de este repo, y también como artifact del agente cloud.
