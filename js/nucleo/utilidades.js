// ============================================================
// UTILIDADES COMPARTIDAS
// ============================================================
const Utilidades = {

  desplazarMetros(pos, metros, bearingDeg) {
    if (!pos || pos.length < 2) return pos;
    const m = Math.max(0, metros || 0);
    if (m <= 0) return pos.slice();
    const br = ((bearingDeg != null ? bearingDeg : Math.random() * 360) * Math.PI) / 180;
    const R = 6371000;
    const lat1 = pos[0] * Math.PI / 180;
    const lon1 = pos[1] * Math.PI / 180;
    const d = m / R;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br)
    );
    const lon2 = lon1 + Math.atan2(
      Math.sin(br) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );
    return [lat2 * 180 / Math.PI, lon2 * 180 / Math.PI];
  },

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

  /** Vibración corta (combate). Respeta preferencia vibracionCombate del jugador. */
  vibrar(ms) {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    const prefs = typeof Guardado !== 'undefined' ? Guardado.datos?.preferencias : null;
    if (prefs && prefs.vibracionCombate === false) return;
    try {
      navigator.vibrate(ms || 140);
    } catch (e) { /* */ }
  },

  async fetchConTimeout(url, opciones = {}, ms = 8000) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, Object.assign({}, opciones, { signal: ctrl.signal }));
    } finally {
      clearTimeout(id);
    }
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
  },

  claveCuentaValida(clave) {
    if (!clave || clave.length < 8) return 'Mínimo 8 caracteres';
    if (!/[A-ZÁÉÍÓÚÑ]/.test(clave)) return 'Debe tener al menos 1 letra mayúscula';
    if (!/[^A-Za-z0-9]/.test(clave)) return 'Debe tener al menos 1 carácter especial (!@#$…)';
    return null;
  },

  pinCofreValido(pin) {
    return /^\d{4}$/.test(pin);
  },

  /** Contador para badges HUD: 1–10 exacto, 11+ muestra +10 */
  contadorBadge(cantidad) {
    const n = Math.max(0, Math.floor(Number(cantidad) || 0));
    if (n <= 0) return '';
    if (n > 10) return '+10';
    return String(n);
  },

  /** Fase 7 faces.md — nunca mostrar 404/500/undefined al jugador */
  mensajeAmigable(err, fallback) {
    const fb = fallback || 'No se pudo completar la acción. Inténtalo de nuevo.';
    if (err == null) return fb;
    const raw = typeof err === 'string'
      ? err
      : (err.message || err.error || err.mensaje || String(err));
    const msg = String(raw || '').trim();
    if (!msg || msg === 'undefined' || msg === 'null') return fb;
    const low = msg.toLowerCase();
    if (/failed to fetch|network|fetch|abort|timeout|econnrefused|socket/i.test(low)) {
      return 'No se pudo conectar. Reintentando…';
    }
    if (/\b404\b|not found/i.test(low)) return 'No se encontró esta información.';
    if (/\b500\b|internal server/i.test(low)) return 'El servidor tuvo un problema. Inténtalo de nuevo.';
    if (/forbidden|403|no puedes/i.test(low)) return 'No tienes permiso para esta acción.';
    if (/unauthorized|401|token/i.test(low)) return 'Sesión expirada. Vuelve a entrar.';
    if (/too far|demasiado lejos/i.test(low)) return msg;
    if (msg.length > 120 || /stack|at \w+\./i.test(msg)) return fb;
    return msg;
  }
};
