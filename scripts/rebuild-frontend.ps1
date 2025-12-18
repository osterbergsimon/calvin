# Helper script to rebuild and restart the frontend (PowerShell version)
# This script rebuilds the frontend for Windows development

$ErrorActionPreference = "Stop"

# Colors for output
function Write-Log {
    param([string]$Message)
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message" -ForegroundColor Green
}

function Write-Error-Log {
    param([string]$Message)
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] ERROR: $Message" -ForegroundColor Red
    exit 1
}

function Write-Warn-Log {
    param([string]$Message)
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] WARNING: $Message" -ForegroundColor Yellow
}

# Get the script directory and project root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$FrontendDir = Join-Path $ProjectRoot "frontend"

Write-Log "Starting frontend rebuild..."
Write-Log "Project root: $ProjectRoot"
Write-Log "Frontend directory: $FrontendDir"

# Check if frontend directory exists
if (-not (Test-Path $FrontendDir)) {
    Write-Error-Log "Frontend directory not found: $FrontendDir"
}

# Check if package.json exists
$PackageJson = Join-Path $FrontendDir "package.json"
if (-not (Test-Path $PackageJson)) {
    Write-Error-Log "package.json not found in frontend directory"
}

# Change to frontend directory
Set-Location $FrontendDir

# Check if node_modules exists, if not install dependencies
if (-not (Test-Path "node_modules")) {
    Write-Log "node_modules not found. Installing dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Error-Log "Failed to install dependencies"
    }
}

# Build frontend
Write-Log "Building frontend..."
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error-Log "Frontend build failed"
}

Write-Log "Frontend build completed successfully"

# Check if backend is running (check for process or service)
$BackendRunning = $false
try {
    # Check if there's a process running on port 8000 (typical backend port)
    $Port8000 = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
    if ($Port8000) {
        $BackendRunning = $true
    }
} catch {
    # Port check failed, try checking for uvicorn process
    $UvicornProcess = Get-Process -Name "python" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*uvicorn*" }
    if ($UvicornProcess) {
        $BackendRunning = $true
    }
}

if ($BackendRunning) {
    Write-Log "Backend appears to be running. Please restart it manually to serve the new frontend build."
    Write-Log "The new build is available in: $(Join-Path $FrontendDir 'dist')"
} else {
    Write-Log "Backend is not running. New build will be served when backend starts."
}

Write-Log "Frontend rebuild complete!"
Write-Log "The new build is available in: $(Join-Path $FrontendDir 'dist')"


