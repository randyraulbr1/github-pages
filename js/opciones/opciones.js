// ============================================================
// MENÚ DE OPCIONES
// ============================================================
const Opciones = {

  iniciar() {
    document.getElementById('btn-opciones').addEventListener('click', () => this.abrir());
    const adminBtn = document.getElementById('btn-admin');
    if (adminBtn) adminBtn.addEventListener('click', () => Admin.solicitarAcceso());
    this._refrescarAdmin();

    document.getElementById('opcion-centrar').addEventListener('click', () => {
      Mapa.centrarEnJugador(true);
      this.cerrar();
    });

    document.getElementById('opcion-salir').addEventListener('click', () => {
      if (confirm('¿Cerrar sesión y volver a la pantalla de inicio?')) {
        this.cerrar();
        Usuarios.cerrarSesion();
      }
    });

    document.getElementById('opcion-tarjeta').addEventListener('click', () => this.copiarTarjeta());

    document.getElementById('opcion-borrar').addEventListener('click', () => {
      if (confirm('¿Seguro? Se borra TODA tu partida (dinero, mochila e historial) y empiezas de cero.')) {
        Guardado.borrarPartidaActual();
      }
    });

    const rep = document.getElementById('opcion-reportar');
    if (rep) rep.addEventListener('click', () => this.reportar());
  },

  pintarPerfilOpciones() {
    const perfil = Usuarios.perfilActivo;
    if (!perfil) return;
    const nom = document.getElementById('opciones-nombre');
    const grid = document.getElementById('opciones-stats-grid');
    const idEl = document.getElementById('opciones-id');
    const av = document.getElementById('opciones-avatar');
    if (nom) nom.textContent = perfil.nombre || 'Jugador';
    if (av) av.textContent = (perfil.nombre || '?').charAt(0).toUpperCase();
    const nivel = (typeof Vida !== 'undefined') ? Vida.nivel : 1;
    const vida = (typeof Vida !== 'undefined') ? Vida.actual : CONFIG.vidaMaxima;
    const maxVida = (typeof Vida !== 'undefined') ? Vida.vidaMaxima() : CONFIG.vidaMaxima;
    const hambre = (typeof Vida !== 'undefined') ? Vida.hambre : CONFIG.hambreInicial;
    const oro = (typeof Dinero !== 'undefined') ? Dinero.saldo : 0;
    if (grid) {
      grid.innerHTML =
        '<div class="perfil-stat-chip">Nivel<b>Nv ' + nivel + '</b></div>' +
        '<div class="perfil-stat-chip">Vida<b>❤️ ' + vida + '/' + maxVida + '</b></div>' +
        '<div class="perfil-stat-chip">Hambre<b>🍽️ ' + hambre + '/' + CONFIG.hambreMaxima + '</b></div>' +
        '<div class="perfil-stat-chip">Oro<b>💰 $' + oro + '</b></div>';
    }
    if (idEl) {
      idEl.textContent = (perfil.telefono ? '📱 ' + perfil.telefono + ' · ' : '') + perfil.id;
    }
  },

  abrir() {
    this._refrescarAdmin();
    this.pintarPerfilOpciones();
    document.getElementById('ventana-opciones').classList.remove('oculto');
  },

  _refrescarAdmin() {
    const btn = document.getElementById('btn-admin');
    if (btn) btn.classList.toggle('oculto', !Usuarios.esAdministrador());
  },

  cerrar() {
    document.getElementById('ventana-opciones').classList.add('oculto');
  },

  async generarTarjeta() {
    const malas = (await Historial.verificar('dinero')).length +
                  (await Historial.verificar('objetos')).length;
    const datos = {
      id: Usuarios.perfilActivo.id,
      nombre: Usuarios.perfilActivo.nombre,
      telefono: Usuarios.perfilActivo.telefono || '',
      dinero: Dinero.saldo,
      vida: Vida.actual,
      hambre: Vida.hambre,
      nivel: Vida.nivel,
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
