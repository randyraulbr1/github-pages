// ============================================================
// ARRANQUE DEL JUEGO — conecta todos los módulos en orden
// (la pantalla de carga se muestra sola desde el HTML y se
// esconde aquí cuando todo está listo)
// ============================================================

// ---------- INDICADOR DE DESCARGA (primera instalación) ----------
// El Service Worker reporta cuántos KB lleva descargados al instalar.
// Solo se ve en la primera carga o cuando hay actualización.
(function escucharProgreso() {
  if (!('serviceWorker' in navigator)) return;
  const barra    = document.querySelector('.carga-progreso');
  const textoCarga = document.getElementById('carga-texto') ||
                     document.querySelector('.carga-texto');

  function formatBytes(bytes) {
    if (bytes < 1024)       return bytes + ' B';
    if (bytes < 1048576)    return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
  }

  navigator.serviceWorker.addEventListener('message', ev => {
    const d = ev.data;
    if (!d || d.tipo !== 'progreso') return;
    if (barra) barra.style.width = d.porcentaje + '%';
    if (textoCarga) {
      textoCarga.textContent =
        'Descargando… ' + d.descargados + '/' + d.total +
        ' archivos · ' + formatBytes(d.bytesTotal);
    }
  });
})();

(async function arrancar() {
  const ocultarCarga = () => {
    const el = document.getElementById('pantalla-carga');
    if (el) el.classList.add('oculto');
  };
  const textoCarga = document.getElementById('carga-texto') ||
                     document.querySelector('.carga-texto');
  const avanzarCarga = (msg) => { if (textoCarga) textoCarga.textContent = msg; };

  try {
    await Usuarios.iniciar();      // 1. registro / selección de jugador
    avanzarCarga('Cargando tu partida…');
    await Guardado.iniciar();      // 2. cargar la partida del jugador (verifica firma)
    avanzarCarga('Descargando el mundo…');
    await Admin.cargar();          // 3. mundo publicado en GitHub (items, precios, bloqueos)

    // ¿Juego en mantenimiento o jugador baneado?
    const bloqueo = Admin.estadoBloqueo();
    if (bloqueo) {
      ocultarCarga();
      const pantalla = document.getElementById('pantalla-bloqueo');
      pantalla.classList.remove('oculto');
      if (bloqueo.tipo === 'ban') {
        document.getElementById('bloqueo-icono').textContent = '🚫';
        document.getElementById('bloqueo-titulo').textContent = 'Cuenta suspendida';
        document.getElementById('bloqueo-mensaje').textContent = bloqueo.mensaje;
        return; // sin salida: el juego no arranca
      }
      document.getElementById('bloqueo-icono').textContent = '🚧';
      document.getElementById('bloqueo-titulo').textContent = 'Juego en mantenimiento';
      document.getElementById('bloqueo-mensaje').textContent = bloqueo.mensaje;
      // El administrador puede entrar con su PIN aunque haya mantenimiento
      if (Admin.datos.pinHash && Usuarios.esAdministrador()) {
        const boton = document.getElementById('btn-bloqueo-admin');
        boton.classList.remove('oculto');
        boton.addEventListener('click', async () => {
          const pin = prompt('PIN de administrador:');
          if (pin === null) return;
          const hash = await Utilidades.sha256('pin-admin|' + pin.trim());
          if (hash === Admin.datos.pinHash) pantalla.classList.add('oculto');
          else alert('PIN incorrecto');
        });
      }
      // El juego sigue arrancando por debajo para el admin
    }

    avanzarCarga('Preparando el mapa…');
    Historial.iniciarVisor();      // 4. historiales seguros (separados por jugador)
    Notificaciones.iniciarVisor(); // 5. ventana de últimos avisos
    await Dinero.iniciar();        // 6. dinero (verifica contra el historial)
    Vida.iniciar();                // 7. barra de vida
    Mochila.iniciar();             // 8. mochila de 25 casillas
    if (typeof L === 'undefined') throw new Error('No se cargó el mapa (Leaflet)');
    Mapa.iniciar();                // 9. mapa limpio de Mariel
    GPS.iniciar();                 // 10. punto del jugador (arrastrable + GPS real)
    Tiendas.iniciar();             // 11. tiendas
    Pesca.iniciar();               // 12. muelles de pesca
    Tesoros.iniciar();             // 13. tesoros ocultos
    Misiones.iniciar();            // 14. misiones
    Correo.iniciar();              // 15. correo de intercambio entre jugadores
    Admin.iniciar();               // 16. contenido creado por el admin + su panel
    Opciones.iniciar();            // 17. menú de opciones

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

    // Perfiles antiguos sin teléfono: recordarles registrarlo
    if (!Usuarios.perfilActivo.telefono) {
      Notificaciones.mostrar('📱 Registra tu número de teléfono en ⚙️ Opciones para poder recibir recompensas', 'alerta', 8000);
    }

    Admin.mostrarMensajes();       // mensajes del administrador sin leer
  } catch (e) {
    console.error('Error arrancando Mariel Explorer:', e);
    if (typeof Notificaciones !== 'undefined') {
      Notificaciones.mostrar(
        '⚠️ No se pudo cargar todo. Recarga la página o revisa tu conexión.',
        'error', 9000
      );
    }
  } finally {
    ocultarCarga();
  }
})();
