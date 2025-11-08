# PowerShell script to validate Raspberry Pi image configuration files
# This validates syntax and structure without requiring bash/WSL

param(
    [switch]$Verbose
)

$ErrorCount = 0
$WarningCount = 0

function Write-Status {
    param([string]$Message, [string]$Type = "Info")
    $color = switch ($Type) {
        "Error" { "Red" }
        "Warning" { "Yellow" }
        "Success" { "Green" }
        default { "Cyan" }
    }
    Write-Host $Message -ForegroundColor $color
}

function Test-BashScript {
    param([string]$Path)
    
    if (-not (Test-Path $Path)) {
        Write-Status "ERROR: File not found: $Path" "Error"
        $script:ErrorCount++
        return $false
    }
    
    $content = Get-Content $Path -Raw
    $issues = @()
    
    # Check for common bash syntax issues
    if ($content -match '`[^`]*`') {
        # Check for unclosed backticks (basic check)
        $backticks = ([regex]::Matches($content, '`')).Count
        if ($backticks % 2 -ne 0) {
            $issues += "Unclosed backticks detected"
        }
    }
    
    # Check for set -e (good practice)
    if ($content -notmatch 'set\s+-e') {
        $issues += "Missing 'set -e' (error handling)"
    }
    
    # Check for shebang
    if ($content -notmatch '^#!/bin/bash') {
        $issues += "Missing or incorrect shebang"
    }
    
    # Check for common path issues
    if ($content -match '\$HOME' -and $content -notmatch 'export PATH.*HOME') {
        $issues += "Uses \$HOME but may not export PATH correctly"
    }
    
    if ($issues.Count -eq 0) {
        Write-Status "✓ $Path - Syntax looks good" "Success"
        return $true
    } else {
        Write-Status "⚠ $Path - Issues found:" "Warning"
        foreach ($issue in $issues) {
            Write-Status "  - $issue" "Warning"
        }
        $script:WarningCount++
        return $true
    }
}

function Test-YamlFile {
    param([string]$Path)
    
    if (-not (Test-Path $Path)) {
        Write-Status "ERROR: File not found: $Path" "Error"
        $script:ErrorCount++
        return $false
    }
    
    $content = Get-Content $Path -Raw
    $issues = @()
    
    # Basic YAML validation
    $lines = Get-Content $Path
    $indentStack = @()
    
    foreach ($line in $lines) {
        if ($line.Trim() -eq '' -or $line.Trim().StartsWith('#')) {
            continue
        }
        
        # Check for common YAML issues
        if ($line -match '^\s*-\s*$' -and $line -notmatch '^\s*-\s*name:') {
            # Empty list item might be an issue
        }
        
        # Check for tabs (should use spaces)
        if ($line -match "`t") {
            $issues += "Line contains tabs (should use spaces)"
        }
    }
    
    # Check for required cloud-init fields
    if ($Path -match 'user-data') {
        if ($content -notmatch 'hostname:') {
            $issues += "Missing 'hostname' field"
        }
        if ($content -notmatch 'users:') {
            $issues += "Missing 'users' field"
        }
    }
    
    if ($issues.Count -eq 0) {
        Write-Status "✓ $Path - YAML structure looks good" "Success"
        return $true
    } else {
        Write-Status "⚠ $Path - Issues found:" "Warning"
        foreach ($issue in $issues) {
            Write-Status "  - $issue" "Warning"
        }
        $script:WarningCount++
        return $true
    }
}

function Test-SystemdService {
    param([string]$Path)
    
    if (-not (Test-Path $Path)) {
        Write-Status "ERROR: File not found: $Path" "Error"
        $script:ErrorCount++
        return $false
    }
    
    $content = Get-Content $Path -Raw
    $issues = @()
    
    # Check for required sections
    if ($content -notmatch '\[Unit\]') {
        $issues += "Missing [Unit] section"
    }
    if ($content -notmatch '\[Service\]') {
        $issues += "Missing [Service] section"
    }
    if ($content -notmatch '\[Install\]') {
        $issues += "Missing [Install] section"
    }
    
    # Check for ExecStart
    if ($content -notmatch 'ExecStart=') {
        $issues += "Missing ExecStart directive"
    }
    
    # Check for User directive
    if ($content -notmatch 'User=') {
        $issues += "Missing User directive (security concern)"
    }
    
    if ($issues.Count -eq 0) {
        Write-Status "✓ $Path - Systemd service looks good" "Success"
        return $true
    } else {
        Write-Status "⚠ $Path - Issues found:" "Warning"
        foreach ($issue in $issues) {
            Write-Status "  - $issue" "Warning"
        }
        $script:WarningCount++
        return $true
    }
}

