# PowerShell Makefile equivalent for Calvin Dashboard

param(
    [Parameter(Position=0)]
    [string]$Target = "help"
)

$ComposeDev = @("compose", "-f", "docker/docker-compose.dev.yml")
$ComposeProd = @("compose", "-f", "docker/docker-compose.yml")

function Show-Help {
    Write-Host "Available commands:" -ForegroundColor Cyan
    Write-Host "  .\Makefile.ps1 install        - One-time setup (creates docker/.env from example)" -ForegroundColor White
    Write-Host "  .\Makefile.ps1 dev            - Start dev stack (docker compose, streams logs)" -ForegroundColor White
    Write-Host "  .\Makefile.ps1 dev-logs       - Tail logs from running dev stack" -ForegroundColor White
    Write-Host "  .\Makefile.ps1 dev-logs-read  - Show last 50 lines of dev logs" -ForegroundColor White
    Write-Host "  .\Makefile.ps1 dev-down       - Stop dev stack" -ForegroundColor White
    Write-Host "  .\Makefile.ps1 dev-restart    - Restart dev stack containers" -ForegroundColor White
    Write-Host "  .\Makefile.ps1 doctor         - Check docker + dev env" -ForegroundColor White
    Write-Host "  .\Makefile.ps1 test           - Run all tests (native)" -ForegroundColor White
    Write-Host "  .\Makefile.ps1 test-backend   - Run backend tests only (native)" -ForegroundColor White
    Write-Host "  .\Makefile.ps1 test-frontend  - Run frontend tests only (native)" -ForegroundColor White
    Write-Host "  .\Makefile.ps1 test-coverage  - Run tests with coverage (native)" -ForegroundColor White
    Write-Host "  .\Makefile.ps1 test-scripts   - Test setup scripts" -ForegroundColor White
    Write-Host "  .\Makefile.ps1 lint           - Run linters (native)" -ForegroundColor White
    Write-Host "  .\Makefile.ps1 format         - Format code (native)" -ForegroundColor White
    Write-Host "  .\Makefile.ps1 type-check     - Run type checkers (native)" -ForegroundColor White
    Write-Host "  .\Makefile.ps1 build          - Build the production docker image" -ForegroundColor White
    Write-Host "  .\Makefile.ps1 clean          - Tear down dev stack and remove dev data" -ForegroundColor White
}

function Install-Dependencies {
    $envFile = Join-Path $PSScriptRoot "docker\.env"
    $exampleFile = Join-Path $PSScriptRoot "deploy\calvin.env.example"
    if (-not (Test-Path $envFile)) {
        Write-Host "Creating docker/.env from deploy/calvin.env.example..." -ForegroundColor Yellow
        Copy-Item $exampleFile $envFile
    } else {
        Write-Host "docker/.env already exists - leaving it alone" -ForegroundColor Gray
    }
    Write-Host "Done. Run '.\Makefile.ps1 dev' to start." -ForegroundColor Green
}

function Start-Dev {
    Write-Host "Starting dev stack via docker compose..." -ForegroundColor Yellow
    Write-Host "Backend:  http://localhost:8000" -ForegroundColor Cyan
    Write-Host "Frontend: http://localhost:5173" -ForegroundColor Cyan
    & docker @ComposeDev up
}

function Tail-Dev-Logs {
    & docker @ComposeDev logs -f
}

function Read-Dev-Logs {
    & docker @ComposeDev logs --tail=50
}

function Stop-Dev {
    & docker @ComposeDev down
}

