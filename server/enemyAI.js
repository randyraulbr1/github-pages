/**
 * IA de enemigos compartidos — persigue y ataca jugadores online cercanos.
 */
const {
  getAllWorldObjects,
  updateWorldObject,
  updatePlayer,
  findPlayerById,
  formatWorldObject
} = require('./db');

const TICK_MS = 800;
const ATTACK_COOLDOWN_MS = 2000;
const ENEMY_STEP = 0.000004;

/** objectId -> lastAttackMs */
const lastAttack = new Map();
/** objectId -> target playerId */
const enemyTargets = new Map();

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDeg(lat1, lon1, lat2, lon2) {
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function parseEnemyData(obj) {
  let data = {};
  try { data = JSON.parse(obj.data_json || '{}'); } catch (e) { data = {}; }
  const hpMax = data.hpMax || data.vidaMax || data.hp || 30;
  return {
    icon: data.icon || '👹',
    nombre: data.nombre || data.name || 'Enemigo',
    hp: data.hp != null ? data.hp : hpMax,
    hpMax,
    nivel: data.nivel || data.level || 1,
    radioZona: data.radioZona || 40,
    radioAtaque: data.radioAtaque || data.radioPersecucion || 18,
    danoMin: data.danoMin || 5,
    danoMax: data.danoMax || data.dano || 10,
    origenX: data.origenX != null ? data.origenX : obj.x,
    origenY: data.origenY != null ? data.origenY : obj.y
  };
}

function pickTarget(objId, inZone) {
  if (!inZone.length) {
    enemyTargets.delete(objId);
    return null;
  }
  const prevId = enemyTargets.get(objId);
  const prev = prevId ? inZone.find(p => p.playerId === prevId) : null;
  if (prev && Math.random() > 0.15) return prev;
  const chosen = inZone[Math.floor(Math.random() * inZone.length)];
  enemyTargets.set(objId, chosen.playerId);
  return chosen;
}

function startEnemyAI(io, onlinePlayers) {
  setInterval(() => {
    if (!onlinePlayers.size) return;

    const players = [...onlinePlayers.values()];
    const objects = getAllWorldObjects().filter(o => o.type === 'enemy' && o.state === 'active');

    for (const obj of objects) {
      const data = parseEnemyData(obj);
      if (data.hp <= 0) continue;

      const inZone = players.filter(p => {
        if (p.dead || (p.hp != null && p.hp <= 0)) return false;
        return distanceMeters(obj.x, obj.y, p.x, p.y) <= data.radioZona;
      });

      const target = pickTarget(obj.id, inZone);
      let facingDeg = null;
      let targetPlayerId = null;

      let newX = obj.x;
      let newY = obj.y;

      if (target) {
        targetPlayerId = target.playerId;
        facingDeg = bearingDeg(obj.x, obj.y, target.x, target.y);
        const closestDist = distanceMeters(obj.x, obj.y, target.x, target.y);
        const dx = target.x - obj.x;
        const dy = target.y - obj.y;
        const distDeg = Math.sqrt(dx * dx + dy * dy);
        if (distDeg > 0.000001) {
          newX = obj.x + (dx / distDeg) * ENEMY_STEP;
          newY = obj.y + (dy / distDeg) * ENEMY_STEP;
        }

        const inAttack = inZone.filter(p =>
          distanceMeters(obj.x, obj.y, p.x, p.y) <= data.radioAtaque
        );

        if (inAttack.length && closestDist <= data.radioAtaque) {
          const now = Date.now();
          const prev = lastAttack.get(obj.id) || 0;
          if (now - prev >= ATTACK_COOLDOWN_MS) {
            lastAttack.set(obj.id, now);
            const victim = inAttack[Math.floor(Math.random() * inAttack.length)];
            enemyTargets.set(obj.id, victim.playerId);
            facingDeg = bearingDeg(obj.x, obj.y, victim.x, victim.y);
            targetPlayerId = victim.playerId;

            const pl = findPlayerById(victim.playerId);
            if (pl) {
              const nv = Math.max(1, data.nivel || 1);
              const factor = 1 + (nv - 1) * 0.06;
              const lo = Math.round(data.danoMin * factor);
              const hi = Math.round(data.danoMax * factor);
              const dmg = lo + Math.floor(Math.random() * (Math.max(1, hi - lo + 1)));
              const newHp = Math.max(0, pl.hp - dmg);
              updatePlayer(victim.playerId, { hp: newHp });
              const online = onlinePlayers.get(victim.playerId);
              if (online) {
                online.hp = newHp;
                if (newHp <= 0) {
                  online.dead = true;
                  online.deathX = online.x;
                  online.deathY = online.y;
                }
              }

              io.emit('player:updateStats', {
                playerId: victim.playerId,
                hp: newHp,
                hpMax: online?.hpMax || 100,
                level: pl.level,
                dead: newHp <= 0,
                deathX: newHp <= 0 ? online?.deathX : null,
                deathY: newHp <= 0 ? online?.deathY : null
              });

              const targetSocket = io.sockets.sockets.get(victim.socketId);
              if (targetSocket) {
                targetSocket.emit('enemy:attack', {
                  enemyId: obj.id,
                  enemyName: data.nombre,
                  damage: dmg,
                  hp: newHp,
                  hpMax: online?.hpMax || 100
                });
              }
            }
          }
        }
      } else {
        const dx = data.origenX - obj.x;
        const dy = data.origenY - obj.y;
        const distDeg = Math.sqrt(dx * dx + dy * dy);
        if (distDeg > 0.00001) {
          newX = obj.x + (dx / distDeg) * ENEMY_STEP;
          newY = obj.y + (dy / distDeg) * ENEMY_STEP;
        }
      }

      let payload = {};
      try { payload = JSON.parse(obj.data_json || '{}'); } catch (e) { payload = {}; }
      if (payload.origenX == null) payload.origenX = data.origenX;
      if (payload.origenY == null) payload.origenY = data.origenY;
      payload.hp = data.hp;
      payload.facingDeg = facingDeg;
      payload.targetPlayerId = targetPlayerId;

      const moved = Math.abs(newX - obj.x) > 1e-9 || Math.abs(newY - obj.y) > 1e-9;
      const facingChanged = payload.facingDeg !== (() => {
        try { return JSON.parse(obj.data_json || '{}').facingDeg; } catch (e) { return null; }
      })();

      if (moved || facingChanged || targetPlayerId) {
        const updated = updateWorldObject(obj.id, {
          x: newX,
          y: newY,
          data_json: JSON.stringify(payload)
        });
        io.emit('world:updateObject', formatWorldObject(updated));
        obj.x = newX;
        obj.y = newY;
        obj.data_json = JSON.stringify(payload);
      }
    }
  }, TICK_MS);
}

module.exports = { startEnemyAI, distanceMeters, bearingDeg };
