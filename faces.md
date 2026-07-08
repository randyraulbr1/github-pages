# faces - Plan maestro de fases, bugs e ideas

Este archivo es la guia principal para organizar las fases, bugs, ideas, pruebas y decisiones del proyecto Kingdom GPS / juego GPS online.

Regla principal: Cursor implementa. ChatGPT solo agrega ideas, revisiones y documentacion cuando Randy lo pida. No tocar codigo desde este archivo.

---

## Reglas para Cursor

1. Trabajar una fase a la vez.
2. No empezar una fase nueva hasta terminar o pausar claramente la anterior.
3. Cuando complete una fase, marcarla como: ✅ Completada.
4. Si una fase esta en proceso, marcarla como: 🚧 En progreso.
5. Si una fase aun no empieza, marcarla como: ⏳ Pendiente.
6. Al completar una fase, dejar una nota corta de 2 a 5 lineas maximo.
7. La nota debe decir que se hizo y si quedo algo pendiente.
8. No escribir notas largas si no hace falta.
9. Si aparece un bug durante una fase, agregarlo en Bugs conocidos.
10. No agregar nuevas funciones grandes antes de cerrar seguridad, estabilidad y mundo persistente.

Formato recomendado al completar:

Estado: ✅ Completada

Nota: Se implemento y se probo en PC/Android. Queda pendiente revisar rendimiento con mas jugadores.

---

## Prioridades generales

1. No perder cuentas ni jugadores.
2. No perder el mundo creado por el ADM.
3. Todos los jugadores deben ver el mismo mundo.
4. Funcionar con internet lento y telefonos normales.
5. Interfaz clara, comoda y sin bugs de capas.
6. No agregar funciones nuevas si rompen estabilidad.

---

# FASE 1 - Seguridad critica del servidor

Estado: ⏳ Pendiente de confirmar deploy/pruebas

Objetivo: cerrar huecos donde un jugador pueda volverse admin, modificar datos ajenos o romper el servidor.

Incluye:

- Reservar nombres de administrador.
- No usar JWT_SECRET por defecto en produccion.
- Validar que un jugador solo edite su propia partida.
- Rechazar cambios de inventario enviados directamente desde cliente.
- Proteger contra borrado accidental de cuentas.

Pruebas:

- Intentar registrar nombre admin como jugador normal debe fallar.
- Intentar modificar partida ajena debe fallar.
- Intentar actualizar inventario desde cliente debe fallar.
- Servidor no debe arrancar con secreto de desarrollo.

---

# FASE 2 - Estabilidad del servidor

Estado: ⏳ Pendiente

Objetivo: hacer el servidor mas estable antes de agregar funciones nuevas.

Incluye:

- Roles reales en base de datos: owner, admin, moderador, tester, jugador.
- JWT con role.
- Permisos por rol, no por nombre.
- Validar HP, hambre, XP y otros stats en servidor.
- Log de auditoria cuando el admin edita partida ajena.
- Evitar sincronizaciones repetidas si no hay cambios reales.

Como hacerlo:

- Agregar columna role a users.
- Mantener compatibilidad con cuentas existentes.
- Crear helpers de permisos: isOwner, isAdmin, isModerator.
- Registrar acciones admin importantes.

Pruebas:

- Cuenta normal no puede abrir funciones admin.
- Admin real conserva permisos.
- Jugador no puede ponerse vida/XP imposible.
- Se guarda log cuando admin edita algo.

---

# FASE 3 - Fuente unica del mundo

Estado: ⏳ Pendiente

Objetivo: evitar que algunos jugadores vean objetos y otros no.

Problema a evitar:

- Mundo en tablas de base de datos.
- Mundo en snapshot JSON.
- Dos fuentes pueden causar diferencias.

Regla:

Base de datos = mundo oficial.
Snapshot = backup/recuperacion.

Incluye:

