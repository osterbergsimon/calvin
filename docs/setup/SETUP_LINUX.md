# Linux Setup Guide

## Prerequisites

### 1. Install Python 3.12+
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install python3.12 python3.12-venv python3-pip

# Fedora
sudo dnf install python3.12 python3-pip

# Arch Linux
sudo pacman -S python python-pip

# Verify
python3 --version
```

### 2. Install Node.js 20+
```bash
# Using NodeSource repository (recommended)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Or using nvm (alternative)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20

# Verify
node --version
npm --version
```

### 3. Install UV (Python Package Manager)
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh

# uv installs into ~/.local/bin; the installer adds it to your shell profile
export PATH="$HOME/.local/bin:$PATH"

# Verify
uv --version
```

### 4. Install Git (if not already installed)
```bash
# Ubuntu/Debian
sudo apt install git

# Fedora
sudo dnf install git

# Arch Linux
sudo pacman -S git

# Verify
git --version
```

## Setup Project

### 1. Clone or navigate to project directory
```bash
cd /path/to/calvin
```

### 2. Install Backend Dependencies
```bash
cd backend
uv sync --extra dev
cd ..
```

**Note:** `--extra dev` adds pytest, ruff, and mypy. No `--extra linux`
(evdev) is needed: keyboard input is handled by the browser.

### 3. Install Frontend Dependencies
```bash
cd frontend
npm install
cd ..
```

## Running the Application

### Option 1: Use Makefile (if available)
```bash
make install
make dev
```

### Option 2: Manual Commands

**Terminal 1 - Backend:**
```bash
cd backend
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

## Verify Setup

1. Backend should be running at: http://localhost:8000
2. Frontend should be running at: http://localhost:5173
3. API docs available at: http://localhost:8000/docs
4. Health check: http://localhost:8000/api/health

## Keyboard Support

Keyboard input is browser-based: the frontend listens for DOM `keydown`
events, so compact 7-button keypads and full keyboards work on any platform
without kernel input access. Bindings are configured in Settings → Keyboard.

## Troubleshooting

### UV not found
- Make sure UV is in your PATH: `export PATH="$HOME/.local/bin:$PATH"`
- Or add to `~/.bashrc` or `~/.zshrc`:
  ```bash
  export PATH="$HOME/.local/bin:$PATH"
  ```

### Port already in use
- Change port in backend or kill the process:
  ```bash
  lsof -ti:8000 | xargs kill -9
  ```

## Development vs Production

### Development
- Use `uv sync --extra dev` to get the tooling (pytest, ruff, mypy)
- Run with `--reload` flag for auto-reload on code changes
- Keyboard input works through the browser

### Production (Raspberry Pi)
- Use automated setup script: `scripts/setup.sh` (`--mode prod` or `--mode dev`)
- The script installs Docker + the kiosk; the app itself runs from the published `ghcr.io/osterbergsimon/calvin` container image (no native Python/Node/UV install on the Pi)
- The manual install steps in the section above do **not** apply to Pi production — they're for non-Pi Linux dev machines
- See [Setup Scripts Documentation](SETUP_SCRIPTS.md) for details

**Quick Setup for Raspberry Pi:**

Production:
```bash
wget -O- https://raw.githubusercontent.com/osterbergsimon/calvin/develop/scripts/setup.sh | sudo bash
```

Development (with hot reload):
```bash
wget -O- https://raw.githubusercontent.com/osterbergsimon/calvin/develop/scripts/setup.sh | sudo bash -s -- --mode dev
```

The setup script handles the complete setup automatically. See [Setup Scripts Documentation](SETUP_SCRIPTS.md) for more information.
