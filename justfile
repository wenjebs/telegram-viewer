# Start both backend and frontend dev servers
dev:
    -lsof -ti :8000 | xargs kill -9 2>/dev/null
    -lsof -ti :3000 | xargs kill -9 2>/dev/null
    just backend & just frontend & wait

# Start backend dev server
backend:
    cd backend && uv run uvicorn main:app --reload --port 8000

# Start frontend dev server
frontend:
    cd frontend && bun run dev

# Run all backend tests
test:
    cd backend && uv run pytest tests/ -v

# Install all dependencies
install:
    cd backend && uv sync && uv pip install -e ".[dev]"
    cd frontend && bun install
