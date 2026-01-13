# Windows Setup Script for Calvin Dashboard
# This script sets up Calvin for development on Windows

$ErrorActionPreference = "Stop"

# Configuration
$ScriptName = "Calvin Dashboard - Windows Setup"
$RequiredPythonVersion = "3.11"
$RequiredNodeVersion = "20"

# Color output functions
function Write-Step {
    param([string]$Message)
    Write-Host "`n$Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠ $Message" -ForegroundColor Yellow
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

function Write-Info {
    param([string]$Message)
    Write-Host "  $Message" -ForegroundColor Gray
}

# Error handling
function Test-Command {
    param(
        [string]$Command,
        [string]$ErrorMessage,
        [string]$InstallHint
    )
    
    try {
        $null = Get-Command $Command -ErrorAction Stop
        return $true
    }
    catch {
        if ($InstallHint) {
            Write-Error-Custom "$ErrorMessage`n  $InstallHint"
        }
        else {
            Write-Error-Custom $ErrorMessage
        }
        return $false
    }
}

function Invoke-SafeCommand {
    param(
        [scriptblock]$ScriptBlock,
        [string]$ErrorMessage,
        [string]$SuccessMessage,
        [switch]$AllowFailure
    )
    
    try {
        & $ScriptBlock
        if ($LASTEXITCODE -ne 0 -and -not $AllowFailure) {
            throw "Command exited with code $LASTEXITCODE"
        }
        if ($SuccessMessage) {
            Write-Success $SuccessMessage
        }
        return $true
    }
    catch {
        if ($AllowFailure) {
            Write-Warning "$ErrorMessage (non-fatal)"
            return $false
        }
        else {
            Write-Error-Custom $ErrorMessage
            Write-Info $_.Exception.Message
            exit 1
        }
    }
}

# Version checking
function Test-Version {
    param(
        [string]$VersionString,
        [int]$MinMajor,
        [string]$ToolName
    )
    
    if (-not $VersionString) {
        return $false
    }
    
    $versionMatch = $VersionString -match "(\d+)\.(\d+)"
    if ($versionMatch) {
        $major = [int]$matches[1]
        if ($major -ge $MinMajor) {
            return $true
        }
    }
    
    Write-Error-Custom "$ToolName version $MinMajor+ required, found: $VersionString"
    return $false
}

# Git repository management
function Initialize-GitRepository {
    Write-Step "Checking Git repository..."
    
    if (-not (Test-Command "git" "Git not found" "Install Git from https://git-scm.com/download/win")) {
        Write-Warning "Git not available. Skipping repository checks."
        return
    }
    
    try {
        $currentBranch = git rev-parse --abbrev-ref HEAD 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Info "Current branch: $currentBranch"
            
            # Fetch latest changes
            Write-Info "Fetching latest changes from remote..."
            git fetch origin develop 2>&1 | Out-Null
            
            # Check if develop branch exists locally
            $developExists = git show-ref --verify --quiet refs/heads/develop 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-Info "Creating develop branch from origin/develop..."
                git checkout -b develop origin/develop 2>&1 | Out-Null
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "Switched to develop branch"
                }
                else {
                    Write-Warning "Could not create develop branch. Continuing with current branch."
                }
            }
            elseif ($currentBranch -ne "develop") {
                Write-Info "Switching to develop branch..."
                git checkout develop 2>&1 | Out-Null
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "Switched to develop branch"
                    git pull origin develop 2>&1 | Out-Null
                }
                else {
                    Write-Warning "Could not switch to develop branch. Continuing with current branch."
                }
            }
            else {
                # Already on develop, pull latest
                Write-Info "Pulling latest changes from develop..."
                git pull origin develop 2>&1 | Out-Null
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "Up to date with develop"
                }
                else {
                    Write-Warning "Could not pull latest changes. Continuing anyway."
                }
            }
        }
    }
    catch {
        Write-Warning "Git operations failed (non-fatal): $($_.Exception.Message)"
    }
}

