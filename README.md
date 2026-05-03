# Calvin - Lightweight DAKBoard Alternative

A lightweight, self-hosted home dashboard system for Raspberry Pi that displays calendars, photos, and external web services with keyboard navigation support. Perfect for creating a smart home information display.

## ✨ Features

- **📅 Calendar Integration**: Connect to Google Calendar and other calendar services
- **🖼️ Photo Slideshow**: Automatic image rotation and display
- **🌐 Web Services**: Embed external web services and content
- **⌨️ Keyboard Navigation**: Support for compact 7-button keyboards and full keyboards
- **🔌 Plugin System**: Extensible plugin architecture for custom functionality
- **🔄 Hot Reload**: Development mode with automatic reloading
- **📱 Responsive Design**: Works on various display sizes and orientations
- **🐧 Cross-Platform**: Develop on Windows/Linux, deploy on Raspberry Pi

## 🎯 Hardware Baseline

- **Device**: Raspberry Pi 3B+ (primary target)
- **Display**: Standard HDMI display (1080p)
- **Keyboard**: 7-button compact keyboard (primary) with full keyboard support (secondary)

## 🚀 Quick Start

### Prerequisites

- **Python 3.12+**
- **Node.js 20+** (LTS recommended)
- **UV** (Python package manager - installed automatically)
- **Git**

### Windows Development Setup

**Quick Start (Develop Branch):**

```powershell
# 1. Clone repository
git clone https://github.com/osterbergsimon/calvin.git
cd calvin

# 2. Switch to develop branch
git checkout develop

# 3. Install Node.js from https://nodejs.org/ (LTS version)

# 4. Run setup script
.\setup-windows.ps1

# 5. Start development servers
.\make.ps1 dev
```

**Using Make Commands:**

```powershell
# Install dependencies
.\make.ps1 install

# Start development servers
.\make.ps1 dev

# Run tests
.\make.ps1 test

# Format code
.\make.ps1 format

# Lint code
.\make.ps1 lint
```

**Note:** On Windows, keyboard input uses a mock handler. Full keyboard support works on Linux/Raspberry Pi.

**Detailed Instructions:**
- **Development (develop branch)**: See [docs/setup/QUICKSTART_DEVELOP.md](docs/setup/QUICKSTART_DEVELOP.md)
- **General Windows setup**: See [docs/setup/QUICKSTART_WINDOWS.md](docs/setup/QUICKSTART_WINDOWS.md)
- **Remote Settings Configuration**: See [docs/configuration/REMOTE_CONFIG.md](docs/configuration/REMOTE_CONFIG.md) - Configure frontend to connect to remote dashboard backend

### Raspberry Pi Setup

**Production Setup (One Command):**

```bash
wget -O- https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup.sh | sudo bash
```

**Development Setup (with hot reload):**

```bash
wget -O- https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup.sh | sudo bash -s -- --mode dev
```

**Using curl:**

```bash
curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup.sh | sudo bash
curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup.sh | sudo bash -s -- --mode dev
```

**Using a Different Branch:**

```bash
# Production setup with develop branch
export GIT_BRANCH=develop
wget -O- https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup.sh | sudo -E bash

# Development setup with develop branch
export GIT_BRANCH=develop
curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup.sh | sudo -E bash -s -- --mode dev
```

> **Note:** Use `sudo -E` to preserve environment variables. Without `-E`, `sudo` will not pass `GIT_BRANCH` or `GIT_REPO` to the script, and it will default to the `main` branch.
> 
> **Important:** Export the variable first (`export GIT_BRANCH=develop`) rather than setting it inline (`GIT_BRANCH=develop wget ...`), as inline assignments don't propagate through pipes to `sudo`.

**Using a Fork or Different Repository:**

```bash
export GIT_REPO=https://github.com/yourusername/calvin.git
export GIT_BRANCH=your-branch
wget -O- ... | sudo -E bash
```

**What the Setup Scripts Do:**
- Install kiosk dependencies, Docker, and the Docker Compose plugin
- Create `calvin` user if needed
- Clone the Calvin repository (from the specified branch)
- Install a compose configuration under `/etc/calvin`
- Store runtime data under `/var/lib/calvin`
- Set up `calvin-app.service`, `calvin-x.service`, and `calvin-kiosk.service`
- Configure display and kiosk mode
- Verify installation and provide next steps

