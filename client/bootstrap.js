/**
 * Carga Socket.IO desde el servidor API (funciona en tcodm.com + api.tcodm.com).
 */
(function () {
  const CFG = window.MARIEL_ONLINE || {};
  const api = (CFG.SERVER_URL || window.location.origin).replace(/\/$/, '');

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar ' + src));
      document.body.appendChild(s);
    });
  }

  const estado = document.getElementById('auth-estado');

  loadScript(api + '/socket.io/socket.io.js')
    .then(() => loadScript('game.js?v=2'))
    .catch((e) => {
      if (estado) {
        estado.innerHTML = '⚠️ Servidor no disponible.<br>Despliega <code>server/</code> en Render → <code>api.tcodm.com</code><br><small>' + e.message + '</small>';
        estado.style.color = '#fca5a5';
      }
    });
})();