# Check prerequisites
function Test-Prerequisites {
    Write-Step "Checking Prerequisites"
    
    # Check Python
    Write-Info "Checking Python..."
    if (-not (Test-Command "python" "Python not found" "Please install Python $RequiredPythonVersion+ from https://www.python.org/downloads/")) {
        exit 1
    }
    
    $pythonVersion = python --version 2>&1
    if (-not (Test-Version $pythonVersion $RequiredPythonVersion "Python")) {
        exit 1
    }
    Write-Success "Python found: $pythonVersion"
    
    # Check Node.js
    Write-Info "Checking Node.js..."
    if (-not (Test-Command "node" "Node.js not found" "Please install Node.js $RequiredNodeVersion+ from https://nodejs.org/")) {
        exit 1
    }
    
    $nodeVersion = node --version
    $nodeMajor = ($nodeVersion -replace "v", "").Split(".")[0]
    if ([int]$nodeMajor -lt $RequiredNodeVersion) {
        Write-Error-Custom "Node.js version $RequiredNodeVersion+ required, found: $nodeVersion"
        exit 1
    }
    Write-Success "Node.js found: $nodeVersion"
    
    # Check UV
    Write-Info "Checking UV..."
    $uvInstalled = $false
    try {
        $uvVersion = uv --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "UV found: $uvVersion"
            $uvInstalled = $true
        }
    }
    catch {
        # UV not found, will install
    }
    
    if (-not $uvInstalled) {
        Write-Info "UV not found. Installing UV..."
        try {
            Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression
            $uvVersion = uv --version 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Success "UV installed: $uvVersion"
            }
            else {
                throw "UV installation verification failed"
            }
        }
        catch {
            Write-Error-Custom "UV installation failed. Please install manually: pip install uv"
            exit 1
        }
    }
}

# Install backend dependencies
function Install-BackendDependencies {
    Write-Step "Installing Backend Dependencies"
    Write-Info "Note: evdev (keyboard support) is Linux-only and will be skipped on Windows"
    
    $backendDir = Join-Path $PSScriptRoot "backend"
    if (-not (Test-Path $backendDir)) {
        Write-Error-Custom "Backend directory not found: $backendDir"
        exit 1
    }
    
    Push-Location $backendDir
    
    try {
        Invoke-SafeCommand -ScriptBlock {
            uv sync --extra dev
        } -ErrorMessage "Backend dependencies installation failed" -SuccessMessage "Backend dependencies installed"
        Write-Info "(Keyboard input disabled on Windows - normal for development)"
    }
    finally {
        Pop-Location
    }
}

# Install frontend dependencies
function Install-FrontendDependencies {
    Write-Step "Installing Frontend Dependencies"
    
    $frontendDir = Join-Path $PSScriptRoot "frontend"
    if (-not (Test-Path $frontendDir)) {
        Write-Error-Custom "Frontend directory not found: $frontendDir"
        exit 1
    }
    
    Push-Location $frontendDir
    
    try {
        Invoke-SafeCommand -ScriptBlock {
            npm install
        } -ErrorMessage "Frontend dependencies installation failed" -SuccessMessage "Frontend dependencies installed"
    }
    finally {
        Pop-Location
    }
}

# Main setup function
function Main {
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host $ScriptName -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""
    
    # Initialize Git repository
    Initialize-GitRepository
    
    # Check prerequisites
    Test-Prerequisites
    
    # Install dependencies
    Install-BackendDependencies
    Install-FrontendDependencies
    
    # Success message
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Success "Setup complete!"
    Write-Host ""
    Write-Host "To start development:" -ForegroundColor Yellow
    Write-Host "  Terminal 1: cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000" -ForegroundColor White
    Write-Host "  Terminal 2: cd frontend && npm run dev" -ForegroundColor White
    Write-Host ""
    Write-Host "Backend: http://localhost:8000" -ForegroundColor Cyan
    Write-Host "Frontend: http://localhost:5173" -ForegroundColor Cyan
    Write-Host "API Docs: http://localhost:8000/docs" -ForegroundColor Cyan
    Write-Host ""
}

# Run main function
try {
    Main
}
catch {
    Write-Error-Custom "Setup failed: $($_.Exception.Message)"
    exit 1
}