- Definir una fuente unica para objetos, misiones, cofres, enemigos y pines.
- Publicar cambios por objeto, no subir el mundo completo cada vez.
- Mantener historial de cambios.
- Permitir restaurar una version anterior.

Pruebas:

- ADM crea un cofre y dos jugadores lo ven.
- Reiniciar servidor y el cofre sigue.
- Borrar cache del telefono y el mundo carga igual.
- Si snapshot falla, la base de datos no borra mundo.

---

# FASE 4 - Rendimiento GPS para Cuba

Estado: ⏳ Pendiente

Objetivo: que el juego sea ligero y funcione con internet lento.

Incluye:

- No enviar movimientos a todos los jugadores.
- Enviar solo jugadores cercanos.
- Usar zonas/chunks.
- Actualizar por distancia o cada pocos segundos.
- Reducir datos repetidos.

Regla:

El cliente solo debe recibir lo que necesita ver cerca.

Pruebas:

- 2 jugadores cerca se ven.
- 2 jugadores lejos no reciben datos innecesarios.
- Con 20 jugadores no se dispara el consumo.
- En internet lento el juego reconecta sin romperse.

---

# FASE 5 - Estandar de interfaz UI/UX

Estado: ⏳ Pendiente

Objetivo: que toda la interfaz se vea igual, sea facil de tocar y no tenga bugs visuales.

Referencia visual:

Usar el inventario actual como base porque esta bien logrado.

Reglas:

- No cambiar tamano del inventario sin razon.
- Botones con tamanos consistentes.
- No usar scroll si no hace falta.
- Botones tactiles grandes aunque el icono sea pequeno.
- Separacion clara entre botones.
- Mismo estilo para ventanas, carteles, barras y menus.

En PC:

- Aplicar user-select: none a botones, HUD, inventario, paneles y menus.
- No permitir seleccionar texto al dejar clic apretado.
- Excepcion: inputs, chat, cajas de texto.

Toques/clicks:

- Un toque debe hacer una sola accion.
- No permitir que un click atraviese un menu y toque el mapa detras.
- No permitir que dos botones reciban el mismo toque.
- Al abrir una ventana, debe capturar foco.

Mensajes/carteles:

- No mostrar carteles repetidos.
- Agrupar mensajes iguales.
- Ejemplo: en vez de 3 carteles de madera, mostrar +3 madera.
- Tiempo recomendado: 1 a 2 segundos.

---

# FASE 5.1 - Bugs de capas y ventanas

Estado: ⏳ Pendiente

Bug detectado:

Cuando el administrador mueve un PIN, a veces el cartel/boton para confirmar queda detras de otra capa y no se puede tocar.

Solucion esperada:

- Todo dialogo de confirmacion debe estar encima de todas las ventanas.
- Ninguna capa invisible debe bloquear los toques.
- Si hay dialogo abierto, el resto de la UI queda bloqueada detras.
- Revisar z-index / orden de render / pointer-events.

Prioridad de capas recomendada:

1. Errores criticos.
2. Confirmaciones.
3. Dialogos modales.
4. Inventario.
5. Tiendas.
6. Amigos/perfil/chat.
7. HUD.
8. Mapa.

Pruebas:

- Mover PIN muchas veces.
- Abrir admin y cerrar mientras se confirma.
- Abrir inventario y luego confirmacion.
- Confirmar con mouse en PC.
- Confirmar con dedo en Android.

---

# FASE 6 - Administrador de ventanas UI Manager

Estado: ⏳ Pendiente

Objetivo: evitar bugs de ventanas, capas, foco y botones bloqueados.

Idea:

Crear un solo sistema que controle todas las ventanas del juego.

Debe controlar:

- Que ventana esta abierta.
- Que ventana tiene foco.
- Orden de capas.
- Cierre con boton atras/ESC.
- Bloqueo de clicks al mapa cuando hay menu.
- Confirmaciones por encima de todo.

Regla:

Ninguna pantalla debe abrir otra directamente sin pasar por el UI Manager.

