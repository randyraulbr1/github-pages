#!/bin/bash
# Actualizar Kingdom Map en Oracle (git pull + static + npm + restart)
set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/ubuntu/github-pages}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Ejecuta con sudo."
  exit 1
fi

echo "== update-app $(date -u +%Y-%m-%dT%H:%M:%SZ) =="

cd "$REPO_DIR"
sudo -u ubuntu git fetch origin main
sudo -u ubuntu git pull origin main

cd "$REPO_DIR/server"
sudo -u ubuntu npm ci --silent 2>/dev/null || sudo -u ubuntu npm install --silent

bash "$REPO_DIR/deploy/sync-static.sh"

systemctl restart mariel-api
nginx -t && systemctl reload nginx

sleep 2
curl -sf http://127.0.0.1:3000/health && echo " OK node" || echo " WARN node health"
echo "== update-app completado =="
