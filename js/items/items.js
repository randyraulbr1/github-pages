// ============================================================
// CATÁLOGO DE ITEMS DEL JUEGO
// tipo: pez | herramienta | comida | tesoro | material | arma | especial
// cura = hambre · curaVida = vida · dano = arma equipable
// ============================================================

const TIPOS_ITEM = {
  comida:      { etiqueta: 'Consumible', categoria: 'consumibles', icono: '🍽️' },
  arma:        { etiqueta: 'Arma',       categoria: 'armas',       icono: '⚔️' },
  pez:         { etiqueta: 'Animal',     categoria: 'animales',    icono: '🐟' },
  herramienta: { etiqueta: 'Herramienta',categoria: 'objetos',     icono: '🔧' },
  tesoro:      { etiqueta: 'Tesoro',     categoria: 'objetos',     icono: '💎' },
  material:    { etiqueta: 'Material',   categoria: 'objetos',     icono: '📦' },
  especial:    { etiqueta: 'Especial',   categoria: 'objetos',     icono: '✨' }
};

const ITEMS_USO_ESPECIAL = {
  cofre: 'cofre',
  llave_maestra: 'llave',
  papel: 'escribir'
};

const CATALOGO_ITEMS = {
  // ---------- PECES Y CRIATURAS DEL MAR (15) ----------
  sardina:        { nombre: 'Sardina',           icono: '🐟', tipo: 'pez', precio: 8,   rareza: 1, desc: 'Pez pequeño y común de la bahía.' },
  mojarra:        { nombre: 'Mojarra',           icono: '🐟', tipo: 'pez', precio: 10,  rareza: 1, desc: 'Abunda cerca de la costa.' },
  lisa:           { nombre: 'Lisa',              icono: '🐟', tipo: 'pez', precio: 12,  rareza: 1, desc: 'Pez plateado de aguas tranquilas.' },
  jurel:          { nombre: 'Jurel',             icono: '🐟', tipo: 'pez', precio: 15,  rareza: 2, desc: 'Nadador rápido, buena carne.' },
  pargo:          { nombre: 'Pargo',             icono: '🐠', tipo: 'pez', precio: 25,  rareza: 2, desc: 'Muy apreciado en la cocina cubana.' },
  robalo:         { nombre: 'Róbalo',            icono: '🐟', tipo: 'pez', precio: 30,  rareza: 2, desc: 'Difícil de engañar con el anzuelo.' },
  dorado:         { nombre: 'Dorado',            icono: '🐠', tipo: 'pez', precio: 45,  rareza: 3, desc: 'Brilla como el oro bajo el sol.' },
  atun:           { nombre: 'Atún',              icono: '🐟', tipo: 'pez', precio: 60,  rareza: 3, desc: 'Gigante de mar abierto.' },
  tiburon_perro:  { nombre: 'Tiburón perro',     icono: '🦈', tipo: 'pez', precio: 90,  rareza: 4, desc: '¡Cuidado con los dientes!' },
  anguila:        { nombre: 'Anguila',           icono: '🐍', tipo: 'pez', precio: 35,  rareza: 3, desc: 'Escurridiza y eléctrica.' },
  langosta:       { nombre: 'Langosta',          icono: '🦞', tipo: 'pez', precio: 70,  rareza: 3, desc: 'El manjar de la costa norte.' },
  cangrejo:       { nombre: 'Cangrejo',          icono: '🦀', tipo: 'pez', precio: 18,  rareza: 2, desc: 'Camina de lado pero se vende bien.' },
  camaron:        { nombre: 'Camarón',           icono: '🦐', tipo: 'pez', precio: 14,  rareza: 1, desc: 'Pequeño pero sabroso.' },
  pulpo:          { nombre: 'Pulpo',             icono: '🐙', tipo: 'pez', precio: 55,  rareza: 3, desc: 'Ocho brazos de pura astucia.' },
  pez_globo:      { nombre: 'Pez globo',         icono: '🐡', tipo: 'pez', precio: 40,  rareza: 4, desc: 'Raro y curioso, no te lo comas.' },

  // ---------- HERRAMIENTAS (10) ----------
  cana_pescar:    { nombre: 'Caña de pescar',    icono: '🎣', tipo: 'herramienta', precio: 120, desc: 'Necesaria para pescar en los muelles.' },
  buscador_tesoros:{ nombre: 'Buscador de tesoros', icono: '📡', tipo: 'herramienta', precio: 500, desc: 'Detecta tesoros ocultos cercanos y muestra la distancia.' },
  carnada:        { nombre: 'Carnada',           icono: '🐛', tipo: 'herramienta', precio: 5,  desc: 'Mejora la suerte al pescar (se gasta 1 por captura).' },
  red_pesca:      { nombre: 'Red de pesca',      icono: '🕸️', tipo: 'herramienta', precio: 200, desc: 'A veces atrapa un pez extra.' },
  pico:           { nombre: 'Pico',              icono: '⛏️', tipo: 'herramienta', precio: 80, desc: 'Para trabajos duros.' },
  brujula:        { nombre: 'Brújula',           icono: '🧭', tipo: 'herramienta', precio: 45, desc: 'Siempre apunta al norte de la bahía.' },
  mapa_antiguo:   { nombre: 'Mapa antiguo',      icono: '🗺️', tipo: 'herramienta', precio: 150, desc: 'Papeles viejos con marcas extrañas.' },
  linterna:       { nombre: 'Linterna',          icono: '🔦', tipo: 'herramienta', precio: 35, desc: 'Ilumina la noche del malecón.' },
  cuchillo:       { nombre: 'Cuchillo',          icono: '🔪', tipo: 'herramienta', precio: 40, desc: 'Útil para limpiar pescado.' },
  cuerda:         { nombre: 'Cuerda',            icono: '🧵', tipo: 'herramienta', precio: 20, desc: 'Diez metros de soga marinera.' },
  papel:          { nombre: 'Papel',             icono: '📄', tipo: 'herramienta', precio: 10, desc: 'Con un lápiz puedes escribir una nota.' },
  lapiz:          { nombre: 'Lápiz',             icono: '✏️', tipo: 'herramienta', precio: 30, desc: 'Sirve para escribir notas en papel.' },
  nota_escrita:   { nombre: 'Nota escrita',      icono: '📝', tipo: 'especial', precio: 5, unico: true, desc: 'Una nota escrita por un jugador.' },

  // ---------- COMIDA Y MEDICINA (12) — precios realistas ----------
  agua:           { nombre: 'Botella de agua',   icono: '💧', tipo: 'comida', precio: 18,  cura: 12, desc: 'Fresca, calma el hambre.' },
  refresco:       { nombre: 'Refresco',          icono: '🥤', tipo: 'comida', precio: 28,  cura: 18, desc: 'Bien frío, del timbiriche.' },
  cafe:           { nombre: 'Café cubano',       icono: '☕', tipo: 'comida', precio: 22,  cura: 14, desc: 'Un buchito y sigues andando.' },
  pan:            { nombre: 'Pan',               icono: '🍞', tipo: 'comida', precio: 25,  cura: 16, desc: 'Pan de la bodega, calientico.' },
  pizza:          { nombre: 'Pizza',             icono: '🍕', tipo: 'comida', precio: 65,  cura: 32, desc: 'De queso, doblada como se debe.' },
  pollo_asado:    { nombre: 'Pollo asado',       icono: '🍗', tipo: 'comida', precio: 85,  cura: 42, desc: 'Recupera bastante hambre.' },
  arroz_congri:   { nombre: 'Arroz congrí',      icono: '🍚', tipo: 'comida', precio: 48,  cura: 28, desc: 'El clásico que nunca falla.' },
  platano_frito:  { nombre: 'Plátano frito',     icono: '🍌', tipo: 'comida', precio: 32,  cura: 20, desc: 'Chatinos crujientes.' },
  mango:          { nombre: 'Mango',             icono: '🥭', tipo: 'comida', precio: 28,  cura: 16, desc: 'Dulce, de la mata del patio.' },
  coco:           { nombre: 'Coco',              icono: '🥥', tipo: 'comida', precio: 35,  cura: 18, desc: 'Agua de coco directa de la palma.' },
  botiquin:       { nombre: 'Botiquín',          icono: '🩹', tipo: 'comida', precio: 300, curaVida: 55, desc: 'Vendas y medicinas: recupera vida o revive a un amigo.' },
  pocion_vida:    { nombre: 'Medicina fuerte',   icono: '🧪', tipo: 'comida', precio: 320, curaVida: 100, desc: 'Recupera toda la vida.' },

  // ---------- ARMAS (10) — una por tramo de nivel, daño suma al combate global ----------
  arma_nv1:   { nombre: 'Cuchillo de combate', icono: '🔪', tipo: 'arma', precio: 120,  dano: 5,  nivelMin: 1,  nivelMax: 10,  desc: 'Para novatos (nivel 1–10). +5 de daño.' },
  arma_nv2:   { nombre: 'Machete',             icono: '🗡️', tipo: 'arma', precio: 350,  dano: 10, nivelMin: 11, nivelMax: 20, desc: 'Nivel 11–20. +10 de daño.' },
  arma_nv3:   { nombre: 'Lanza corta',         icono: '🔱', tipo: 'arma', precio: 620,  dano: 15, nivelMin: 21, nivelMax: 30, desc: 'Nivel 21–30. +15 de daño.' },
  arma_nv4:   { nombre: 'Espada corta',        icono: '⚔️', tipo: 'arma', precio: 980,  dano: 20, nivelMin: 31, nivelMax: 40, desc: 'Nivel 31–40. +20 de daño.' },
  arma_nv5:   { nombre: 'Espada larga',        icono: '🗡️', tipo: 'arma', precio: 1450, dano: 25, nivelMin: 41, nivelMax: 50, desc: 'Nivel 41–50. +25 de daño.' },
  arma_nv6:   { nombre: 'Hacha de guerra',     icono: '🪓', tipo: 'arma', precio: 2100, dano: 32, nivelMin: 51, nivelMax: 60, desc: 'Nivel 51–60. +32 de daño.' },
  arma_nv7:   { nombre: 'Martillo pesado',     icono: '🔨', tipo: 'arma', precio: 2900, dano: 38, nivelMin: 61, nivelMax: 70, desc: 'Nivel 61–70. +38 de daño.' },
  arma_nv8:   { nombre: 'Alabarda',            icono: '⚔️', tipo: 'arma', precio: 3800, dano: 45, nivelMin: 71, nivelMax: 80, desc: 'Nivel 71–80. +45 de daño.' },
  arma_nv9:   { nombre: 'Katana',              icono: '🗡️', tipo: 'arma', precio: 4500, dano: 52, nivelMin: 81, nivelMax: 90, desc: 'Nivel 81–90. +52 de daño.' },
  arma_nv10:  { nombre: 'Tridente legendario', icono: '🔱', tipo: 'arma', precio: 5000, dano: 60, nivelMin: 91, nivelMax: 100, desc: 'Nivel 91–100. +60 de daño.' },

  // ---------- TESOROS Y VALIOSOS (9) ----------
  moneda_antigua: { nombre: 'Moneda antigua',    icono: '🥉', tipo: 'tesoro', precio: 100, desc: 'Una moneda colonial oxidada.' },
  doblon:         { nombre: 'Doblón español',    icono: '🥇', tipo: 'tesoro', precio: 250, desc: 'Oro de la época de los galeones.' },
  perla:          { nombre: 'Perla',             icono: '🦪', tipo: 'tesoro', precio: 180, desc: 'Nacida en una ostra de la bahía.' },
  anillo_oro:     { nombre: 'Anillo de oro',     icono: '💍', tipo: 'tesoro', precio: 220, desc: '¿Quién lo habrá perdido?' },
  collar_plata:   { nombre: 'Collar de plata',   icono: '📿', tipo: 'tesoro', precio: 160, desc: 'Brilla a pesar de los años.' },
  gema_azul:      { nombre: 'Gema azul',         icono: '💎', tipo: 'tesoro', precio: 400, desc: 'Azul como la bahía al mediodía.' },
  estatuilla:     { nombre: 'Estatuilla',        icono: '🗿', tipo: 'tesoro', precio: 300, desc: 'Figura tallada muy antigua.' },
  reliquia_taina: { nombre: 'Reliquia taína',    icono: '🏺', tipo: 'tesoro', precio: 350, desc: 'Cerámica de los primeros habitantes.' },
  botella_mensaje:{ nombre: 'Botella con mensaje', icono: '🍾', tipo: 'tesoro', precio: 90, desc: 'Trae un papel escrito ilegible.' },

  // ---------- MATERIALES (4) ----------
  madera:         { nombre: 'Madera',            icono: '🌳', tipo: 'material', precio: 6,  desc: 'Tabla arrastrada por la marea.' },
  piedra:         { nombre: 'Piedra',            icono: '⛰️', tipo: 'material', precio: 4,  desc: 'Piedra de la costa.' },
  concha:         { nombre: 'Concha',            icono: '🐚', tipo: 'material', precio: 7,  desc: 'Suena el mar si la acercas al oído.' },
  chatarra:       { nombre: 'Chatarra',          icono: '⚙️', tipo: 'material', precio: 9,  desc: 'Hierros viejos del puerto.' },
  cofre:          { nombre: 'Cofre',           icono: '🧰', tipo: 'herramienta', precio: 250, desc: 'Déjalo en el mapa (visible u oculto con PIN).' },
  llave_maestra:  { nombre: 'Llave maestra',   icono: '🗝️', tipo: 'herramienta', precio: 180, desc: '15% de abrir un cofre oculto cercano (se gasta).' }
};

