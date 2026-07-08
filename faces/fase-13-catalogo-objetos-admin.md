# FASE 13 - Catalogo fuerte de objetos en panel ADM

Estado: ⏳ Pendiente

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
- Cocinas / hornos
- Libros
- Cartas
- Cofres de jugador
- Llaves maestras
- Buscador de tesoros

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

## Regla de inventario y apilamiento

El inventario debe respetar reglas claras por tipo de objeto.

Reglas:

- Objetos apilables: maximo 20 por casilla.
- Objetos no apilables: maximo 1 por casilla.
- Armas: siempre 1 por casilla.
- Cascos, chalecos, botas y ropa: siempre 1 por casilla.
- Herramientas especiales: normalmente 1 por casilla, salvo que el ADM indique que son apilables.
- Llaves maestras: apilables hasta 20 por casilla.
- Madera, comida, materiales y consumibles: apilables hasta 20 por casilla.

El catalogo debe tener un campo:

- stackMax

Ejemplos:

- madera -> stackMax 20
- llave maestra -> stackMax 20
- espada -> stackMax 1
- casco -> stackMax 1
- chaleco -> stackMax 1

El servidor debe validar siempre el limite de stack. El cliente solo muestra, pero no decide la verdad.

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

## Sistema de cocina / horno

Agregar un sistema de cocina parecido a un horno simple.

Objeto principal:

- Cocina / Horno portatil

Reglas:

- Si el jugador tiene una cocina en el inventario, aparece un boton pequeno arriba de la mochila.
- Ese boton debe ser aproximadamente la mitad del tamano del boton de mochila.
- No debe mover los botones inferiores ni romper el HUD.
- Al tocarlo, permite colocar un icono de cocina/horno en el mapa.
- La cocina colocada solo debe ser visible para amigos cercanos del jugador.
- Si un jugador esta usando el horno, otro no puede usarlo al mismo tiempo.
- Si otro intenta abrirlo mientras esta ocupado, mostrar: Horno ocupado.
- El propietario puede ponerlo y un amigo puede usarlo si esta libre.
- Si el usuario que lo usa se desconecta o cierra la ventana, el horno queda libre.

Ventana del horno:

- Casilla superior: objeto crudo.
- Casilla inferior: combustible.
- Casilla derecha: resultado cocinado.
- Barra de progreso.
- Boton cocinar si hay ingredientes validos.

Ejemplo:

- Poner pescado crudo.
- Poner madera como combustible.
- Esperar progreso.
- Resultado: pescado cocinado.
- El pescado cocinado da mas hambre y puede dar algo de vida.

Combustibles:

- madera
- carbon si se agrega despues
- combustible especial si el ADM lo crea

Reglas de servidor:

- El servidor valida si el jugador tiene la cocina.
- El servidor valida si esta cerca del horno.
- El servidor bloquea el horno si alguien lo esta usando.
- El servidor consume ingredientes y combustible.
- El servidor crea el resultado.
- No confiar en el cliente.

Ideas futuras:

- Recetas desbloqueables.
- Comida quemada si se cocina mal.
- Horno mejorado con mas velocidad.
- Cocina de clan o campamento.

## Sistema de libros

Agregar libros como objetos reales del inventario.

Tipos:

- Libro vacio
- Libro escrito editable
- Libro firmado no editable
- Carta corta

Funciones:

- El jugador puede escribir un libro.
- Puede editarlo mientras no este firmado.
- Puede poner titulo.
- Puede guardar paginas.
- Puede compartirlo con otros jugadores.
- Otros pueden leerlo.
- Si tiene permiso de edicion, otros tambien pueden editarlo.

Permisos sugeridos:

- privado
- solo amigos
- publico
- editable por amigos
- solo lectura

Libro firmado:

- no se puede editar
- guarda autor
- guarda fecha
- puede venderse, regalarse o guardarse

Usos en el juego:

- guias escritas por jugadores
- pistas de misiones
- diario del jugador
- libros de historia del mundo
- notas de clanes

Seguridad:

- limite de paginas
- limite de caracteres por pagina
- guardado en servidor
- historial de cambios mientras sea editable

## Sistema de cartas

Las cartas son una version corta de los libros.

Usos:

- enviar mensaje a un amigo
- dejar nota en un cofre
- mision de entregar carta
- recompensa de NPC

Las cartas tambien deben ser objetos reales conectados a la base de datos.

## Cofres de jugador y buscador de tesoros

Permitir que los jugadores coloquen cofres si tienen un objeto cofre en el inventario.

Reglas del cofre:

