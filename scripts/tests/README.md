# Setup Scripts Testing

This directory contains tests for the Calvin setup scripts.

## Test Structure

- `setup-common.bats` - Tests for utility functions in `setup-common.sh`
- `setup.bats` - Tests for the mode-aware Raspberry Pi setup script and the `setup-dev.sh` compatibility wrapper
- `helpers/` - Test helper functions and mocks

## Running Tests

### Bash Script Tests (using bats)

First, install bats-core:

```bash
# macOS
brew install bats-core

# Ubuntu/Debian
sudo apt-get install bats

# Or install via npm
npm install -g bats
```

Run all tests:
```bash
cd scripts
bats tests/
```

Run specific test file:
```bash
bats tests/setup-common.bats
```

### PowerShell Script Tests (using Pester)

First, install Pester (if not already installed):
```powershell
Install-Module -Name Pester -Force -SkipPublisherCheck
```

Run tests:
```powershell
cd scripts
Invoke-Pester tests/setup-windows.Tests.ps1
```

## Test Approach

These tests use mocking to avoid requiring root access or making actual system changes. They test:

1. **Function Logic** - Verify functions behave correctly with mocked dependencies
2. **Error Handling** - Ensure proper error messages and exit codes
3. **Path and Variable Handling** - Check that paths and configurations are handled correctly
4. **Integration Flow** - Verify the main setup flow calls functions in the correct order

## Limitations

Since these scripts perform system-level operations, full integration testing would require:
- Root access
- Clean system environment
- Ability to create/delete users
- Ability to install/uninstall packages

The tests here focus on verifiable logic without requiring these capabilities.
