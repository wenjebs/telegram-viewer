#!/usr/bin/env bash
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${BLUE}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
err()   { echo -e "${RED}[error]${NC} $*"; }

echo ""
echo -e "${BOLD}Telegram Viewer — Setup${NC}"
echo "==============================="
echo ""

# ── 1. Check Docker ──────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  err "Docker is not installed."
  echo "  Install Docker Desktop from: https://www.docker.com/products/docker-desktop/"
  exit 1
fi

if ! docker info &>/dev/null 2>&1; then
  err "Docker daemon is not running. Please start Docker Desktop and try again."
  exit 1
fi

ok "Docker is installed and running"

# ── 2. Configure .env ────────────────────────────────────────────
if [ -f .env ]; then
  # Check if .env still has placeholder values
  if grep -q 'your_api_id_here\|your_api_hash_here' .env; then
    warn ".env exists but has placeholder values — let's fill it in"
  else
    ok ".env already configured"
    SKIP_ENV=true
  fi
fi

if [ "${SKIP_ENV:-}" != "true" ]; then
  echo ""
  echo -e "${BOLD}Step 1: Telegram API Credentials${NC}"
  echo ""
  echo "  You need API credentials from Telegram. Here's how:"
  echo ""
  echo "  1. Go to ${BLUE}https://my.telegram.org/apps${NC}"
  echo "  2. Log in with your phone number"
  echo "  3. Click 'API development tools'"
  echo "  4. Fill in any app name/short name (e.g. 'viewer')"
  echo "  5. Copy the ${BOLD}api_id${NC} and ${BOLD}api_hash${NC}"
  echo ""

  read -rp "Enter your Telegram API ID: " API_ID
  read -rp "Enter your Telegram API Hash: " API_HASH

  if [ -z "$API_ID" ] || [ -z "$API_HASH" ]; then
    err "Both API ID and API Hash are required."
    exit 1
  fi

  cat > .env <<EOF
TELEGRAM_API_ID=${API_ID}
TELEGRAM_API_HASH=${API_HASH}
EOF

  ok ".env created"
fi

# ── 3. Add tele.view to /etc/hosts ───────────────────────────────
echo ""
echo -e "${BOLD}Step 2: Local Domain Setup${NC}"
echo ""

if grep -q 'tele.view' /etc/hosts; then
  ok "tele.view is already in /etc/hosts"
else
  info "Adding tele.view to /etc/hosts (requires sudo)"
  sudo sh -c 'echo "127.0.0.1 tele.view" >> /etc/hosts'
  ok "Added tele.view to /etc/hosts"
fi

# ── 4. Trust Caddy's local CA certificate ────────────────────────
echo ""
echo -e "${BOLD}Step 3: HTTPS Certificate Trust${NC}"
echo ""

# Caddy generates its local CA cert on first run inside Docker.
# We need to start Caddy briefly, extract the cert, and trust it.

CADDY_DATA_VOL="telegram-viewer_caddy-data"
CA_CERT_CONTAINER_PATH="/data/caddy/pki/authorities/local/root.crt"
CA_CERT_LOCAL="/tmp/caddy-local-ca.crt"

# Check if cert is already trusted
if security find-certificate -c "Caddy Local Authority" /Library/Keychains/System.keychain &>/dev/null 2>&1; then
  ok "Caddy local CA is already trusted"
else
  info "Starting Caddy to generate the CA certificate..."
  docker compose --profile prod up -d caddy 2>/dev/null

  # Wait for Caddy to generate the CA cert (up to 15 seconds)
  TRIES=0
  while [ $TRIES -lt 15 ]; do
    if docker compose exec caddy test -f "$CA_CERT_CONTAINER_PATH" 2>/dev/null; then
      break
    fi
    sleep 1
    TRIES=$((TRIES + 1))
  done

  if ! docker compose exec caddy test -f "$CA_CERT_CONTAINER_PATH" 2>/dev/null; then
    warn "Could not find Caddy CA cert. You may need to trust it manually later."
    warn "The site will still work — your browser will just show a security warning."
  else
    docker compose cp "caddy:$CA_CERT_CONTAINER_PATH" "$CA_CERT_LOCAL" 2>/dev/null

    info "Trusting the Caddy local CA certificate (requires sudo)"
    sudo security add-trusted-cert -d -r trustRoot \
      -k /Library/Keychains/System.keychain "$CA_CERT_LOCAL"
    rm -f "$CA_CERT_LOCAL"
    ok "Caddy local CA is now trusted — HTTPS will work without warnings"
  fi

  docker compose --profile prod down 2>/dev/null
fi

# ── 5. Build and start ───────────────────────────────────────────
echo ""
echo -e "${BOLD}Step 4: Build & Launch${NC}"
echo ""
info "Building and starting containers (this may take a few minutes on first run)..."
echo ""

docker compose --profile prod up --build -d

echo ""
echo "==============================="
echo ""
echo -e "  ${GREEN}${BOLD}Setup complete!${NC}"
echo ""
echo -e "  Open ${BLUE}${BOLD}https://tele.view${NC} in your browser"
echo ""
echo -e "  You'll be prompted to log in with your Telegram account."
echo ""
echo -e "  ${BOLD}Useful commands:${NC}"
echo "    docker compose --profile prod logs -f     View logs"
echo "    docker compose --profile prod down        Stop the app"
echo "    docker compose --profile prod up -d       Start again"
echo ""
