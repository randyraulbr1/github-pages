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

  // ---------- COMIDA Y MEDICINA (12) ----------
  agua:           { nombre: 'Botella de agua',   icono: '💧', tipo: 'comida', precio: 5,  cura: 5,  desc: 'Fresca, recupera un poco de vida.' },
  refresco:       { nombre: 'Refresco',          icono: '🥤', tipo: 'comida', precio: 10, cura: 10, desc: 'Bien frío, del timbiriche.' },
  cafe:           { nombre: 'Café cubano',       icono: '☕', tipo: 'comida', precio: 6,  cura: 8,  desc: 'Un buchito y sigues andando.' },
  pan:            { nombre: 'Pan',               icono: '🍞', tipo: 'comida', precio: 8,  cura: 10, desc: 'Pan de la bodega, calientico.' },
  pizza:          { nombre: 'Pizza',             icono: '🍕', tipo: 'comida', precio: 25, cura: 25, desc: 'De queso, doblada como se debe.' },
  pollo_asado:    { nombre: 'Pollo asado',       icono: '🍗', tipo: 'comida', precio: 35, cura: 30, desc: 'Recupera bastante vida.' },
  arroz_congri:   { nombre: 'Arroz congrí',      icono: '🍚', tipo: 'comida', precio: 20, cura: 22, desc: 'El clásico que nunca falla.' },
  platano_frito:  { nombre: 'Plátano frito',     icono: '🍌', tipo: 'comida', precio: 10, cura: 12, desc: 'Chatinos crujientes.' },
  mango:          { nombre: 'Mango',             icono: '🥭', tipo: 'comida', precio: 8,  cura: 10, desc: 'Dulce, de la mata del patio.' },
  coco:           { nombre: 'Coco',              icono: '🥥', tipo: 'comida', precio: 12, cura: 12, desc: 'Agua de coco directa de la palma.' },
  botiquin:       { nombre: 'Botiquín',          icono: '🩹', tipo: 'comida', precio: 60, cura: 50, desc: 'Vendas y medicinas básicas.' },
  pocion_vida:    { nombre: 'Medicina fuerte',   icono: '🧪', tipo: 'comida', precio: 120, cura: 100, desc: 'Recupera toda la vida.' },

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
  chatarra:       { nombre: 'Chatarra',          icono: '⚙️', tipo: 'material', precio: 9,  desc: 'Hierros viejos del puerto.' }
};

const Items = {
  obtener(id) { return CATALOGO_ITEMS[id]; },

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
  }
};
