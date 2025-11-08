# Windows Setup Guide

## Prerequisites

### 1. Install Python 3.11+
- Download from: https://www.python.org/downloads/
- During installation, check "Add Python to PATH"
- Verify: `python --version` (should show 3.11 or higher)

### 2. Install Node.js 20+
- Download from: https://nodejs.org/
- Choose LTS version (20.x or higher)
- Verify: `node --version` and `npm --version`

### 3. Install UV (Python Package Manager)
Open PowerShell and run:
```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

Or using pip:
```powershell
pip install uv
```

Verify: `uv --version`

### 4. Install Git (if not already installed)
- Download from: https://git-scm.com/download/win
- Verify: `git --version`

## Setup Project

### 1. Navigate to project directory
```powershell
cd C:\Users\oster\code\calvin
```

### 2. Install Backend Dependencies
```powershell
cd backend
uv sync
cd ..
```

### 3. Install Frontend Dependencies
```powershell
cd frontend
npm install
cd ..
```

## Running the Application

### Option 1: Use Makefile (if you have Make installed)
```powershell
make install
make dev
```

### Option 2: Manual Commands (Windows PowerShell)

**Terminal 1 - Backend:**
```powershell
cd backend
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 - Frontend:**
```powershell
cd frontend
npm run dev
```

## Verify Setup

1. Backend should be running at: http://localhost:8000
2. Frontend should be running at: http://localhost:5173
3. API docs available at: http://localhost:8000/docs
4. Health check: http://localhost:8000/api/health

## Troubleshooting

### UV not found
- Make sure UV is in your PATH
- Try restarting PowerShell
- Or use full path: `C:\Users\<username>\.cargo\bin\uv.exe`

### Port already in use
- Change port in `backend/app/config.py` or use different port
- Or kill process using port: `netstat -ano | findstr :8000`

### Node modules issues
- Delete `frontend/node_modules` and `frontend/package-lock.json`
- Run `npm install` again


