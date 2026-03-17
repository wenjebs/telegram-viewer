# Docker Compose Distribution Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the Telegram Viewer as a Docker Compose app so users can run it with a single `docker compose up` command.

**Architecture:** Three-service Docker Compose: Caddy (reverse proxy + entry point), backend (FastAPI/uvicorn), frontend (TanStack Start/Bun SSR server). Caddy routes `/api/*` to backend and everything else to frontend. Persistent volumes for SQLite database, Telegram session, media cache, and InsightFace ML models.

**Tech Stack:** Docker, Docker Compose, Caddy 2, Python 3.12, Bun, uv

---

### Task 1: Make backend paths configurable via environment variables

Currently `session_path`, `CACHE_DIR`, and CORS origins are hardcoded. Docker needs these configurable.

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/telegram_client.py:20` (session_path default)
- Modify: `backend/routes/media.py:51` (CACHE_DIR)
- Modify: `backend/face_scanner.py:25-26` (CACHE_DIR, FACE_CACHE_DIR)
- Modify: `backend/indexer.py:32` (CACHE_DIR)
- Modify: `backend/.env.example`

- [ ] **Step 1: Add SESSION_PATH env var to main.py and pass to TelegramClientWrapper**

In `backend/main.py`, add after `DB_PATH` line (line 21):

```python
SESSION_PATH = os.getenv("SESSION_PATH", "tg_session")
```

Update the `TelegramClientWrapper` constructor call (lines 40-44) to pass the session path:

```python
tg = TelegramClientWrapper(
    api_id=api_id,
    api_hash=api_hash,
    session_path=SESSION_PATH,
    background_tasks=app.state.background_tasks,
)
```

- [ ] **Step 2: Make CORS origins configurable**

In `backend/main.py`, replace the hardcoded CORS origins (line 64):

```python
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
```

Use `CORS_ORIGINS` in the middleware `allow_origins` parameter.

- [ ] **Step 3: Make CACHE_DIR configurable in routes/media.py**

Replace line 51:

```python
CACHE_DIR = Path(os.getenv("CACHE_DIR", str(Path(__file__).parent.parent / "cache")))
```

Add `import os` at top if not present.

- [ ] **Step 4: Make CACHE_DIR configurable in face_scanner.py**

Add `import os` at the top of the file (not currently imported).

Replace lines 25-26:

```python
CACHE_DIR = Path(os.getenv("CACHE_DIR", str(Path(__file__).parent / "cache")))
FACE_CACHE_DIR = CACHE_DIR / "faces"
```

- [ ] **Step 5: Make CACHE_DIR configurable in indexer.py**

Add `import os` at the top of the file (not currently imported).

Replace line 32:

```python
CACHE_DIR = Path(os.getenv("CACHE_DIR", str(Path(__file__).parent / "cache")))
```

- [ ] **Step 6: Update .env.example**

```env
TELEGRAM_API_ID=your_api_id_here
TELEGRAM_API_HASH=your_api_hash_here
# Optional: override defaults for Docker
# DB_PATH=telegram_viewer.db
# SESSION_PATH=tg_session
# CACHE_DIR=cache
# CORS_ORIGINS=http://localhost:3000
```

- [ ] **Step 7: Verify backend still starts normally**

Run: `cd backend && uv run uvicorn main:app --port 8000`
Expected: Server starts without errors, existing behavior unchanged (defaults match current values).

- [ ] **Step 8: Commit**

```bash
git add backend/main.py backend/telegram_client.py backend/routes/media.py backend/face_scanner.py backend/indexer.py backend/.env.example
git commit -m "feat: make backend paths and CORS configurable via env vars"
```

---

### Task 2: Create backend Dockerfile

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`

- [ ] **Step 1: Create backend/.dockerignore**

```dockerignore
__pycache__/
*.pyc
.venv/
.env
telegram_viewer.db
tg_session.session
cache/
.pytest_cache/
tests/
```

- [ ] **Step 2: Create backend/Dockerfile**

```dockerfile
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

WORKDIR /app

# Install dependencies first (cache layer)
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Copy application source
COPY . .

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 3: Verify backend image builds**

Run: `cd backend && docker build -t telegram-viewer-backend .`
Expected: Image builds successfully. The insightface/onnxruntime wheels install (they're large, ~200MB+).

- [ ] **Step 4: Commit**

```bash
git add backend/Dockerfile backend/.dockerignore
git commit -m "feat: add backend Dockerfile"
```

---

### Task 3: Create frontend Dockerfile

The frontend uses TanStack Start (SSR). Build produces `dist/server/server.js` (Bun/Node server) and `dist/client/` (static assets). Needs a Bun runtime to serve.

**Files:**
- Create: `frontend/Dockerfile`
- Create: `frontend/.dockerignore`

- [ ] **Step 1: Create frontend/.dockerignore**

```dockerignore
node_modules/
dist/
.oxfmtrc.json
.oxlintrc.json
src/**/__tests__/
src/test/
vitest.config.ts
```

- [ ] **Step 2: Create frontend/Dockerfile**

```dockerfile
FROM oven/bun:1 AS build

WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source and build
COPY . .
RUN bun run build

