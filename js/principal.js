// ============================================================
// ARRANQUE DEL JUEGO — conecta todos los módulos en orden
// ============================================================
(async function arrancar() {

  await Guardado.iniciar();      // 1. cargar la partida (y verificar firma)
  Historial.iniciarVisor();      // 2. historiales seguros
  await Dinero.iniciar();        // 3. dinero (verifica contra el historial)
  Vida.iniciar();                // 4. barra de vida
  Mochila.iniciar();             // 5. mochila de 25 casillas
  Mapa.iniciar();                // 6. mapa limpio de Mariel
  GPS.iniciar();                 // 7. punto del jugador (arrastrable + GPS real)
  Tiendas.iniciar();             // 8. tiendas
  Pesca.iniciar();               // 9. muelles de pesca
  Tesoros.iniciar();             // 10. tesoros ocultos
  Misiones.iniciar();            // 11. misiones

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

  Notificaciones.mostrar('🌴 Bienvenido a Mariel. Arrastra el punto azul para moverte', 'info', 4500);
})();
