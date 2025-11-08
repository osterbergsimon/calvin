# Test bash script syntax using Git Bash (if available)
# This provides more thorough bash syntax checking than PowerShell validation

param(
    [switch]$Verbose
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

$GitBashPath = "C:\Program Files\Git\bin\bash.exe"
$GitBashPathAlt = "C:\Program Files (x86)\Git\bin\bash.exe"

$BashPath = $null
if (Test-Path $GitBashPath) {
    $BashPath = $GitBashPath
} elseif (Test-Path $GitBashPathAlt) {
    $BashPath = $GitBashPathAlt
}

if (-not $BashPath) {
    Write-Host "Git Bash not found. Skipping bash syntax tests." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To test bash syntax:" -ForegroundColor Cyan
    Write-Host "  1. Install Git for Windows (includes Git Bash)" -ForegroundColor White
    Write-Host "  2. Or use WSL: wsl bash -n <script>" -ForegroundColor White
    Write-Host "  3. Or test on actual Raspberry Pi" -ForegroundColor White
    exit 0
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Bash Syntax Testing (using Git Bash)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$ErrorCount = 0
$Scripts = @(
    "$ScriptDir\first-boot\setup.sh",
    "$ScriptDir\first-boot\setup-dev.sh",
    "$ProjectRoot\scripts\update-calvin.sh"
)

foreach ($Script in $Scripts) {
    if (-not (Test-Path $Script)) {
        Write-Host "✗ File not found: $Script" -ForegroundColor Red
        $ErrorCount++
        continue
    }
    
    Write-Host "Testing: $Script" -ForegroundColor Yellow
    
    # Test syntax using bash -n (no execution)
    $result = & $BashPath -n $Script 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ Syntax is valid" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Syntax errors found:" -ForegroundColor Red
        $result | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
        $ErrorCount++
    }
    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if ($ErrorCount -eq 0) {
    Write-Host "✓ All bash scripts have valid syntax!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "✗ Found $ErrorCount script(s) with syntax errors" -ForegroundColor Red
    exit 1
}

