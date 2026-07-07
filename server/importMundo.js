/**
 * Importa objetos y misiones desde datos/mundo.json del juego GPS original.
 */
const fs = require('fs');
const path = require('path');

const ICONOS = {
  coco: '🥥', cangrejo: '🦀', agua: '💧', pan: '🍞',
  pescado: '🐟', madera: '🪵', default: '📦'
};

function importarDesdeMundoJson(db) {
  const ruta = path.join(__dirname, '..', 'datos', 'mundo.json');
  if (!fs.existsSync(ruta)) return { objetos: 0, misiones: 0 };

  let mundo;
  try { mundo = JSON.parse(fs.readFileSync(ruta, 'utf8')); } catch (e) { return { objetos: 0, misiones: 0 }; }

  let objetos = 0;
  let misiones = 0;

  const countObj = db.prepare('SELECT COUNT(*) AS n FROM world_objects').get().n;
  if (countObj === 0) {
    const insert = db.prepare(`
      INSERT INTO world_objects (type, x, y, state, data_json)
      VALUES (@type, @x, @y, 'active', @data_json)
    `);

    const filas = [];

    for (const o of (mundo.objetos || [])) {
      if (!o.pos || o.pos.length < 2) continue;
      filas.push({
        type: 'item',
        x: o.pos[0],
        y: o.pos[1],
        data_json: JSON.stringify({
          itemId: o.itemId || 'objeto',
          cantidad: o.cantidad || 1,
          icon: ICONOS[o.itemId] || ICONOS.default,
          origenId: o.id
        })
      });
    }

    for (const [id, pos] of Object.entries(mundo.posiciones || {})) {
      if (!Array.isArray(pos) || pos.length < 2) continue;
      if (id.startsWith('enm_')) {
        filas.push({
          type: 'enemy',
          x: pos[0],
          y: pos[1],
          data_json: JSON.stringify({ origenId: id, icon: '👹', hp: 30 })
        });
      }
    }

    if (!filas.length) {
      filas.push(
        { type: 'item', x: 22.993775, y: -82.759516, data_json: JSON.stringify({ itemId: 'coco', cantidad: 1, icon: '🥥' }) },
        { type: 'item', x: 22.992788, y: -82.759709, data_json: JSON.stringify({ itemId: 'cangrejo', cantidad: 1, icon: '🦀' }) },
        { type: 'tree', x: 22.9941, y: -82.758, data_json: JSON.stringify({ label: 'Palma', hp: 3, icon: '🌴' }) }
      );
    }

    const tx = db.transaction((rows) => { for (const r of rows) insert.run(r); });
    tx(filas);
    objetos = filas.length;
  }

  const countMis = db.prepare('SELECT COUNT(*) AS n FROM missions').get().n;
  if (countMis === 0) {
    const insertM = db.prepare(`
      INSERT INTO missions (title, description, reward_json, is_active)
      VALUES (@title, @description, @reward_json, 1)
    `);
    for (const m of (mundo.misiones || [])) {
      insertM.run({
        title: m.titulo || m.title || 'Misión',
        description: m.texto || m.description || '',
        reward_json: JSON.stringify(m.recompensa || m.reward || { xp: 10 })
      });
      misiones++;
    }
  }

  return { objetos, misiones };
}

module.exports = { importarDesdeMundoJson };
