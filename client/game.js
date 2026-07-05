/**
 * Mariel Online — multijugador en vivo. Otros jugadores visibles en el mapa.
 */
(function () {
  'use strict';

  const CFG = window.MARIEL_ONLINE || {};
  const API = (CFG.SERVER_URL || window.location.origin).replace(/\/$/, '');
  const TOKEN_KEY = 'mariel_online_token';
  const MI_ID = () => Number(player?.id);

  let token = localStorage.getItem(TOKEN_KEY);
  let socket = null;
  let player = null;
  let worldObjects = [];
  let missions = [];
  let onlinePlayers = [];
  let map = null;
  let miMarcador = null;
  let marcadores = { jugadores: {}, objetos: {} };
  let animaciones = {};
  let gpsActivo = false;
  let gpsWatch = null;
  let ultimoGps = 0;

  const $ = (id) => document.getElementById(id);

  $('ir-registro').onclick = () => { toggleAuth('registro'); hideError(); };
  $('ir-login').onclick = () => { toggleAuth('login'); hideError(); };
  $('btn-login').onclick = login;
  $('btn-registro').onclick = register;
  $('btn-logout').onclick = logout;
  $('btn-ayuda').onclick = () => $('modal-ayuda').classList.remove('oculto');
  $('btn-cerrar-ayuda').onclick = () => $('modal-ayuda').classList.add('oculto');
  $('btn-gps').onclick = toggleGps;
  $('btn-centrar').onclick = () => {
    if (player && map) map.setView([player.x, player.y], map.getZoom(), { animate: true });
  };

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

  function setConexion(ok) {
    const el = $('stat-conexion');
    if (!el) return;
    el.textContent = ok ? '🟢' : '🔴';
    el.title = ok ? 'En vivo — multijugador activo' : 'Desconectado';
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

  function initMap() {
    if (map) return;
    map = L.map('map', {
      center: CFG.mapCenter || [22.9936, -82.7539],
      zoom: CFG.mapZoom || 16,
      minZoom: CFG.mapMinZoom || 14,
      maxZoom: CFG.mapMaxZoom || 20
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map);
    if (CFG.mapBounds) map.setMaxBounds(L.latLngBounds(CFG.mapBounds));
    map.on('click', (e) => moverA(e.latlng.lat, e.latlng.lng, false));
  }

  function iconoJugador(nombre, esYo) {
    const cls = esYo ? 'marca-yo' : 'marca-otro';
    const color = esYo ? '#ef4444' : '#3b82f6';
    const html = '<div class="pin-jugador ' + cls + '">' +
      '<span class="pin-circulo" style="background:' + color + '"></span>' +
      '<span class="pin-nombre">' + esc(nombre) + '</span></div>';
    return L.divIcon({
      className: 'marca-jugador-wrap',
      html,
      iconSize: [80, 36],
      iconAnchor: [40, 18]
    });
  }

  function iconoObjeto(obj) {
    const icon = obj.data?.icon || (obj.type === 'tree' ? '🌴' : obj.type === 'enemy' ? '👹' : '📦');
    return L.divIcon({ className: 'marca-objeto', html: icon, iconSize: [32, 32], iconAnchor: [16, 16] });
  }

  function actualizarMiMarcador(animar) {
    if (!player || !map) return;
    const latlng = [player.x, player.y];
    if (!miMarcador) {
      miMarcador = L.marker(latlng, { icon: iconoJugador(player.name, true), zIndexOffset: 2000 }).addTo(map);
    } else if (animar) {
      animarMarcador(miMarcador, latlng);
    } else {
      miMarcador.setLatLng(latlng);
    }
  }

  function animarMarcador(marker, destino) {
    const inicio = marker.getLatLng();
    const t0 = performance.now();
    const dur = 280;
    function frame(t) {
      const p = Math.min(1, (t - t0) / dur);
      const lat = inicio.lat + (destino[0] - inicio.lat) * p;
      const lng = inicio.lng + (destino[1] - inicio.lng) * p;
      marker.setLatLng([lat, lng]);
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function upsertJugadorOnline(p) {
    const id = Number(p.playerId);
    if (id === MI_ID()) return;
    const idx = onlinePlayers.findIndex(x => Number(x.playerId) === id);
    if (idx >= 0) onlinePlayers[idx] = Object.assign({}, onlinePlayers[idx], p, { playerId: id });
    else onlinePlayers.push(Object.assign({}, p, { playerId: id }));
  }

  function pintarJugadoresOnline() {
    const activos = new Set(onlinePlayers.map(p => Number(p.playerId)));

    for (const id of Object.keys(marcadores.jugadores)) {
      if (!activos.has(parseInt(id, 10))) {
        map.removeLayer(marcadores.jugadores[id]);
        delete marcadores.jugadores[id];
      }
    }

    for (const p of onlinePlayers) {
      const id = Number(p.playerId);
      if (id === MI_ID()) continue;
      const destino = [p.x, p.y];
      let m = marcadores.jugadores[id];
      if (!m) {
        m = L.marker(destino, { icon: iconoJugador(p.name, false), zIndexOffset: 1000 + id }).addTo(map);
        marcadores.jugadores[id] = m;
      } else {
        animarMarcador(m, destino);
      }
    }
    renderOnline();
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
        m.on('click', (ev) => { L.DomEvent.stopPropagation(ev); interactuar(obj); });
        m.bindTooltip((obj.data?.itemId || obj.type) + (obj.data?.hp ? ' HP:' + obj.data.hp : ''));
        marcadores.objetos[obj.id] = m;
      } else {
        m.setLatLng(latlng);
      }
    }
  }

  function moverA(lat, lng, esGps) {
    if (!socket || !player) return;
    socket.emit('player:move', { x: lat, y: lng, gps: !!esGps }, (res) => {
      if (!res?.ok) { if (!esGps) toast(res?.error || 'No puedes ir tan lejos'); return; }
      player.x = res.x;
      player.y = res.y;
      actualizarMiMarcador(!esGps);
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
    if (!navigator.geolocation) return toast('GPS no disponible');
    gpsActivo = !gpsActivo;
    $('btn-gps').classList.toggle('activo', gpsActivo);
    if (!gpsActivo) {
      if (gpsWatch) navigator.geolocation.clearWatch(gpsWatch);
      gpsWatch = null;
      return toast('GPS desactivado');
    }
    toast('GPS ON — otros te ven moverte en vivo');
    gpsWatch = navigator.geolocation.watchPosition(
      (pos) => {
        const ahora = Date.now();
        if (ahora - ultimoGps < 1800) return;
        ultimoGps = ahora;
        moverA(pos.coords.latitude, pos.coords.longitude, true);
      },
      () => toast('Error GPS'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 12000 }
    );
  }

  function startGame() {
    $('pantalla-auth').classList.add('oculto');
    $('pantalla-juego').classList.remove('oculto');
    initMap();
    updatePlayerUI();

    socket = io(API, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 20
    });

    socket.on('connect', () => setConexion(true));
    socket.on('disconnect', () => setConexion(false));
    socket.on('connect_error', (e) => {
      setConexion(false);
      toast('Sin servidor en vivo: ' + e.message, 8000);
    });

    socket.on('game:init', onGameInit);
    socket.on('players:sync', (data) => {
      onlinePlayers = (data.players || []).filter(p => Number(p.playerId) !== MI_ID());
      pintarJugadoresOnline();
    });
    socket.on('player:move', onPlayerMove);
    socket.on('player:online', (p) => { upsertJugadorOnline(p); pintarJugadoresOnline(); toast('👋 ' + p.name + ' entró al mapa'); });
    socket.on('player:offline', (p) => {
      onlinePlayers = onlinePlayers.filter(x => Number(x.playerId) !== Number(p.playerId));
      pintarJugadoresOnline();
      toast('Salió un jugador');
    });
    socket.on('player:updateStats', onStatsUpdate);
    socket.on('world:updateObject', onWorldUpdate);
    socket.on('world:removeObject', onWorldRemove);
    socket.on('mission:create', (m) => { missions.unshift(m); renderMissions(); toast('Nueva misión: ' + m.title); });
    socket.on('mission:update', onMissionUpdate);
    socket.on('player:updateInventory', (p) => {
      if (p.inventory) { player.inventory = p.inventory; renderInventory(); }
    });

    setTimeout(() => map.invalidateSize(), 400);
  }

  function onGameInit(data) {
    player = data.player;
    worldObjects = data.worldObjects || [];
    missions = data.missions || [];
    onlinePlayers = (data.onlinePlayers || []).filter(p => Number(p.playerId) !== MI_ID());
    updatePlayerUI();
    renderMissions();
    renderInventory();
    actualizarMiMarcador(false);
    pintarObjetos();
    pintarJugadoresOnline();
    map.setView([player.x, player.y], CFG.mapZoom || 16);
    toast('🟢 En vivo — ' + (onlinePlayers.length + 1) + ' en el mapa');
  }

  function onPlayerMove(data) {
    const id = Number(data.playerId);
    if (id === MI_ID()) {
      player.x = data.x;
      player.y = data.y;
      actualizarMiMarcador(true);
      return;
    }
    upsertJugadorOnline({ playerId: id, name: data.name, x: data.x, y: data.y });
    pintarJugadoresOnline();
  }

  function onStatsUpdate(data) {
    if (Number(data.playerId) !== MI_ID()) return;
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
    const otros = onlinePlayers.filter(p => Number(p.playerId) !== MI_ID());
    $('online-count').textContent = otros.length + 1;
    $('online-list').innerHTML =
      '<li><b>' + esc(player?.name || 'Tú') + '</b> (tú) 🔴</li>' +
      otros.map(p => '<li>' + esc(p.name) + ' 🔵</li>').join('');
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

  // Comprobar servidor antes de login
  fetch(API + '/health').then(r => r.json()).then(() => {
    const el = $('auth-estado');
    if (el) el.textContent = 'Servidor en vivo ✅ — Regístrate o entra';
  }).catch(() => {
    const el = $('auth-estado');
    if (el) {
      el.innerHTML = '⚠️ Falta el servidor API (<code>api.tcodm.com</code>). Despliega <code>server/</code> en Render.';
      el.style.color = '#fca5a5';
    }
  });

  if (token) {
    api('/api/player/me').then((data) => {
      player = data.player;
      startGame();
    }).catch(() => localStorage.removeItem(TOKEN_KEY));
  }
})();
