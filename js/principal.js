// ============================================================
// ARRANQUE DEL JUEGO — conecta todos los módulos en orden
// ============================================================
(async function arrancar() {

  await Usuarios.iniciar();      // 1. registro / selección de jugador
  await Guardado.iniciar();      // 2. cargar la partida del jugador (verifica firma)
  Historial.iniciarVisor();      // 3. historiales seguros (separados por jugador)
  await Dinero.iniciar();        // 4. dinero (verifica contra el historial)
  Vida.iniciar();                // 5. barra de vida
  Mochila.iniciar();             // 6. mochila de 25 casillas
  Mapa.iniciar();                // 7. mapa limpio de Mariel
  GPS.iniciar();                 // 8. punto del jugador (arrastrable + GPS real)
  Admin.cargar();                // 9. datos del administrador (posiciones, eliminados)
  Tiendas.iniciar();             // 10. tiendas
  Pesca.iniciar();               // 11. muelles de pesca
  Tesoros.iniciar();             // 12. tesoros ocultos
  Misiones.iniciar();            // 13. misiones
  Admin.iniciar();               // 14. contenido creado por el admin + su panel
  Opciones.iniciar();            // 15. menú de opciones

  // Botones de cerrar de todas las ventanas
  document.querySelectorAll('.btn-cerrar').forEach(b => {
    b.addEventListener('click', () => {
      document.getElementById(b.dataset.cierra).classList.add('oculto');
    });
  });
  // Tocar el fondo oscuro también cierra la ventana
  document.querySelectorAll('.ventana').forEach(v => {
    v.addEventListener('click', ev => {
      if (ev.target === v) v.classList.add('oculto');
    });
  });

  if (Guardado.integridadRota) {
    Notificaciones.mostrar('⚠️ Los datos guardados fueron modificados a mano (revisa el Historial)', 'error', 7000);
  }

  Notificaciones.mostrar('🌴 ¡Hola ' + Usuarios.perfilActivo.nombre + '! Arrastra el punto azul para moverte', 'info', 4500);
})();