function Restart-Dev {
    & docker @ComposeDev restart
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

function Run-Tests-Scripts {
    Write-Host "Testing setup scripts..." -ForegroundColor Yellow
    $pesterPath = Join-Path $PSScriptRoot "scripts" "tests" "setup-windows.Tests.ps1"
    if (Test-Path $pesterPath) {
        Write-Host "Running Pester tests for setup-windows.ps1..." -ForegroundColor Cyan
        if (Get-Module -ListAvailable -Name Pester) {
            Invoke-Pester $pesterPath
        } else {
            Write-Host "Warning: Pester not installed. Install with: Install-Module -Name Pester -Force" -ForegroundColor Yellow
        }
    }
    Write-Host "Note: Bash script tests require bats. Run 'make test-scripts' on Linux/macOS." -ForegroundColor Gray
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
    Write-Host "Building production docker image..." -ForegroundColor Yellow
    & docker @ComposeProd build
}

function Clean-Artifacts {
    Write-Host "Tearing down dev stack and removing artifacts..." -ForegroundColor Yellow
    & docker @ComposeDev down -v 2>$null
    if (Test-Path "docker\.calvin-dev-data") {
        Remove-Item -Recurse -Force "docker\.calvin-dev-data"
    }
    if (Test-Path "backend\.venv") {
        Remove-Item -Recurse -Force "backend\.venv"
    }
    if (Test-Path "frontend\node_modules") {
        Remove-Item -Recurse -Force "frontend\node_modules"
    }
    if (Test-Path "frontend\dist") {
        Remove-Item -Recurse -Force "frontend\dist"
    }
    Get-ChildItem -Recurse -Filter "__pycache__" -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Get-ChildItem -Recurse -Filter "*.pyc" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
    Write-Host "Clean complete!" -ForegroundColor Green
}

function Show-Doctor {
    Write-Host "Calvin dev-environment doctor" -ForegroundColor Cyan
    Write-Host "-----------------------------"
    Write-Host -NoNewline "docker:         "
    if (Get-Command docker -ErrorAction SilentlyContinue) { docker --version } else { Write-Host "MISSING - install Docker Desktop" -ForegroundColor Red }
    Write-Host -NoNewline "docker compose: "
    $composeOk = $false
    try { docker compose version | Out-Null; $composeOk = ($LASTEXITCODE -eq 0) } catch {}
    if ($composeOk) { docker compose version } else { Write-Host "MISSING - needs Docker Compose v2" -ForegroundColor Red }
    Write-Host ""
    Write-Host -NoNewline "docker/.env:    "
    if (Test-Path (Join-Path $PSScriptRoot "docker\.env")) { Write-Host "present" -ForegroundColor Green } else { Write-Host "MISSING - run: .\Makefile.ps1 install" -ForegroundColor Yellow }
    Write-Host ""
    Write-Host "Native toolchain (only needed for test/lint/format/type-check):" -ForegroundColor Gray
    Write-Host -NoNewline "  uv:   "
    if (Get-Command uv -ErrorAction SilentlyContinue) { uv --version } else { Write-Host "missing" -ForegroundColor Gray }
    Write-Host -NoNewline "  node: "
    if (Get-Command node -ErrorAction SilentlyContinue) { node --version } else { Write-Host "missing" -ForegroundColor Gray }
    Write-Host -NoNewline "  npm:  "
    if (Get-Command npm -ErrorAction SilentlyContinue) { npm --version } else { Write-Host "missing" -ForegroundColor Gray }
    Write-Host ""
    Write-Host "Ports (8000 backend, 5173 frontend):"
    foreach ($p in 8000, 5173) {
        $inUse = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
        if ($inUse) { Write-Host "  ${p}: IN USE" -ForegroundColor Yellow } else { Write-Host "  ${p}: free" -ForegroundColor Green }
    }
}

# Main switch
switch ($Target.ToLower()) {
    "help" { Show-Help }
    "install" { Install-Dependencies }
    "dev" { Start-Dev }
    "dev-logs" { Tail-Dev-Logs }
    "dev-logs-read" { Read-Dev-Logs }
    "dev-down" { Stop-Dev }
    "dev-restart" { Restart-Dev }
    "doctor" { Show-Doctor }
    "test" { Run-Tests }
    "test-backend" { Run-Tests-Backend }
    "test-frontend" { Run-Tests-Frontend }
    "test-coverage" { Run-Tests-Coverage }
    "test-scripts" { Run-Tests-Scripts }
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
