.PHONY: help install dev dev-logs dev-logs-read dev-verbose test test-watch test-watch-frontend lint format type-check build clean doctor

help:
	@echo "Available commands:"
	@echo "  make install        - Install all dependencies"
	@echo "  make dev            - Start development servers (backend, docs in background)"
	@echo "  make dev-logs       - Start development servers with visible logs"
	@echo "  make dev-logs-read  - Read recent dev logs (useful for AI assistant)"
	@echo "  make dev-verbose    - Like dev-logs but with HTTP request logging on"
	@echo "  make doctor         - Check dev environment (versions, ports, venv)"
	@echo "  make test           - Run all tests"
	@echo "  make test-watch     - Re-run backend unit tests on file change"
	@echo "  make test-watch-frontend - Re-run frontend tests on file change"
	@echo "  make test-scripts   - Test setup scripts (requires bats)"
	@echo "  make lint           - Run linters"
	@echo "  make format         - Format code"
	@echo "  make type-check     - Run type checkers"
	@echo "  make build          - Build for production"
	@echo "  make clean          - Clean build artifacts"

install:
	@echo "Installing dependencies..."
	@if [ "$$(uname -s)" = "Linux" ]; then \
		echo "Linux detected - installing with evdev support..."; \
		cd backend && uv sync --extra linux --extra dev; \
	else \
		echo "Installing dependencies (no evdev on non-Linux systems)..."; \
		cd backend && uv sync --extra dev; \
	fi
	cd frontend && npm install

dev:
	@echo "Starting development servers..."
	@echo "Backend: http://localhost:8000"
	@echo "Frontend: http://localhost:5173"
	@echo "Docs: http://localhost:8001"
	cd backend && uv run uvicorn app.main:app --reload --reload-dir app --host 0.0.0.0 --port 8000 &
	uv run --project backend mkdocs serve --dev-addr 127.0.0.1:8001 &
	cd frontend && npm run dev

dev-logs:
	@echo "Starting development servers with visible logs..."
	@echo ""
	@mkdir -p logs
	@echo "Logs are also being written to:"
	@echo "  Backend:  logs/dev-backend.log"
	@echo "  Frontend: logs/dev-frontend.log"
	@echo "  Combined: logs/dev-combined.log"
	@echo ""
	@echo "Backend: http://localhost:8000"
	@echo "Frontend: http://localhost:5173"
	@echo "Docs: http://localhost:8001"
	@echo "API Docs: http://localhost:8000/docs"
	@echo ""
	@echo "Press Ctrl+C to stop all servers"
	@echo "────────────────────────────────────────────────────────────────────────────────"
	@echo ""
	@> logs/dev-backend.log && > logs/dev-frontend.log && > logs/dev-docs.log && > logs/dev-combined.log
	@trap 'kill 0' EXIT INT TERM; \
	(cd backend && PYTHONUNBUFFERED=1 uv run uvicorn app.main:app --reload --reload-dir app --host 0.0.0.0 --port 8000 2>&1 | \
		awk '{timestamp=strftime("%Y-%m-%d %H:%M:%S"); logline="["timestamp"] [BACKEND] "$$0; print logline >> "../logs/dev-backend.log"; print logline >> "../logs/dev-combined.log"; print "\033[36m[BACKEND]\033[0m "$$0; fflush()}') & \
	(uv run --project backend mkdocs serve --dev-addr 127.0.0.1:8001 2>&1 | \
		awk '{timestamp=strftime("%Y-%m-%d %H:%M:%S"); logline="["timestamp"] [DOCS] "$$0; print logline >> "logs/dev-docs.log"; print logline >> "logs/dev-combined.log"; print "\033[33m[DOCS]\033[0m "$$0; fflush()}') & \
	(cd frontend && npm run dev 2>&1 | \
		awk '{timestamp=strftime("%Y-%m-%d %H:%M:%S"); logline="["timestamp"] [FRONTEND] "$$0; print logline >> "../logs/dev-frontend.log"; print logline >> "../logs/dev-combined.log"; print "\033[35m[FRONTEND]\033[0m "$$0; fflush()}') & \
	wait

dev-logs-read:
	@if [ ! -f logs/dev-combined.log ]; then \
		echo "No dev logs found. Have you started 'make dev-logs' yet?"; \
		echo "Expected log files in: logs/"; \
		exit 1; \
	fi
	@echo "Last 50 lines from combined log:"
	@echo "────────────────────────────────────────────────────────────────────────────────"
	@tail -n 50 logs/dev-combined.log 2>/dev/null | \
		sed 's/\[BACKEND\]/\033[36m[BACKEND]\033[0m/g' | \
		sed 's/\[FRONTEND\]/\033[35m[FRONTEND]\033[0m/g' || echo "No log content found"
	@echo "────────────────────────────────────────────────────────────────────────────────"
	@echo "Full log: logs/dev-combined.log"
	@echo "Backend log: logs/dev-backend.log"
	@echo "Frontend log: logs/dev-frontend.log"

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
	cd frontend && npm run build

clean:
	rm -rf backend/.venv
	rm -rf frontend/node_modules
	rm -rf frontend/dist
	find . -type d -name __pycache__ -exec rm -r {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete

dev-verbose:
	@CALVIN_DEV_LOG_HTTP=1 $(MAKE) dev-logs

test-watch:
	cd backend && uv run ptw -- -m "unit and not slow"

test-watch-frontend:
	cd frontend && npm run test -- --watch

doctor:
	@echo "Calvin dev-environment doctor"
	@echo "─────────────────────────────"
	@printf "uv:         "; command -v uv >/dev/null 2>&1 && uv --version || echo "MISSING — install from https://docs.astral.sh/uv/"
	@printf "python:     "; command -v python >/dev/null 2>&1 && python --version || echo "MISSING"
	@printf "node:       "; command -v node >/dev/null 2>&1 && node --version || echo "MISSING"
	@printf "npm:        "; command -v npm >/dev/null 2>&1 && npm --version || echo "MISSING"
	@printf "pre-commit: "; command -v pre-commit >/dev/null 2>&1 && pre-commit --version || echo "MISSING — run: pip install pre-commit (or: uv tool install pre-commit)"
	@echo ""
	@echo "Backend venv:"
	@if [ -d backend/.venv ]; then echo "  backend/.venv exists"; else echo "  MISSING — run: make install"; fi
	@echo ""
	@echo "Ports (8000 backend, 5173 frontend, 8001 docs):"
	@for p in 8000 5173 8001; do \
		if command -v lsof >/dev/null 2>&1 && lsof -i :$$p -sTCP:LISTEN >/dev/null 2>&1; then \
			echo "  $$p: IN USE"; \
		else \
			echo "  $$p: free"; \
		fi; \
	done