---

# FASE 7 - Sistema de errores amigables

Estado: ⏳ Pendiente

Objetivo: nunca mostrar errores feos al jugador.

No mostrar:

- undefined
- null
- 404
- 500
- stack trace

Mostrar:

- No se pudo conectar. Reintentando...
- No se pudo cargar esta ventana.
- Intentalo de nuevo.

Cada pantalla debe tener:

- estado cargando
- estado error
- boton reintentar
- estado vacio

---

# FASE 8 - Pruebas antes de publicar

Estado: ⏳ Pendiente

Checklist minimo:

- Crear cuenta.
- Iniciar sesion.
- GPS propio.
- Ver otro jugador.
- Inventario.
- Amigos.
- Chat.
- Bloquear jugador.
- Admin crea objeto.
- Admin mueve PIN.
- Admin borra objeto.
- Reiniciar servidor.
- Borrar cache.
- Entrar desde otro telefono.
- Probar mala conexion.
- Probar PC.
- Probar movil.

Regla:

No publicar version si una prueba critica falla.

---

# FASE 9 - Historial y restauracion

Estado: ⏳ Pendiente

Objetivo: poder deshacer errores.

Guardar historial:

- ADM creo objeto.
- ADM movio PIN.
- ADM borro cofre.
- ADM cambio mision.
- Jugador recibio recompensa.

Debe guardar:

- quien
- que hizo
- fecha
- version
- datos antes
- datos despues

---

# FASE 10 - Panel de depuracion admin

Estado: ⏳ Pendiente

Objetivo: encontrar bugs rapido sin adivinar.

Mostrar solo a owner/admin:

- version del juego
- ping
- estado servidor
- jugadores online
- objetos cargados
- zona actual
- errores recientes
- ultimo sync
- tamano de datos descargados

---

# FASE 11 - Anti spam y limites

Estado: ⏳ Pendiente

Objetivo: evitar abuso y bugs por exceso de acciones.

Agregar limites a:

- chat
- solicitudes de amistad
- registro
- mover posicion
- crear objetos admin
- publicar mundo

---

# FASE 12 - Inventario como patron visual

Estado: ⏳ Pendiente

Objetivo: usar el inventario actual como guia de diseno para todo.

Reglas:

- Las tiendas deben parecer del mismo juego.
- Amigos/chat/perfil deben usar bordes, sombras y botones similares.
- Los menus deben respetar el tamano de pantalla como el inventario.
- No crear cada pantalla con estilos diferentes.

Componentes recomendados:

- UIPanel
- UIButton
- UIToast
- UIDialog
- UIProgressBar
- UIGrid

---

# Bugs conocidos / ideas pendientes

## Bug UI - Confirmacion de mover PIN queda detras

Estado: ⏳ Pendiente

Descripcion:

Al mover un PIN como administrador, el cartel de confirmacion a veces queda debajo de otra capa y no se puede tocar.

Solucion sugerida:

- revisar z-index
- revisar pointer-events
- usar UI Manager
- confirmaciones siempre arriba

## Bug UI - Carteles repetidos

Estado: ⏳ Pendiente

Descripcion:

Algunas acciones pueden mostrar mensajes repetidos.

Solucion sugerida:

- sistema unico de toast
- agrupar mensajes iguales
- cooldown por mensaje

## Mejora PC - No seleccionar texto

Estado: ⏳ Pendiente

Descripcion:

En PC, al mantener clic sobre botones o textos de menu se puede seleccionar texto.

Solucion sugerida:

- user-select: none en UI general
- permitir seleccion solo en inputs/chat

---

# Como usar este archivo

Cursor debe leer este archivo antes de proponer cambios grandes.

Cada fase debe tener:

- objetivo
- como hacerlo
- pruebas
- prioridad
- estado
- nota corta cuando se complete

Randy puede pedir: agrega esto a faces.md, y se debe actualizar este archivo sin tocar codigo del juego.
