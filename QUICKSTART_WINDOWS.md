# Quick Start - Windows

## Current Status
✅ Python 3.12.1 - Installed
❌ Node.js - Not installed
❌ UV - Not installed

## Step 1: Install Node.js

1. Download Node.js LTS (20.x or higher) from: https://nodejs.org/
2. Run the installer (accept defaults)
3. **Restart PowerShell** after installation
4. Verify: `node --version` and `npm --version`

## Step 2: Install UV

Open PowerShell and run:
```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

Or using pip:
```powershell
pip install uv
```

After installation, **restart PowerShell** or refresh PATH:
```powershell
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
```

Verify: `uv --version`

## Important Note: evdev (Keyboard Support)

The `evdev` package is **Linux-only** and won't install on Windows. This is **normal and expected**:

### Development on Windows
- ✅ Backend will run fine on Windows for development
- ✅ All features work except keyboard input
- ✅ Keyboard features are automatically disabled on Windows
- ✅ Perfect for developing and testing all other features

### Production on Raspberry Pi (Linux)
- ✅ Full keyboard support will work on Raspberry Pi (Linux)
- ✅ Install with: `uv sync --extra linux` on Raspberry Pi
- ✅ All features including keyboard input will be available

**You don't need WSL** - develop on Windows, deploy to Raspberry Pi. The backend automatically handles platform differences.

## Step 3: Run Setup Script

Once Node.js and UV are installed, run:
```powershell
.\setup-windows.ps1
```

This will:
- Check all prerequisites
- Install backend dependencies
- Install frontend dependencies

## Step 4: Start Development

**Option A: Use the setup script (recommended)**
```powershell
.\setup-windows.ps1
```

**Option B: Manual setup**

Terminal 1 - Backend:
```powershell
cd backend
uv sync
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Terminal 2 - Frontend:
```powershell
cd frontend
npm install
npm run dev
```

## Verify It Works

1. Backend: http://localhost:8000
2. Frontend: http://localhost:5173
3. API Docs: http://localhost:8000/docs
4. Health Check: http://localhost:8000/api/health

## Troubleshooting

### "uv: command not found"
- Restart PowerShell after installing UV
- Or add UV to PATH manually: `C:\Users\<username>\.cargo\bin\`

### "node: command not found"
- Restart PowerShell after installing Node.js
- Or restart your computer

### Port already in use
- Change port in backend or kill the process:
```powershell
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```


