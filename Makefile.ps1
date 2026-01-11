# PowerShell Makefile equivalent for Calvin Dashboard

param(
    [Parameter(Position=0)]
    [string]$Target = "help"
)

function Show-Help {
    Write-Host "Available commands:" -ForegroundColor Cyan
    Write-Host "  .\Makefile.ps1 install        - Install all dependencies" -ForegroundColor White
    Write-Host "  .\Makefile.ps1 dev           - Start development servers (separate windows)" -ForegroundColor White
    Write-Host "  .\Makefile.ps1 dev-logs      - Start development servers with visible logs" -ForegroundColor White
    Write-Host "  .\Makefile.ps1 dev-logs-read - Read recent dev logs (useful for AI assistant)" -ForegroundColor White
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
    Write-Host "Starting backend, docs, and frontend in separate windows..." -ForegroundColor Cyan
    Write-Host ""
    
    # Get the current directory
    $projectRoot = $PSScriptRoot
    
    # Start backend in new PowerShell window
    Write-Host "Starting backend..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$projectRoot\backend'; uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
    
    # Wait a moment for backend to start
    Start-Sleep -Seconds 2
    
    # Start docs in new PowerShell window
    Write-Host "Starting docs..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$projectRoot'; uv run --project backend mkdocs serve --dev-addr 127.0.0.1:8001"
    
    # Wait a moment for docs to start
    Start-Sleep -Seconds 1
    
    # Start frontend in new PowerShell window
    Write-Host "Starting frontend..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$projectRoot\frontend'; npm run dev"
    
    Write-Host ""
    Write-Host "✓ Servers starting in separate windows" -ForegroundColor Green
    Write-Host ""
    Write-Host "Backend: http://localhost:8000" -ForegroundColor Cyan
    Write-Host "Frontend: http://localhost:5173" -ForegroundColor Cyan
    Write-Host "Docs: http://localhost:8001" -ForegroundColor Cyan
    Write-Host "API Docs: http://localhost:8000/docs" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Press Ctrl+C in each window to stop the servers" -ForegroundColor Yellow
}

