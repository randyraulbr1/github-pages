# Nota ChatGPT - Orden y pruebas antes de seguir

Fecha: 2026-07-08

## Resumen

Cursor avanzo bastante entre los PR #114, #115, #116 y #117.

Ahora la prioridad no debe ser agregar mas funciones nuevas, sino ordenar, probar y evitar conflictos entre ramas.

## Estado visto

- PR #114: UIManager, ventanas y overlays.
- PR #115: errores amigables y checklist de pruebas.
- PR #116: catalogo de objetos, consumibles, equipo, armas y cocinar.
- PR #117: panel de depuracion admin.

## Riesgo principal

Hay varios PR abiertos en draft que tocan partes relacionadas del juego.

Riesgos:

- conflictos con `faces.md`
- cambios repetidos entre ramas
- versiones diferentes del cliente
- pantallas no integradas igual con UIManager
- funciones nuevas sin pruebas reales en Android y GPS

## Orden sugerido

1. PR #114 UIManager.
2. PR #115 errores amigables.
3. PR #116 catalogo, objetos y cocinar.
4. PR #117 panel depuracion.

Si una rama ya incluye cambios de otra, revisar antes de hacer merge para no duplicar ni pisar codigo.

## Regla para juego GPS

Como el juego usa GPS y la gente puede ir caminando:

- No obligar al jugador a mirar mucho la pantalla mientras camina.
- Acciones largas deben hacerse detenido.
- Inventario, cocina, cofres, libros, admin y combates pactados deben usarse quieto.
- Botones simples y claros.
- Confirmaciones visibles.
- Si el jugador va rapido, no iniciar acciones que requieran mucha atencion.

## Prioridad actual

Estado aproximado del plan base: 72-78% si los PR pasan pruebas reales.

Prioridad real ahora:

1. estabilidad
2. pruebas
3. merge ordenado
4. deploy
5. luego funciones nuevas

## Nota para Cursor

No empezar sistemas grandes nuevos todavia.

Primero cerrar y probar UIManager, errores amigables, catalogo de objetos, cocinar y panel de depuracion.

Cuando esas fases esten estables, entonces seguir con nuevos sistemas.

- ChatGPT