- Cada cofre tiene 10 casillas.
- Puede tener contrasena o no.
- Puede colocarse visible u oculto.
- Si es visible, todos los jugadores cercanos pueden verlo.
- Si es oculto, otros jugadores no lo ven normalmente.

Cofres ocultos:

- Se pueden encontrar con el objeto Buscador de Tesoros.
- El buscador indica distancia al cofre oculto mas cercano.
- Al estar a 20 metros o menos, el cofre se vuelve visible para ese jugador.

Cofres con contrasena:

- Si el jugador no sabe la contrasena, necesita Llave Maestra.
- Cada intento consume 1 Llave Maestra.
- Cada intento tiene 5% de probabilidad de abrir el cofre.
- Se puede intentar muchas veces si el jugador tiene llaves.
- No poner limite de intentos, solo consumir llave por intento.

Robo:

- Si un jugador abre un cofre ajeno, puede sacar objetos.
- El servidor debe registrar quien lo abrio y que saco.
- El dueno puede ver historial basico del cofre.

Seguridad:

- El servidor valida distancia.
- El servidor valida contrasena.
- El servidor consume llave.
- El servidor calcula el 5%.
- El servidor valida el inventario del cofre.
- El cliente nunca decide si se abre.

Ideas futuras:

- trampas para cofres
- cofres reforzados
- mapas del tesoro
- cofres de clan
- cofres que caducan si llevan mucho tiempo abandonados

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

## Editor de misiones en panel ADM

En el boton Misiones del panel ADM, separar plantillas por tipo para crear misiones mas facil.

Tipos predeterminados:

- Mision de recoleccion
- Mision de lucha
- Mision de entrega
- Mision de ir a lugar
- Mision por nivel
- Mision de cocina
- Mision de pesca
- Mision de hablar con NPC

Mision de recoleccion:

- El ADM pone el pin donde inicia la mision.
- Puede poner un segundo pin donde se busca el objeto o NPC.
- Puede pedir cierta cantidad de objetos.
- Puede contar objetos que el jugador ya tenga o solo objetos nuevos.
- El jugador entrega los objetos y completa la mision.

Mision de entrega:

- NPC A pide algo.
- El jugador recibe o busca un objeto de mision.
- Debe llevarlo a otro lugar o NPC.
- Al entregarlo, vuelve o completa segun configuracion.

Objetos de mision:

- No se pueden vender.
- No se pueden eliminar.
- No se pueden usar.
- No se pueden tirar.
- Solo sirven para la mision.
- Se borran automaticamente al completar o cancelar la mision si corresponde.

Mision por nivel:

- Completar al llegar a cierto nivel.
- Puede dar recompensa al alcanzar nivel.

Cada tipo de mision debe tener:

- icono predeterminado
- color predeterminado
- texto base editable
- recompensa editable
- requisitos editables

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
- recetas
- libros/categorias si aplica
- definiciones de cofres y llaves

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
- cocina
- libros
- cartas
- buscador de tesoros

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
- Crear horno, colocarlo y cocinar pescado con madera.
- Confirmar que si un jugador usa el horno otro no puede usarlo al mismo tiempo.
- Crear libro, editarlo, guardarlo, compartirlo y leerlo desde otra cuenta.
- Crear cofre de jugador con 10 casillas.
- Colocar cofre visible y oculto.
- Encontrar cofre oculto con Buscador de Tesoros.
- Intentar abrir cofre con Llave Maestra y confirmar 5% desde servidor.
- Confirmar que cada intento consume 1 llave.
- Confirmar stack maximo 20 por casilla.
- Confirmar que armas/equipos ocupan 1 por casilla.
- Exportar base de objetos a archivo local.
- Recargar juego y confirmar que no se pierden objetos.
- Probar desde PC y Android.

## Prioridad

Alta, pero despues de cerrar UIManager, seguridad y persistencia principal.

## Nota para Cursor

Esto es nuevo pedido por Randy. Implementar por partes y no mezclar con UIManager.

Orden recomendado:

1. Modelo de datos fuerte para objetos.
2. Reglas de stack: 20 apilables, 1 unicos.
3. Panel ADM con lista y descripcion.
4. Crear/editar objetos.
5. Consumibles funcionales.
6. Equipamiento con bonus.
7. Armas por nivel.
8. Animales/comida cruda.
9. Cocina/horno cooperativo.
10. Libros y cartas.
11. Cofres de jugador y buscador de tesoros.
12. Editor avanzado de misiones.
13. Exportar base local.

No mezclar esta fase con otros cambios grandes.
