/**
 * Mariel Online — cliente con mapa Leaflet (Mariel, Cuba).
 * Solo envía intenciones; el servidor decide y avisa a todos.
 */
(function () {
  'use strict';

  const CFG = window.MARIEL_ONLINE || {};
  const API = (CFG.SERVER_URL || window.location.origin).replace(/\/$/, '');
  const TOKEN_KEY = 'mariel_online_token';

  let token = localStorage.getItem(TOKEN_KEY);
  let socket = null;
  let player = null;
  let worldObjects = [];
  let missions = [];
  let onlinePlayers = [];
  let map = null;
  let miMarcador = null;
  let marcadores = { jugadores: {}, objetos: {} };
  let gpsActivo = false;
  let gpsWatch = null;

  const $ = (id) => document.getElementById(id);

  // --- UI auth ---
  $('ir-registro').onclick = () => { toggleAuth('registro'); hideError(); };
  $('ir-login').onclick = () => { toggleAuth('login'); hideError(); };
  $('btn-login').onclick = login;
  $('btn-registro').onclick = register;
  $('btn-logout').onclick = logout;
  $('btn-ayuda').onclick = () => $('modal-ayuda').classList.remove('oculto');
  $('btn-cerrar-ayuda').onclick = () => $('modal-ayuda').classList.add('oculto');
  $('btn-gps').onclick = toggleGps;

  function toggleAuth(modo) {
    $('form-login').classList.toggle('oculto', modo !== 'login');
    $('form-registro').classList.toggle('oculto', modo !== 'registro');
  }

  async function api(path, opts = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (token) headers.Authorization = 'Bearer ' + token;
    const r = await fetch(API + path, Object.assign({}, opts, { headers }));
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Error de red');
    return data;
  }

  function showError(msg) { $('auth-error').textContent = msg; $('auth-error').classList.remove('oculto'); }
  function hideError() { $('auth-error').classList.add('oculto'); }

  function toast(msg, ms) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('oculto');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add('oculto'), ms || 3500);
  }

  async function login() {
    hideError();
    try {
      const data = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ username: $('login-user').value.trim(), password: $('login-pass').value })
      });
      onAuthSuccess(data);
    } catch (e) { showError(e.message); }
  }

  async function register() {
    hideError();
    if ($('reg-pass').value !== $('reg-pass2').value) return showError('Las contraseñas no coinciden');
    try {
      const data = await api('/api/register', {
        method: 'POST',
        body: JSON.stringify({ username: $('reg-user').value.trim(), password: $('reg-pass').value })
      });
      onAuthSuccess(data);
    } catch (e) { showError(e.message); }
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
    if (gpsWatch) navigator.geolocation.clearWatch(gpsWatch);
    if (socket) socket.disconnect();
    location.reload();
  }

  // --- Mapa Leaflet ---
  function initMap() {
    if (map) return;
    const center = CFG.mapCenter || [22.9936, -82.7539];
    map = L.map('map', {
      center,
      zoom: CFG.mapZoom || 16,
      minZoom: CFG.mapMinZoom || 14,
      maxZoom: CFG.mapMaxZoom || 20,
      zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map);

    if (CFG.mapBounds) {
      map.setMaxBounds(L.latLngBounds(CFG.mapBounds));
    }

    map.on('click', (e) => {
      moverA(e.latlng.lat, e.latlng.lng);
    });
  }

  function iconoHtml(texto, extra) {
    return L.divIcon({
      className: 'marca-jugador ' + (extra || ''),
      html: '<div>' + texto + '</div>',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
  }

  function iconoObjeto(obj) {
    const icon = obj.data?.icon || (obj.type === 'tree' ? '🌴' : '📦');
    return L.divIcon({
      className: 'marca-objeto',
      html: icon,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
  }

  function actualizarMiMarcador() {
    if (!player || !map) return;
    const latlng = [player.x, player.y];
    if (!miMarcador) {
      miMarcador = L.marker(latlng, { icon: iconoHtml('🔴', 'marca-yo'), zIndexOffset: 1000 }).addTo(map);
      miMarcador.bindTooltip(player.name + ' (tú)', { permanent: false });
    } else {
      miMarcador.setLatLng(latlng);
    }
  }

  function pintarObjetos() {
    for (const id of Object.keys(marcadores.objetos)) {
      if (!worldObjects.find(o => o.id === parseInt(id, 10))) {
        map.removeLayer(marcadores.objetos[id]);
        delete marcadores.objetos[id];
      }
    }
    for (const obj of worldObjects) {
      const latlng = [obj.x, obj.y];
      let m = marcadores.objetos[obj.id];
      if (!m) {
        m = L.marker(latlng, { icon: iconoObjeto(obj) }).addTo(map);
        m.on('click', (ev) => {
          L.DomEvent.stopPropagation(ev);
          interactuar(obj);
        });
        const tip = (obj.data?.itemId || obj.type) +
          (obj.data?.hp ? ' HP:' + obj.data.hp : '');
        m.bindTooltip(tip);
        marcadores.objetos[obj.id] = m;
      } else {
        m.setLatLng(latlng);
      }
    }
  }

  function pintarJugadoresOnline() {
    for (const id of Object.keys(marcadores.jugadores)) {
      if (!onlinePlayers.find(p => p.playerId === parseInt(id, 10))) {
        map.removeLayer(marcadores.jugadores[id]);
        delete marcadores.jugadores[id];
      }
    }
    for (const p of onlinePlayers) {
      if (p.playerId === player?.id) continue;
      const latlng = [p.x, p.y];
      let m = marcadores.jugadores[p.playerId];
      if (!m) {
        m = L.marker(latlng, { icon: iconoHtml('🔵') }).addTo(map);
        m.bindTooltip(p.name);
        marcadores.jugadores[p.playerId] = m;
      } else {
        m.setLatLng(latlng);
      }
    }
  }

  function moverA(lat, lng) {
    if (!socket || !player) return;
    socket.emit('player:move', { x: lat, y: lng }, (res) => {
      if (!res?.ok) { toast(res?.error || 'No puedes ir tan lejos'); return; }
      player.x = res.x;
      player.y = res.y;
      actualizarMiMarcador();
    });
  }

  function interactuar(obj) {
    if (obj.type === 'tree') {
      socket.emit('world:cutTree', { objectId: obj.id }, (res) => {
        toast(res?.ok ? '🌴 Golpeaste el árbol' : (res?.error || 'No se pudo'));
      });
    } else if (obj.type === 'item') {
      socket.emit('world:pickup', { objectId: obj.id }, (res) => {
        if (res?.ok) {
          player.inventory = res.inventory;
          renderInventory();
          toast('Recogiste ' + (obj.data?.itemId || 'objeto'));
        } else toast(res?.error || 'No se pudo recoger');
      });
    }
  }

  function toggleGps() {
    if (!navigator.geolocation) return toast('GPS no disponible en este dispositivo');
    gpsActivo = !gpsActivo;
    $('btn-gps').classList.toggle('activo', gpsActivo);
    if (!gpsActivo) {
      if (gpsWatch) navigator.geolocation.clearWatch(gpsWatch);
      gpsWatch = null;
      return toast('GPS desactivado');
    }
    toast('GPS activo — camina en Mariel');
    gpsWatch = navigator.geolocation.watchPosition(
      (pos) => moverA(pos.coords.latitude, pos.coords.longitude),
      () => toast('No se pudo leer el GPS'),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );
  }

  // --- Socket ---
  function startGame() {
    $('pantalla-auth').classList.add('oculto');
    $('pantalla-juego').classList.remove('oculto');
    initMap();
    updatePlayerUI();

    socket = io(API, { auth: { token } });

    socket.on('connect_error', (e) => toast('Sin conexión: ' + e.message, 6000));
    socket.on('game:init', onGameInit);
    socket.on('player:move', onPlayerMove);
    socket.on('player:online', (p) => { onlinePlayers.push(p); renderOnline(); pintarJugadoresOnline(); });
    socket.on('player:offline', (p) => {
      onlinePlayers = onlinePlayers.filter(x => x.playerId !== p.playerId);
      renderOnline(); pintarJugadoresOnline();
    });
    socket.on('player:updateStats', onStatsUpdate);
    socket.on('world:updateObject', onWorldUpdate);
    socket.on('world:removeObject', onWorldRemove);
    socket.on('mission:create', (m) => { missions.unshift(m); renderMissions(); toast('Nueva misión: ' + m.title); });
    socket.on('mission:update', onMissionUpdate);
    socket.on('player:updateInventory', (p) => {
      if (p.inventory) { player.inventory = p.inventory; renderInventory(); }
    });

    setTimeout(() => map.invalidateSize(), 300);
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
    actualizarMiMarcador();
    pintarObjetos();
    pintarJugadoresOnline();
    map.setView([player.x, player.y], CFG.mapZoom || 16);
    toast('Conectado al mundo compartido');
  }

  function onPlayerMove(data) {
    if (data.playerId === player.id) {
      player.x = data.x;
      player.y = data.y;
      actualizarMiMarcador();
    } else {
      const p = onlinePlayers.find(x => x.playerId === data.playerId);
      if (p) { p.x = data.x; p.y = data.y; pintarJugadoresOnline(); }
    }
  }

  function onStatsUpdate(data) {
    if (data.playerId !== player.id) return;
    if (data.hp !== undefined) player.hp = data.hp;
    if (data.hunger !== undefined) player.hunger = data.hunger;
    if (data.xp !== undefined) player.xp = data.xp;
    if (data.level !== undefined) player.level = data.level;
    updatePlayerUI();
  }

  function onWorldUpdate(obj) {
    const i = worldObjects.findIndex(x => x.id === obj.id);
    if (i >= 0) worldObjects[i] = obj; else worldObjects.push(obj);
    pintarObjetos();
  }

  function onWorldRemove(data) {
    worldObjects = worldObjects.filter(x => x.id !== data.id);
    pintarObjetos();
  }

  function onMissionUpdate(m) {
    if (m.deleted) missions = missions.filter(x => x.id !== m.id);
    else {
      const i = missions.findIndex(x => x.id === m.id);
      if (i >= 0) missions[i] = m; else if (m.isActive) missions.push(m);
    }
    renderMissions();
  }

  function updatePlayerUI() {
    if (!player) return;
    $('stat-nombre').textContent = player.name;
    $('stat-hp').textContent = player.hp;
    $('stat-hunger').textContent = player.hunger;
    $('stat-level').textContent = player.level;
  }

  function renderOnline() {
    $('online-count').textContent = onlinePlayers.length;
    $('online-list').innerHTML = onlinePlayers.map(p =>
      '<li>' + esc(p.name) + '</li>'
    ).join('') || '<li>Solo tú</li>';
  }

  function renderMissions() {
    $('missions-list').innerHTML = missions.map(m =>
      '<li><b>' + esc(m.title) + '</b></li>'
    ).join('') || '<li>Sin misiones</li>';
  }

  function renderInventory() {
    const inv = player?.inventory || [];
    $('inventory-list').innerHTML = inv.map(it =>
      '<li>' + (it.icon || '📦') + ' ' + esc(it.itemId) + ' x' + (it.cantidad || 1) + '</li>'
    ).join('') || '<li>Vacía</li>';
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  if (token) {
    api('/api/player/me').then((data) => {
      player = data.player;
      startGame();
    }).catch(() => localStorage.removeItem(TOKEN_KEY));
  }
})();
