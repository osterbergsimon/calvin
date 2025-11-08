# Calvin - Lightweight DAKBoard Alternative

A lightweight home dashboard system for Raspberry Pi, displaying calendars, photos, and external web services with keyboard navigation support.

## Hardware Baseline

- **Device**: Raspberry Pi 3B+ (primary target)
- **Display**: Standard HDMI display (1080p)
- **Keyboard**: 7-button compact keyboard (primary) with full keyboard support (secondary)

## Quick Start

### Development Workflow

- **Development/Testing**: Windows or Linux
- **Production**: Linux (Raspberry Pi 3B+)

The backend automatically handles platform differences:
- ✅ **Windows**: All features work except keyboard input (mock handler)
- ✅ **Linux**: Full support including keyboard input via `evdev`
- ✅ **Raspberry Pi**: Full support including keyboard input via `evdev`

### Prerequisites

- Python 3.11+ ✅ (You have Python 3.12.1)
- Node.js 20+ ❌ (Need to install)
- UV (Python package manager) ❌ (Need to install)
- Git

### Windows Setup

**Quick Start:**
1. Install Node.js: https://nodejs.org/ (LTS version)
2. Install UV: Run `pip install uv` or use the installer script
3. Run setup script: `.\setup-windows.ps1`

**Detailed instructions:** See [QUICKSTART_WINDOWS.md](QUICKSTART_WINDOWS.md)

### Development Setup

**Windows (PowerShell):**

```powershell
# Install dependencies
.\setup-windows.ps1

# Or manually:
cd backend
uv sync --extra dev  # Include dev dependencies for testing
cd ..\frontend
npm install

# Start development servers (in separate terminals)
# Terminal 1 - Backend:
cd backend
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 - Frontend:
cd frontend
npm run dev
```

**Windows (Development/Testing - Recommended):**

```powershell
# Install dependencies (evdev will be skipped on Windows)
.\Makefile.ps1 install
# Or use the alias:
.\make.ps1 install

# Start development servers
.\Makefile.ps1 dev

# Run tests
.\Makefile.ps1 test

# Format code
.\Makefile.ps1 format

# Lint code
.\Makefile.ps1 lint
```

**Note:** On Windows, `evdev` (keyboard support) is automatically skipped. The backend runs fine for development/testing. Full keyboard support will work on Linux/Raspberry Pi.

**Linux (Development & Production):**

See [docs/SETUP_LINUX.md](docs/SETUP_LINUX.md) for detailed Linux setup instructions.

```bash
# Install dependencies (includes evdev for keyboard support and dev tools for testing)
cd backend
uv sync --extra linux --extra dev
cd ../frontend
npm install

# Or use Makefile if available:
make install

# Start development server
cd backend
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Note:** On Linux, full keyboard support is available via `evdev`. Perfect for development and production.

**Windows with Make (Alternative):**

If you have Git Bash or WSL installed, you can use the regular Makefile:
```bash
make install
make dev
```

## Project Structure

```
calvin/
├── backend/          # FastAPI backend
├── frontend/         # Vue 3 frontend
├── config/           # Configuration files
├── data/             # Data storage (images, database)
├── image/            # Raspberry Pi image creation
├── scripts/          # Utility scripts
└── docs/             # Documentation
```

## Development

See [PROJECT_PLAN.md](PROJECT_PLAN.md) for detailed architecture and implementation plan.

## License

GPLv3 - See [LICENSE](LICENSE) file for details.

