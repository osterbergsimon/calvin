# PowerShell Makefile equivalent for Calvin Dashboard

param(
    [Parameter(Position=0)]
    [string]$Target = "help"
)

function Show-Help {
    Write-Host "Available commands:" -ForegroundColor Cyan
    Write-Host "  .\Makefile.ps1 install        - Install all dependencies" -ForegroundColor White
    Write-Host "  .\Makefile.ps1 dev           - Start development servers" -ForegroundColor White
    Write-Host "  .\Makefile.ps1 test          - Run all tests" -ForegroundColor White
    Write-Host "  .\Makefile.ps1 test-backend  - Run backend tests only" -ForegroundColor White
    Write-Host "  .\Makefile.ps1 test-frontend - Run frontend tests only" -ForegroundColor White
    Write-Host "  .\Makefile.ps1 test-coverage - Run tests with coverage" -ForegroundColor White
    Write-Host "  .\Makefile.ps1 lint          - Run linters" -ForegroundColor White
    Write-Host "  .\Makefile.ps1 format        - Format code" -ForegroundColor White
    Write-Host "  .\Makefile.ps1 type-check    - Run type checkers" -ForegroundColor White
    Write-Host "  .\Makefile.ps1 build         - Build for production" -ForegroundColor White
    Write-Host "  .\Makefile.ps1 clean         - Clean build artifacts" -ForegroundColor White
}

function Install-Dependencies {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    Set-Location backend
    uv sync --extra dev
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Backend dependencies installation failed" -ForegroundColor Red
        Set-Location ..
        exit 1
    }
    Set-Location ..
    
    Set-Location frontend
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Frontend dependencies installation failed" -ForegroundColor Red
        Set-Location ..
        exit 1
    }
    Set-Location ..
    Write-Host "Dependencies installed successfully!" -ForegroundColor Green
}

function Start-Dev {
    Write-Host "Starting development servers..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Starting backend and frontend in separate windows..." -ForegroundColor Cyan
    Write-Host ""
    
    # Get the current directory
    $projectRoot = $PSScriptRoot
    
    # Start backend in new PowerShell window
    Write-Host "Starting backend..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$projectRoot\backend'; uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
    
    # Wait a moment for backend to start
    Start-Sleep -Seconds 2
    
    # Start frontend in new PowerShell window
    Write-Host "Starting frontend..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$projectRoot\frontend'; npm run dev"
    
    Write-Host ""
    Write-Host "✓ Servers starting in separate windows" -ForegroundColor Green
    Write-Host ""
    Write-Host "Backend: http://localhost:8000" -ForegroundColor Cyan
    Write-Host "Frontend: http://localhost:5173" -ForegroundColor Cyan
    Write-Host "API Docs: http://localhost:8000/docs" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Press Ctrl+C in each window to stop the servers" -ForegroundColor Yellow
}

function Run-Tests {
    Write-Host "Running all tests..." -ForegroundColor Yellow
    Set-Location backend
    uv sync --extra dev
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install dev dependencies" -ForegroundColor Red
        Set-Location ..
        exit 1
    }
    uv run pytest
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Backend tests failed" -ForegroundColor Red
        Set-Location ..
        exit 1
    }
    Set-Location ..
    
    Set-Location frontend
    npm run test
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Frontend tests failed" -ForegroundColor Red
        Set-Location ..
        exit 1
    }
    Set-Location ..
    Write-Host "All tests passed!" -ForegroundColor Green
}

function Run-Tests-Backend {
    Write-Host "Running backend tests..." -ForegroundColor Yellow
    Set-Location backend
    uv sync --extra dev
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install dev dependencies" -ForegroundColor Red
        Set-Location ..
        exit 1
    }
    uv run pytest
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Backend tests failed" -ForegroundColor Red
        Set-Location ..
        exit 1
    }
    Set-Location ..
    Write-Host "Backend tests passed!" -ForegroundColor Green
}

function Run-Tests-Frontend {
    Write-Host "Running frontend tests..." -ForegroundColor Yellow
    Set-Location frontend
    npm run test
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Frontend tests failed" -ForegroundColor Red
        Set-Location ..
        exit 1
    }
    Set-Location ..
    Write-Host "Frontend tests passed!" -ForegroundColor Green
}

function Run-Tests-Coverage {
    Write-Host "Running tests with coverage..." -ForegroundColor Yellow
    Set-Location backend
    uv sync --extra dev
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install dev dependencies" -ForegroundColor Red
        Set-Location ..
        exit 1
    }
    uv run pytest --cov=app --cov-report=html --cov-report=term
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Backend tests failed" -ForegroundColor Red
        Set-Location ..
        exit 1
    }
    Set-Location ..
    
    Set-Location frontend
    npm run test:coverage
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Frontend tests failed" -ForegroundColor Red
        Set-Location ..
        exit 1
    }
    Set-Location ..
    Write-Host "Coverage reports generated!" -ForegroundColor Green
}

function Run-Lint {
    Write-Host "Running linters..." -ForegroundColor Yellow
    Set-Location backend
    uv run ruff check .
    Set-Location ..
    
    Set-Location frontend
    npm run lint
    Set-Location ..
}

function Format-Code {
    Write-Host "Formatting code..." -ForegroundColor Yellow
    Set-Location backend
    uv run ruff format .
    Set-Location ..
    
    Set-Location frontend
    npm run format
    Set-Location ..
}

function Type-Check {
    Write-Host "Running type checkers..." -ForegroundColor Yellow
    Set-Location backend
    uv run mypy app/
    Set-Location ..
    
    Set-Location frontend
    npm run type-check
    Set-Location ..
}

function Build-Production {
    Write-Host "Building for production..." -ForegroundColor Yellow
    Set-Location frontend
    npm run build
    Set-Location ..
}

function Clean-Artifacts {
    Write-Host "Cleaning build artifacts..." -ForegroundColor Yellow
    if (Test-Path "backend\.venv") {
        Remove-Item -Recurse -Force "backend\.venv"
    }
    if (Test-Path "frontend\node_modules") {
        Remove-Item -Recurse -Force "frontend\node_modules"
    }
    if (Test-Path "frontend\dist") {
        Remove-Item -Recurse -Force "frontend\dist"
    }
    Get-ChildItem -Recurse -Filter "__pycache__" | Remove-Item -Recurse -Force
    Get-ChildItem -Recurse -Filter "*.pyc" | Remove-Item -Force
    Write-Host "Clean complete!" -ForegroundColor Green
}

# Main switch
switch ($Target.ToLower()) {
    "help" { Show-Help }
    "install" { Install-Dependencies }
    "dev" { Start-Dev }
    "test" { Run-Tests }
    "test-backend" { Run-Tests-Backend }
    "test-frontend" { Run-Tests-Frontend }
    "test-coverage" { Run-Tests-Coverage }
    "lint" { Run-Lint }
    "format" { Format-Code }
    "type-check" { Type-Check }
    "build" { Build-Production }
    "clean" { Clean-Artifacts }
    default {
        Write-Host "Unknown target: $Target" -ForegroundColor Red
        Show-Help
        exit 1
    }
}

