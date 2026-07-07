// ============================================================
// TESOROS OCULTOS
//  - Invisibles en el mapa
//  - Con el "Buscador de tesoros" en la mochila, al acercarte a
//    menos de 150 m aparece arriba el aviso "Tesoro cerca" con
//    los metros actualizándose en vivo (sube/baja al moverte)
//  - A menos de 10 m aparece el icono ✨ en el mapa; si te
//    alejas, se vuelve a esconder
//  - Al tocarlo: animación volando a la mochila + premio
// ============================================================
const Tesoros = {
  activos: [], // { datos, marcadorVisible }

  iniciar() {
    for (const t of DATOS_TESOROS) {
      if (Admin.eliminado(t.id)) continue;
      Admin.pos(t.id, t.posicion);
      if (typeof Admin !== 'undefined' && Admin._tesoroDisponiblePorId &&
          !Admin._tesoroDisponiblePorId(t.id, 0)) continue;
      if (Guardado.datos.tesorosRecogidos.includes(t.id)) continue;
      if (Mapa.puntosInteractivos.some(p => p.id === t.id)) continue;
      const estado = { datos: t, marcador: null };
      this.activos.push(estado);
      Mapa.registrarPunto({
        id: t.id,
        posicion: t.posicion,
        radio: CONFIG.distanciaInteraccion,
        marcador: null,
        alCambiarDistancia: d => this._segunDistancia(estado, d)
      });
    }
  },

  _segunDistancia(estado, distancia) {
    const tid = estado.datos.id;
    if (typeof Admin !== 'undefined' && Admin._tesoroDisponiblePorId &&
        !Admin._tesoroDisponiblePorId(tid, 0)) {
      if (estado.marcador) { estado.marcador.remove(); estado.marcador = null; }
      return;
    }
    if (Guardado.datos.tesorosRecogidos.includes(tid)) return;

    // El icono solo existe estando MUY cerca; si te alejas, se esconde
    if (distancia <= CONFIG.distanciaVerTesoro && !estado.marcador) {
      if (estado.marcador) {
        try { estado.marcador.remove(); } catch (e) { /* */ }
        estado.marcador = null;
      }
      estado.marcador = L.marker(estado.datos.posicion, {
        icon: L.divIcon({
          className: '',
          html: '<div class="icono-tesoro">✨</div>',
          iconSize: [34, 34],
          iconAnchor: [17, 17]
        })
      }).addTo(Mapa.mapa);
      estado.marcador.on('click', () => this._recoger(estado));
      Notificaciones.mostrar('✨ ¡Algo brilla en el suelo!', 'alerta');
    } else if (distancia > CONFIG.distanciaVerTesoro && estado.marcador) {
      estado.marcador.remove();
      estado.marcador = null;
    }

    this._actualizarBanner();
  },

  // Llamado también por la mochila cuando cambia su contenido
  refrescarBanner() { this._actualizarBanner(); },

  // Banner superior: muestra el tesoro detectable más cercano.
  // Cuenta los tesoros base (con el Buscador de tesoros) y también los
  // tesoros invisibles creados por el admin (con el objeto que él eligió).
  _actualizarBanner() {
    const banner = document.getElementById('banner-tesoro');
    if (!GPS.posicion) return;

    let masCerca = Infinity;
    if (Mochila.tieneItem('buscador_tesoros')) {
      for (const e of this.activos) {
        if (Guardado.datos.tesorosRecogidos.includes(e.datos.id)) continue;
        const d = Utilidades.distanciaMetros(GPS.posicion, e.datos.posicion);
        if (d < masCerca) masCerca = d;
      }
    }
    if (typeof Admin !== 'undefined') {
      for (const pos of Admin.tesorosDetectables()) {
        const d = Utilidades.distanciaMetros(GPS.posicion, pos);
        if (d < masCerca) masCerca = d;
      }
    }

    if (masCerca <= CONFIG.distanciaDetectorTesoro) {
      // Distancia aproximada (redondeada a 5 m para no dar el punto exacto)
      document.getElementById('tesoro-metros').textContent = Math.max(5, Math.round(masCerca / 5) * 5);
      banner.classList.remove('oculto');
    } else {
      banner.classList.add('oculto');
    }
  },

  async _recoger(estado) {
    const t = estado.datos;
    const d = Utilidades.distanciaMetros(GPS.posicion, t.posicion);
    if (d > CONFIG.distanciaInteraccion) return;
    if (typeof Admin !== 'undefined' && Admin._tesoroDisponiblePorId &&
        !Admin._tesoroDisponiblePorId(t.id, 0)) return;
    if (Guardado.datos.tesorosRecogidos.includes(t.id)) return;

    if (typeof Multijugador !== 'undefined' && Multijugador.activo && CONFIG.servidorOnline) {
      const ok = await Multijugador.recogerTesoroCompartido(t.id);
      if (!ok) return;
    } else if (typeof Admin !== 'undefined') {
      Admin.aplicarRecogidaTesoro(t.id, Date.now());
      if (Admin.esAdminJugador()) {
        Admin.guardar();
        Admin._publicarParaTodos(true);
      }
    }

    if (!Guardado.datos.tesorosRecogidos.includes(t.id)) {
      Guardado.datos.tesorosRecogidos.push(t.id);
    }
    Guardado.guardar();

    // Animación: el tesoro vuela hacia la mochila
    const punto = Mapa.mapa.latLngToContainerPoint(t.posicion);
    Utilidades.volarHaciaMochila('✨', punto.x, punto.y);

    if (estado.marcador) { estado.marcador.remove(); estado.marcador = null; }

    // Premio: un objeto de tesoro al azar + dinero
    const idPremio = Items.tesoroAleatorio();
    const premio = Items.obtener(idPremio);
    setTimeout(async () => {
      Mochila.agregar(idPremio, 1, { silencioso: true });
      await Dinero.ganar(t.dinero, 'Tesoro encontrado: ' + premio.nombre);
      Notificaciones.mostrar('🏴‍☠️ ¡Tesoro! ' + premio.icono + ' ' + premio.nombre + ' + $' + t.dinero, 'exito', 5000);
      Misiones.evento('tesoro_recogido', t.id);
      this._actualizarBanner();
    }, 800);
  }
};
