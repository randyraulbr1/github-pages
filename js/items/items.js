// ============================================================
// CATÁLOGO DE ITEMS DEL JUEGO (50 items)
// tipo: pez | herramienta | comida | tesoro | material
// precio: precio de compra en tiendas (se vende a la mitad)
// cura: puntos de vida que recupera al usarse (solo comida/medicina)
// rareza (peces): 1 común ... 4 muy raro — afecta la pesca
// ============================================================
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

const Items = {
  PRECIO_MINIMO: 5,
  PRECIO_MAXIMO: 5000,

  obtener(id) { return CATALOGO_ITEMS[id]; },

  // Para pintar en pantalla: nunca devuelve vacío aunque el item ya no exista
  seguro(id) {
    return CATALOGO_ITEMS[id] ||
      { nombre: 'Objeto desconocido', icono: '❓', tipo: 'especial', precio: this.PRECIO_MINIMO, desc: '' };
  },

  // Aplica el mundo publicado/local del admin: objetos nuevos y precios globales
  aplicarMundo(itemsNuevos, precios) {
    for (const it of (itemsNuevos || [])) {
      if (!it.id) continue;
      CATALOGO_ITEMS[it.id] = {
        nombre: it.nombre || it.id,
        icono: it.icono || '📦',
        tipo: it.tipo || 'especial',
        precio: this._limitarPrecio(it.precio),
        cura: it.cura || undefined,
        curaVida: it.curaVida || undefined,
        dano: it.dano || undefined,
        nivelMin: it.nivelMin || undefined,
        nivelMax: it.nivelMax || undefined,
        desc: it.desc || 'Objeto creado por el administrador.'
      };
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
    if (!item) return 'objetos';
    if (item.tipo === 'comida') return 'consumibles';
    if (item.tipo === 'arma') return 'armas';
    if (item.tipo === 'pez') return 'animales';
    return 'objetos';
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
  }
};
