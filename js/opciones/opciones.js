// ============================================================
// MENÚ DE OPCIONES
// ============================================================
const Opciones = {

  iniciar() {
    document.getElementById('btn-opciones').addEventListener('click', () => this.abrir());

    document.getElementById('opcion-centrar').addEventListener('click', () => {
      Mapa.mapa.setView(GPS.posicion, 17);
      this.cerrar();
    });

    document.getElementById('opcion-cambiar').addEventListener('click', () => {
      Usuarios.cambiarJugador();
    });

    document.getElementById('opcion-admin').addEventListener('click', () => {
      this.cerrar();
      Admin.solicitarAcceso();
    });

    document.getElementById('opcion-borrar').addEventListener('click', () => {
      if (confirm('¿Seguro? Se borra TODA tu partida (dinero, mochila e historial) y empiezas de cero.')) {
        Guardado.borrarPartidaActual();
      }
    });
  },

  abrir() {
    document.getElementById('opciones-nombre').textContent =
      Usuarios.perfilActivo ? Usuarios.perfilActivo.nombre : '—';
    document.getElementById('opciones-id').textContent =
      Usuarios.perfilActivo ? Usuarios.perfilActivo.id : '—';
    document.getElementById('ventana-opciones').classList.remove('oculto');
  },

  cerrar() {
    document.getElementById('ventana-opciones').classList.add('oculto');
  }
};
