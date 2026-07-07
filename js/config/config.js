// ============================================================
// CONFIGURACIÓN GENERAL DEL JUEGO — Mariel, Cuba
// ============================================================
const CONFIG = {
  // Cambiar al publicar: obliga al móvil a descartar caché vieja
  version: '258',
  maxPila: 10,

  // Nombre reservado del administrador (solo este jugador ve el panel admin)
  adminNombre: 'SoyCaos',
  adminDisplayNombre: 'SoyCaos',
  adminAlias: ['randy'],
  adminId: 'pmr7x4zhznzw5o',

  vidaMaxima: 100,
  vidaExtraPorNivel: 4,
  hambreMaxima: 100,
  hambreInicial: 50,
  nivelMaximo: 100,
  segundosDesgasteHambre: 120,
  radioColocarCofre: 60,

  // ☁️ NUBE: servidor en vivo (Render) + respaldo en datos/mundo.json (GitHub Pages).
  // Admin: inicia sesión y pulsa Guardar mapa → todos ven el cambio al instante.
  firebaseMundoUrl: '',
  // Centro del pueblo de Mariel, Artemisa, Cuba
  centro: [22.9936, -82.7539],
  // Posición de rescate si el pin queda fuera del mapa
  pinRestablecer: [22.988784, -82.754494],

  // Cuadrado jugable: no se puede ver ni salir fuera de esta zona
  limites: [
    [22.9650, -82.7900], // esquina suroeste
    [23.0250, -82.7150]  // esquina noreste
  ],

  zoomInicial: 16,
  zoomSeguimientoJugador: 20,
  zoomRecuperarSegundos: 4,
  zoomMinimo: 14,
  zoomMaximo: 20,

  // Distancias (en metros)
  distanciaInteraccion: 20,      // distancia para poder tocar tiendas, pesca, etc.
  bolsaDropMinutos: 5,           // bolsa en el suelo sin recoger nada
  distanciaVerBolsa: 60,         // ver bolsas de objetos eliminados en el mapa
  distanciaVerEntidades: 500,    // jugadores y enemigos en el mapa (optimización)
  optimizarVisibilidad: true,    // ocultar entidades lejanas (admin puede desactivar)
  distanciaVerMuerto: 50,        // distancia para revivir/saquear
  distanciaBolsaDropMetros: 5,   // bolsa al eliminar inventario: ~5 m del pin
  cuerpoMuertoHoras: 1,          // pin ⚰️ visible en mapa (aunque desconecte)
  vidaAlRevivirPct: 40,          // % de vida máxima al revivir (amigo o admin)
  proteccionRevivirMs: 120000,   // 2 min tras revivir: sin atacar, huir ni daño
  cofreVacioHoras: 1,            // cofre vacío desaparece del mapa tras N horas
  distanciaDetectorTesoro: 150,  // el buscador de tesoros empieza a avisar
  distanciaVerTesoro: 10,

  radioZonaExterior: 75,
  radioZonaEnemigo: 40,
  radioZonaAtaque: 18,        // el icono del tesoro aparece en el mapa

  // Valores iniciales del jugador
  dineroInicial: 100,

  // La vida baja solo si el hambre llega a 0 (ver vida.js)
  segundosDesgasteVida: 90,

  claveGuardado: 'mariel_explorer_v1',

  // Dónde publica el admin el mundo (botón PUBLICAR MUNDO)
  repoPublicacion: 'randyraulbr1/github-pages',
  ramaPublicacion: 'main',

  // Solo desarrollo local (nunca subas un token real al repositorio)
  tokenRegistroJugadores: '',

  // Servidor multijugador en vivo (Render). Vacío = desactivado.
  servidorOnline: 'https://mariel-online.onrender.com',
};
