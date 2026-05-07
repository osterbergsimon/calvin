.PHONY: help install dev dev-logs dev-logs-read dev-down test test-watch test-watch-frontend lint format type-check build clean doctor

COMPOSE_DEV := docker compose -f docker/docker-compose.dev.yml
COMPOSE_PROD := docker compose -f docker/docker-compose.yml

help:
	@echo "Available commands:"
	@echo "  make install        - One-time setup (creates docker/.env from example)"
	@echo "  make dev            - Start dev stack (docker compose, streams logs)"
	@echo "  make dev-logs       - Tail logs from running dev stack"
	@echo "  make dev-logs-read  - Show last 50 lines of dev logs"
	@echo "  make dev-down       - Stop dev stack"
	@echo "  make doctor         - Check docker + dev env"
	@echo "  make test           - Run all tests (native)"
	@echo "  make test-watch     - Re-run backend unit tests on file change"
	@echo "  make test-watch-frontend - Re-run frontend tests on file change"
	@echo "  make test-scripts   - Test setup scripts (requires bats)"
	@echo "  make lint           - Run linters (native)"
	@echo "  make format         - Format code (native)"
	@echo "  make type-check     - Run type checkers (native)"
	@echo "  make build          - Build the production docker image"
	@echo "  make clean          - Tear down dev stack and remove dev data"

install:
	@if [ ! -f docker/.env ]; then \
		echo "Creating docker/.env from deploy/calvin.env.example..."; \
		cp deploy/calvin.env.example docker/.env; \
	else \
		echo "docker/.env already exists — leaving it alone"; \
	fi
	@echo "Done. Run 'make dev' to start."

dev:
	@echo "Starting dev stack via docker compose..."
	@echo "Backend:  http://localhost:8000"
	@echo "Frontend: http://localhost:5173"
	$(COMPOSE_DEV) up

dev-logs:
	$(COMPOSE_DEV) logs -f

dev-logs-read:
	$(COMPOSE_DEV) logs --tail=50

dev-down:
	$(COMPOSE_DEV) down

test:
	cd backend && uv sync --extra dev && uv run pytest
	cd frontend && npm run test

test-backend:
	cd backend && uv sync --extra dev && uv run pytest

test-frontend:
	cd frontend && npm run test

test-scripts:
	@echo "Testing setup scripts..."
	@if command -v bats >/dev/null 2>&1; then \
		echo "Running bash script tests..."; \
		cd scripts && bats tests/ || echo "Warning: bats tests failed or bats not fully configured"; \
	else \
		echo "Warning: bats not installed. Install with: brew install bats-core (macOS) or sudo apt-get install bats (Linux)"; \
	fi

test-coverage:
	cd backend && uv sync --extra dev && uv run pytest --cov=app --cov-report=html --cov-report=term
	cd frontend && npm run test:coverage

lint:
	cd backend && uv run ruff check .
	cd frontend && npm run lint

format:
	cd backend && uv run ruff format .
	cd frontend && npm run format

type-check:
	cd backend && uv run mypy app/
	cd frontend && npm run type-check

build:
	$(COMPOSE_PROD) build

clean:
	-$(COMPOSE_DEV) down -v
	rm -rf docker/.calvin-dev-data
	rm -rf backend/.venv
	rm -rf frontend/node_modules
	rm -rf frontend/dist
	find . -type d -name __pycache__ -exec rm -r {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete

test-watch:
	cd backend && uv run ptw -- -m "unit and not slow"

test-watch-frontend:
	cd frontend && npm run test -- --watch

doctor:
	@echo "Calvin dev-environment doctor"
	@echo "─────────────────────────────"
	@printf "docker:         "; command -v docker >/dev/null 2>&1 && docker --version || echo "MISSING — install Docker Desktop / engine"
	@printf "docker compose: "; docker compose version >/dev/null 2>&1 && docker compose version || echo "MISSING — needs Docker Compose v2"
	@echo ""
	@printf "docker/.env:    "; if [ -f docker/.env ]; then echo "present"; else echo "MISSING — run: make install"; fi
	@echo ""
	@echo "Native toolchain (only needed for test/lint/format/type-check):"
	@printf "  uv:   "; command -v uv >/dev/null 2>&1 && uv --version || echo "missing"
	@printf "  node: "; command -v node >/dev/null 2>&1 && node --version || echo "missing"
	@printf "  npm:  "; command -v npm >/dev/null 2>&1 && npm --version || echo "missing"
	@echo ""
	@echo "Ports (8000 backend, 5173 frontend):"
	@for p in 8000 5173; do \
		if command -v lsof >/dev/null 2>&1 && lsof -i :$$p -sTCP:LISTEN >/dev/null 2>&1; then \
			echo "  $$p: IN USE"; \
		else \
			echo "  $$p: free"; \
		fi; \
	done
