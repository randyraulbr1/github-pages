# FASE 13 - Catalogo fuerte de objetos en panel ADM

Estado: 🚧 En progreso (v291, pasos 1–3)

## Objetivo

Crear una seccion dedicada dentro del panel ADM para administrar todos los objetos del juego de forma ordenada, segura y persistente.

Esta seccion debe permitir crear, revisar, editar y consultar objetos sin perder datos y sin romper el juego.

## Idea principal

En el panel ADM debe existir una parte llamada algo como:

- Catalogo de objetos
- Base de datos de objetos
- Objetos del juego

Ahi deben aparecer todos los objetos en casillas ordenadas. Cuando el ADM cree un objeto nuevo, debe agregarse automaticamente a esa lista.

Cada objeto debe poder tocarse para ver su descripcion completa y sus datos reales.

## Tipos de objetos

El catalogo debe soportar como minimo:

- Consumibles
- Armas
- Cascos
- Botas
- Chalecos
- Ropa / conjuntos
- Animales / carnes / comida cruda
- Materiales
- Objetos de mision
- Objetos especiales

## Datos base de cada objeto

Cada objeto debe tener informacion clara en base de datos:

- id unico
- nombre
- icono
- tipo
- rareza
- descripcion corta
- descripcion larga
- nivel minimo si aplica
- nivel maximo recomendado si aplica
- si se puede usar
- si se puede equipar
- si se puede vender
- si se puede tirar
- si se puede comerciar
- si se pierde al morir
- fecha de creacion
- ultima modificacion
- creado por
- activo / oculto / eliminado

## Consumibles

Los consumibles no deben depender de nivel. Todos los jugadores pueden usarlos.

Debe haber consumibles por porcentaje o valor claro.

Ejemplos vida:

- Cura 10% de vida total
- Cura 20% de vida total
- Cura 30% de vida total
- Cura 45% de vida total
- Cura 60% de vida total
- Cura 75% de vida total
- Cura 100% de vida total

Tambien pueden existir consumibles de hambre:

- Da 10% de hambre
- Da 20% de hambre
- Da 30% de hambre
- Da 50% de hambre
- Da 100% de hambre

Datos recomendados para consumibles:

- efecto: vida / hambre / energia / veneno / otro
- valor
- modo: porcentaje / numero fijo
- tiempo de uso
- cooldown
- si se consume al usar

## Armas por nivel

Debe existir progresion clara de armas.

Ejemplo:

- Arma nivel 1-10
- Arma nivel 10-20
- Arma nivel 20-30
- Arma nivel 30-40
- Arma nivel 40-50

Cada arma debe tener:

- nivel minimo
- nivel recomendado
- dano minimo
- dano maximo
- velocidad de ataque
- alcance
- tipo de dano
- efectos extra si tiene
- durabilidad si aplica

## Equipos por nivel

Debe existir conjunto de equipo por rangos de nivel:

- Casco nivel 1-10
- Chaleco nivel 1-10
- Botas nivel 1-10
- Ropa nivel 1-10

Luego repetir para niveles superiores:

- 10-20
- 20-30
- 30-40
- 40-50

Cada pieza de equipo debe tener:

- ranura: casco / chaleco / botas / ropa / accesorio
- nivel minimo
- defensa
- bonus de vida
- bonus de hambre si aplica
- bonus de velocidad si aplica
- bonus de dano si aplica
- resistencia especial si aplica

Ejemplo:

Chaleco nivel 20:

- defensa +15
- vida maxima +25%
- resistencia a golpes +10%

Importante:

Los bonus solo deben funcionar mientras el objeto este equipado.

Si se quita el objeto, se quita el bonus.

## Animales y comida cruda

Agregar objetos de animales y comida cruda.

Ejemplos:

- carne cruda
- pescado crudo
- carne cocinada
- pescado cocinado

Debe tener efectos claros:

Si se come crudo puede:

- dar hambre
- quitar vida
- causar veneno
- dar probabilidad de enfermedad

Si se cocina puede:

- dar mas hambre
- no causar veneno
- curar un poco

Datos recomendados:

- se puede comer crudo
- efecto crudo
- probabilidad de efecto negativo
- version cocinada
- valor de hambre cocinado

## Interfaz en panel ADM

La seccion debe tener:

- buscador
- filtros por tipo
- filtros por nivel
- filtros por rareza
- casillas de objetos
- vista de descripcion
- boton crear objeto
- boton editar objeto
- boton duplicar objeto
- boton desactivar objeto
- boton exportar base en texto

Organizacion visual:

- izquierda: lista/casillas de objetos
- derecha: descripcion y datos
- arriba: filtros y buscador
- abajo: botones de accion

Debe seguir el estilo del inventario actual.

## Exportar base de datos a local

Agregar boton para descargar la base de objetos en texto local.

Formatos sugeridos:

- JSON para volver a importar
- TXT/Markdown para leer facil

Debe exportar:

- todos los objetos activos
- fecha de exportacion
- version del juego
- cantidad total de objetos

Esto sirve como respaldo manual para Randy.

## Seguridad y persistencia

Los datos deben guardarse en servidor/base de datos y no perderse.

Reglas:

- No confiar en el cliente.
- Validar todos los campos en servidor.
- No borrar objetos definitivamente al primer click.
- Usar estado: activo / oculto / eliminado.
- Guardar historial de cambios.
- Permitir restaurar si se edita mal.

## Conexion con el juego

El catalogo no debe ser solo visual.

Debe conectarse con:

- inventario
- tiendas
- cofres
- enemigos
- recompensas
- misiones
- equipamiento
- consumibles

Si un objeto cambia en el catalogo, el juego debe usar esos datos correctamente.

Ejemplo:

Si un chaleco da +25% vida maxima, al equiparlo debe aumentar la vida maxima y al quitarlo debe volver al valor normal.

## Pruebas obligatorias

- Crear consumible y verlo en la lista.
- Tocar consumible y ver descripcion completa.
- Usarlo y confirmar que cura lo correcto.
- Crear arma por nivel y confirmar que pide nivel correcto.
- Crear casco/chaleco/botas y equiparlos.
- Confirmar que los bonus se aplican solo equipado.
- Crear comida cruda y confirmar efecto al comerla.
- Exportar base de objetos a archivo local.
- Recargar juego y confirmar que no se pierden objetos.
- Probar desde PC y Android.

## Prioridad

Alta, pero despues de cerrar UIManager, seguridad y persistencia principal.

## Nota para Cursor

Implementar esto por partes. No hacerlo todo de golpe.

Orden recomendado:

1. Modelo de datos fuerte para objetos.
2. Panel ADM con lista y descripcion.
3. Crear/editar objetos.
4. Consumibles funcionales.
5. Equipamiento con bonus.
6. Armas por nivel.
7. Animales/comida cruda.
8. Exportar base local.

No mezclar esta fase con otros cambios grandes.
