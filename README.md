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

**Quick Start (Develop Branch):**
1. Clone repository: `git clone https://github.com/osterbergsimon/calvin.git`
2. Switch to develop: `git checkout develop`
3. Install Node.js: https://nodejs.org/ (LTS version)
4. Run setup script: `.\setup-windows.ps1`
5. Start development: `.\make.ps1 dev`

**Detailed instructions:** 
- **Development (develop branch)**: See [QUICKSTART_DEVELOP.md](QUICKSTART_DEVELOP.md)
- **General Windows setup**: See [QUICKSTART_WINDOWS.md](QUICKSTART_WINDOWS.md)

### Raspberry Pi Setup

**Production Setup:**
```bash
wget -O- https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup.sh | sudo sh
```

**Development Setup (with hot reload):**
```bash
wget -O- https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup-dev.sh | sudo sh
```

Or using curl:
```bash
curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup.sh | sudo sh
curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup-dev.sh | sudo sh
```

**Using a Different Branch:**

To use a different branch (e.g., `develop` or a feature branch), set the `GIT_BRANCH` environment variable:

```bash
# Production setup with develop branch
GIT_BRANCH=develop wget -O- https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup.sh | sudo sh

# Development setup with develop branch
GIT_BRANCH=develop curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup-dev.sh | sudo sh
```

**Using a Different Repository:**

To use a fork or different repository:

```bash
GIT_REPO=https://github.com/yourusername/calvin.git GIT_BRANCH=your-branch wget -O- ... | sudo sh
```

**Note:** 
- The selected branch is automatically saved and will be used by the update script
- When you update from GitHub (via Settings or update script), it will use the same branch
- These scripts will:
  - Install all system dependencies (Python, Node.js, etc.)
  - Clone the Calvin repository (from the specified branch)
  - Install backend and frontend dependencies
  - Set up systemd services
  - Configure display and kiosk mode
  - For dev mode: Enable hot reload for both backend and frontend

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

