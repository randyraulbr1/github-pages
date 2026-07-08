#!/bin/bash
# Instalación rápida en Ubuntu 22.04 (Oracle Always Free VM)
# Uso: bash deploy/install-oracle.sh
set -euo pipefail

echo "== Mariel API — instalación Oracle =="

if [ "$(id -u)" -ne 0 ]; then
  echo "Ejecuta con sudo: sudo bash deploy/install-oracle.sh"
  exit 1
fi

apt-get update -qq
apt-get install -y curl git ufw

# Node 20
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# Caddy
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y caddy
fi

REPO_DIR="/home/ubuntu/github-pages"
if [ ! -d "$REPO_DIR/.git" ]; then
  sudo -u ubuntu git clone https://github.com/randyraulbr1/github-pages.git "$REPO_DIR"
fi

cd "$REPO_DIR/server"
sudo -u ubuntu npm ci --silent 2>/dev/null || sudo -u ubuntu npm install --silent

if [ ! -f /etc/mariel-api.env ]; then
  JWT=$(openssl rand -hex 32)
  cat > /etc/mariel-api.env <<EOF
NODE_ENV=production
PORT=3000
JWT_SECRET=$JWT
CORS_ORIGINS=https://tcodm.com,https://www.tcodm.com,https://randyraulbr1.github.io
GITHUB_REPO=randyraulbr1/github-pages
GITHUB_BRANCH=main
# GITHUB_TOKEN=pegar_token_aqui
EOF
  chmod 600 /etc/mariel-api.env
  echo "Creado /etc/mariel-api.env — edita y añade GITHUB_TOKEN"
fi

cp "$REPO_DIR/deploy/Caddyfile" /etc/caddy/Caddyfile
cp "$REPO_DIR/deploy/mariel-api.service" /etc/systemd/system/mariel-api.service

systemctl daemon-reload
systemctl enable mariel-api caddy
systemctl restart caddy
systemctl restart mariel-api || systemctl start mariel-api

ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo ""
echo "OK. Comprueba:"
echo "  curl http://127.0.0.1:3000/health"
echo "  curl https://api.tcodm.com/health   (tras DNS api → esta VM)"
echo "Edita: sudo nano /etc/mariel-api.env"
