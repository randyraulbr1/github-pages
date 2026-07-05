/**
 * Rutas REST del mundo (lectura pública).
 */
const express = require('express');
const {
  getAllWorldObjects,
  getActiveMissions,
  formatWorldObject,
  formatMission
} = require('../db');

const router = express.Router();

router.get('/objects', (req, res) => {
  res.json({
    ok: true,
    objects: getAllWorldObjects().map(formatWorldObject)
  });
});

router.get('/missions', (req, res) => {
  res.json({
    ok: true,
    missions: getActiveMissions().map(formatMission)
  });
});

module.exports = router;
