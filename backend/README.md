# Calvin Backend

FastAPI backend for Calvin Dashboard.

## Setup

### Windows (Development/Testing)

```powershell
# Install UV if not already installed
pip install uv

# Install dependencies (evdev is skipped on Windows, includes dev tools for testing)
uv sync --extra dev

# Run development server
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Note:** On Windows, keyboard input (`evdev`) is automatically disabled. All other features work normally. This is fine for development and testing.

### Linux/Raspberry Pi (Development & Production)

```bash
# Install UV if not already installed
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install dependencies (includes evdev for keyboard support)
uv sync --extra linux

# Run development server
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Note:** On Linux/Raspberry Pi, full keyboard support is available via `evdev`.

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

# Type check
uv run mypy app/
```

## API Documentation

Once the server is running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Platform Support

- **Linux/Raspberry Pi (Development & Production)**: Full support including keyboard input via `evdev`
- **Windows (Development/Testing)**: All features work except keyboard input (automatically disabled)
- **macOS (Development/Testing)**: All features work except keyboard input (automatically disabled)

## Development Workflow

You can develop on either Windows or Linux:

1. **Develop on Windows**: Write code, test features (keyboard input disabled)
2. **Develop on Linux**: Write code, test all features including keyboard input
3. **Test on Raspberry Pi**: Deploy to Pi for full testing including keyboard input
4. **Production**: Deploy to Raspberry Pi with full keyboard support

The code automatically detects the platform and enables/disables keyboard features accordingly.

### Installing on Linux

```bash
# Install UV if not already installed
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install dependencies (includes evdev for keyboard support)
uv sync --extra linux

# Run development server
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
