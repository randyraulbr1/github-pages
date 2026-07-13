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

echo "== Fase 12 UI (paneles unificados) =="
grep -q 'ui_components.css' index.html
grep -q 'ui_components.js' index.html
PANELES=(ventana-amigos ventana-mochila ventana-tienda ventana-misiones ventana-opciones chatPanel)
for id in "${PANELES[@]}"; do
  grep -q "id=\"$id\"" index.html || { echo "FALTA id $id en index.html"; exit 1; }
done
for id in ventana-amigos ventana-mochila ventana-tienda ventana-misiones; do
  grep -q "id=\"$id\"" index.html
  grep -A30 "id=\"$id\"" index.html | grep -q 'ui-panel' || { echo "FALTA ui-panel en $id"; exit 1; }
done
grep -q 'ui-panel-header' index.html
grep -q 'ui-panel-close' index.html
grep -q 'red.js' index.html
node --check js/nucleo/red.js
grep -q 'servidorOnline' js/config/config.js
[ -f docs/ORACLE_MIGRACION.md ] || { echo "FALTA docs/ORACLE_MIGRACION.md"; exit 1; }
grep -q 'Oracle Cloud' docs/ORACLE_MIGRACION.md
echo "OK paneles UI Fase 12 (${#PANELES[@]} ventanas críticas)"

echo "== Fases 9-11 (servidor) =="
for f in server/rateLimit.js server/adminHistorial.js; do
  [ -f "$f" ] || { echo "FALTA $f"; exit 1; }
  node --check "$f"
done
grep -q 'rateLimit' server/sockets.js
grep -q 'adminHistorial\|historial' server/routes/playerRoutes.js
echo "OK rate limit + historial admin"

echo "== Deploy tcodm.com =="
if [ "${SMOKE_SKIP_LIVE:-}" = "1" ]; then
  echo "SKIP tcodm.com (SMOKE_SKIP_LIVE=1)"
else
  REMOTE_V=$(curl -sf -m 12 https://raw.githubusercontent.com/randyraulbr1/github-pages/main/version.json | grep -oP '"version": "\K[0-9]+' || true)
  [ "$REMOTE_V" = "$V" ] || { echo "FALTA sync GitHub version.json ($REMOTE_V vs $V)"; exit 1; }
  LIVE_V=""
  for i in 1 2 3 4 5; do
    LIVE_V=$(curl -sf -m 15 -A 'mariel-smoke/299' https://tcodm.com/ 2>/dev/null | grep -oP 'mariel-version" content="\K[0-9]+' | head -1 || true)
    [ "$LIVE_V" = "$V" ] && break
    sleep 2
  done
  [ "$LIVE_V" = "$V" ] || { echo "FALTA tcodm.com v$V (vi: ${LIVE_V:-sin respuesta})"; exit 1; }
  echo "OK tcodm.com sirve v$V"
fi

echo "== Health (si servidor en :3000) =="
if curl -sf -m 3 http://127.0.0.1:3000/health >/dev/null 2>&1; then
  curl -s http://127.0.0.1:3000/health | head -c 200
  echo ""
  echo "OK /health"
else
  echo "SKIP /health (servidor no corriendo en :3000)"
fi

echo "== Smoke v299 completado =="
