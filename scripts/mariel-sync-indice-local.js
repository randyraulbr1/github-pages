#!/usr/bin/env node
/**
 * Reconstruye indice.json y archivos por jugador desde mundo.json.
 * Regla canónica: admin NUNCA va en indice.json.
 */
const fs = require('fs');
const path = require('path');
const { indiceDesdeJugadores } = require('../server/utils/reglasIndice');

const mundoPath = path.join(__dirname, '../datos/mundo.json');
const dirJugadores = path.join(__dirname, '../datos/jugadores');
const indicePath = path.join(dirJugadores, 'indice.json');

const mundo = JSON.parse(fs.readFileSync(mundoPath, 'utf8'));
const partidas = mundo.partidas || {};
const indice = indiceDesdeJugadores(mundo.jugadores || []);

fs.mkdirSync(dirJugadores, { recursive: true });
fs.writeFileSync(indicePath, JSON.stringify(indice, null, 2) + '\n');

for (const j of indice) {
  const archivo = {
    id: j.id,
    nombre: j.nombre,
    telefono: j.telefono || '',
    pinHash: j.pinHash || '',
    creado: j.creado || Date.now(),
    actualizadoEn: mundo.actualizadoEn || Date.now()
  };
  const partida = partidas[j.id];
  if (partida) archivo.partida = partida;
  fs.writeFileSync(
    path.join(dirJugadores, j.id + '.json'),
    JSON.stringify(archivo, null, 2) + '\n'
  );
}

console.log('Índice:', indice.length, 'cuentas (sin admin) + archivos en datos/jugadores/');
