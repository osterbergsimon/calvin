# Setup Scripts Testing

This directory contains tests for the Calvin setup scripts.

## Test Structure

- `setup-common.bats` - Tests for utility functions in `setup-common.sh`
- `setup.bats` - Tests for the mode-aware Raspberry Pi setup script and the `setup-dev.sh` compatibility wrapper
- `test_default_kiosk_id.sh` - Verifies `compute_default_kiosk_id()` / `compute_default_kiosk_hostname()` in `setup-kiosk.sh` (stable `<hostname>-<6hex>` id, machine-id-derived suffix, hostname sanitized to `[A-Za-z0-9.-]`)
- `test_kiosk_id_persists.sh` - Regression test: an operator-set `CALVIN_KIOSK_ID` / `CALVIN_KIOSK_HOSTNAME` survives re-running `install_kiosk_config()`
- `test_install_authorized_key.sh` - Verifies `install_authorized_key()` appends an SSH key once, idempotently, with 0600 perms
- `test_firstboot_wrapper.sh` - Verifies the boot-2 firstboot wrapper runs setup once, is idempotent via a sentinel, and reboots
- `test_bake_kiosk_firstrun_args.sh` - Verifies `bake-kiosk-firstrun.sh` argument validation and raw-URL derivation
- `test_bake_kiosk_firstrun_emit.sh` - Verifies `emit_firstrun` bakes host/wifi/ssh/config into the generated `firstrun.sh`
- `test_bake_kiosk_firstrun_cmdline.sh` - Verifies `main()` writes `firstrun.sh` and appends the `cmdline.txt` hook exactly once
- `helpers/` - Test helper functions and mocks

The two `test_*.sh` files are plain bash (no bats needed) and run in CI via the
`Run scripts/tests/*.sh` step in `.github/workflows/setup-validation.yml`.

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

### Standalone shell tests (no bats)

The `test_*.sh` files run directly with bash and exit non-zero on failure:

```bash
bash scripts/tests/test_default_kiosk_id.sh
bash scripts/tests/test_kiosk_id_persists.sh
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
