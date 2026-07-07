/**
 * Chat privado entre jugadores (texto + ubicación).
 */
const express = require('express');
const {
  findPlayerById,
  getChatHistory,
  getChatConversations,
  insertChatMessage,
  markChatRead,
  canChatBetween,
  getBlockedIds
} = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router();

router.get('/conversations', authMiddleware, (req, res) => {
  const me = req.auth.playerId;
  const conversations = getChatConversations(me);
  const blocked = new Set(getBlockedIds(me));
  const list = conversations
    .filter(c => !blocked.has(c.playerId))
    .map(c => {
      const p = findPlayerById(c.playerId);
      return {
        playerId: c.playerId,
        name: p?.name || 'Jugador',
        lastMessage: c.lastMessage
      };
    });
  res.json({ ok: true, conversations: list });
});

router.get('/:playerId', authMiddleware, (req, res) => {
  const me = req.auth.playerId;
  const otherId = parseInt(req.params.playerId, 10);
  if (!Number.isFinite(otherId) || otherId === me) {
    return res.status(400).json({ ok: false, error: 'Jugador inválido' });
  }
  if (!findPlayerById(otherId)) {
    return res.status(404).json({ ok: false, error: 'Jugador no encontrado' });
  }
  if (!canChatBetween(me, otherId)) {
    return res.status(403).json({ ok: false, error: 'No puedes chatear con este jugador' });
  }
  const messages = getChatHistory(me, otherId);
  res.json({ ok: true, messages });
});

router.post('/send', authMiddleware, (req, res) => {
  const me = req.auth.playerId;
  const toId = parseInt(req.body.toPlayerId, 10);
  const type = String(req.body.type || 'text');
  const text = String(req.body.text || '').trim().slice(0, 500);

  if (!Number.isFinite(toId) || toId === me) {
    return res.status(400).json({ ok: false, error: 'Destinatario inválido' });
  }
  if (!findPlayerById(toId)) {
    return res.status(404).json({ ok: false, error: 'Jugador no encontrado' });
  }
  if (!canChatBetween(me, toId)) {
    return res.status(403).json({ ok: false, error: 'No puedes enviar mensajes a este jugador' });
  }

  let lat = null;
  let lng = null;
  if (type === 'location') {
    lat = Number(req.body.lat);
    lng = Number(req.body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ ok: false, error: 'Ubicación inválida' });
    }
  } else if (!text) {
    return res.status(400).json({ ok: false, error: 'Mensaje vacío' });
  }

  const msg = insertChatMessage(me, toId, type, text, lat, lng);
  const io = req.app.get('io');
  if (io && msg) {
    io.to('player:' + toId).emit('chat:message', msg);
    io.to('player:' + me).emit('chat:message', msg);
  }
  res.json({ ok: true, message: msg });
});

router.post('/read', authMiddleware, (req, res) => {
  const me = req.auth.playerId;
  const otherId = parseInt(req.body.playerId, 10);
  const messageId = parseInt(req.body.messageId, 10);
  if (!Number.isFinite(otherId) || otherId === me) {
    return res.status(400).json({ ok: false, error: 'Jugador inválido' });
  }
  if (!canChatBetween(me, otherId)) {
    return res.status(403).json({ ok: false, error: 'Chat bloqueado' });
  }
  const result = markChatRead(me, otherId, messageId);
  if (!result) return res.status(400).json({ ok: false, error: 'Mensaje inválido' });
  const io = req.app.get('io');
  if (io) {
    io.to('player:' + otherId).emit('chat:read', {
      fromPlayerId: me,
      lastReadMessageId: result.lastReadMessageId
    });
  }
  res.json({ ok: true, lastReadMessageId: result.lastReadMessageId });
});

module.exports = router;
