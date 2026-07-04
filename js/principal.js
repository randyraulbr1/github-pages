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
  await Admin.cargar();          // 9. mundo publicado en GitHub + borradores del admin
  Tiendas.iniciar();             // 10. tiendas
  Pesca.iniciar();               // 11. muelles de pesca
  Tesoros.iniciar();             // 12. tesoros ocultos
  Misiones.iniciar();            // 13. misiones
  Correo.iniciar();              // 14. correo de intercambio entre jugadores
  Admin.iniciar();               // 15. contenido creado por el admin + su panel
  Opciones.iniciar();            // 16. menú de opciones

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
