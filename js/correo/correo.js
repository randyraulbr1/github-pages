// ============================================================
// CORREO — intercambio de objetos entre jugadores
// El jugador deposita un objeto en el correo 📮: desaparece de
// su mochila y recibe un CÓDIGO DE ENVÍO único y firmado.
// Otro jugador escribe ese código en su correo y recibe el
// objeto. Como no hay servidor, el código ES el paquete: lleva
// dentro el objeto, la hora y la firma, y no se puede falsificar
// (la firma se comprueba). Cada teléfono recuerda los códigos ya
// cobrados para que no se usen dos veces.
// Si nadie lo reclama en 1 HORA, el código vence y el remitente
// puede reclamar su objeto de vuelta en el correo.
// ============================================================
const Correo = {
  POSICION: [22.9928, -82.7533], // oficina de correos, centro de Mariel
  VENCIMIENTO_MS: 60 * 60 * 1000, // 1 hora
  pestana: 'enviar',

  iniciar() {
    // Memoria del jugador: envíos hechos y códigos ya cobrados
    if (!Guardado.datos.correoEnviados) Guardado.datos.correoEnviados = [];
    if (!Guardado.datos.correoRecibidos) Guardado.datos.correoRecibidos = [];

    if (!Admin.eliminado('correo_central')) {
      Admin.pos('correo_central', this.POSICION);
      const marcador = Mapa.crearMarcadorEmoji(this.POSICION, '📮');
      Mapa.registrarPunto({
        id: 'correo_central',
        posicion: this.POSICION,
        radio: CONFIG.distanciaInteraccion,
        marcador,
        alTocar: () => this.abrir()
      });
    }

    document.getElementById('pestana-correo-enviar').addEventListener('click', () => this.cambiarPestana('enviar'));
    document.getElementById('pestana-correo-recibir').addEventListener('click', () => this.cambiarPestana('recibir'));
  },

  abrir() {
    document.getElementById('ventana-correo').classList.remove('oculto');
    this.cambiarPestana('enviar');
  },

  cambiarPestana(cual) {
    this.pestana = cual;
    document.getElementById('pestana-correo-enviar').classList.toggle('activa', cual === 'enviar');
    document.getElementById('pestana-correo-recibir').classList.toggle('activa', cual === 'recibir');
    this.pintar();
  },

  // ---------- CÓDIGOS FIRMADOS ----------
  async _generarCodigo(itemId, cantidad) {
    const datos = [itemId, cantidad, Date.now().toString(36),
      Usuarios.perfilActivo.id.slice(-6)].join('.');
    const firma = (await Utilidades.sha256(Guardado.SAL + '|correo|' + datos)).slice(0, 8);
    return datos + '.' + firma;
  },

  async _leerCodigo(codigo) {
    const partes = codigo.trim().split('.');
    if (partes.length !== 5) return null;
    const [itemId, cant, ts36, remitente, firma] = partes;
    const datos = [itemId, cant, ts36, remitente].join('.');
    const esperada = (await Utilidades.sha256(Guardado.SAL + '|correo|' + datos)).slice(0, 8);
    if (esperada !== firma) return null;
    return { itemId, cantidad: parseInt(cant, 10) || 1, t: parseInt(ts36, 36), remitente };
  },

  // ---------- ENVIAR ----------
  async enviar(itemId) {
    const item = Items.seguro(itemId);
    if (!Mochila.quitar(itemId, 1, 'Enviado por correo')) return;
    const codigo = await this._generarCodigo(itemId, 1);
    Guardado.datos.correoEnviados.push({ codigo, itemId, t: Date.now(), resuelto: false });
    Guardado.guardar();
    Notificaciones.mostrar('📮 ' + item.nombre + ' enviado. Comparte el código con quien lo va a recibir', 'exito', 5000);
    this._mostrarCodigo(codigo, item);
  },

  _mostrarCodigo(codigo, item) {
    const cont = document.getElementById('correo-contenido');
    cont.innerHTML =
      '<div class="correo-codigo-caja">' +
        '<div class="correo-icono-grande">' + item.icono + '</div>' +
        '<div>Código de envío de <b>' + item.nombre + '</b>:</div>' +
        '<div class="correo-codigo" id="correo-codigo-texto">' + codigo + '</div>' +
        '<button id="btn-copiar-codigo">📋 Copiar código</button>' +
        '<div class="correo-nota">Mándaselo por WhatsApp a quien lo va a recibir. ' +
        'Vale por 1 HORA: si nadie lo cobra, vuelve aquí y escribe tu propio código en RECIBIR para recuperarlo.</div>' +
      '</div>';
    document.getElementById('btn-copiar-codigo').addEventListener('click', () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(codigo)
          .then(() => Notificaciones.mostrar('📋 Código copiado', 'exito'))
          .catch(() => prompt('Copia el código:', codigo));
      } else {
        prompt('Copia el código:', codigo);
      }
    });
  },

  // ---------- RECIBIR ----------
  async recibir() {
    const codigo = document.getElementById('correo-entrada-codigo').value.trim();
    if (!codigo) return;
    const aviso = texto => Notificaciones.mostrar(texto, 'alerta', 5000);

    const envio = await this._leerCodigo(codigo);
    if (!envio || !Items.obtener(envio.itemId)) {
      Notificaciones.mostrar('❌ Código inválido: revisa que esté completo y bien escrito', 'error', 5000);
      return;
    }
    if (Guardado.datos.correoRecibidos.includes(codigo)) {
      aviso('⚠️ Ese código ya fue cobrado en este teléfono');
      return;
    }

    const vencido = Date.now() - envio.t > this.VENCIMIENTO_MS;
    const mio = Guardado.datos.correoEnviados.find(e => e.codigo === codigo);

    if (mio) {
      // El remitente intenta usar su propio código
      if (mio.resuelto) { aviso('⚠️ Ese envío ya fue resuelto'); return; }
      if (!vencido) {
        const minutos = Math.ceil((this.VENCIMIENTO_MS - (Date.now() - envio.t)) / 60000);
        aviso('⏳ Este envío salió de este teléfono. Si nadie lo cobra, podrás reclamarlo en ' + minutos + ' min');
        return;
      }
      // Venció sin cobrarse: el remitente recupera su objeto
      mio.resuelto = true;
    } else {
      if (vencido) { aviso('⌛ Ese código venció (más de 1 hora). Solo el remitente puede reclamarlo'); return; }
    }

    if (!Mochila.agregar(envio.itemId, envio.cantidad, { silencioso: true })) return;
    Guardado.datos.correoRecibidos.push(codigo);
    Guardado.guardar();
    const item = Items.seguro(envio.itemId);
    Historial.registrar('objetos', {
      detalle: (mio ? 'Reclamado del correo (venció): ' : 'Recibido por correo: ') + item.nombre +
        ' (código ' + codigo.slice(-8) + ')',
      monto: envio.cantidad
    });
    Notificaciones.mostrar('📬 ' + item.icono + ' ' + (mio ? 'Recuperaste ' : 'Recibiste ') + item.nombre, 'exito', 5000);
    this.pintar();
  },

  // ---------- PINTADO ----------
  pintar() {
    const cont = document.getElementById('correo-contenido');
    cont.innerHTML = '';

    if (this.pestana === 'recibir') {
      cont.innerHTML =
        '<div class="campo-admin" style="padding: 14px;">' +
          '<label for="correo-entrada-codigo">Pega aquí el código de envío</label>' +
          '<input id="correo-entrada-codigo" autocomplete="off" placeholder="ejemplo: perla.1.sx9k2.abc123.9f3a2c1b">' +
        '</div>' +
        '<button id="btn-recibir-codigo" class="correo-boton-recibir">📬 Recibir objeto</button>';
      document.getElementById('btn-recibir-codigo').addEventListener('click', () => this.recibir());
      return;
    }

    // Pestaña ENVIAR: lista de la mochila
    let hayAlgo = false;
    const vistos = new Set();
    for (const sl of Mochila.slots) {
      if (!sl || vistos.has(sl.id)) continue;
      vistos.add(sl.id);
      hayAlgo = true;
      const item = Items.seguro(sl.id);
      const fila = document.createElement('div');
      fila.className = 'fila-tienda';
      fila.innerHTML =
        '<span class="icono">' + item.icono + '</span>' +
        '<div class="datos"><div class="nombre">' + item.nombre + '</div>' +
        '<div class="precio">Tienes: ' + Mochila.contar(sl.id) + '</div></div>';
      const boton = document.createElement('button');
      boton.textContent = 'Enviar';
      boton.addEventListener('click', () => this.enviar(sl.id));
      fila.appendChild(boton);
      cont.appendChild(fila);
    }
    if (!hayAlgo) cont.innerHTML = '<div class="tienda-vacia">Tu mochila está vacía</div>';
  }
};
