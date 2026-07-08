/**
 * Auditoría de ediciones admin sobre partidas ajenas (Fase 2.4).
 */
const { findPlayerById } = require('./db');
const { registrar } = require('./eventLog');

function auditarEdicionAdmin(adminPlayerId, perfilId, via, extra) {
  if (!adminPlayerId || !perfilId) return;
  const admin = findPlayerById(adminPlayerId);
  const nombre = admin?.name || '?';
  registrar(
    'admin_partida_edit',
    `${nombre} editó partida ${perfilId} (${via || 'socket'})`,
    Object.assign({ adminPlayerId, perfilId, via: via || 'socket' }, extra || null)
  );
}

/** Si el editor es admin y no es dueño del perfilId, registra auditoría. */
function auditarSiAdminEditaAjeno(editorPlayerId, perfilId, via, extra) {
  if (!editorPlayerId || !perfilId) return;
  const { isGameAdminPlayer, isOwnPerfil } = require('./auth');
  if (!isGameAdminPlayer(editorPlayerId)) return;
  if (isOwnPerfil(editorPlayerId, perfilId)) return;
  auditarEdicionAdmin(editorPlayerId, perfilId, via, extra);
}

module.exports = { auditarEdicionAdmin, auditarSiAdminEditaAjeno };
