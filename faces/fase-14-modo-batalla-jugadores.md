# FASE 14 - Modo batalla entre jugadores

Estado: ⏳ Pendiente

## Objetivo

Crear un sistema de batalla PvP voluntario entre jugadores, sin molestar a quien no quiera pelear y sin afectar la vida real del jugador fuera de la batalla.

La batalla debe funcionar por invitacion: un jugador invita y el otro decide si acepta.

## Regla principal

Nadie debe entrar en batalla sin aceptar.

El sistema debe ser entretenido, seguro y no molesto.

## Invitaciones de batalla

Un jugador puede tocar a otro jugador cercano y enviar una invitacion de batalla.

La invitacion debe mostrar:

- nombre del jugador que invita
- nivel si existe
- boton Aceptar
- boton Rechazar
- boton No recibir batallas por un tiempo

Opciones de rechazo rapido:

- No aceptar batallas por 1 minuto
- No aceptar batallas por 5 minutos
- No aceptar batallas por 15 minutos
- No aceptar ninguna batalla

Si el jugador activa bloqueo temporal, las invitaciones no deben aparecer durante ese tiempo.

## Ajuste global

En Ajustes debe existir una opcion:

- Aceptar invitaciones de batalla: Si / No

Si esta en No:

- ningun jugador puede mandarle invitaciones visibles
- el sistema puede mostrar al que invita: Este jugador no acepta batallas ahora

El jugador puede volver a activar las invitaciones cuando quiera.

## Inicio de combate

Cuando ambos aceptan:

1. El servidor guarda la vida actual de cada jugador.
2. El servidor crea una batalla con id unico.
3. Los dos jugadores entran a una ventana/escena de batalla.
4. Mientras estan en batalla, no deben perder vida real del mundo.
5. Al terminar, se restaura la vida que tenian antes de la batalla.

Importante:

La vida de batalla es temporal.

Ejemplo:

Jugador A tenia 70 de vida antes de pelear.
Jugador B tenia 45 de vida antes de pelear.

Al terminar, aunque alguien pierda en combate:

Jugador A vuelve a 70.
Jugador B vuelve a 45.

## Combate

El combate debe ser entre 2 jugadores.

Datos que debe calcular el servidor:

- dano realizado por cada jugador
- golpes acertados
- golpes fallados
- bloqueos si existen
- criticos si existen
- vida restante de batalla
- ganador
- duracion

El cliente solo muestra animaciones y botones. El servidor decide el resultado real.

## Fin de batalla

Al ganar alguien:

Debe aparecer un cartel de resumen:

- ganador
- perdedor
- dano total de cada uno
- fallos de cada uno
- golpes acertados
- duracion
- recompensa si aplica

Debe haber un boton:

- Terminar

Cuando ambos terminan o cuando el tiempo de cierre pasa:

- se cierra la ventana de batalla
- se restaura la vida original de ambos
- vuelven al mapa normal

## Recompensas opcionales

Para evitar abuso, al inicio puede no dar recompensas fuertes.

Ideas futuras:

- medallas PvP
- contador de victorias
- ranking amistoso
- recompensa pequena diaria
- logro por ganar X batallas

No dar objetos valiosos ilimitados para evitar farming entre amigos.

## Antimolestia / anti spam

Reglas recomendadas:

- No enviar muchas invitaciones seguidas al mismo jugador.
- Cooldown por invitacion rechazada.
- Si alguien rechaza, no insistir por unos segundos.
- Si el receptor esta en menu importante, no tapar todo con la invitacion.
- La invitacion debe ser pequena y clara.

## Seguridad

El servidor debe validar:

- que ambos jugadores aceptaron
- que no estan ya en otra batalla
- que estan conectados
- que no estan bloqueando invitaciones
- que no estan demasiado lejos si se requiere cercania
- vida original antes de batalla
- resultado del combate
- restauracion de vida al terminar

Nunca confiar en el cliente para:

- dano
- vida
- ganador
- recompensa
- estadisticas

## Desconexion durante batalla

Si un jugador se desconecta:

- la batalla se marca como abandonada
- el otro puede ganar por abandono o la batalla se cancela
- ambos recuperan la vida original
- se guarda nota en historial

Regla importante:

Nunca dejar a un jugador con la vida temporal de batalla al volver al mapa.

## Interfaz

Debe seguir el estilo del inventario y del UIManager.

Pantallas:

- invitacion de batalla
- ventana de combate
- resumen final
- ajustes de invitaciones

El cartel de invitacion no debe quedar detras de otras capas.

Debe pasar por UIManager.

## Pruebas obligatorias

- Jugador A invita a jugador B.
- B acepta y empieza batalla.
- B rechaza y no empieza batalla.
- B activa no aceptar por 1 minuto.
- B activa no aceptar por 5 minutos.
- B desactiva todas las batallas en ajustes.
- Al iniciar, se guarda vida original de ambos.
- Al terminar, se restaura la vida original.
- Se muestra resumen con dano, fallos y ganador.
- Si alguien se desconecta, no pierde vida real.
- No se puede entrar en dos batallas a la vez.
- Probar en PC y Android.

## Nota para Cursor

Esto es nuevo pedido por Randy.

Implementarlo despues de cerrar UIManager y la base de objetos/estadisticas.

No mezclar con la fase de catalogo de objetos ni con misiones.

Primero crear el flujo basico:

1. invitacion
2. aceptar/rechazar
3. bloqueo temporal de invitaciones
4. batalla simple
5. resumen final
6. restaurar vida original

Luego agregar ranking, recompensas o efectos avanzados.
