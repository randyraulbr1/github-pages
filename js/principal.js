// ============================================================
// ARRANQUE DEL JUEGO — conecta todos los módulos en orden
// El mundo SIEMPRE carga antes de la sesión y del mapa.
// ============================================================

(function registrarMarielBoot() {
  const el = () => document.getElementById('pantalla-carga');
  const texto = () => document.getElementById('carga-texto') || document.querySelector('.carga-texto');

  window.MarielBoot = {
    avanzar(msg) {
      const t = texto();
      if (t && msg) t.textContent = msg;
    },
    mostrar(msg) {
      const c = el();
      if (!c) return;
      c.classList.remove('oculto', 'carga-detras-auth');
      c.classList.add('carga-enfrente');
      if (msg) this.avanzar(msg);
    },
    detrasAuth(msg) {
      const c = el();
      if (!c) return;
      c.classList.remove('oculto', 'carga-enfrente');
      c.classList.add('carga-detras-auth');
      if (msg) this.avanzar(msg);
    },
    enfrente(msg) {
      this.mostrar(msg);
    },
    ocultar() {
      const c = el();
      if (c) c.classList.add('oculto');
    }
  };
})();

// ---------- INDICADOR DE DESCARGA (primera instalación) ----------
(function escucharProgreso() {
  if (!('serviceWorker' in navigator)) return;
  const barra = document.querySelector('.carga-progreso');
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

async function esperarMapaListo() {
  if (typeof Mapa === 'undefined' || !Mapa.mapa) return;
  MarielBoot.avanzar('Cargando mapa…');
  await new Promise(resolve => {
    const limite = setTimeout(resolve, 5000);
    Mapa.mapa.whenReady(() => {
      Mapa.mapa.invalidateSize();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          clearTimeout(limite);
          setTimeout(resolve, 250);
        });
      });
    });
  });
}

async function conectarMultijugadorEnFondo(timeoutMs) {
  if (typeof Multijugador === 'undefined' || !Usuarios.perfilActivo || !CONFIG.servidorOnline) {
    return false;
  }
  const limite = typeof timeoutMs === 'number' ? timeoutMs : 8000;
  MarielBoot.avanzar('Conectando con otros jugadores…');
  try {
    return await Promise.race([
      Multijugador.conectarYEsperarMundo(limite),
      new Promise(resolve => setTimeout(() => resolve(false), limite + 400))
    ]);
  } catch (e) {
    return false;
  }
}

async function esperarMundoEnMapa() {
  if (typeof Admin === 'undefined' || !Admin.asegurarMundoMapaCargado) return;
  MarielBoot.avanzar('Colocando enemigos y objetos…');
  await Admin.asegurarMundoMapaCargado();
  if (typeof GPS !== 'undefined' && GPS.posicion) {
    await new Promise(resolve => setTimeout(resolve, 350));
  }
  if (typeof Multijugador !== 'undefined' && Usuarios.perfilActivo && CONFIG.servidorOnline) {
    await conectarMultijugadorEnFondo(8000);
    if (typeof Admin !== 'undefined' && Admin.pintarMapaCompleto) {
      Admin.pintarMapaCompleto();
    }
    if (typeof Admin !== 'undefined' && typeof Notificaciones !== 'undefined' &&
        !Usuarios.esAdministrador() && Admin._contarElementosMapa(Admin.publicado || {}) === 0) {
      Notificaciones.mostrar(
        '🗺️ El mapa aún no tiene objetos publicados. El admin debe colocarlos y pulsar Guardar mapa.',
        'info', 8000
      );
    }
  }
}

async function asegurarMapaVisible() {
  if (typeof Mapa === 'undefined') return false;
  const ok = await Mapa.asegurarIniciado();
  if (!ok) return false;
  Mapa.refrescarTamano();
  if (typeof Guardado !== 'undefined') Guardado._asegurarPosicionJugador?.();
  if (typeof GPS !== 'undefined') {
    if (!GPS.marcador && Mapa.mapa && typeof Guardado !== 'undefined' && Guardado.datos) {
      try { GPS.iniciar(); } catch (e) { console.warn('GPS fallback:', e); }
    } else {
      GPS.aplicarPosicionGuardada?.();
    }
  }
  Mapa.refrescarTamano();
  if (typeof GPS !== 'undefined' && GPS.posicion) {
    Mapa.centrarEnJugador(false);
  } else if (Mapa.restaurarVista) {
    Mapa.restaurarVista();
  }
  setTimeout(() => Mapa.refrescarTamano(), 500);
  return true;
}

