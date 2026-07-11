#!/usr/bin/env node
/**
 * Verificación de sintaxis JS (cliente + servidor).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules') continue;
      walk(full, acc);
    } else if (name.endsWith('.js')) {
      acc.push(full);
    }
  }
  return acc;
}

const dirs = [
  path.join(root, 'js'),
  path.join(root, 'server'),
  path.join(root, 'client'),
  path.join(root, 'online'),
];

const files = [...new Set(dirs.flatMap((d) => walk(d)))].sort();
let ok = 0;

for (const file of files) {
  execSync(`node --check "${file}"`, { stdio: 'pipe' });
  ok++;
}

console.log(`OK typecheck: ${ok} archivos JS`);