# Production stage
FROM oven/bun:1-slim

WORKDIR /app

# Copy built output and node_modules (server needs deps at runtime)
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

EXPOSE 3000

CMD ["bun", "run", "dist/server/server.js"]
```

- [ ] **Step 3: Verify frontend image builds**

Run: `cd frontend && docker build -t telegram-viewer-frontend .`
Expected: Image builds successfully. Build output appears in `dist/`.

- [ ] **Step 4: Commit**

```bash
git add frontend/Dockerfile frontend/.dockerignore
git commit -m "feat: add frontend Dockerfile"
```

---

### Task 4: Create production Caddyfile

Caddy acts as the single entry point, routing traffic to frontend and backend.

**Files:**
- Create: `Caddyfile.docker`

- [ ] **Step 1: Create Caddyfile.docker**

```caddyfile
:80 {
    handle /api/* {
        uri strip_prefix /api
        reverse_proxy backend:8000
    }

    handle {
        reverse_proxy frontend:3000
    }
}
```

Note: This strips `/api` prefix before forwarding to backend, matching the Vite dev proxy behavior. No HTTPS needed inside Docker (local-only app).

- [ ] **Step 2: Commit**

```bash
git add Caddyfile.docker
git commit -m "feat: add production Caddyfile for Docker"
```

---

### Task 5: Create docker-compose.yml and root .env.example

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example` (root-level, for Docker)

- [ ] **Step 1: Create .env.example at project root**

```env
# Required: Get these from https://my.telegram.org/apps
TELEGRAM_API_ID=your_api_id_here
TELEGRAM_API_HASH=your_api_hash_here
```

- [ ] **Step 2: Create docker-compose.yml**

```yaml
services:
  caddy:
    image: caddy:2-alpine
    ports:
      - "${PORT:-8080}:80"
    volumes:
      - ./Caddyfile.docker:/etc/caddy/Caddyfile:ro
    depends_on:
      - backend
      - frontend
    restart: unless-stopped

  backend:
    build: ./backend
    environment:
      TELEGRAM_API_ID: ${TELEGRAM_API_ID}
      TELEGRAM_API_HASH: ${TELEGRAM_API_HASH}
      DB_PATH: /data/telegram_viewer.db
      SESSION_PATH: /data/tg_session
      CACHE_DIR: /data/cache
      CORS_ORIGINS: "http://localhost:${PORT:-8080}"
    volumes:
      - app-data:/data
      - insightface-models:/root/.insightface
    restart: unless-stopped

  frontend:
    build: ./frontend
    environment:
      PORT: 3000
    restart: unless-stopped

volumes:
  app-data:
  insightface-models:
```

Key design decisions:
- **Single `app-data` volume** holds SQLite DB, Telegram session, and media cache. Simpler than separate volumes, and they're all "user data".
- **`insightface-models` volume** persists the ~340MB ML model download across rebuilds.
- **`PORT` env var** lets users pick their port (default 8080).
- **No `.env` file mount** — secrets passed via environment variables from `.env` at project root (Docker Compose reads `.env` automatically).

- [ ] **Step 3: Verify compose config is valid**

First create a `.env` from the example (compose needs it for variable interpolation):
Run: `cp .env.example .env`

Run: `docker compose config`
Expected: Prints resolved config without errors.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "feat: add docker-compose.yml for single-command deployment"
```

---

### Task 6: Add justfile commands and update docs

**Files:**
- Modify: `justfile`

- [ ] **Step 1: Add Docker commands to justfile**

Append to `justfile`:

```just
# Build and start with Docker Compose
docker:
    docker compose up --build

# Start Docker Compose (no rebuild)
docker-up:
    docker compose up

# Stop Docker Compose
docker-down:
    docker compose down

# View Docker logs
docker-logs:
    docker compose logs -f
```

- [ ] **Step 2: Commit**

```bash
git add justfile
git commit -m "feat: add Docker commands to justfile"
```

---

### Task 7: End-to-end verification

- [ ] **Step 1: Build all images**

Run: `docker compose build`
Expected: All three services build successfully.

- [ ] **Step 2: Start the stack**

Create a `.env` file at project root with real Telegram credentials (copy from `backend/.env`), then:

Run: `docker compose up`
Expected: All services start. Caddy logs show it's listening on :80. Backend connects to Telegram. Frontend serves on :3000.

- [ ] **Step 3: Verify the app works**

Open `http://localhost:8080` in a browser.
Expected: Frontend loads, auth flow works, media browsing works through `/api/*` proxy.

- [ ] **Step 4: Verify data persists across restarts**

Run: `docker compose down && docker compose up`
Expected: Database, session, and cached media are preserved (stored in Docker volumes).

- [ ] **Step 5: Test from scratch (first-time user experience)**

```bash
docker compose down -v  # Remove volumes
docker compose up
```
Expected: App starts fresh, prompts for Telegram auth, works end-to-end.

- [ ] **Step 6: Final commit (if any fixes were needed)**

Review changed files with `git diff`, then stage only relevant files:

```bash
git add <specific-files-that-changed>
git commit -m "fix: docker compose adjustments from e2e testing"
```