function Test-SystemdTimer {
    param([string]$Path)
    
    if (-not (Test-Path $Path)) {
        Write-Status "ERROR: File not found: $Path" "Error"
        $script:ErrorCount++
        return $false
    }
    
    $content = Get-Content $Path -Raw
    $issues = @()
    
    # Check for required sections
    if ($content -notmatch '\[Unit\]') {
        $issues += "Missing [Unit] section"
    }
    if ($content -notmatch '\[Timer\]') {
        $issues += "Missing [Timer] section"
    }
    
    # Check for timer directives
    if ($content -notmatch 'OnUnitActiveSec=|OnCalendar=|OnBootSec=') {
        $issues += "Missing timer directive (OnUnitActiveSec, OnCalendar, or OnBootSec)"
    }
    
    if ($issues.Count -eq 0) {
        Write-Status "✓ $Path - Systemd timer looks good" "Success"
        return $true
    } else {
        Write-Status "⚠ $Path - Issues found:" "Warning"
        foreach ($issue in $issues) {
            Write-Status "  - $issue" "Warning"
        }
        $script:WarningCount++
        return $true
    }
}

function Test-PathExists {
    param([string]$Path, [string]$Description)
    
    if (Test-Path $Path) {
        Write-Status "✓ $Description exists: $Path" "Success"
        return $true
    } else {
        Write-Status "✗ $Description missing: $Path" "Error"
        $script:ErrorCount++
        return $false
    }
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Calvin RPi Image Configuration Validator" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

# Test file structure
Write-Host "Testing file structure..." -ForegroundColor Yellow
Test-PathExists "$ScriptDir\first-boot\setup.sh" "Production setup script"
Test-PathExists "$ScriptDir\first-boot\setup-dev.sh" "Development setup script"
Test-PathExists "$ScriptDir\cloud-init\user-data.yml" "Production cloud-init config"
Test-PathExists "$ScriptDir\cloud-init\user-data-dev.yml" "Development cloud-init config"
Test-PathExists "$ScriptDir\systemd\calvin-backend.service" "Backend service file"
Test-PathExists "$ScriptDir\systemd\calvin-frontend.service" "Frontend service file"
Test-PathExists "$ScriptDir\systemd\calvin-update.service" "Update service file"
Test-PathExists "$ScriptDir\systemd\calvin-update.timer" "Update timer file"
Test-PathExists "$ProjectRoot\scripts\update-calvin.sh" "Update script"
Write-Host ""

# Test bash scripts
Write-Host "Testing bash scripts..." -ForegroundColor Yellow
Test-BashScript "$ScriptDir\first-boot\setup.sh"
Test-BashScript "$ScriptDir\first-boot\setup-dev.sh"
Test-BashScript "$ProjectRoot\scripts\update-calvin.sh"
Write-Host ""

# Test YAML files
Write-Host "Testing YAML files..." -ForegroundColor Yellow
Test-YamlFile "$ScriptDir\cloud-init\user-data.yml"
Test-YamlFile "$ScriptDir\cloud-init\user-data-dev.yml"
Write-Host ""

# Test systemd files
Write-Host "Testing systemd service files..." -ForegroundColor Yellow
Test-SystemdService "$ScriptDir\systemd\calvin-backend.service"
Test-SystemdService "$ScriptDir\systemd\calvin-frontend.service"
Test-SystemdService "$ScriptDir\systemd\calvin-update.service"
Test-SystemdTimer "$ScriptDir\systemd\calvin-update.timer"
Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Validation Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Errors: $ErrorCount" -ForegroundColor $(if ($ErrorCount -eq 0) { "Green" } else { "Red" })
Write-Host "Warnings: $WarningCount" -ForegroundColor $(if ($WarningCount -eq 0) { "Green" } else { "Yellow" })
Write-Host ""

if ($ErrorCount -eq 0) {
    Write-Host "✓ All required files exist and basic validation passed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Note: This is a basic validation. For full testing:" -ForegroundColor Yellow
    Write-Host "  1. Use Git Bash (if available) to test bash syntax" -ForegroundColor White
    Write-Host "  2. Test on actual Raspberry Pi for full validation" -ForegroundColor White
    Write-Host "  3. Use shellcheck (Linux/WSL) for advanced bash linting" -ForegroundColor White
    exit 0
} else {
    Write-Host "✗ Validation failed with $ErrorCount error(s)" -ForegroundColor Red
    exit 1
}

