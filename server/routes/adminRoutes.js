/**
 * Rutas del panel de administrador.
 */
const express = require('express');
const {
  createMission,
  updateMission,
  deleteMission,
  getAllMissions,
  createWorldObject,
  updateWorldObject,
  deleteWorldObject,
  getAllWorldObjects,
  findWorldObject,
  findMission,
  formatMission,
  formatWorldObject
} = require('../db');
const { signAdminToken, validateAdminLogin, adminMiddleware } = require('../auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const username = (req.body.username || 'admin').trim();
  const password = req.body.password || '';

  if (!validateAdminLogin(username, password)) {
    return res.status(401).json({ ok: false, error: 'Credenciales admin incorrectas' });
  }

  return res.json({
    ok: true,
    token: signAdminToken(),
    username
  });
});

router.get('/missions', adminMiddleware, (req, res) => {
  const missions = getAllMissions().map(formatMission);
  res.json({ ok: true, missions });
});

router.post('/missions', adminMiddleware, (req, res) => {
  const title = (req.body.title || '').trim();
  if (!title) return res.status(400).json({ ok: false, error: 'Título requerido' });

  const mission = createMission({
    title,
    description: req.body.description || '',
    reward_json: req.body.reward || req.body.reward_json || {},
    is_active: req.body.isActive !== false
  });

  const formatted = formatMission(mission);
  const io = req.app.get('io');
  if (io) io.emit('mission:create', formatted);

  res.status(201).json({ ok: true, mission: formatted });
});

router.put('/missions/:id', adminMiddleware, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const current = findMission(id);
  if (!current) return res.status(404).json({ ok: false, error: 'Misión no encontrada' });

  const mission = updateMission(id, {
    title: req.body.title,
    description: req.body.description,
    reward_json: req.body.reward ? JSON.stringify(req.body.reward) : undefined,
    is_active: req.body.isActive
  });

  const formatted = formatMission(mission);
  const io = req.app.get('io');
  if (io) io.emit('mission:update', formatted);

  res.json({ ok: true, mission: formatted });
});

router.delete('/missions/:id', adminMiddleware, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!findMission(id)) return res.status(404).json({ ok: false, error: 'Misión no encontrada' });

  deleteMission(id);
  const io = req.app.get('io');
  if (io) io.emit('mission:update', { id, isActive: false, deleted: true });

  res.json({ ok: true });
});

router.get('/objects', adminMiddleware, (req, res) => {
  res.json({ ok: true, objects: getAllWorldObjects().map(formatWorldObject) });
});

router.post('/objects', adminMiddleware, (req, res) => {
  const { type, x, y, state, data } = req.body;
  if (!type || x === undefined || y === undefined) {
    return res.status(400).json({ ok: false, error: 'type, x e y son requeridos' });
  }

  const obj = createWorldObject({
    type,
    x: Number(x),
    y: Number(y),
    state: state || 'active',
    data_json: JSON.stringify(data || {})
  });

  const formatted = formatWorldObject(obj);
  const io = req.app.get('io');
  if (io) io.emit('world:updateObject', formatted);

  res.status(201).json({ ok: true, object: formatted });
});

router.put('/objects/:id', adminMiddleware, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!findWorldObject(id)) return res.status(404).json({ ok: false, error: 'Objeto no encontrado' });

  const obj = updateWorldObject(id, {
    type: req.body.type,
    x: req.body.x !== undefined ? Number(req.body.x) : undefined,
    y: req.body.y !== undefined ? Number(req.body.y) : undefined,
    state: req.body.state,
    data_json: req.body.data ? JSON.stringify(req.body.data) : undefined
  });

  const formatted = formatWorldObject(obj);
  const io = req.app.get('io');
  if (io) io.emit('world:updateObject', formatted);

  res.json({ ok: true, object: formatted });
});

router.delete('/objects/:id', adminMiddleware, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!findWorldObject(id)) return res.status(404).json({ ok: false, error: 'Objeto no encontrado' });

  deleteWorldObject(id);
  const io = req.app.get('io');
  if (io) io.emit('world:removeObject', { id });

  res.json({ ok: true });
});

module.exports = router;
