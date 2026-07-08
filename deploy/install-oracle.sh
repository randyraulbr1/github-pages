#!/bin/bash
# Instalación Oracle Cloud Always Free — Kingdom Map (Nginx + Node + HTTPS)
# Guía completa: docs/ORACLE_MIGRACION.md
set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/ubuntu/github-pages}"
WEB_ROOT="/var/www/tcodm"
ENV_FILE="/etc/mariel-api.env"

echo "== Kingdom Map — instalación Oracle (Nginx) =="

if [ "$(id -u)" -ne 0 ]; then
  echo "Ejecuta con sudo."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y curl git ufw nginx certbot python3-certbot-nginx logrotate

# Node 20
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# Repo
if [ ! -d "$REPO_DIR/.git" ]; then
  sudo -u ubuntu git clone https://github.com/randyraulbr1/github-pages.git "$REPO_DIR"
fi

# Static site
mkdir -p "$WEB_ROOT"
chown -R ubuntu:www-data "$WEB_ROOT"

# Env
if [ ! -f "$ENV_FILE" ]; then
  JWT=$(openssl rand -hex 32)
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=3000
JWT_SECRET=$JWT
TRUST_PROXY=1
SYNC_INTERVAL_MS=12000
CORS_ORIGINS=https://tcodm.com,https://www.tcodm.com,https://api.tcodm.com,https://randyraulbr1.github.io
GITHUB_REPO=randyraulbr1/github-pages
GITHUB_BRANCH=main
# GITHUB_TOKEN=pegar_token_github_aqui
EOF
  chmod 600 "$ENV_FILE"
  echo "Creado $ENV_FILE — añade GITHUB_TOKEN"
fi

# Dependencias Node
cd "$REPO_DIR/server"
sudo -u ubuntu npm ci --silent 2>/dev/null || sudo -u ubuntu npm install --silent

# Nginx
cp "$REPO_DIR/deploy/nginx/tcodm.conf" /etc/nginx/sites-available/tcodm.conf
ln -sf /etc/nginx/sites-available/tcodm.conf /etc/nginx/sites-enabled/tcodm.conf
rm -f /etc/nginx/sites-enabled/default
mkdir -p /var/www/certbot

# Systemd + logrotate
mkdir -p /var/log/mariel-api
chown ubuntu:ubuntu /var/log/mariel-api
cp "$REPO_DIR/deploy/mariel-api.service" /etc/systemd/system/mariel-api.service
cp "$REPO_DIR/deploy/logrotate/mariel-api" /etc/logrotate.d/mariel-api 2>/dev/null || true

systemctl daemon-reload
systemctl enable mariel-api nginx

# Sync static + restart (sin cert aún nginx puede fallar ssl — certbot después)
sudo -u ubuntu bash "$REPO_DIR/deploy/sync-static.sh" || true

ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo ""
echo "== Siguiente paso (DNS apuntando a esta VM) =="
echo "  sudo certbot --nginx -d tcodm.com -d www.tcodm.com -d api.tcodm.com"
echo "  sudo nano $ENV_FILE   # GITHUB_TOKEN"
echo "  sudo systemctl restart mariel-api nginx"
echo "  curl https://tcodm.com/health"
