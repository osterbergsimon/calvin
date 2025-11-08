# Simple make.ps1 wrapper for Windows
# Usage: .\make.ps1 <target>

param(
    [Parameter(Position=0)]
    [string]$Target = "help"
)

# Call the Makefile.ps1
& "$PSScriptRoot\Makefile.ps1" -Target $Target