(async function arrancar() {
  if (typeof MarielVersion !== 'undefined') {
    await MarielVersion.comprobarRemota({ bloquear: false });
  }

  const ocultarCarga = () => MarielBoot.ocultar();
  const avanzarCarga = (msg) => MarielBoot.avanzar(msg);
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
    MarielBoot.mostrar('Conectando con la nube…');

    // Mapa visible desde el primer momento (no esperar al servidor)
    await pasoSeguro('mapa-temprano', () => Mapa.asegurarIniciado());

    // —— FASE 1: MUNDO DESDE SERVIDOR (SQLite en Render) ——
    await pasoSeguro('mundo-remoto', async () => {
      const texto = await MundoPublico.descargar();
      if (texto && typeof Admin !== 'undefined') {
        Admin._crudoPublicado = texto;
      }
    });
    avanzarCarga('Descargando el mundo…');
    await pasoSeguro('mundo', () => Admin.cargar());
    if (typeof Admin !== 'undefined' && !Admin._mundoCargado) {
      Admin._mundoCargado = true;
      if (!Admin.publicado) {
        Admin.publicado = {
          misiones: [], tesoros: [], objetos: [], posiciones: {}, eliminados: [],
          precios: {}, itemsNuevos: [], jugadores: [], cofres: [], partidas: {}
        };
      }
      console.warn('Mundo incompleto: se continúa con mapa local vacío');
    }

    // —— FASE 2: SESIÓN (login si hace falta; el mundo ya está listo) ——
    avanzarCarga('Comprobando sesión…');
    await Usuarios.iniciar();
    if (Usuarios.perfilActivo && typeof Admin !== 'undefined' && Admin.refrescarMundoTrasLogin) {
      await pasoSeguro('mundo-servidor', () => Admin.refrescarMundoTrasLogin());
      await pasoSeguro('cuenta-mundo', () => Usuarios.verificarCuentaEnMundo());
    }
    if (Usuarios.perfilActivo && CONFIG.servidorOnline) {
      await pasoSeguro('token-servidor', async () => {
        if (typeof SyncServidor === 'undefined') return;
        if (SyncServidor.puedePublicar()) {
          const ok = await SyncServidor.verificarToken();
          if (ok) return;
        }
        await SyncServidor.asegurarSesionServidor(
          Usuarios.esAdministrador() ? { pedirClave: false } : {}
        );
      });
    }
    if (Usuarios._cuentaEliminada) {
      ocultarCarga();
      return;
    }

    // —— FASE 3: PARTIDA DEL JUGADOR ACTIVO ——
    avanzarCarga('Cargando tu partida…');
    await pasoSeguro('partida', () => Guardado.iniciar());
    Usuarios.iniciarVigilanciaSesion();

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
        boton.addEventListener('click', () => {
          pantalla.classList.add('oculto');
          Admin.solicitarAcceso();
        });
      }
      return;
    }

    // —— FASE 4: SISTEMAS DEL JUEGO ——
    avanzarCarga('Preparando el mapa…');
    Historial.iniciarVisor();
    Notificaciones.iniciarVisor();
    await pasoSeguro('dinero', () => Dinero.iniciar());
    Vida.iniciar();
    Mochila.iniciar();
    if (typeof L === 'undefined') throw new Error('No se cargó el mapa (Leaflet)');
    await pasoSeguro('mapa', () => Mapa.asegurarIniciado());
    await pasoSeguro('gps', () => { if (!GPS.marcador) GPS.iniciar(); });
    Tiendas.iniciar();
    Pesca.iniciar();
    Tesoros.iniciar();
    Misiones.iniciar();
    if (typeof Enemigos !== 'undefined') Enemigos.iniciar();
    Correo.iniciar();
    Cofres.iniciar();
    await pasoSeguro('admin', () => { Admin.iniciar(); });
    await pasoSeguro('opciones', () => { Opciones.iniciar(); });
    if (typeof Amigos !== 'undefined') Amigos.iniciarUI();
    Mapa.restaurarVista();

    document.querySelectorAll('.btn-cerrar').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.dataset.cierra;
        if (id === 'ventana-combate') return;
        if (id === 'ventana-admin' && typeof Admin !== 'undefined' && Admin.cerrarPanel) {
          Admin.cerrarPanel();
          return;
        }
        document.getElementById(id).classList.add('oculto');
      });
    });
    document.querySelectorAll('.ventana').forEach(v => {
      if (v.id === 'ventana-combate') return;
      v.addEventListener('click', ev => {
        if (ev.target === v) v.classList.add('oculto');
      });
    });

    // —— FASE 5: MAPA LISTO ANTES DE ENTRAR ——
    await esperarMapaListo();
    await esperarMundoEnMapa();
    if (Usuarios.perfilActivo && typeof Admin !== 'undefined') {
      await pasoSeguro('mundo-jugador', async () => {
        if (Admin.refrescarMundoTrasLogin) await Admin.refrescarMundoTrasLogin();
        else if (typeof Multijugador !== 'undefined' && Multijugador.obtenerMundoServidor) {
          await Multijugador.obtenerMundoServidor();
        }
        if (Admin.pintarMapaCompleto) Admin.pintarMapaCompleto();
        if (typeof Multijugador !== 'undefined' && Multijugador._sincronizarPinesPartida) {
          Multijugador._sincronizarPinesPartida();
        }
      });
    }

    if (Guardado.integridadRota) {
      Notificaciones.mostrar('⚠️ Los datos guardados fueron modificados a mano (revisa el Historial)', 'error', 7000);
    }

    if (Usuarios.perfilActivo) {
      const cambio = sessionStorage.getItem('mariel_cambio_sesion');
      if (cambio) {
        sessionStorage.removeItem('mariel_cambio_sesion');
        Notificaciones.mostrar('🎮 Jugando como ' + Usuarios.perfilActivo.nombre, 'exito', 4000);
      } else {
        Notificaciones.mostrar('🌴 ¡Hola ' + Usuarios.perfilActivo.nombre + '! Toca 📍 para usar tu GPS', 'info', 4500);
      }
      if (typeof Multijugador !== 'undefined' && !Multijugador.activo) {
        conectarMultijugadorEnFondo(10000).then(ok => {
          if (ok && Multijugador.activo && typeof Notificaciones !== 'undefined') {
            Notificaciones.mostrar('📡 Conectado al servidor en vivo', 'info', 2500);
          }
        }).catch(() => {});
      }
      Guardado.sincronizarNube(true).catch(() => {});
      if (!Usuarios.perfilActivo.telefono) {
        Notificaciones.mostrar('📱 Registra tu número de teléfono en ⚙️ Opciones para poder recibir recompensas', 'alerta', 8000);
      }
    }

    if (typeof Admin !== 'undefined' && Admin.mostrarMensajes) Admin.mostrarMensajes();
    if (typeof Notificaciones !== 'undefined') Notificaciones._actualizarBadge();

    await pasoSeguro('mapa-jugador-final', () => asegurarMapaVisible());
    if (typeof Opciones !== 'undefined') Opciones._refrescarAdmin?.();
  } catch (e) {
    console.error('Error arrancando Mariel Explorer:', e);
    MarielBoot.avanzar('Error al cargar. Recarga la página.');
    if (typeof Notificaciones !== 'undefined') {
      Notificaciones.mostrar(
        '⚠️ No se pudo cargar todo. Recarga la página o revisa tu conexión.',
        'error', 9000
      );
    }
  } finally {
    ocultarCarga();
    await pasoSeguro('mapa-final', () => asegurarMapaVisible());
    if (typeof Opciones !== 'undefined') Opciones._refrescarAdmin?.();
    if (typeof MarielVersion !== 'undefined') {
      await MarielVersion.aplicarBloqueoTrasArranque();
      MarielVersion._evitarBloqueoFantasma?.();
    }
  }
})();
