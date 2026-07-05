// ============================================================
// ARRANQUE DEL JUEGO — conecta todos los módulos en orden
// (la pantalla de carga se muestra sola desde el HTML y se
// esconde aquí cuando todo está listo)
// ============================================================

// ---------- INDICADOR DE DESCARGA (primera instalación) ----------
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
  const pasoSeguro = async (nombre, fn) => {
    try {
      await fn();
    } catch (e) {
      console.error('Error en paso "' + nombre + '":', e);
      if (typeof Notificaciones !== 'undefined') {
        Notificaciones.mostrar('⚠️ Problema en: ' + nombre + '. El juego sigue…', 'alerta', 5000);
      }
    }
  };

  try {
    await Usuarios.iniciar();
    avanzarCarga('Cargando tu partida…');
    await pasoSeguro('partida', () => Guardado.iniciar());
    avanzarCarga('Descargando el mundo…');
    await pasoSeguro('mundo', () => Admin.cargar());

    const bloqueo = Admin.estadoBloqueo();
    if (bloqueo) {
      ocultarCarga();
      const pantalla = document.getElementById('pantalla-bloqueo');
      pantalla.classList.remove('oculto');
      if (bloqueo.tipo === 'ban') {
        document.getElementById('bloqueo-icono').textContent = '🚫';
        document.getElementById('bloqueo-titulo').textContent = 'Cuenta suspendida';
        document.getElementById('bloqueo-mensaje').textContent = bloqueo.mensaje;
        return;
      }
      document.getElementById('bloqueo-icono').textContent = '🚧';
      document.getElementById('bloqueo-titulo').textContent = 'Juego en mantenimiento';
      document.getElementById('bloqueo-mensaje').textContent = bloqueo.mensaje;
      if (Admin.datos && Usuarios.esAdministrador() && Usuarios.perfilActivo.pinHash) {
        const boton = document.getElementById('btn-bloqueo-admin');
        boton.classList.remove('oculto');
        boton.addEventListener('click', async () => {
          const pin = prompt('Contraseña de tu cuenta:');
          if (pin === null) return;
          if (!Utilidades.claveCuentaValida(pin)) {
            alert('Contraseña inválida (mín. 8, 1 mayúscula, 1 carácter especial)');
            return;
          }
          const hash = await Utilidades.sha256('pin-perfil|' + pin.trim());
          if (hash === Usuarios.perfilActivo.pinHash) pantalla.classList.add('oculto');
          else alert('Contraseña incorrecta');
        });
      }
    }

    avanzarCarga('Preparando el mapa…');
    Historial.iniciarVisor();
    Notificaciones.iniciarVisor();
    await pasoSeguro('dinero', () => Dinero.iniciar());
    Vida.iniciar();
    Mochila.iniciar();
    if (typeof L === 'undefined') throw new Error('No se cargó el mapa (Leaflet)');
    Mapa.iniciar();
    GPS.iniciar();
    Tiendas.iniciar();
    Pesca.iniciar();
    Tesoros.iniciar();
    Misiones.iniciar();
    Correo.iniciar();
    Cofres.iniciar();
    await pasoSeguro('admin', () => { Admin.iniciar(); });
    await pasoSeguro('opciones', () => { Opciones.iniciar(); });

    document.querySelectorAll('.btn-cerrar').forEach(b => {
      b.addEventListener('click', () => {
        document.getElementById(b.dataset.cierra).classList.add('oculto');
      });
    });
    document.querySelectorAll('.ventana').forEach(v => {
      v.addEventListener('click', ev => {
        if (ev.target === v) v.classList.add('oculto');
      });
    });

    if (Guardado.integridadRota) {
      Notificaciones.mostrar('⚠️ Los datos guardados fueron modificados a mano (revisa el Historial)', 'error', 7000);
    }

    if (Usuarios.perfilActivo) {
      Notificaciones.mostrar('🌴 ¡Hola ' + Usuarios.perfilActivo.nombre + '! Arrastra el punto azul para moverte', 'info', 4500);
      if (!Usuarios.perfilActivo.telefono) {
        Notificaciones.mostrar('📱 Registra tu número de teléfono en ⚙️ Opciones para poder recibir recompensas', 'alerta', 8000);
      }
    }

    if (typeof Admin !== 'undefined' && Admin.mostrarMensajes) Admin.mostrarMensajes();
  } catch (e) {
    console.error('Error arrancando Mariel Explorer:', e);
    if (textoCarga) {
      textoCarga.textContent = 'Error al cargar. Recarga la página.';
    }
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
