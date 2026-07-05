/**
 * Cliente del juego — solo envía intenciones al servidor.
 * El servidor valida, guarda en SQLite y avisa a todos por Socket.IO.
 */
(function () {
  'use strict';

  const API = window.location.origin;
  const TOKEN_KEY = 'mariel_online_token';

  // Centro del mapa: Mariel, Cuba
  const MAP_CENTER = { lat: 22.9936, lng: -82.7539 };
  const MAP_SCALE = 80000; // píxeles por grado

  let token = localStorage.getItem(TOKEN_KEY);
  let socket = null;
  let player = null;
  let worldObjects = [];
  let missions = [];
  let onlinePlayers = [];
  let selectedObjectId = null;

  const $ = (id) => document.getElementById(id);
  const canvas = $('mapa');
  const ctx = canvas.getContext('2d');

  // --- Auth UI ---
  $('ir-registro').onclick = () => {
    $('form-login').classList.add('oculto');
    $('form-registro').classList.remove('oculto');
    hideError();
  };
  $('ir-login').onclick = () => {
    $('form-registro').classList.add('oculto');
    $('form-login').classList.remove('oculto');
    hideError();
  };

  $('btn-login').onclick = () => login();
  $('btn-registro').onclick = () => register();
  $('btn-logout').onclick = () => logout();

  async function api(path, opts = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (token) headers.Authorization = 'Bearer ' + token;
    const r = await fetch(API + path, Object.assign({}, opts, { headers }));
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Error de red');
    return data;
  }

  function showError(msg) {
    $('auth-error').textContent = msg;
    $('auth-error').classList.remove('oculto');
  }

  function hideError() {
    $('auth-error').classList.add('oculto');
  }

  async function login() {
    hideError();
    try {
      const data = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({
          username: $('login-user').value.trim(),
          password: $('login-pass').value
        })
      });
      onAuthSuccess(data);
    } catch (e) {
      showError(e.message);
    }
  }

  async function register() {
    hideError();
    const pass = $('reg-pass').value;
    if (pass !== $('reg-pass2').value) return showError('Las contraseñas no coinciden');
    try {
      const data = await api('/api/register', {
        method: 'POST',
        body: JSON.stringify({
          username: $('reg-user').value.trim(),
          password: pass
        })
      });
      onAuthSuccess(data);
    } catch (e) {
      showError(e.message);
    }
  }

  function onAuthSuccess(data) {
    token = data.token;
    localStorage.setItem(TOKEN_KEY, token);
    player = data.player;
    startGame();
  }

  function logout() {
    token = null;
    localStorage.removeItem(TOKEN_KEY);
    if (socket) socket.disconnect();
    socket = null;
    $('pantalla-juego').classList.add('oculto');
    $('pantalla-auth').classList.remove('oculto');
  }

  // --- Juego ---
  function startGame() {
    $('pantalla-auth').classList.add('oculto');
    $('pantalla-juego').classList.remove('oculto');
    updatePlayerUI();

    socket = io(API, { auth: { token } });

    socket.on('connect_error', (e) => log('Error Socket: ' + e.message));
    socket.on('game:init', onGameInit);
    socket.on('player:move', onPlayerMove);
    socket.on('player:online', (p) => { onlinePlayers.push(p); renderOnline(); });
    socket.on('player:offline', (p) => {
      onlinePlayers = onlinePlayers.filter(x => x.playerId !== p.playerId);
      renderOnline();
    });
    socket.on('player:updateStats', onStatsUpdate);
    socket.on('world:updateObject', onWorldUpdate);
    socket.on('world:removeObject', onWorldRemove);
    socket.on('mission:create', (m) => { missions.unshift(m); renderMissions(); log('Nueva misión: ' + m.title); });
    socket.on('mission:update', (m) => {
      if (m.deleted) missions = missions.filter(x => x.id !== m.id);
      else {
        const i = missions.findIndex(x => x.id === m.id);
        if (i >= 0) missions[i] = m; else if (m.isActive) missions.push(m);
      }
      renderMissions();
    });
    socket.on('player:updateInventory', (p) => {
      if (p.inventory) { player.inventory = p.inventory; renderInventory(); }
    });

    canvas.onclick = onMapClick;
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
  }

  function onGameInit(data) {
    player = data.player;
    worldObjects = data.worldObjects || [];
    missions = data.missions || [];
    onlinePlayers = data.onlinePlayers || [];
    updatePlayerUI();
    renderOnline();
    renderMissions();
    renderInventory();
    drawMap();
    log('Conectado al mundo compartido');
  }

  function onPlayerMove(data) {
    if (data.playerId === player.id) {
      player.x = data.x;
      player.y = data.y;
    } else {
      const p = onlinePlayers.find(x => x.playerId === data.playerId);
      if (p) { p.x = data.x; p.y = data.y; }
    }
    drawMap();
  }

  function onStatsUpdate(data) {
    if (data.playerId === player.id) {
      if (data.hp !== undefined) player.hp = data.hp;
      if (data.hunger !== undefined) player.hunger = data.hunger;
      if (data.xp !== undefined) player.xp = data.xp;
      if (data.level !== undefined) player.level = data.level;
      updatePlayerUI();
    }
  }

  function onWorldUpdate(obj) {
    const i = worldObjects.findIndex(x => x.id === obj.id);
    if (i >= 0) worldObjects[i] = obj; else worldObjects.push(obj);
    drawMap();
  }

  function onWorldRemove(data) {
    worldObjects = worldObjects.filter(x => x.id !== data.id);
    drawMap();
  }

  function updatePlayerUI() {
    if (!player) return;
    $('stat-nombre').textContent = player.name;
    $('stat-hp').textContent = player.hp;
    $('stat-hunger').textContent = player.hunger;
    $('stat-level').textContent = player.level;
  }

  function renderOnline() {
    $('online-list').innerHTML = onlinePlayers.map(p =>
      `<li>${esc(p.name)}</li>`
    ).join('') || '<li>Nadie más</li>';
  }

  function renderMissions() {
    $('missions-list').innerHTML = missions.map(m =>
      `<li><b>${esc(m.title)}</b> — ${esc(m.description)}</li>`
    ).join('') || '<li>Sin misiones activas</li>';
  }

  function renderInventory() {
    const inv = player?.inventory || [];
    $('inventory-list').innerHTML = inv.map(it =>
      `<li>${it.icon || '📦'} ${esc(it.itemId)} x${it.cantidad || 1}</li>`
    ).join('') || '<li>Vacía</li>';
  }

  function log(msg) {
    $('game-log').textContent = msg;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // --- Mapa canvas (coordenadas GPS simplificadas) ---
  function latLngToPixel(lat, lng) {
    const w = canvas.width;
    const h = canvas.height;
    const x = (lng - MAP_CENTER.lng) * MAP_SCALE + w / 2;
    const y = (MAP_CENTER.lat - lat) * MAP_SCALE + h / 2;
    return { x, y };
  }

  function pixelToLatLng(x, y) {
    const w = canvas.width;
    const h = canvas.height;
    const lng = (x - w / 2) / MAP_SCALE + MAP_CENTER.lng;
    const lat = MAP_CENTER.lat - (y - h / 2) / MAP_SCALE;
    return { lat, lng };
  }

  function resizeCanvas() {
    const wrap = $('mapa-wrap');
    const w = Math.min(wrap.clientWidth - 16, 800);
    canvas.width = w;
    canvas.height = Math.round(w * 0.625);
    drawMap();
  }

  function drawMap() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#166534';
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    for (let i = 0; i < w; i += 40) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
    }
    for (let j = 0; j < h; j += 40) {
      ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(w, j); ctx.stroke();
    }

    // Objetos del mundo
    for (const obj of worldObjects) {
      const p = latLngToPixel(obj.x, obj.y);
      const icon = obj.data?.icon || (obj.type === 'tree' ? '🌴' : '📦');
      ctx.font = '22px serif';
      ctx.textAlign = 'center';
      ctx.fillText(icon, p.x, p.y);
      if (obj.type === 'tree' && obj.data?.hp) {
        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#fef08a';
        ctx.fillText('HP:' + obj.data.hp, p.x, p.y + 14);
        ctx.fillStyle = '#fff';
      }
    }

    // Otros jugadores
    for (const op of onlinePlayers) {
      if (op.playerId === player?.id) continue;
      const p = latLngToPixel(op.x, op.y);
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.fillText(op.name, p.x, p.y - 12);
    }

    // Jugador local
    if (player) {
      const p = latLngToPixel(player.x, player.y);
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function onMapClick(ev) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (ev.clientX - rect.left) * scaleX;
    const py = (ev.clientY - rect.top) * scaleY;
    const { lat, lng } = pixelToLatLng(px, py);

    // ¿Clic en objeto cercano?
    const hit = findNearbyObject(px, py);
    if (hit) {
      interactWithObject(hit);
      return;
    }

    // Mover jugador (intención → servidor valida)
    socket.emit('player:move', { x: lng, y: lat }, (res) => {
      if (!res?.ok) {
        log(res?.error || 'Movimiento rechazado');
        return;
      }
      player.x = res.x;
      player.y = res.y;
      drawMap();
    });
  }

  function findNearbyObject(px, py) {
    let best = null;
    let bestDist = 30;
    for (const obj of worldObjects) {
      const p = latLngToPixel(obj.x, obj.y);
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < bestDist) { bestDist = d; best = obj; }
    }
    return best;
  }

  function interactWithObject(obj) {
    if (obj.type === 'tree') {
      socket.emit('world:cutTree', { objectId: obj.id }, (res) => {
        log(res?.ok ? '🌴 Golpeaste el árbol' : (res?.error || 'No se pudo'));
      });
    } else if (obj.type === 'item') {
      socket.emit('world:pickup', { objectId: obj.id }, (res) => {
        if (res?.ok) {
          player.inventory = res.inventory;
          renderInventory();
          log('Recogiste ' + (obj.data?.itemId || 'objeto'));
        } else {
          log(res?.error || 'No se pudo recoger');
        }
      });
    }
  }

  // Auto-login si hay token guardado
  if (token) {
    api('/api/player/me')
      .then((data) => {
        player = data.player;
        startGame();
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        token = null;
      });
  }
})();
