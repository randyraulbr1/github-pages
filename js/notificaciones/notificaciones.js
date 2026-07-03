// ============================================================
// SISTEMA DE NOTIFICACIONES
// Aparecen deslizándose desde la derecha y desaparecen solas.
// Tipos: 'info', 'exito', 'error', 'alerta'
// ============================================================
const Notificaciones = {

  mostrar(texto, tipo = 'info', duracionMs = 3200) {
    const zona = document.getElementById('zona-notificaciones');
    const n = document.createElement('div');
    n.className = 'notificacion ' + tipo;
    n.textContent = texto;
    zona.appendChild(n);

    // Entra deslizándose
    requestAnimationFrame(() => requestAnimationFrame(() => n.classList.add('visible')));

    // Sale deslizándose y se elimina
    setTimeout(() => {
      n.classList.add('saliendo');
      setTimeout(() => n.remove(), 400);
    }, duracionMs);
  }
};
