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

- **Python 3.11+**
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
- **Development (develop branch)**: See [QUICKSTART_DEVELOP.md](QUICKSTART_DEVELOP.md)
- **General Windows setup**: See [QUICKSTART_WINDOWS.md](QUICKSTART_WINDOWS.md)

### Raspberry Pi Setup

**Production Setup (One Command):**

```bash
wget -O- https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup.sh | sudo sh
```

**Development Setup (with hot reload):**

```bash
wget -O- https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup-dev.sh | sudo sh
```

**Using curl:**

```bash
curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup.sh | sudo sh
curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup-dev.sh | sudo sh
```

**Using a Different Branch:**

```bash
# Production setup with develop branch
GIT_BRANCH=develop wget -O- https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup.sh | sudo sh

# Development setup with develop branch
GIT_BRANCH=develop curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup-dev.sh | sudo sh
```

**Using a Fork or Different Repository:**

```bash
GIT_REPO=https://github.com/yourusername/calvin.git GIT_BRANCH=your-branch wget -O- ... | sudo sh
```

**What the Setup Scripts Do:**
- Install all system dependencies (Python, Node.js, etc.)
- Clone the Calvin repository (from the specified branch)
- Install backend and frontend dependencies
- Set up systemd services for auto-start
- Configure display and kiosk mode
- Enable hot reload for both backend and frontend (dev mode only)

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
- For detailed setup instructions, see [docs/SETUP_LINUX.md](docs/SETUP_LINUX.md)

**Important:** The `scripts/setup.sh` and `scripts/setup-dev.sh` scripts are for **Raspberry Pi deployment** (require root, set up systemd services). For Linux development, use the Makefile or manual commands above.

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
├── rpi-image/        # Raspberry Pi image creation
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
- [Plugin Development Guide](docs/PLUGIN_DEVELOPMENT.md)
- [Plugin Installation Guide](docs/PLUGIN_INSTALLATION.md)

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
- Python 3.11+ with FastAPI
- UV for package management
- SQLite for data storage
- APScheduler for scheduled tasks

**Frontend:**
- Vue 3 with Composition API
- Vite for build tooling
- Pinia for state management

**See [PROJECT_PLAN.md](PROJECT_PLAN.md) for detailed architecture and implementation plan.**

## 📚 Documentation

- [Quick Start - Development](QUICKSTART_DEVELOP.md)
- [Quick Start - Windows](QUICKSTART_WINDOWS.md)
- [Linux Setup Guide](docs/SETUP_LINUX.md)
- [Windows Setup Guide](docs/SETUP_WINDOWS.md)
- [Add Google Calendar](docs/ADD_GOOGLE_CALENDAR.md)
- [Plugin Development](docs/PLUGIN_DEVELOPMENT.md)
- [Plugin Installation](docs/PLUGIN_INSTALLATION.md)
- [Project Plan](PROJECT_PLAN.md)

## 📄 License

GPLv3 - See [LICENSE](LICENSE) file for details.