**For detailed information about the setup scripts, see [Setup Scripts Documentation](docs/setup/SETUP_SCRIPTS.md)**

### Linux Development Setup

**Quick Start:**

```bash
# Clone repository (if not already cloned)
git clone https://github.com/osterbergsimon/calvin.git
cd calvin

# Install dependencies (Makefile auto-detects Linux and includes evdev)
make install

# Start development servers
make dev
```

**Manual Setup:**

```bash
# Install dependencies (includes evdev for keyboard support)
cd backend
uv sync --extra linux --extra dev
cd ../frontend
npm install

# Start development servers (in separate terminals)
# Terminal 1 - Backend:
cd backend
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 - Frontend:
cd frontend
npm run dev
```

**Note:** 
- On Linux, full keyboard support is available via `evdev` (automatically included with `make install`)
- The Makefile automatically detects Linux and includes the `linux` extra for evdev support
- For detailed setup instructions, see [docs/setup/SETUP_LINUX.md](docs/setup/SETUP_LINUX.md)

**Important:** The `scripts/setup.sh` script is for **Raspberry Pi deployment** (requires root, Docker, and systemd services). For Linux development, use the Makefile, Docker Compose dev file, or manual commands above.

## 📁 Project Structure

```
calvin/
├── backend/          # FastAPI backend
│   ├── app/
│   │   ├── api/      # API routes
│   │   ├── models/   # Data models
│   │   ├── plugins/  # Plugin system
│   │   ├── services/ # Business logic
│   │   └── utils/    # Utilities
│   └── tests/        # Test suite
├── frontend/         # Vue 3 frontend
│   └── src/
│       ├── components/  # Vue components
│       ├── stores/      # Pinia stores
│       └── services/    # API services
├── config/           # Configuration files
├── data/             # Data storage (images, database)
├── docker/           # Dockerfile + compose files for deployment
├── deploy/           # systemd units + env example for Pi prod
├── scripts/          # Utility scripts
└── docs/             # Documentation
```

## 🔌 Plugin System

Calvin features an extensible plugin system that allows you to add custom functionality:

- **Service Plugins**: Add new backend services
- **Calendar Plugins**: Integrate additional calendar sources
- **Image Plugins**: Custom image processing and sources
- **Frontend Components**: Add custom Vue components

**Documentation:**
- [Plugin Development Guide](docs/plugins/PLUGIN_DEVELOPMENT_GUIDE.md)
- [Plugin Installation Guide](docs/plugins/PLUGIN_INSTALLATION.md)

## 🛠️ Development

### Platform Support

The backend automatically handles platform differences:

- ✅ **Windows**: All features work except keyboard input (mock handler)
- ✅ **Linux**: Full support including keyboard input via `evdev`
- ✅ **Raspberry Pi**: Full support including keyboard input via `evdev`

### Development Workflow

- **Development/Testing**: Windows or Linux
- **Production**: Linux (Raspberry Pi 3B+)

### Technology Stack

**Backend:**
- Python 3.12+ with FastAPI
- UV for package management
- SQLite for data storage
- APScheduler for scheduled tasks

**Frontend:**
- Vue 3 with Composition API
- Vite for build tooling
- Pinia for state management

## 📚 Documentation

Comprehensive documentation is available:

- **Online Documentation**: [Documentation Site](https://calvin.readthedocs.io/) (hosted on Read the Docs)
- **Local Documentation**: Run `mkdocs serve` from the project root to view documentation locally
- **Documentation Index**: See [docs/README.md](docs/README.md) for the documentation structure

**Quick Links:**
- [Quick Start - Development](docs/setup/QUICKSTART_DEVELOP.md)
- [Quick Start - Windows](docs/setup/QUICKSTART_WINDOWS.md)
- [Linux Setup Guide](docs/setup/SETUP_LINUX.md)
- [Windows Setup Guide](docs/setup/SETUP_WINDOWS.md)
- [Plugin Development Guide](docs/plugins/PLUGIN_DEVELOPMENT_GUIDE.md)
- [Plugin Installation](docs/plugins/PLUGIN_INSTALLATION.md)

## 📄 License

GPLv3 - See [LICENSE](LICENSE) file for details.
