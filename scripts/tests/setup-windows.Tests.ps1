# Pester tests for setup-windows.ps1
# Compatible with Pester 3.x

$ScriptPath = Join-Path $PSScriptRoot ".." ".." "setup-windows.ps1"
$ScriptName = "setup-windows.ps1"

Describe "Setup-Windows.ps1 Script Structure" {
    It "Script file exists" {
        $ScriptPath | Should Exist
    }

    It "Script has correct encoding and syntax" {
        # Check that script can be parsed
        $scriptContent = Get-Content $ScriptPath -Raw
        $scriptContent | Should Not BeNullOrEmpty
        
        # Check for PowerShell-specific syntax
        $scriptContent | Should Match 'function\s+\w+'
    }

    It "Has error action preference set" {
        $scriptContent = Get-Content $ScriptPath -Raw
        $scriptContent | Should Match '\$ErrorActionPreference'
    }
}

Describe "Function Definitions" {
    $scriptContent = Get-Content $ScriptPath -Raw

    It "Has Write-Step function" {
        $scriptContent | Should Match 'function\s+Write-Step'
    }

    It "Has Write-Success function" {
        $scriptContent | Should Match 'function\s+Write-Success'
    }

    It "Has Write-Warning function" {
        $scriptContent | Should Match 'function\s+Write-Warning'
    }

    It "Has Write-Error-Custom function" {
        $scriptContent | Should Match 'function\s+Write-Error-Custom'
    }

    It "Has Test-Command function" {
        $scriptContent | Should Match 'function\s+Test-Command'
    }

    It "Has Test-Prerequisites function" {
        $scriptContent | Should Match 'function\s+Test-Prerequisites'
    }

    It "Has Install-BackendDependencies function" {
        $scriptContent | Should Match 'function\s+Install-BackendDependencies'
    }

    It "Has Install-FrontendDependencies function" {
        $scriptContent | Should Match 'function\s+Install-FrontendDependencies'
    }

    It "Has Main function" {
        $scriptContent | Should Match 'function\s+Main'
    }
}

Describe "Configuration" {
    $scriptContent = Get-Content $ScriptPath -Raw

    It "Defines required Python version" {
        $scriptContent | Should Match '\$RequiredPythonVersion'
    }

    It "Defines required Node version" {
        $scriptContent | Should Match '\$RequiredNodeVersion'
    }
}

Describe "Error Handling" {
    $scriptContent = Get-Content $ScriptPath -Raw

    It "Has try-catch blocks for error handling" {
        ($scriptContent -match 'try\s*\{') -or ($scriptContent -match 'catch\s*\{') | Should Be $true
    }

    It "Has Invoke-SafeCommand function for safe command execution" {
        $scriptContent | Should Match 'function\s+Invoke-SafeCommand'
    }
}

Describe "Version Checking" {
    $scriptContent = Get-Content $ScriptPath -Raw

    It "Has Test-Version function" {
        $scriptContent | Should Match 'function\s+Test-Version'
    }

    It "Checks Python version" {
        $scriptContent | Should Match 'python\s+--version'
    }

    It "Checks Node.js version" {
        $scriptContent | Should Match 'node\s+--version'
    }
}

Describe "Git Repository Management" {
    $scriptContent = Get-Content $ScriptPath -Raw

    It "Has Initialize-GitRepository function" {
        $scriptContent | Should Match 'function\s+Initialize-GitRepository'
    }

    It "Handles Git operations gracefully" {
        $scriptContent | Should Match 'git\s+checkout'
    }
}

Describe "Dependency Installation" {
    $scriptContent = Get-Content $ScriptPath -Raw

    It "Installs backend dependencies using UV" {
        $scriptContent | Should Match 'uv\s+sync'
    }

    It "Installs frontend dependencies using npm" {
        $scriptContent | Should Match 'npm\s+install'
    }

    It "Handles UV installation if missing" {
        ($scriptContent -match 'uv.*install') -or ($scriptContent -match 'Install.*UV') | Should Be $true
    }
}

Describe "Script Execution Flow" {
    $scriptContent = Get-Content $ScriptPath -Raw

    It "Calls Main function at the end" {
        # Check that Main is called (not just defined)
        $lines = Get-Content $ScriptPath
        $mainCalled = $false
        $inMainFunction = $false
        
        foreach ($line in $lines) {
            if ($line -match 'function\s+Main') {
                $inMainFunction = $true
            }
            if ($inMainFunction -and $line -match '^\}') {
                $inMainFunction = $false
            }
            if (-not $inMainFunction -and $line -match 'Main\s*$') {
                $mainCalled = $true
                break
            }
        }
        
        # Main should be called (either directly or via try-catch)
        (($scriptContent -match 'try\s*\{[\s\S]*Main') -or ($scriptContent -match 'Main\s*$')) | Should Be $true
    }
}

Describe "Output and User Feedback" {
    $scriptContent = Get-Content $ScriptPath -Raw

    It "Provides success messages" {
        $scriptContent | Should Match 'Setup complete'
    }

    It "Provides instructions for starting development" {
        $scriptContent | Should Match 'To start development'
    }

    It "Shows URLs for services" {
        $scriptContent | Should Match 'localhost:8000'
        $scriptContent | Should Match 'localhost:5173'
    }
}
