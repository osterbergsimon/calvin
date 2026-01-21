# Getting Started with Calvin

Welcome to Calvin! This guide will help you get started with Calvin Dashboard, whether you're setting up for development or production deployment.

## Choose Your Setup Method

Calvin supports multiple setup methods depending on your needs:

1. **[Native Installation](#native-installation)** - Direct installation on your system (recommended for development)
   - **Windows**: Automated PowerShell script
   - **Linux/Raspberry Pi**: Automated bash scripts
   - **Manual Setup**: Step-by-step manual installation

2. **[Docker Setup](#docker-setup)** - Containerized deployment (recommended for production and consistent environments)
   - Development with hot-reload
   - Production deployment
   - Distributed deployment (backend and frontend on separate machines)

3. **[VS Code Dev Containers](#vs-code-dev-containers)** - Fully configured development environment in containers

## Prerequisites

Before you begin, ensure you have:

- **Python 3.11+** - [Download Python](https://www.python.org/downloads/)
- **Node.js 20+** (LTS recommended) - [Download Node.js](https://nodejs.org/)
- **Git** - [Download Git](https://git-scm.com/downloads)
- **UV** - Python package manager (installed automatically by setup scripts)

### Platform-Specific Notes

- **Windows**: Keyboard input uses a mock handler (normal for development). Full keyboard support works on Linux/Raspberry Pi.
- **Linux/Raspberry Pi**: Full keyboard support available via `evdev` package.
- **Docker**: Works on all platforms that support Docker.

## Native Installation

### Windows Development Setup

The easiest way to get started on Windows is using the automated setup script.

#### Quick Start

```powershell
# 1. Clone the repository
git clone https://github.com/osterbergsimon/calvin.git
cd calvin

# 2. Run the setup script
.\setup-windows.ps1

# 3. Start development servers
.\make.ps1 dev
```

The setup script will:
- Check for Python 3.11+, Node.js 20+, and Git
- Install UV if not present
- Switch to the `develop` branch (if Git is available)
- Install all backend dependencies (with dev extras)
- Install all frontend dependencies

#### Manual Setup

If you prefer manual setup or the script doesn't work for your environment:

```powershell
# Install backend dependencies
cd backend
uv sync --extra dev
cd ..

# Install frontend dependencies
cd frontend
npm install
cd ..

# Start development servers (in separate terminals)
# Terminal 1 - Backend:
cd backend
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 - Frontend:
cd frontend
npm run dev
```

**Access Points:**
- Backend API: http://localhost:8000
- Frontend Dev Server: http://localhost:5173
- API Documentation: http://localhost:8000/docs

For more details, see [Windows Setup Guide](SETUP_WINDOWS.md) or [Quick Start - Windows](QUICKSTART_WINDOWS.md).

### Linux/Raspberry Pi Setup

Calvin provides automated setup scripts for Raspberry Pi and Linux systems. These scripts handle complete system configuration including user creation, service setup, and display configuration.

#### Production Setup (Raspberry Pi)

For production deployment on Raspberry Pi:

```bash
# One-command installation
wget -O- https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup.sh | sudo bash

# Or using curl
curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup.sh | sudo bash
```

**What it does:**
- Creates `calvin` user if needed
- Installs all system dependencies (Python, Node.js, UV, etc.)
- Clones the repository to `/home/calvin/calvin`
- Installs backend dependencies (with `linux` extra for keyboard support)
- Installs and builds frontend for production
- Configures systemd services for auto-start
- Sets up display and kiosk mode
- Configures auto-login and X server

**After setup:**
```bash
sudo reboot
```

After reboot, the dashboard will automatically start and be available at `http://localhost:8000`.

#### Development Setup (Raspberry Pi)

For development with hot-reload on Raspberry Pi:

```bash
# Development installation with hot-reload
wget -O- https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup-dev.sh | sudo bash

# Or using curl
curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup-dev.sh | sudo bash
```

**What it does:**
- Everything from production setup, plus:
- Creates 4GB swap file (for Pi 3B+ with limited RAM)
- Uses venv for backend (more stable on Pi 3B+)
- Installs dev dependencies
- Configures hot-reload for both backend and frontend
- Frontend dev server runs on port 5173

**After setup:**
```bash
sudo reboot
```

After reboot:
- Backend runs with hot-reload (code changes auto-reload)
- Frontend runs with hot-reload (Vite dev server on port 5173)
- Dashboard available at `http://localhost:5173`

#### Using Different Branches

```bash
# Production setup with develop branch
GIT_BRANCH=develop wget -O- https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup.sh | sudo -E bash

# Development setup with develop branch
GIT_BRANCH=develop curl -fsSL https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup-dev.sh | sudo -E bash
```

> **Note:** Use `sudo -E` to preserve environment variables. Without `-E`, `sudo` will not pass `GIT_BRANCH` or `GIT_REPO` to the script, and it will default to the `main` branch.

#### Using a Fork or Custom Repository

```bash
GIT_REPO=https://github.com/yourusername/calvin.git GIT_BRANCH=your-branch \
  wget -O- https://raw.githubusercontent.com/osterbergsimon/calvin/main/scripts/setup.sh | sudo bash
```

#### Linux Development Setup (Non-Raspberry Pi)

For development on a Linux machine (not Raspberry Pi):

```bash
# Clone repository
git clone https://github.com/osterbergsimon/calvin.git
cd calvin

# Install dependencies (includes evdev for keyboard support)
make install

# Start development servers
make dev
```

Or manually:

```bash
# Install backend dependencies (includes evdev for keyboard support)
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

**Note:** The `scripts/setup.sh` and `scripts/setup-dev.sh` scripts are for **Raspberry Pi deployment** (require root, set up systemd services). For Linux development, use the Makefile or manual commands above.

For more details, see [Linux Setup Guide](SETUP_LINUX.md) or [Setup Scripts Documentation](SETUP_SCRIPTS.md).

## Docker Setup

Docker provides a consistent, isolated environment for both development and production. Calvin supports multiple Docker deployment scenarios.

### Quick Start with Docker

#### Development Mode (Hot-Reload)

```bash
# From project root
docker-compose -f docker/docker-compose.dev.yml up
```

**Access Points:**
- Backend API: http://localhost:8000
- Frontend Dev Server: http://localhost:5173
- API Documentation: http://localhost:8000/docs

**Features:**
- Hot-reload for both backend and frontend
- Source code mounted as volumes
- Fast iteration cycle

#### Production Mode (Local - Separate Containers)

```bash
# From project root
docker-compose -f docker/docker-compose.prod-separate.yml up -d
```

**Access Points:**
- Backend API: http://localhost:8000
- Frontend: http://localhost:80
- API Documentation: http://localhost:8000/docs

**Features:**
- Optimized multi-stage builds
- Nginx for frontend static file serving
- Separate containers for scalability

#### Production Mode (Monolithic - Legacy)

```bash
# From project root
docker-compose -f docker/docker-compose.prod.yml up -d calvin-prod
```

**Access Points:**
- Application: http://localhost:8000
- API Documentation: http://localhost:8000/docs

### Distributed Deployment

Run backend and frontend on separate machines:

#### Step 1: Backend Server

On the machine hosting the backend (e.g., home server):

```bash
# Set CORS origins (comma-separated list of frontend URLs)
export CORS_ORIGINS=http://192.168.1.50:80,http://rpi.local:80

# Start backend
docker-compose -f docker/docker-compose.backend-only.yml up -d
```

Backend will be available at `http://backend-server-ip:8000`.

#### Step 2: Frontend (Raspberry Pi)

On the machine hosting the frontend (e.g., Raspberry Pi):

```bash
# Set the backend URL (embedded at build time)
export BACKEND_URL=http://192.168.1.100:8000/api

# Start frontend
docker-compose -f docker/docker-compose.frontend-only.yml up -d
```

Frontend will be available at `http://localhost:80`.

**Important Notes:**
- Backend URL is embedded at build time - rebuild frontend image if backend URL changes
- Ensure CORS is properly configured on the backend
- Verify network connectivity between machines
- Consider firewall rules

### Multi-Architecture Builds

Calvin Docker images support multiple architectures (amd64, arm64, arm/v7) for deployment on various platforms including Raspberry Pi.

```bash
cd docker

# Build for all architectures and push to registry
./build-multiarch.sh --both --push --repo your-registry/calvin --tag latest

# Build only backend
./build-multiarch.sh --backend --push --repo your-registry/calvin

# Build only frontend
./build-multiarch.sh --frontend --push --repo your-registry/calvin

# Build for local use (single platform, current architecture)
./build-multiarch.sh --both
```

For detailed Docker documentation, see:
- [Getting Started with Docker](GETTING_STARTED_DOCKER.md) - Complete getting started guide
- [Docker Overview](DOCKER_OVERVIEW.md) - Deployment scenarios and configuration
- [Docker Building and Running](DOCKER_BUILDING_AND_RUNNING.md) - Detailed build and run instructions

## VS Code Dev Containers

VS Code Dev Containers provide a fully configured development environment in containers.

### Prerequisites

- VS Code with [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
- Docker Desktop or Docker Engine

### Opening in Dev Container

1. Open VS Code in the project root
2. Press `F1` or `Ctrl+Shift+P` (Windows/Linux) / `Cmd+Shift+P` (Mac)
3. Select "Dev Containers: Reopen in Container"
4. VS Code will build and start the containers automatically

### Features

- Pre-configured Python and Node.js environments
- VS Code extensions automatically installed
- Port forwarding configured (8000, 5173)
- Full development environment in container
- Code mounted as volumes for hot-reload

### Customization

Edit `.devcontainer/devcontainer.json` to customize:
- VS Code extensions
- Settings
- Port forwarding
- Features

**Note:** If you don't have a `.devcontainer` directory yet, you can create one based on the Docker development setup. See the [Getting Started with Docker](GETTING_STARTED_DOCKER.md) guide for details.

## Verification

After setup, verify your installation:

1. **Backend Health Check**: http://localhost:8000/api/health
2. **API Documentation**: http://localhost:8000/docs
3. **Frontend**: http://localhost:5173 (dev) or http://localhost:80 (production)

## Next Steps

1. **Configure Calvin**: Set up your calendars, image sources, and plugins
2. **Explore Plugins**: Check out the [Plugin Development Guide](../plugins/PLUGIN_DEVELOPMENT_GUIDE.md)
3. **Read Documentation**: Browse the [documentation index](../index.md) for more information
4. **Contribute**: See [Contributing Guide](../CONTRIBUTING.md) for development guidelines

## Troubleshooting

### Common Issues

#### Port Already in Use

**Windows:**
```powershell
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

**Linux/Mac:**
```bash
lsof -i :8000
kill -9 <PID>
```

#### UV Not Found

**Windows:**
- Restart PowerShell after installing UV
- Or add UV to PATH: `C:\Users\<username>\.cargo\bin\`

**Linux:**
```bash
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
```

#### Docker Permission Issues (Linux)

```bash
sudo usermod -aG docker $USER
newgrp docker
```

#### Services Not Starting (Raspberry Pi)

```bash
# Check service status
sudo systemctl status calvin-backend
sudo systemctl status calvin-frontend

# Check logs
sudo journalctl -u calvin-backend -n 50
sudo journalctl -u calvin-frontend -n 50
```

### Getting Help

- Check the [documentation index](../index.md) for detailed guides
- Review [Setup Scripts Documentation](SETUP_SCRIPTS.md) for script-specific issues
- See [Getting Started with Docker](GETTING_STARTED_DOCKER.md) for Docker-specific issues
- Open an issue on [GitHub](https://github.com/osterbergsimon/calvin/issues)

## Related Documentation

- [Windows Setup Guide](SETUP_WINDOWS.md) - Detailed Windows setup
- [Linux Setup Guide](SETUP_LINUX.md) - Detailed Linux setup
- [Setup Scripts Documentation](SETUP_SCRIPTS.md) - Automated setup scripts
- [Quick Start - Development](QUICKSTART_DEVELOP.md) - Fast development setup
- [Quick Start - Windows](QUICKSTART_WINDOWS.md) - Fast Windows setup
- [Getting Started with Docker](GETTING_STARTED_DOCKER.md) - Complete Docker guide
