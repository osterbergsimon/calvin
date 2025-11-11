# Quick Start - Development on Windows (Develop Branch)

This guide will help you get started with development on Windows using the `develop` branch.

## Prerequisites

- **Python 3.11+** - Download from https://www.python.org/downloads/
- **Node.js 20+** - Download LTS from https://nodejs.org/
- **Git** - Download from https://git-scm.com/download/win
- **UV** - Will be installed automatically by the setup script

## Quick Start

### Step 1: Clone the Repository (if not already cloned)

```powershell
git clone https://github.com/osterbergsimon/calvin.git
cd calvin
```

### Step 2: Switch to Develop Branch

```powershell
git checkout develop
git pull origin develop
```

### Step 3: Run Setup Script

```powershell
.\setup-windows.ps1
```

This will:
- Check all prerequisites (Python, Node.js, UV)
- Switch to `develop` branch automatically
- Install backend dependencies (with dev extras)
- Install frontend dependencies

### Step 4: Start Development Servers

**Option A: Use Makefile (Recommended)**

```powershell
.\make.ps1 dev
```

This will start both backend and frontend in separate PowerShell windows.

**Option B: Manual Start**

Terminal 1 - Backend:
```powershell
cd backend
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Terminal 2 - Frontend:
```powershell
cd frontend
npm run dev
```

## Verify It Works

1. **Backend**: http://localhost:8000
2. **Frontend**: http://localhost:5173
3. **API Docs**: http://localhost:8000/docs
4. **Health Check**: http://localhost:8000/api/health

## Available Commands

Use `.\make.ps1` or `.\Makefile.ps1` for common tasks:

```powershell
.\make.ps1 install        # Install all dependencies
.\make.ps1 dev           # Start development servers
.\make.ps1 test          # Run all tests
.\make.ps1 test-backend  # Run backend tests only
.\make.ps1 test-frontend # Run frontend tests only
.\make.ps1 lint          # Run linters
.\make.ps1 format        # Format code
.\make.ps1 type-check    # Run type checkers
.\make.ps1 build         # Build for production
.\make.ps1 clean         # Clean build artifacts
```

## Working with the Develop Branch

### Pull Latest Changes

```powershell
git pull origin develop
```

### Create a Feature Branch

```powershell
git checkout -b feature/your-feature-name develop
```

### Switch Back to Develop

```powershell
git checkout develop
```

## Important Notes

### Keyboard Support (evdev)

- **Windows**: Keyboard input is disabled (normal for development)
- **Raspberry Pi**: Full keyboard support will work on Linux
- The backend automatically handles platform differences
- You don't need WSL - develop on Windows, deploy to Raspberry Pi

### Hot Reload

Both backend and frontend support hot reload:
- **Backend**: Uses `uvicorn --reload` (auto-restarts on code changes)
- **Frontend**: Uses Vite dev server (instant updates in browser)

## Troubleshooting

### "uv: command not found"
- Restart PowerShell after installing UV
- Or add UV to PATH: `C:\Users\<username>\.cargo\bin\`

### "node: command not found"
- Restart PowerShell after installing Node.js
- Or restart your computer

### Port already in use
```powershell
# Find process using port 8000
netstat -ano | findstr :8000

# Kill the process (replace <PID> with actual PID)
taskkill /PID <PID> /F
```

### Git branch issues
```powershell
# Force switch to develop
git checkout -f develop

# Reset to remote develop
git fetch origin develop
git reset --hard origin/develop
```

## Next Steps

1. Read the main [README.md](README.md) for project overview
2. Check [PROJECT_PLAN.md](PROJECT_PLAN.md) for architecture details
3. Start coding on a feature branch!

