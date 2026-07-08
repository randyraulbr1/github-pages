// ============================================================
// CORREO — envío por cantidad, reclamo parcial, tienda del correo
// ============================================================
const Correo = {
  POSICION: [22.9928, -82.7533],
  VENCIMIENTO_MS: 60 * 60 * 1000,
  SLOTS_RECLAMO: 20,
  pestana: 'enviar',
  _reclamoActual: null,

  iniciar() {
    if (!Guardado.datos.correoEnviados) Guardado.datos.correoEnviados = [];
    if (!Guardado.datos.correoRecibidos) Guardado.datos.correoRecibidos = [];
    this._procesarExpirados();
    this._quitarPinFijoLegacy();

    document.getElementById('pestana-correo-enviar').addEventListener('click', () => this.cambiarPestana('enviar'));
    document.getElementById('pestana-correo-recibir').addEventListener('click', () => this.cambiarPestana('recibir'));
    document.getElementById('pestana-correo-pendientes').addEventListener('click', () => this.cambiarPestana('pendientes'));
    document.getElementById('pestana-correo-tienda').addEventListener('click', () => this.cambiarPestana('tienda'));
  },

  _quitarPinFijoLegacy() {
    if (typeof Admin !== 'undefined' && Admin.datos) {
      Admin.datos.eliminados = Admin.datos.eliminados || [];
      if (!Admin.datos.eliminados.includes('correo_central')) {
        Admin.datos.eliminados.push('correo_central');
      }
    }
    if (typeof Mapa === 'undefined' || !Mapa.puntosInteractivos) return;
    const idx = Mapa.puntosInteractivos.findIndex(p => p.id === 'correo_central');
    if (idx < 0) return;
    const punto = Mapa.puntosInteractivos[idx];
    if (punto.marcador && Mapa.mapa) Mapa.mapa.removeLayer(punto.marcador);
    Mapa.puntosInteractivos.splice(idx, 1);
  },

  abrir() {
    this._procesarExpirados();
    if (typeof UIManager !== 'undefined') UIManager.abrir('ventana-correo');
    else document.getElementById('ventana-correo').classList.remove('oculto');
    this.cambiarPestana(this.pestana);
  },

  cambiarPestana(cual) {
    this.pestana = cual;
    ['enviar', 'recibir', 'pendientes', 'tienda'].forEach(p => {
      const el = document.getElementById('pestana-correo-' + p);
      if (el) el.classList.toggle('activa', p === cual);
    });
    this.pintar();
  },

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

  async _reclamadoGlobal(codigo) {
    const g = await MundoPublico.correoYaReclamado(codigo);
    return g ? (g.reclamado || g.cantidad || 0) : 0;
  },

  async enviar(itemId) {
    const item = Items.seguro(itemId);
    const max = Mochila.contar(itemId);
    const v = prompt('¿Cuántos ' + item.nombre + ' enviar? (tienes ' + max + ')', '1');
    if (v === null) return;
    const cant = parseInt(v, 10);
    if (!cant || cant < 1 || cant > max) { alert('Cantidad inválida'); return; }
    if (!Mochila.quitar(itemId, cant, 'Enviado por correo')) return;
    const codigo = await this._generarCodigo(itemId, cant);
    Guardado.datos.correoEnviados.push({
      codigo, itemId, cantidad: cant, cantidadOriginal: cant,
      reclamado: 0, t: Date.now(), resuelto: false
    });
    Guardado.guardar();
    Notificaciones.mostrar('📮 ' + item.nombre + ' x' + cant + ' enviado', 'exito', 5000);
    this._mostrarCodigo(codigo, item, cant);
  },

  _mostrarCodigo(codigo, item, cant) {
    const cont = document.getElementById('correo-contenido');
    cont.innerHTML =
      '<div class="correo-codigo-caja">' +
        '<div class="correo-icono-grande">' + item.icono + '</div>' +
        '<div>Código de <b>' + item.nombre + ' x' + cant + '</b>:</div>' +
        '<div class="correo-codigo" id="correo-codigo-texto">' + codigo + '</div>' +
        '<button id="btn-copiar-codigo">📋 Copiar código</button>' +
        '<div class="correo-nota">Vale 1 hora. Si no lo reclaman, lo recuperas o va a la tienda del correo.</div>' +
      '</div>';
    document.getElementById('btn-copiar-codigo').addEventListener('click', () => {
      const copiar = () => Notificaciones.mostrar('📋 Código copiado', 'exito');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(codigo).then(copiar).catch(() => prompt('Copia:', codigo));
      } else prompt('Copia:', codigo);
    });
  },

  async recibir() {
    const codigo = document.getElementById('correo-entrada-codigo').value.trim();
    if (!codigo) return;

    const envio = await this._leerCodigo(codigo);
    if (!envio || !Items.obtener(envio.itemId)) {
      Notificaciones.mostrar('❌ Código inválido', 'error', 5000);
      return;
    }

    const global = await MundoPublico.correoYaReclamado(codigo);
    if (global && global.completo && global.jugadorId !== Usuarios.perfilActivo.id) {
      Notificaciones.mostrar('⚠️ Ese código ya fue reclamado por otro jugador', 'alerta', 5000);
      return;
    }

    const vencido = Date.now() - envio.t > this.VENCIMIENTO_MS;
    const mio = Guardado.datos.correoEnviados.find(e => e.codigo === codigo);

    if (mio) {
      if (mio.resuelto) { Notificaciones.mostrar('⚠️ Envío ya resuelto', 'alerta'); return; }
      if (!vencido) {
        Notificaciones.mostrar('⏳ Tu propio envío: espera 1 h o que alguien lo reclame', 'alerta', 6000);
        return;
      }
    } else if (vencido) {
      Notificaciones.mostrar('⌛ Código vencido', 'alerta');
      return;
    }

    const okCola = await MundoPublico.reclamarCodigoCorreo(codigo, Usuarios.perfilActivo, false);
    if (!okCola) {
      Notificaciones.mostrar('⏳ Otro jugador está reclamando este código', 'alerta', 5000);
      return;
    }

    const yaReclamado = await this._reclamadoGlobal(codigo);
    const restante = envio.cantidad - yaReclamado;
    if (restante <= 0) {
      Notificaciones.mostrar('⚠️ Ya no queda nada en este envío', 'alerta');
      return;
    }

    this._abrirReclamo(codigo, envio, restante, yaReclamado);
  },

  _abrirReclamo(codigo, envio, restante, yaReclamado) {
    this._reclamoActual = { codigo, envio, restante, yaReclamado };
    if (typeof UIManager !== 'undefined') {
      UIManager.cerrar('ventana-correo');
      UIManager.abrir('ventana-correo-reclamo', { cerrarPares: false });
    } else {
      document.getElementById('ventana-correo').classList.add('oculto');
      document.getElementById('ventana-correo-reclamo').classList.remove('oculto');
    }
    document.getElementById('correo-reclamo-info').textContent =
      Items.seguro(envio.itemId).nombre + ' — quedan ' + restante + ' por recoger (toca para llevar a tu mochila)';
    this._pintarReclamo();
  },

  _pintarReclamo() {
    const r = this._reclamoActual;
    if (!r) return;
    const rejilla = document.getElementById('rejilla-correo-reclamo');
    rejilla.innerHTML = '';
    const item = Items.seguro(r.envio.itemId);
    let puesto = 0;
    for (let i = 0; i < this.SLOTS_RECLAMO && puesto < r.restante; i++) {
      const cel = document.createElement('button');
      cel.className = 'slot';
      cel.textContent = item.icono;
      const cant = document.createElement('span');
      cant.className = 'cantidad';
      cant.textContent = '1';
      cel.appendChild(cant);
      cel.addEventListener('click', () => this._tomarUnoReclamo());
      rejilla.appendChild(cel);
      puesto++;
    }
  },

  async _tomarUnoReclamo() {
    const r = this._reclamoActual;
    if (!r || r.restante <= 0) return;
    if (!Mochila.agregar(r.envio.itemId, 1, { silencioso: true })) {
      Notificaciones.mostrar('🎒 Mochila llena — solo puedes llevar lo que quepa', 'alerta', 5000);
      return;
    }
    r.restante--;
    r.yaReclamado++;
    await MundoPublico.registrarReclamoParcial(r.codigo, Usuarios.perfilActivo, 1, r.envio.cantidad);

    const mio = Guardado.datos.correoEnviados.find(e => e.codigo === r.codigo);
    if (mio) {
      mio.reclamado = (mio.reclamado || 0) + 1;
      if (mio.reclamado >= mio.cantidadOriginal) mio.resuelto = true;
    }

    if (r.restante <= 0) {
      await MundoPublico.reclamarCodigoCorreo(r.codigo, Usuarios.perfilActivo, true);
      Guardado.datos.correoRecibidos.push(r.codigo);
      Guardado.guardar();
      if (typeof UIManager !== 'undefined') UIManager.cerrar('ventana-correo-reclamo');
      else document.getElementById('ventana-correo-reclamo').classList.add('oculto');
      Notificaciones.mostrar('📬 Reclamo completado', 'exito', 4000);
      this._reclamoActual = null;
      return;
    }

    Guardado.guardar();
    this._pintarReclamo();
  },

  _procesarExpirados() {
    const ahora = Date.now();
    for (const e of Guardado.datos.correoEnviados) {
      if (e.resuelto) continue;
      if (ahora - e.t < this.VENCIMIENTO_MS) continue;
      const reclamado = e.reclamado || 0;
      const restante = (e.cantidadOriginal || e.cantidad) - reclamado;
      if (restante > 0) this._añadirATienda(e.itemId, restante, e.codigo);
      e.resuelto = true;
    }
    Guardado.guardar();
  },

  _añadirATienda(itemId, cantidad, codigo) {
    if (!Guardado.datos.correoTiendaLocal) Guardado.datos.correoTiendaLocal = [];
    const precio = Items.seguro(itemId).precio;
    Guardado.datos.correoTiendaLocal.push({
      id: 'ct_' + Date.now().toString(36),
      itemId, cantidad, precio, codigoOrigen: codigo || '', t: Date.now()
    });
    if (typeof Admin !== 'undefined' && Admin.esAdminJugador()) Admin._publicarParaTodos();
  },

  _listaTienda() {
    const mapa = new Map();
    for (const t of ((Admin && Admin.publicado && Admin.publicado.correoTienda) || [])) mapa.set(t.id, t);
    for (const t of (Guardado.datos.correoTiendaLocal || [])) mapa.set(t.id, t);
    return [...mapa.values()];
  },

  async _comprarTienda(entrada) {
    const item = Items.seguro(entrada.itemId);
    const v = prompt('¿Cuántos ' + item.nombre + ' comprar? ($' + entrada.precio + ' c/u, hay ' + entrada.cantidad + ')', '1');
    if (v === null) return;
    const cant = parseInt(v, 10);
    if (!cant || cant < 1 || cant > entrada.cantidad) return;
    const total = entrada.precio * cant;
    if (Dinero.saldo < total) { Notificaciones.mostrar('No tienes suficiente dinero', 'error'); return; }
    if (!Mochila.agregar(entrada.itemId, cant, { silencioso: true })) return;
    await Dinero.gastar(total, 'Tienda del correo: ' + item.nombre);
    entrada.cantidad -= cant;
    if (entrada.cantidad <= 0) {
      Guardado.datos.correoTiendaLocal = (Guardado.datos.correoTiendaLocal || [])
        .filter(x => x.id !== entrada.id);
    }
    Guardado.guardar();
    if (typeof Admin !== 'undefined' && Admin.esAdminJugador()) Admin._publicarParaTodos();
    Notificaciones.mostrar('🛒 Compraste ' + item.nombre + ' x' + cant, 'exito');
    this.pintar();
  },

  async _sincronizarPendientes() {
    for (const e of Guardado.datos.correoEnviados) {
      if (e.resuelto) continue;
      const g = await MundoPublico.correoYaReclamado(e.codigo);
      if (g && (g.completo || (g.reclamado || 0) >= (e.cantidadOriginal || e.cantidad))) {
        e.resuelto = true;
        e.reclamado = e.cantidadOriginal || e.cantidad;
      } else if (g && g.reclamado) {
        e.reclamado = g.reclamado;
      }
    }
    Guardado.guardar();
  },

  pintar() {
    const cont = document.getElementById('correo-contenido');
    cont.innerHTML = '';
    this._procesarExpirados();

    if (this.pestana === 'recibir') {
      cont.innerHTML =
        '<div class="campo-admin" style="padding:14px;">' +
          '<label for="correo-entrada-codigo">Pega el código de envío</label>' +
          '<input id="correo-entrada-codigo" autocomplete="off" placeholder="código del remitente">' +
        '</div>' +
        '<button id="btn-recibir-codigo" class="correo-boton-recibir">📬 Abrir paquete</button>' +
        '<div class="correo-nota" style="padding:10px 14px;">Solo recoges lo que quepa en tu mochila. El resto queda en el paquete 1 hora.</div>';
      document.getElementById('btn-recibir-codigo').addEventListener('click', () => this.recibir());
      return;
    }

    if (this.pestana === 'pendientes') {
      this._sincronizarPendientes().then(() => {
        const pend = Guardado.datos.correoEnviados.filter(e => !e.resuelto && Date.now() - e.t < this.VENCIMIENTO_MS);
        if (!pend.length) {
          cont.innerHTML = '<div class="tienda-vacia">No tienes envíos pendientes</div>';
          return;
        }
        for (const e of pend) {
          const item = Items.seguro(e.itemId);
          const fila = document.createElement('div');
          fila.className = 'fila-tienda';
          const recl = e.reclamado || 0;
          const total = e.cantidadOriginal || e.cantidad;
          fila.innerHTML =
            '<span class="icono">' + item.icono + '</span>' +
            '<div class="datos"><div class="nombre">' + item.nombre + ' x' + total + '</div>' +
            '<div class="precio">Reclamado: ' + recl + '/' + total + '</div>' +
            '<div class="correo-codigo" style="font-size:11px;margin-top:4px;">' + e.codigo + '</div></div>';
          const b = document.createElement('button');
          b.textContent = '📋';
          b.addEventListener('click', () => {
            if (navigator.clipboard) navigator.clipboard.writeText(e.codigo);
            else prompt('Copia:', e.codigo);
          });
          fila.appendChild(b);
          cont.appendChild(fila);
        }
      });
      return;
    }

    if (this.pestana === 'tienda') {
      const lista = this._listaTienda().filter(t => t.cantidad > 0);
      if (!lista.length) {
        cont.innerHTML = '<div class="tienda-vacia">La tienda del correo está vacía<br><small>Objetos no reclamados en 1 h aparecen aquí</small></div>';
        return;
      }
      for (const t of lista) {
        const item = Items.seguro(t.itemId);
        const fila = document.createElement('div');
        fila.className = 'fila-tienda';
        fila.innerHTML =
          '<span class="icono">' + item.icono + '</span>' +
          '<div class="datos"><div class="nombre">' + item.nombre + '</div>' +
          '<div class="precio">$' + t.precio + ' · Quedan: ' + t.cantidad + '</div></div>';
        const b = document.createElement('button');
        b.textContent = 'Comprar';
        b.addEventListener('click', () => this._comprarTienda(t));
        fila.appendChild(b);
        cont.appendChild(fila);
      }
      return;
    }

    const vistos = new Set();
    let hay = false;
    for (const sl of Mochila.slots) {
      if (!sl || vistos.has(sl.id)) continue;
      if (Items.seguro(sl.id).unico || sl.texto) continue;
      vistos.add(sl.id);
      hay = true;
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
    if (!hay) cont.innerHTML = '<div class="tienda-vacia">Tu mochila está vacía</div>';
  }
};