const IDS_BASE_INICIAL = new Set(Object.keys(CATALOGO_ITEMS));

const Items = {
  PRECIO_MINIMO: 5,
  PRECIO_MAXIMO: 5000,

  obtener(id) { return CATALOGO_ITEMS[id]; },

  tiposValidos() { return Object.keys(TIPOS_ITEM); },

  _normalizarDef(it) {
    if (!it || typeof it !== 'object') return it;
    const out = Object.assign({}, it);
    if (out.dano) out.tipo = 'arma';
    else if (out.curaVida) out.tipo = 'comida';
    else if (out.cura && !out.curaVida) out.tipo = 'comida';
    else if (!out.tipo || !TIPOS_ITEM[out.tipo]) out.tipo = 'especial';
    if (!out.estado) out.estado = 'activo';
    if (out.rareza == null) out.rareza = 1;
    if (out.puedeUsar == null) out.puedeUsar = true;
    if (out.puedeEquipar == null) out.puedeEquipar = out.tipo === 'arma';
    if (out.puedeVender == null) out.puedeVender = true;
    if (out.puedeTirar == null) out.puedeTirar = true;
    if (out.puedeComerciar == null) out.puedeComerciar = true;
    if (out.pierdeAlMorir == null) out.pierdeAlMorir = false;
    return out;
  },

  esBase(id) {
    return IDS_BASE_INICIAL.has(id);
  },

  metaDe(itemsNuevos, id) {
    return (itemsNuevos || []).find(x => x && x.id === id) || null;
  },

  estadoDe(itemsNuevos, id) {
    return this.metaDe(itemsNuevos, id)?.estado || 'activo';
  },

  idsTodos() {
    return Object.keys(CATALOGO_ITEMS).sort((a, b) =>
      this.seguro(a).nombre.localeCompare(this.seguro(b).nombre, 'es'));
  },

  listarParaAdmin(itemsNuevos, opts) {
    const q = (opts?.q || '').trim().toLowerCase();
    const tipoF = opts?.tipo || '';
    const rarezaF = opts?.rareza !== '' && opts?.rareza != null ? parseInt(opts.rareza, 10) : null;
    const lista = [];
    for (const id of this.idsTodos()) {
      const meta = this.metaDe(itemsNuevos, id);
      const estado = meta?.estado || 'activo';
      if (!opts?.incluirOcultos && (estado === 'oculto' || estado === 'eliminado')) continue;
      const item = Object.assign({}, CATALOGO_ITEMS[id], meta, {
        id,
        esBase: this.esBase(id) && !meta
      });
      if (tipoF && item.tipo !== tipoF) continue;
      if (rarezaF != null && !Number.isNaN(rarezaF) && (item.rareza || 1) !== rarezaF) continue;
      if (q) {
        const blob = [item.nombre, id, item.desc, item.descLarga].join(' ').toLowerCase();
        if (!blob.includes(q)) continue;
      }
      lista.push(item);
    }
    return lista;
  },

  resumenDetalle(item) {
    const filas = [];
    filas.push(['ID', item.id]);
    filas.push(['Tipo', this.etiquetaTipo(item)]);
    filas.push(['Precio', '$' + (item.precio || this.PRECIO_MINIMO)]);
    if (item.rareza) filas.push(['Rareza', String(item.rareza)]);
    const def = this.defEfecto(item);
    if (def) {
      const unidad = def.modo === 'porcentaje' ? def.valor + '%' : String(def.valor);
      filas.push(['Efecto', def.efecto + ' (' + unidad + ')']);
    } else {
      if (item.cura) filas.push(['Hambre', '+' + item.cura]);
      if (item.curaVida) filas.push(['Vida', '+' + item.curaVida]);
    }
    if (item.crudo !== false && item.tipo === 'pez') {
      filas.push(['Crudo', 'Sí · prob. negativo ' + (item.probCrudoNegativo ?? 60) + '%']);
    }
    if (item.dano) filas.push(['Daño', '+' + item.dano]);
    if (item.nivelMin) filas.push(['Nivel', (item.nivelMin || 1) + '–' + (item.nivelMax || 100)]);
    filas.push(['Estado', item.estado || 'activo']);
    if (item.creadoPor) filas.push(['Creado por', item.creadoPor]);
    if (item.creadoEn) filas.push(['Creado', Utilidades.fechaLegible(item.creadoEn)]);
    if (item.modificadoEn) filas.push(['Modificado', Utilidades.fechaLegible(item.modificadoEn)]);
    return filas;
  },

  exportarCatalogo(itemsNuevos, formato) {
    const lista = this.listarParaAdmin(itemsNuevos, { incluirOcultos: false });
    const payload = {
      version: CONFIG.version,
      exportadoEn: new Date().toISOString(),
      total: lista.length,
      objetos: lista.map(o => ({
        id: o.id,
        nombre: o.nombre,
        icono: o.icono,
        tipo: o.tipo,
        rareza: o.rareza || 1,
        precio: o.precio,
        desc: o.desc || '',
        descLarga: o.descLarga || '',
        cura: o.cura,
        curaVida: o.curaVida,
        efecto: o.efecto,
        efectoValor: o.efectoValor,
        efectoModo: o.efectoModo,
        crudo: o.crudo,
        probCrudoNegativo: o.probCrudoNegativo,
        dano: o.dano,
        nivelMin: o.nivelMin,
        nivelMax: o.nivelMax,
        estado: o.estado || 'activo',
        esBase: !!o.esBase
      }))
    };
    const v = CONFIG.version || '?';
    if (formato === 'txt') {
      let txt = 'Catálogo Kingdom Map v' + v + '\nExportado: ' + payload.exportadoEn +
        '\nTotal objetos activos: ' + payload.total + '\n\n';
      for (const o of payload.objetos) {
        txt += o.icono + ' ' + o.nombre + ' [' + o.id + ']\n';
        txt += '  Tipo: ' + o.tipo + ' · Precio: $' + o.precio + ' · Rareza: ' + o.rareza + '\n';
        if (o.desc) txt += '  ' + o.desc + '\n';
        if (o.descLarga) txt += '  ' + o.descLarga + '\n';
        txt += '\n';
      }
      return { mime: 'text/plain;charset=utf-8', nombre: 'catalogo-objetos-v' + v + '.txt', contenido: txt };
    }
    return {
      mime: 'application/json;charset=utf-8',
      nombre: 'catalogo-objetos-v' + v + '.json',
      contenido: JSON.stringify(payload, null, 2)
    };
  },

  metaTipo(item) {
    const t = (item && item.tipo && TIPOS_ITEM[item.tipo]) ? item.tipo : 'especial';
    return TIPOS_ITEM[t];
  },

  etiquetaTipo(item) {
    const m = this.metaTipo(item);
    return m.icono + ' ' + m.etiqueta;
  },

  esArma(item) {
    return !!item && item.tipo === 'arma';
  },

  esEquipable(item, id) {
    return this.esArma(item);
  },

  usoEspecial(id) {
    return ITEMS_USO_ESPECIAL[id] || null;
  },

  esUsableEnInventario(item, id) {
    if (!item || !id) return false;
    if (this.usoEspecial(id)) return true;
    const t = this.tipoConsumible(item, id);
    return t === 'hambre' || t === 'vida' || t === 'crudo';
  },

  esUsableEnVarios(item, id) {
    const t = this.tipoConsumible(item, id);
    return t === 'hambre' || t === 'vida' || t === 'crudo';
  },

  requiereConfirmBorrar(item, id, desdeEquip) {
    if (desdeEquip) return true;
    const t = this.tipoConsumible(item, id);
    if (t === 'hambre' || t === 'vida' || t === 'crudo') return false;
    return true;
  },

  resumenInventario(item, id) {
    const partes = [this.etiquetaTipo(item)];
    const tc = this.tipoConsumible(item, id);
    const def = this.defEfecto(item);
    if (def && tc === 'hambre') {
      partes.push(def.modo === 'porcentaje' ? '+' + def.valor + '% hambre' : '+' + def.valor + ' hambre');
    } else if (def && tc === 'vida') {
      partes.push(def.modo === 'porcentaje' ? '+' + def.valor + '% vida' : '+' + def.valor + ' vida');
    } else if (tc === 'crudo') {
      partes.push('crudo (riesgo)');
    }
    if (item.dano) partes.push('+' + item.dano + ' daño');
    if (this.usoEspecial(id) === 'cofre') partes.push('colocar en mapa');
    if (this.usoEspecial(id) === 'llave') partes.push('abrir cofre');
    if (this.usoEspecial(id) === 'escribir') partes.push('escribir nota');
    return partes.join(' · ');
  },

  // Para pintar en pantalla: nunca devuelve vacío aunque el item ya no exista
  seguro(id) {
    return CATALOGO_ITEMS[id] ||
      { nombre: 'Objeto desconocido', icono: '❓', tipo: 'especial', precio: this.PRECIO_MINIMO, desc: '' };
  },

  // Aplica el mundo publicado/local del admin: objetos nuevos y precios globales
  aplicarMundo(itemsNuevos, precios) {
    for (const it of (itemsNuevos || [])) {
      if (!it.id) continue;
      const estado = it.estado || 'activo';
      if (estado === 'oculto' || estado === 'eliminado') {
        if (!this.esBase(it.id)) delete CATALOGO_ITEMS[it.id];
        continue;
      }
      const norm = this._normalizarDef({
        nombre: it.nombre || it.id,
        icono: it.icono || '📦',
        tipo: it.tipo || 'especial',
        precio: this._limitarPrecio(it.precio),
        cura: it.cura || undefined,
        curaVida: it.curaVida || undefined,
        efecto: it.efecto || undefined,
        efectoValor: it.efectoValor != null ? it.efectoValor : undefined,
        efectoModo: it.efectoModo || undefined,
        crudo: it.crudo,
        probCrudoNegativo: it.probCrudoNegativo,
        dano: it.dano || undefined,
        nivelMin: it.nivelMin || undefined,
        nivelMax: it.nivelMax || undefined,
        rareza: it.rareza || undefined,
        desc: it.desc || 'Objeto creado por el administrador.',
        descLarga: it.descLarga || undefined,
        unico: it.unico || undefined,
        estado: it.estado || 'activo',
        creadoEn: it.creadoEn,
        modificadoEn: it.modificadoEn,
        creadoPor: it.creadoPor,
        puedeUsar: it.puedeUsar,
        puedeEquipar: it.puedeEquipar,
        puedeVender: it.puedeVender,
        puedeTirar: it.puedeTirar,
        puedeComerciar: it.puedeComerciar,
        pierdeAlMorir: it.pierdeAlMorir
      });
      CATALOGO_ITEMS[it.id] = norm;
    }
    for (const [id, precio] of Object.entries(precios || {})) {
      if (CATALOGO_ITEMS[id]) CATALOGO_ITEMS[id].precio = this._limitarPrecio(precio);
    }
  },

  _limitarPrecio(precio) {
    return Math.max(this.PRECIO_MINIMO, Math.min(this.PRECIO_MAXIMO, parseInt(precio, 10) || this.PRECIO_MINIMO));
  },

  // Lista de peces para el minijuego de pesca
  peces() {
    return Object.entries(CATALOGO_ITEMS)
      .filter(([, it]) => it.tipo === 'pez')
      .map(([id, it]) => ({ id, ...it }));
  },

  // Tesoro aleatorio (para los cofres ocultos del mapa)
  tesoroAleatorio() {
    const lista = Object.entries(CATALOGO_ITEMS).filter(([, it]) => it.tipo === 'tesoro');
    const [id] = lista[Math.floor(Math.random() * lista.length)];
    return id;
  },

  categoriaAdm(item) {
    return this.metaTipo(item).categoria;
  },

  tituloCategoriaAdm(cat) {
    return { consumibles: '🍽️ Consumibles', armas: '⚔️ Armas', animales: '🐟 Animales', objetos: '📦 Objetos' }[cat] || cat;
  },

  armas() {
    return Object.entries(CATALOGO_ITEMS)
      .filter(([, it]) => it.tipo === 'arma')
      .map(([id, it]) => ({ id, ...it }));
  },

  armaAptaParaNivel(id, nivel) {
    const it = this.obtener(id);
    if (!it || it.tipo !== 'arma') return false;
    const min = it.nivelMin || 1;
    const max = it.nivelMax || 100;
    return nivel >= min && nivel <= max;
  },

  /** Definición de efecto consumible (Fase 13): porcentaje o valor fijo. */
  defEfecto(item) {
    if (!item || typeof item !== 'object') return null;
    if (item.efecto && item.efectoValor != null && item.efectoValor > 0) {
      return {
        efecto: item.efecto,
        valor: Number(item.efectoValor),
        modo: item.efectoModo === 'porcentaje' ? 'porcentaje' : 'fijo'
      };
    }
    if (item.curaVida != null && item.curaVida > 0) {
      if (item.curaVida >= 100) return { efecto: 'vida', valor: 100, modo: 'porcentaje' };
      return { efecto: 'vida', valor: item.curaVida, modo: 'fijo' };
    }
    if (item.cura != null && item.cura > 0) {
      return { efecto: 'hambre', valor: item.cura, modo: 'fijo' };
    }
    if (item.tipo === 'pez' && item.crudo !== false) {
      return { efecto: 'crudo', valor: item.efectoValor || 10, modo: 'porcentaje' };
    }
    return null;
  },

  calcularEfectoUnidad(item, tipo, stats) {
    const def = this.defEfecto(item);
    if (!def) return this.valorPorUnidad(item, tipo);
    const efecto = tipo || def.efecto;
    const max = efecto === 'hambre'
      ? (stats?.hambreMax ?? CONFIG.hambreMaxima)
      : (stats?.vidaMax ?? (typeof Vida !== 'undefined' ? Vida.vidaMaxima() : CONFIG.vidaMaxima));
    if (def.modo === 'porcentaje') {
      return Math.max(0, Math.round(max * def.valor / 100));
    }
    return Math.max(0, Math.round(def.valor));
  },

  /** 'hambre' | 'vida' | 'crudo' | 'especial' | null */
  tipoConsumible(item, id) {
    if (!item) return null;
    const uso = this.usoEspecial(id);
    if (uso) return 'especial';
    const def = this.defEfecto(item);
    if (!def) return null;
    if (def.efecto === 'crudo') return 'crudo';
    if (def.efecto === 'vida' || def.efecto === 'veneno') return 'vida';
    if (def.efecto === 'hambre') return 'hambre';
    return null;
  },

  esConsumible(item, id) {
    const t = this.tipoConsumible(item, id);
    return t === 'hambre' || t === 'vida' || t === 'crudo';
  },

  valorPorUnidad(item, tipo) {
    if (tipo === 'crudo') return 0;
    return this.calcularEfectoUnidad(item, tipo);
  },

  /**
   * Cuántas unidades hacen falta para llenar hambre/vida (sin pasar del stack).
   * Ej.: 80/100 con +20 → 1; 79/100 con +20 → 2; 40/100 con +20 → 3.
   */
  cantidadOptimaConsumo(item, id, cantidadDisponible, stats) {
    const tipo = this.tipoConsumible(item, id);
    if (!tipo || tipo === 'especial') return tipo === 'especial' ? 1 : 0;
    const disp = Math.max(0, cantidadDisponible || 0);
    if (!disp) return 0;

    const por = this.calcularEfectoUnidad(item, tipo, stats);
    if (por <= 0 && tipo !== 'crudo') return 0;
    if (tipo === 'crudo') return Math.min(disp, 1);

    if (tipo === 'hambre') {
      const max = stats?.hambreMax ?? CONFIG.hambreMaxima;
      const actual = stats?.hambre ?? 0;
      const falta = max - actual;
      if (falta <= 0) return 0;
      return Math.min(disp, Math.ceil(falta / por));
    }

    const maxV = stats?.vidaMax ?? CONFIG.vidaMaxima;
    const actualV = stats?.vida ?? 0;
    const faltaV = maxV - actualV;
    if (faltaV <= 0) return 0;
    return Math.min(disp, Math.ceil(faltaV / por));
  }
};
