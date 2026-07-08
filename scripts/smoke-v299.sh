#!/bin/bash
# Smoke test v299 — Fase 8 (automatizable en CI/local)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== Versión =="
V=$(grep -oP '"version": "\K[0-9]+' version.json)
grep -q "content=\"$V\"" index.html
grep -q "version: '$V'" js/config/config.js
grep -q "mariel-explorer-v$V" sw.js
echo "OK version $V sincronizada"

echo "== JS cliente clave =="
for f in js/nucleo/ui_components.js js/nucleo/ui_manager.js js/admin/admin_depuracion.js \
  js/mochila/mochila.js js/items/items.js js/admin/catalogo_objetos.js; do
  node --check "$f"
done
echo "OK cliente"

echo "== JS servidor =="
for f in server/*.js server/routes/*.js; do
  [ -f "$f" ] && node --check "$f"
done
echo "OK servidor"

echo "== Health (si servidor en :3000) =="
if curl -sf -m 3 http://127.0.0.1:3000/health >/dev/null 2>&1; then
  curl -s http://127.0.0.1:3000/health | head -c 200
  echo ""
  echo "OK /health"
else
  echo "SKIP /health (servidor no corriendo en :3000)"
fi

echo "== Smoke v299 completado =="
