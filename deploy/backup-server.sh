#!/bin/bash
# Respaldo local SQLite + export snapshot (Oracle VM)
set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/ubuntu/github-pages}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_DIR/datos/backups}"
DB="$REPO_DIR/server/data/game.sqlite"
STAMP=$(date -u +%Y-%m-%dT%H%M%SZ)

mkdir -p "$BACKUP_DIR"

if [ -f "$DB" ]; then
  cp "$DB" "$BACKUP_DIR/game-$STAMP.sqlite"
  echo "OK SQLite → $BACKUP_DIR/game-$STAMP.sqlite"
fi

# Forzar backup GitHub si el servicio corre y hay token
if curl -sf http://127.0.0.1:3000/health >/dev/null 2>&1; then
  echo "Tip: admin puede POST /api/player/force-git-sync con JWT admin"
fi

# Retener 14 días de sqlite locales
find "$BACKUP_DIR" -name 'game-*.sqlite' -mtime +14 -delete 2>/dev/null || true

echo "OK backup $STAMP"
