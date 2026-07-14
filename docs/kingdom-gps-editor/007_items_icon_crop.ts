/**
 * Fase 3 — región de recorte del icono de un objeto.
 * Guarda un rectángulo en píxeles sobre la imagen de la biblioteca de iconos
 * (no la imagen entera). NULL = usar imagen completa.
 */
export const id = '007_items_icon_crop'

export const sql = `
ALTER TABLE items ADD COLUMN icon_crop TEXT;
`
