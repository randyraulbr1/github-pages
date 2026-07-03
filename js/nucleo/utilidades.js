// ============================================================
// UTILIDADES COMPARTIDAS
// ============================================================
const Utilidades = {

  // Distancia en metros entre dos puntos [lat, lon] (fórmula haversine)
  distanciaMetros(a, b) {
    const R = 6371000;
    const rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad;
    const dLon = (b[1] - a[1]) * rad;
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  },

  // SHA-256 en hexadecimal. Usa la API nativa del navegador; si no está
  // disponible (por ejemplo abriendo el archivo sin https) usa un hash simple.
  async sha256(texto) {
    if (window.crypto && crypto.subtle) {
      const datos = new TextEncoder().encode(texto);
      const buffer = await crypto.subtle.digest('SHA-256', datos);
      return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Respaldo simple (solo para pruebas locales sin https)
    let h1 = 0x811c9dc5, h2 = 0x1000193;
    for (let i = 0; i < texto.length; i++) {
      h1 = Math.imul(h1 ^ texto.charCodeAt(i), 16777619) >>> 0;
      h2 = Math.imul(h2 + texto.charCodeAt(i), 2654435761) >>> 0;
    }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  },

  fechaLegible(ms) {
    const f = new Date(ms);
    return f.toLocaleDateString('es-ES') + ' ' +
           f.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  },

  // Animación de un emoji volando desde una posición de pantalla hasta la mochila
  volarHaciaMochila(icono, xInicio, yInicio) {
    const destino = document.getElementById('btn-mochila').getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'item-volando';
    el.textContent = icono;
    el.style.left = xInicio + 'px';
    el.style.top = yInicio + 'px';
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.left = (destino.left + destino.width / 2) + 'px';
      el.style.top = (destino.top + destino.height / 2) + 'px';
      el.style.fontSize = '10px';
      el.style.opacity = '0.2';
    }));
    setTimeout(() => el.remove(), 950);
  }
};
