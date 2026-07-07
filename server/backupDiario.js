/**
 * Backup diario del snapshot a datos/backups/mundo-YYYY-MM-DD.json
 * Conserva los últimos 14 días.
 */
const fs = require('fs');
const path = require('path');
const { getWorldSnapshot } = require('./db');

const DIR = path.join(__dirname, '..', 'datos', 'backups');
const RETENER = 14;

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function guardarBackupDiario() {
  const snap = getWorldSnapshot();
  if (!snap) return { ok: false, reason: 'sin snapshot' };

  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  const nombre = `mundo-${hoyISO()}.json`;
  const ruta = path.join(DIR, nombre);
  fs.writeFileSync(ruta, JSON.stringify(snap, null, 2), 'utf8');

  const archivos = fs.readdirSync(DIR)
    .filter(f => f.startsWith('mundo-') && f.endsWith('.json'))
    .sort();
  while (archivos.length > RETENER) {
    const viejo = archivos.shift();
    try { fs.unlinkSync(path.join(DIR, viejo)); } catch (e) { /* */ }
  }

  return { ok: true, archivo: nombre };
}

function programarBackupDiario() {
  guardarBackupDiario();
  const msHastaMedianoche = () => {
    const n = new Date();
    const m = new Date(n);
    m.setHours(24, 0, 0, 0);
    return m - n;
  };
  const programar = () => {
    setTimeout(() => {
      guardarBackupDiario();
      setInterval(guardarBackupDiario, 24 * 60 * 60 * 1000);
    }, msHastaMedianoche());
  };
  programar();
}

module.exports = { guardarBackupDiario, programarBackupDiario };
