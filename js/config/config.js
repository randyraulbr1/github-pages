// ============================================================
// CONFIGURACIÓN GENERAL DEL JUEGO — Mariel, Cuba
// ============================================================
const CONFIG = {
  // Cambiar al publicar: obliga al móvil a descartar caché vieja
  version: '28',

  // Nombre reservado del administrador (solo este jugador ve el panel admin)
  adminNombre: 'randy',

  vidaMaxima: 100,
  hambreMaxima: 100,
  hambreInicial: 50,
  nivelMaximo: 100,
  segundosDesgasteHambre: 120,
  radioColocarCofre: 60,

  // Cuba: dejar vacío. Usar clave de GitHub en Admin (🔑 Configurar clave de publicación).
  firebaseMundoUrl: '',
  // Centro del pueblo de Mariel, Artemisa, Cuba
  centro: [22.9936, -82.7539],

  // Cuadrado jugable: no se puede ver ni salir fuera de esta zona
  limites: [
    [22.9650, -82.7900], // esquina suroeste
    [23.0250, -82.7150]  // esquina noreste
  ],

  zoomInicial: 16,
  zoomMinimo: 14,
  zoomMaximo: 19,

  // Distancias (en metros)
  distanciaInteraccion: 20,      // distancia para poder tocar tiendas, pesca, etc.
  distanciaDetectorTesoro: 150,  // el buscador de tesoros empieza a avisar
  distanciaVerTesoro: 10,        // el icono del tesoro aparece en el mapa

  // Valores iniciales del jugador
  dineroInicial: 100,

  // La vida baja solo si el hambre llega a 0 (ver vida.js)
  segundosDesgasteVida: 90,

  claveGuardado: 'mariel_explorer_v1',

  // Dónde publica el admin el mundo (botón PUBLICAR MUNDO)
  repoPublicacion: 'randyraulbr1/github-pages',
  ramaPublicacion: 'claude/web-rpg-gps-game-n3ybow',

  // Solo desarrollo local (nunca subas un token real al repositorio)
  tokenRegistroJugadores: '',
};
