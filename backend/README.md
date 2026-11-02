# Calvin Backend

FastAPI backend for Calvin Dashboard.

## Setup

### Windows (Development/Testing)

```powershell
# Install UV if not already installed
pip install uv

# Install dependencies (including dev tools for testing)
uv sync --extra dev

# Run development server
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Linux/Raspberry Pi

```bash
# Install UV if not already installed
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install dependencies (including dev tools for testing)
uv sync --extra dev

# Run development server
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Keyboard input is handled in the browser; there is no `evdev` dependency, so
no kernel headers are needed on either platform.

## Development

```bash
# Run tests
uv run pytest

# Lint (with auto-fix)
uv run ruff check --fix .
uv run ruff check .  # Verify no issues remain

# Format
uv run ruff format .

# Or use the convenience script (Linux/Mac)
./scripts/fix-lint.sh

# Or use the PowerShell script (Windows)
./scripts/fix-lint.ps1

# Setup pre-commit hooks (one-time)
# Uses the repo helper, which works with both plain clones and a
# core.hooksPath set by beads.
../scripts/install-git-hooks.sh

# Type check
uv run mypy app/
```

## API Documentation

Once the server is running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Platform Support

- **Linux/Raspberry Pi**: full support
- **Windows**: full support (development and testing)
- **macOS**: full support (development and testing)

Keyboard input is browser-side on every platform.

## Development Workflow

You can develop on either Windows or Linux; behavior is the same:

1. **Develop on Windows**: write code, run tests and the dashboard
2. **Develop on Linux**: same workflow, with Docker or native tooling
3. **Test on Raspberry Pi**: deploy the container image and the kiosk

## Installing on Linux

```bash
# Install UV if not already installed
curl -LsS https://astral.sh/uv/install.sh | sh

# Install dependencies
uv sync --extra dev

# Run development server
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
