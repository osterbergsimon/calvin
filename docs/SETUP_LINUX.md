# Linux Setup Guide

## Prerequisites

### 1. Install Python 3.11+
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install python3.11 python3.11-venv python3-pip

# Fedora
sudo dnf install python3.11 python3-pip

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

# Add to PATH (if not already added)
export PATH="$HOME/.cargo/bin:$PATH"

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
uv sync --extra linux
cd ..
```

**Note:** The `--extra linux` flag installs `evdev` for full keyboard support on Linux.

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

On Linux, full keyboard support is available via `evdev`:
- ✅ 7-button keyboard support
- ✅ Standard keyboard support
- ✅ Auto-detection of keyboard devices
- ✅ Remappable key bindings

## Troubleshooting

### UV not found
- Make sure UV is in your PATH: `export PATH="$HOME/.cargo/bin:$PATH"`
- Or add to `~/.bashrc` or `~/.zshrc`:
  ```bash
  export PATH="$HOME/.cargo/bin:$PATH"
  ```

### evdev installation fails
- Install kernel headers:
  ```bash
  # Ubuntu/Debian
  sudo apt install linux-headers-$(uname -r)
  
  # Fedora
  sudo dnf install kernel-devel
  
  # Arch Linux
  sudo pacman -S linux-headers
  ```

### Port already in use
- Change port in backend or kill the process:
  ```bash
  lsof -ti:8000 | xargs kill -9
  ```

### Permission denied for /dev/input/*
- Add user to input group:
  ```bash
  sudo usermod -a -G input $USER
  ```
- Log out and log back in for changes to take effect

## Development vs Production

### Development
- Use `uv sync --extra linux` to get all dependencies including `evdev`
- Run with `--reload` flag for auto-reload on code changes
- Full keyboard support available

### Production (Raspberry Pi)
- Same setup as development
- Use systemd services for auto-start
- Full keyboard support available

