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

    document.getElementById('opcion-tarjeta').addEventListener('click', () => this.copiarTarjeta());
    document.getElementById('opcion-reportar').addEventListener('click', () => this.reportar());

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
  },

  // ---------- TARJETA DE JUGADOR ----------
  // Código firmado con el estado del jugador: sirve para mostrar tu perfil
  // a otros o para que el admin te revise (se manda por WhatsApp)
  async generarTarjeta() {
    const malas = (await Historial.verificar('dinero')).length +
                  (await Historial.verificar('objetos')).length;
    const datos = {
      id: Usuarios.perfilActivo.id,
      nombre: Usuarios.perfilActivo.nombre,
      dinero: Dinero.saldo,
      vida: Vida.actual,
      objetos: Mochila.slots.reduce((s, sl) => s + (sl ? sl.cantidad : 0), 0),
      integro: malas === 0 && !Guardado.integridadRota,
      t: Date.now()
    };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(datos))));
    const firma = (await Utilidades.sha256(Guardado.SAL + '|tarjeta|' + b64)).slice(0, 8);
    return 'TJ.' + b64 + '.' + firma;
  },

  async leerTarjeta(codigo) {
    const partes = codigo.split('.');
    if (partes.length !== 3 || partes[0] !== 'TJ') return null;
    const esperada = (await Utilidades.sha256(Guardado.SAL + '|tarjeta|' + partes[1])).slice(0, 8);
    if (esperada !== partes[2]) return null;
    try {
      return JSON.parse(decodeURIComponent(escape(atob(partes[1]))));
    } catch (e) { return null; }
  },

  async copiarTarjeta() {
    const codigo = await this.generarTarjeta();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(codigo)
        .then(() => Notificaciones.mostrar('🪪 Tarjeta copiada: mándala por WhatsApp a quien quiera ver tu perfil', 'exito', 6000))
        .catch(() => prompt('Copia tu tarjeta:', codigo));
    } else {
      prompt('Copia tu tarjeta:', codigo);
    }
  },

  // ---------- REPORTAR JUGADOR ----------
  reportar() {
    const idReportado = prompt('ID del jugador que quieres reportar (pídele su tarjeta o su ID):');
    if (!idReportado || !idReportado.trim()) return;
    const motivo = prompt('¿Qué hizo? Explica el motivo:');
    if (!motivo || !motivo.trim()) return;
    const texto = '🚩 REPORTE — Mariel Explorer\n' +
      'Reporta: ' + Usuarios.perfilActivo.nombre + ' (ID: ' + Usuarios.perfilActivo.id + ')\n' +
      'Reportado: ' + idReportado.trim() + '\n' +
      'Motivo: ' + motivo.trim() + '\n' +
      'Fecha: ' + Utilidades.fechaLegible(Date.now());
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto)
        .then(() => Notificaciones.mostrar('🚩 Reporte copiado: mándaselo al administrador por WhatsApp', 'exito', 7000))
        .catch(() => prompt('Copia el reporte y mándaselo al administrador:', texto));
    } else {
      prompt('Copia el reporte y mándaselo al administrador:', texto);
    }
  }
};
