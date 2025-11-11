# Windows Setup Script for Calvin Dashboard

Write-Host "Calvin Dashboard - Windows Setup" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check if git is available
Write-Host "Checking Git..." -ForegroundColor Yellow
try {
    $gitVersion = git --version 2>&1
    Write-Host "✓ Git found: $gitVersion" -ForegroundColor Green
    
    # Check current branch and switch to develop if needed
    $currentBranch = git rev-parse --abbrev-ref HEAD 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Current branch: $currentBranch" -ForegroundColor Gray
        
        # Fetch latest changes
        Write-Host "Fetching latest changes from remote..." -ForegroundColor Yellow
        git fetch origin develop 2>&1 | Out-Null
        
        # Check if develop branch exists locally
        $developExists = git show-ref --verify --quiet refs/heads/develop 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Creating develop branch from origin/develop..." -ForegroundColor Yellow
            git checkout -b develop origin/develop 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Host "⚠ Could not create develop branch. Continuing with current branch." -ForegroundColor Yellow
            } else {
                Write-Host "✓ Switched to develop branch" -ForegroundColor Green
            }
        } elseif ($currentBranch -ne "develop") {
            Write-Host "Switching to develop branch..." -ForegroundColor Yellow
            git checkout develop 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✓ Switched to develop branch" -ForegroundColor Green
                git pull origin develop 2>&1 | Out-Null
            } else {
                Write-Host "⚠ Could not switch to develop branch. Continuing with current branch." -ForegroundColor Yellow
            }
        } else {
            # Already on develop, pull latest
            Write-Host "Pulling latest changes from develop..." -ForegroundColor Yellow
            git pull origin develop 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✓ Up to date with develop" -ForegroundColor Green
            } else {
                Write-Host "⚠ Could not pull latest changes. Continuing anyway." -ForegroundColor Yellow
            }
        }
    }
} catch {
    Write-Host "⚠ Git not found. Skipping branch checkout." -ForegroundColor Yellow
    Write-Host "  Install Git from https://git-scm.com/download/win if you want branch management" -ForegroundColor Gray
}
Write-Host ""

# Check Python
Write-Host "Checking Python..." -ForegroundColor Yellow
try {
    $pythonVersion = python --version 2>&1
    Write-Host "✓ Python found: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Python not found. Please install Python 3.11+ from https://www.python.org/downloads/" -ForegroundColor Red
    exit 1
}

# Check Node.js
Write-Host "Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js not found. Please install Node.js 20+ from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Check UV
Write-Host "Checking UV..." -ForegroundColor Yellow
try {
    $uvVersion = uv --version 2>&1
    Write-Host "✓ UV found: $uvVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ UV not found. Installing UV..." -ForegroundColor Yellow
    powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ UV installation failed. Please install manually: pip install uv" -ForegroundColor Red
        exit 1
    }
    Write-Host "✓ UV installed" -ForegroundColor Green
}

# Install backend dependencies
Write-Host ""
Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
Write-Host "Note: evdev (keyboard support) is Linux-only and will be skipped on Windows" -ForegroundColor Yellow
Set-Location backend
uv sync --extra dev
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Backend dependencies installation failed" -ForegroundColor Red
    Set-Location ..
    exit 1
}
Write-Host "✓ Backend dependencies installed" -ForegroundColor Green
Write-Host "  (Keyboard input disabled on Windows - normal for development)" -ForegroundColor Gray
Set-Location ..

# Install frontend dependencies
Write-Host ""
Write-Host "Installing frontend dependencies..." -ForegroundColor Yellow
Set-Location frontend
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Frontend dependencies installation failed" -ForegroundColor Red
    Set-Location ..
    exit 1
}
Write-Host "✓ Frontend dependencies installed" -ForegroundColor Green
Set-Location ..

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "To start development:" -ForegroundColor Yellow
Write-Host "  Terminal 1: cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000" -ForegroundColor White
Write-Host "  Terminal 2: cd frontend && npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "Backend: http://localhost:8000" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host "API Docs: http://localhost:8000/docs" -ForegroundColor Cyan


