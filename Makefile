.PHONY: help install dev test lint format type-check build clean

help:
	@echo "Available commands:"
	@echo "  make install    - Install all dependencies"
	@echo "  make dev        - Start development servers"
	@echo "  make test       - Run all tests"
	@echo "  make lint       - Run linters"
	@echo "  make format     - Format code"
	@echo "  make type-check - Run type checkers"
	@echo "  make build      - Build for production"
	@echo "  make clean      - Clean build artifacts"

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
	cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
	cd frontend && npm run dev

test:
	cd backend && uv sync --extra dev && uv run pytest
	cd frontend && npm run test

test-backend:
	cd backend && uv sync --extra dev && uv run pytest

test-frontend:
	cd frontend && npm run test

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