function Start-Dev-Logs {
    Write-Host "Starting development servers with visible logs..." -ForegroundColor Yellow
    Write-Host ""
    
    # Get the current directory and create log directory
    $projectRoot = $PSScriptRoot
    $logDir = Join-Path $projectRoot "logs"
    if (-not (Test-Path $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }
    
    $backendLogFile = Join-Path $logDir "dev-backend.log"
    $frontendLogFile = Join-Path $logDir "dev-frontend.log"
    $docsLogFile = Join-Path $logDir "dev-docs.log"
    $combinedLogFile = Join-Path $logDir "dev-combined.log"
    
    # Clear previous log files
    "" | Out-File $backendLogFile -Force
    "" | Out-File $frontendLogFile -Force
    "" | Out-File $docsLogFile -Force
    "" | Out-File $combinedLogFile -Force
    
    Write-Host "Logs are also being written to:" -ForegroundColor Gray
    Write-Host "  Backend:  $backendLogFile" -ForegroundColor Gray
    Write-Host "  Frontend: $frontendLogFile" -ForegroundColor Gray
    Write-Host "  Docs:     $docsLogFile" -ForegroundColor Gray
    Write-Host "  Combined: $combinedLogFile" -ForegroundColor Gray
    Write-Host ""
    
    # Start backend as a job with proper output handling and file logging
    Write-Host "Starting backend..." -ForegroundColor Yellow
    $backendJob = Start-Job -ScriptBlock {
        param($Root, $BackendLog, $CombinedLog)
        Set-Location "$Root\backend"
        $env:PYTHONUNBUFFERED = "1"
        & uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 *>&1 | ForEach-Object {
            $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            $logLine = "[$timestamp] [BACKEND] $_"
            $logLine | Out-File -FilePath $BackendLog -Append -Encoding utf8
            $logLine | Out-File -FilePath $CombinedLog -Append -Encoding utf8
            "[BACKEND] $_"
        }
    } -ArgumentList $projectRoot, $backendLogFile, $combinedLogFile
    
    # Wait a moment for backend to start
    Start-Sleep -Seconds 2
    
    # Start docs as a job with proper output handling and file logging
    Write-Host "Starting docs..." -ForegroundColor Yellow
    $docsJob = Start-Job -ScriptBlock {
        param($Root, $DocsLog, $CombinedLog)
        Set-Location $Root
        & uv run --project backend mkdocs serve --dev-addr 127.0.0.1:8001 *>&1 | ForEach-Object {
            $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            $logLine = "[$timestamp] [DOCS] $_"
            $logLine | Out-File -FilePath $DocsLog -Append -Encoding utf8
            $logLine | Out-File -FilePath $CombinedLog -Append -Encoding utf8
            "[DOCS] $_"
        }
    } -ArgumentList $projectRoot, $docsLogFile, $combinedLogFile
    
    # Wait a moment for docs to start
    Start-Sleep -Seconds 1
    
    # Start frontend as a job with proper output handling and file logging
    Write-Host "Starting frontend..." -ForegroundColor Yellow
    $frontendJob = Start-Job -ScriptBlock {
        param($Root, $FrontendLog, $CombinedLog)
        Set-Location "$Root\frontend"
        & npm run dev *>&1 | ForEach-Object {
            $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            $logLine = "[$timestamp] [FRONTEND] $_"
            $logLine | Out-File -FilePath $FrontendLog -Append -Encoding utf8
            $logLine | Out-File -FilePath $CombinedLog -Append -Encoding utf8
            "[FRONTEND] $_"
        }
    } -ArgumentList $projectRoot, $frontendLogFile, $combinedLogFile
    
    Write-Host ""
    Write-Host "✓ Servers starting (logs visible below and in log files)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Backend: http://localhost:8000" -ForegroundColor Cyan
    Write-Host "Frontend: http://localhost:5173" -ForegroundColor Cyan
    Write-Host "Docs: http://localhost:8001" -ForegroundColor Cyan
    Write-Host "API Docs: http://localhost:8000/docs" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Press Ctrl+C to stop all servers" -ForegroundColor Yellow
    Write-Host ("─" * 80) -ForegroundColor DarkGray
    Write-Host ""
    
    # Monitor all jobs and display output
    try {
        while ($backendJob.State -eq "Running" -or $docsJob.State -eq "Running" -or $frontendJob.State -eq "Running") {
            # Receive and display backend output
            $backendOutput = Receive-Job -Job $backendJob -ErrorAction SilentlyContinue
            if ($backendOutput) {
                foreach ($line in $backendOutput) {
                    Write-Host $line -ForegroundColor Cyan
                }
            }
            
            # Receive and display docs output
            $docsOutput = Receive-Job -Job $docsJob -ErrorAction SilentlyContinue
            if ($docsOutput) {
                foreach ($line in $docsOutput) {
                    Write-Host $line -ForegroundColor Yellow
                }
            }
            
            # Receive and display frontend output
            $frontendOutput = Receive-Job -Job $frontendJob -ErrorAction SilentlyContinue
            if ($frontendOutput) {
                foreach ($line in $frontendOutput) {
                    Write-Host $line -ForegroundColor Magenta
                }
            }
            
            # Check if jobs have failed or completed
            if ($backendJob.State -eq "Failed" -or $backendJob.State -eq "Completed") {
                $allOutput = Receive-Job -Job $backendJob -ErrorAction SilentlyContinue
                if ($allOutput) {
                    foreach ($line in $allOutput) {
                        Write-Host $line -ForegroundColor Cyan
                    }
                }
                if ($backendJob.State -eq "Failed") {
                    Write-Host "[ERROR] Backend job failed" -ForegroundColor Red
                    break
                }
            }
            
            if ($docsJob.State -eq "Failed" -or $docsJob.State -eq "Completed") {
                $allOutput = Receive-Job -Job $docsJob -ErrorAction SilentlyContinue
                if ($allOutput) {
                    foreach ($line in $allOutput) {
                        Write-Host $line -ForegroundColor Yellow
                    }
                }
                if ($docsJob.State -eq "Failed") {
                    Write-Host "[ERROR] Docs job failed" -ForegroundColor Red
                    break
                }
            }
            
            if ($frontendJob.State -eq "Failed" -or $frontendJob.State -eq "Completed") {
                $allOutput = Receive-Job -Job $frontendJob -ErrorAction SilentlyContinue
                if ($allOutput) {
                    foreach ($line in $allOutput) {
                        Write-Host $line -ForegroundColor Magenta
                    }
                }
                if ($frontendJob.State -eq "Failed") {
                    Write-Host "[ERROR] Frontend job failed" -ForegroundColor Red
                    break
                }
            }
            
            Start-Sleep -Milliseconds 200
        }
    }
    catch {
        Write-Host "`n[ERROR] $($_.Exception.Message)" -ForegroundColor Red
    }
    finally {
        # Clean up jobs
        Write-Host ""
        Write-Host "Stopping servers..." -ForegroundColor Yellow
        Stop-Job -Job $backendJob, $docsJob, $frontendJob -ErrorAction SilentlyContinue | Out-Null
        Remove-Job -Job $backendJob, $docsJob, $frontendJob -ErrorAction SilentlyContinue | Out-Null
        Write-Host "Servers stopped. Logs saved to: $logDir" -ForegroundColor Green
    }
}

function Read-Dev-Logs {
    param(
        [int]$Lines = 50,
        [string]$Type = "combined"
    )
    
    $projectRoot = $PSScriptRoot
    $logDir = Join-Path $projectRoot "logs"
    $combinedLogFile = Join-Path $logDir "dev-combined.log"
    $backendLogFile = Join-Path $logDir "dev-backend.log"
    $frontendLogFile = Join-Path $logDir "dev-frontend.log"
    $docsLogFile = Join-Path $logDir "dev-docs.log"
    
    if (-not (Test-Path $combinedLogFile)) {
        Write-Host "No dev logs found. Have you started 'dev-logs' yet?" -ForegroundColor Yellow
        Write-Host "Expected log files in: $logDir" -ForegroundColor Gray
        return
    }
    
    $logFile = switch ($Type.ToLower()) {
        "backend" { $backendLogFile }
        "frontend" { $frontendLogFile }
        "docs" { $docsLogFile }
        default { $combinedLogFile }
    }
    
    if (Test-Path $logFile) {
        Write-Host "Last $Lines lines from $Type log:" -ForegroundColor Cyan
        Write-Host ("─" * 80) -ForegroundColor DarkGray
        Get-Content $logFile -Tail $Lines -ErrorAction SilentlyContinue | ForEach-Object {
            if ($_ -match "\[BACKEND\]") {
                Write-Host $_ -ForegroundColor Cyan
            } elseif ($_ -match "\[FRONTEND\]") {
                Write-Host $_ -ForegroundColor Magenta
            } elseif ($_ -match "\[DOCS\]") {
                Write-Host $_ -ForegroundColor Yellow
            } else {
                Write-Host $_
            }
        }
        Write-Host ("─" * 80) -ForegroundColor DarkGray
        Write-Host "Full log: $logFile" -ForegroundColor Gray
    } else {
        Write-Host "Log file not found: $logFile" -ForegroundColor Red
    }
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
    "dev-logs" { Start-Dev-Logs }
    "dev-logs-read" { Read-Dev-Logs }
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

