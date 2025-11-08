# Comprehensive test runner for Raspberry Pi image configuration
# Tests file structure, syntax, and configuration

param(
    [switch]$Verbose
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Calvin RPi Image - Comprehensive Tests" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Run validation tests
Write-Host "1. Running validation tests..." -ForegroundColor Yellow
& "$ScriptDir\validate.ps1"
$ValidationResult = $LASTEXITCODE
Write-Host ""

# Run bash syntax tests
Write-Host "2. Running bash syntax tests..." -ForegroundColor Yellow
& "$ScriptDir\test-bash-syntax.ps1"
$BashResult = $LASTEXITCODE
Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$AllPassed = ($ValidationResult -eq 0) -and ($BashResult -eq 0)

if ($AllPassed) {
    Write-Host "✓ All tests passed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Review configuration files (WiFi, SSH keys, etc.)" -ForegroundColor White
    Write-Host "  2. Test on actual Raspberry Pi" -ForegroundColor White
    Write-Host "  3. Flash image and verify first boot" -ForegroundColor White
    exit 0
} else {
    Write-Host "✗ Some tests failed. Please review errors above." -ForegroundColor Red
    exit 1
}

