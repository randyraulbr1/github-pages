#!/bin/bash
# Copia archivos estáticos del repo a /var/www/tcodm (mismo criterio que GitHub Pages)
set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/ubuntu/github-pages}"
WEB_ROOT="${WEB_ROOT:-/var/www/tcodm}"

cd "$REPO_DIR"

rsync -a --delete \
  --exclude='.git' \
  --exclude='.github' \
  --exclude='server' \
  --exclude='mariel-explorer' \
  --exclude='scripts' \
  --exclude='docs' \
  --exclude='deploy' \
  --exclude='client' \
  --exclude='/online' \
  --exclude='*.md' \
  --exclude='render.yaml' \
  --exclude='.gitignore' \
  --exclude='node_modules' \
  ./ "$WEB_ROOT/"

echo "OK static → $WEB_ROOT ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
