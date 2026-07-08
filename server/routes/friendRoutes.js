/**
 * Amigos, solicitudes y bloqueos entre jugadores.
 */
const express = require('express');
const {
  findPlayerById,
  findPlayerByName,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriendship,
  blockPlayer,
  unblockPlayer,
  getSocialData
} = require('../db');
const { authMiddleware } = require('../auth');
const { resolverPlayerIdPorNombre } = require('../syncCuentas');
const { limiteSolicitudAmistad, responderRateLimitHttp } = require('../rateLimit');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const data = getSocialData(req.auth.playerId);
  res.json({ ok: true, ...data });
});

router.post('/request', authMiddleware, (req, res) => {
  if (!limiteSolicitudAmistad('friendReq:' + req.auth.playerId)) {
    return responderRateLimitHttp(res, 'amigos');
  }
  const me = req.auth.playerId;
  let targetId = parseInt(req.body.playerId, 10);
  if (!Number.isFinite(targetId) && req.body.username) {
    const nombre = String(req.body.username).trim();
    const p = findPlayerByName(nombre);
    if (p) targetId = p.id;
    else {
      const resuelto = resolverPlayerIdPorNombre(nombre);
      if (Number.isFinite(resuelto)) targetId = resuelto;
    }
  }
  if (!Number.isFinite(targetId)) {
    return res.status(400).json({ ok: false, error: 'Jugador no encontrado' });
  }
  if (targetId === me) {
    return res.status(400).json({ ok: false, error: 'No puedes agregarte a ti mismo' });
  }
  const result = sendFriendRequest(me, targetId);
  if (!result.ok) return res.status(400).json(result);

  const io = req.app.get('io');
  if (io) {
    io.to('player:' + targetId).emit('friends:request', result.request);
    io.emit('friends:update', { playerId: targetId });
  }
  res.json(result);
});

router.post('/accept', authMiddleware, (req, res) => {
  const requestId = parseInt(req.body.requestId, 10);
  const result = acceptFriendRequest(requestId, req.auth.playerId);
  if (!result.ok) return res.status(400).json(result);

  const io = req.app.get('io');
  if (io && result.request) {
    io.to('player:' + result.request.fromPlayerId).emit('friends:accepted', result.request);
    io.to('player:' + result.request.toPlayerId).emit('friends:accepted', result.request);
    io.emit('friends:update', { playerId: result.request.fromPlayerId });
    io.emit('friends:update', { playerId: result.request.toPlayerId });
  }
  res.json(result);
});

router.post('/reject', authMiddleware, (req, res) => {
  const requestId = parseInt(req.body.requestId, 10);
  const result = rejectFriendRequest(requestId, req.auth.playerId);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

router.delete('/:playerId', authMiddleware, (req, res) => {
  const friendId = parseInt(req.params.playerId, 10);
  const result = removeFriendship(req.auth.playerId, friendId);
  if (!result.ok) return res.status(400).json(result);

  const io = req.app.get('io');
  if (io) {
    io.emit('friends:update', { playerId: req.auth.playerId });
    io.emit('friends:update', { playerId: friendId });
  }
  res.json(result);
});

router.post('/block', authMiddleware, (req, res) => {
  const blockedId = parseInt(req.body.playerId, 10);
  if (!Number.isFinite(blockedId) || blockedId === req.auth.playerId) {
    return res.status(400).json({ ok: false, error: 'Jugador inválido' });
  }
  if (!findPlayerById(blockedId)) {
    return res.status(404).json({ ok: false, error: 'Jugador no encontrado' });
  }
  blockPlayer(req.auth.playerId, blockedId);
  removeFriendship(req.auth.playerId, blockedId);

  const io = req.app.get('io');
  if (io) {
    io.emit('friends:update', { playerId: req.auth.playerId });
    io.to('player:' + blockedId).emit('friends:update', { playerId: blockedId });
  }
  res.json({ ok: true });
});

router.delete('/block/:playerId', authMiddleware, (req, res) => {
  const blockedId = parseInt(req.params.playerId, 10);
  unblockPlayer(req.auth.playerId, blockedId);

  const io = req.app.get('io');
  if (io) io.emit('friends:update', { playerId: req.auth.playerId });
  res.json({ ok: true });
});

module.exports = router;
