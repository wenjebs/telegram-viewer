# List available commands
default:
    @just --list

# Start backend, frontend, and Caddy (HTTP/2) dev servers
dev:
    #!/usr/bin/env bash
    lsof -ti :8000 | xargs kill -9 2>/dev/null || true
    lsof -ti :3000 | xargs kill -9 2>/dev/null || true
    caddy stop 2>/dev/null || true
    # Ensure tele.view is in /etc/hosts
    if ! grep -q 'tele.view' /etc/hosts; then
      echo "Adding tele.view to /etc/hosts (requires password):"
      sudo sh -c 'echo "127.0.0.1 tele.view" >> /etc/hosts'
    fi
    # Caddy needs port 443, may prompt for password on first run
    caddy start --config Caddyfile
    # Then background the rest
    trap 'caddy stop; kill 0 2>/dev/null' EXIT INT TERM
    (cd backend && uv run uvicorn main:app --reload --port 8000) &
    (cd frontend && bun run dev) &
    echo ""
    echo "  https://tele.view  (HTTP/2 via Caddy)"
    echo ""
    wait

# Start backend dev server
backend:
    cd backend && uv run uvicorn main:app --reload --port 8000

# Start frontend dev server
frontend:
    cd frontend && bun run dev

# Start Caddy reverse proxy (HTTP/2)
caddy:
    caddy run --config Caddyfile

# Run all backend tests
test:
    cd backend && uv run pytest tests/ -v

# Install all dependencies
install:
    cd backend && uv sync && uv pip install -e ".[dev]"
    cd frontend && bun install

# Build and start with Docker Compose (HTTPS via tele.view)
docker:
    #!/usr/bin/env bash
    # Stop dev servers if running (they bind the same ports)
    caddy stop 2>/dev/null || true
    # Note: don't kill :443 blindly — it can kill OrbStack/Docker
    docker compose down 2>/dev/null || true
    if ! grep -q 'tele.view' /etc/hosts; then
      echo "Adding tele.view to /etc/hosts (requires password):"
      sudo sh -c 'echo "127.0.0.1 tele.view" >> /etc/hosts'
    fi
    docker compose --profile prod up --build

# Start with Docker Compose + hot reload (frontend & backend source mounted)
docker-dev:
    #!/usr/bin/env bash
    caddy stop 2>/dev/null || true
    # Note: don't kill :443 blindly — it can kill OrbStack/Docker
    docker compose down 2>/dev/null || true
    if ! grep -q 'tele.view' /etc/hosts; then
      echo "Adding tele.view to /etc/hosts (requires password):"
      sudo sh -c 'echo "127.0.0.1 tele.view" >> /etc/hosts'
    fi
    docker compose --profile dev up --build

# Start Docker Compose (no rebuild)
docker-up:
	docker compose --profile prod up

# Stop Docker Compose
docker-down:
	docker compose down

# View Docker logs
docker-logs:
	docker compose logs -f
