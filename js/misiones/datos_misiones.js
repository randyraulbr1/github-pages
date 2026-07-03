// ============================================================
// DATOS DE LAS 5 MISIONES — cada una con su ubicación en Mariel
// tipos:
//  visitar   → llegar a la ubicación (menos de 20 m)
//  contar    → repetir una acción X veces (pescar, tesoros...)
//  entregar  → llevar ciertos items a la ubicación
// ============================================================
const DATOS_MISIONES = [
  {
    id: 'mision_muelle',
    titulo: 'Bienvenido al puerto',
    descripcion: 'Camina hasta el muelle viejo del puerto de Mariel.',
    tipo: 'visitar',
    posicion: [22.9948, -82.7506],
    recompensa: { dinero: 50, items: [{ id: 'cana_pescar', cantidad: 1 }] }
  },
  {
    id: 'mision_pesca',
    titulo: 'Primera pesca',
    descripcion: 'Captura 3 peces en los muelles de la bahía.',
    tipo: 'contar',
    evento: 'pez_capturado',
    meta: 3,
    posicion: [22.9963, -82.7472],
    recompensa: { dinero: 100, items: [{ id: 'carnada', cantidad: 5 }] }
  },
  {
    id: 'mision_plaza',
    titulo: 'El rumor del tesoro',
    descripcion: 'Dicen que en la plaza vieja alguien vende un aparato para encontrar tesoros. Ve a verla.',
    tipo: 'visitar',
    posicion: [22.9926, -82.7538],
    recompensa: { dinero: 30, items: [{ id: 'mapa_antiguo', cantidad: 1 }] }
  },
  {
    id: 'mision_entrega',
    titulo: 'Encargo del mercado',
    descripcion: 'Lleva 3 sardinas al Mercado Central.',
    tipo: 'entregar',
    posicion: [22.9924, -82.7521],
    requiere: [{ id: 'sardina', cantidad: 3 }],
    recompensa: { dinero: 120, items: [{ id: 'pizza', cantidad: 1 }] }
  },
  {
    id: 'mision_cazador',
    titulo: 'Cazador de tesoros',
    descripcion: 'Encuentra 2 tesoros ocultos por el pueblo. Te hará falta un buscador de tesoros…',
    tipo: 'contar',
    evento: 'tesoro_recogido',
    meta: 2,
    posicion: [22.9958, -82.7532],
    recompensa: { dinero: 300, items: [{ id: 'gema_azul', cantidad: 1 }] }
  }
];
