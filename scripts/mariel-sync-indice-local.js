#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const mundoPath = path.join(__dirname, '../datos/mundo.json');
const indicePath = path.join(__dirname, '../datos/jugadores/indice.json');

const mundo = JSON.parse(fs.readFileSync(mundoPath, 'utf8'));
const indice = (mundo.jugadores || [])
  .filter(j => j && j.id && j.nombre)
  .map(j => ({
    id: j.id,
    nombre: j.nombre,
    telefono: j.telefono || '',
    pinHash: j.pinHash || '',
    creado: j.creado || Date.now()
  }))
  .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

fs.mkdirSync(path.dirname(indicePath), { recursive: true });
fs.writeFileSync(indicePath, JSON.stringify(indice, null, 2) + '\n');
console.log('Índice:', indice.length, 'cuentas');
