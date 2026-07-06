/**
 * IA de enemigos compartidos — persigue y ataca jugadores online cercanos.
 */
const {
  getAllWorldObjects,
  findWorldObject,
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

function startEnemyAI(io, onlinePlayers) {
  setInterval(() => {
    if (!onlinePlayers.size) return;

    const players = [...onlinePlayers.values()];
    const objects = getAllWorldObjects().filter(o => o.type === 'enemy' && o.state === 'active');

    for (const obj of objects) {
      const data = parseEnemyData(obj);
      if (data.hp <= 0) continue;

      let closest = null;
      let closestDist = Infinity;

      for (const p of players) {
        if (p.dead || (p.hp != null && p.hp <= 0)) continue;
        const d = distanceMeters(obj.x, obj.y, p.x, p.y);
        if (d <= data.radioZona && d < closestDist) {
          closestDist = d;
          closest = p;
        }
      }

      let newX = obj.x;
      let newY = obj.y;

      if (closest) {
        const dx = closest.x - obj.x;
        const dy = closest.y - obj.y;
        const distDeg = Math.sqrt(dx * dx + dy * dy);
        if (distDeg > 0.000001) {
          newX = obj.x + (dx / distDeg) * ENEMY_STEP;
          newY = obj.y + (dy / distDeg) * ENEMY_STEP;
        }

        if (closestDist <= data.radioAtaque) {
          const now = Date.now();
          const prev = lastAttack.get(obj.id) || 0;
          if (now - prev >= ATTACK_COOLDOWN_MS) {
            lastAttack.set(obj.id, now);
            const pl = findPlayerById(closest.playerId);
            if (pl) {
              const nv = Math.max(1, data.nivel || 1);
              const factor = 1 + (nv - 1) * 0.06;
              const lo = Math.round(data.danoMin * factor);
              const hi = Math.round(data.danoMax * factor);
              const dmg = lo + Math.floor(Math.random() * (Math.max(1, hi - lo + 1)));
              const newHp = Math.max(0, pl.hp - dmg);
              updatePlayer(closest.playerId, { hp: newHp });
              const online = onlinePlayers.get(closest.playerId);
              if (online) {
                online.hp = newHp;
                if (newHp <= 0) {
                  online.dead = true;
                  online.deathX = online.x;
                  online.deathY = online.y;
                }
              }

              io.emit('player:updateStats', {
                playerId: closest.playerId,
                hp: newHp,
                hpMax: online?.hpMax || 100,
                level: pl.level,
                dead: newHp <= 0,
                deathX: newHp <= 0 ? online?.deathX : null,
                deathY: newHp <= 0 ? online?.deathY : null
              });

              const targetSocket = io.sockets.sockets.get(closest.socketId);
              if (targetSocket) {
                targetSocket.emit('enemy:attack', {
                  enemyId: obj.id,
                  enemyName: data.nombre,
                  damage: dmg,
                  hp: newHp,
                  hpMax: 100
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

      if (Math.abs(newX - obj.x) > 1e-9 || Math.abs(newY - obj.y) > 1e-9) {
        let payload = {};
        try { payload = JSON.parse(obj.data_json || '{}'); } catch (e) { payload = {}; }
        if (payload.origenX == null) payload.origenX = data.origenX;
        if (payload.origenY == null) payload.origenY = data.origenY;
        payload.hp = data.hp;

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

module.exports = { startEnemyAI, distanceMeters };
