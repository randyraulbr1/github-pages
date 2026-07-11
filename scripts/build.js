#!/usr/bin/env node
/**
 * Build de validación: sincroniza comprobaciones de versión (sitio estático).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8')).version;
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const config = fs.readFileSync(path.join(root, 'js/config/config.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

const checks = [
  [`index.html meta version`, index.includes(`content="${version}"`)],
  [`config.js version`, config.includes(`version: '${version}'`)],
  [`sw.js cache name`, sw.includes(`mariel-explorer-v${version}`)],
];

const failed = checks.filter(([, pass]) => !pass);
if (failed.length) {
  for (const [label] of failed) console.error('FALLO build:', label);
  process.exit(1);
}

console.log(`OK build: versión ${version} sincronizada en cliente estático`);
