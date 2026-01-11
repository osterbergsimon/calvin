#!/usr/bin/env bats
# Tests for setup-dev.sh development setup script

load 'helpers/test-helpers.bash'

setup() {
    setup_test_environment
}

teardown() {
    cleanup_test_environment
}

@test "setup-dev.sh script exists and is executable" {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    local setup_script="${script_dir}/setup-dev.sh"
    
    assert_file_exists "${setup_script}"
    [ -r "${setup_script}" ]
}

@test "setup-dev.sh has correct shebang" {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    local setup_script="${script_dir}/setup-dev.sh"
    
    run head -n 1 "${setup_script}"
    [ "$status" -eq 0 ]
    [[ "$output" == "#!/bin/bash"* ]]
}

@test "setup-dev.sh sources setup-common.sh correctly" {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    local setup_script="${script_dir}/setup-dev.sh"
    
    run grep -q "setup-common.sh" "${setup_script}"
    [ "$status" -eq 0 ]
}

@test "setup-dev.sh uses set -euo pipefail for strict error handling" {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    local setup_script="${script_dir}/setup-dev.sh"
    
    run grep -q "set -euo pipefail" "${setup_script}"
    [ "$status" -eq 0 ]
}

@test "setup-dev.sh sets up swap file" {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    local setup_script="${script_dir}/setup-dev.sh"
    
    # Check that it calls setup_swap_file
    run grep -q "setup_swap_file" "${setup_script}"
    [ "$status" -eq 0 ]
}

@test "setup-dev.sh uses venv for backend (dev mode)" {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    local setup_script="${script_dir}/setup-dev.sh"
    
    # Check that it uses venv (true parameter)
    run grep -q "install_backend_deps.*true" "${setup_script}"
    [ "$status" -eq 0 ]
}

@test "setup-dev.sh creates .dev marker file" {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    local setup_script="${script_dir}/setup-dev.sh"
    
    # Check for .dev marker file creation
    run grep -q "\.dev" "${setup_script}"
    [ "$status" -eq 0 ]
}

@test "setup-dev.sh creates dev-specific frontend service" {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    local setup_script="${script_dir}/setup-dev.sh"
    
    # Check for dev service creation
    run grep -q "calvin-frontend-dev" "${setup_script}"
    [ "$status" -eq 0 ]
}

@test "setup-dev.sh configures dev server URL (port 5173)" {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    local setup_script="${script_dir}/setup-dev.sh"
    
    # Check for port 5173 (dev server)
    run grep -q "5173" "${setup_script}"
    [ "$status" -eq 0 ]
}

@test "setup-dev.sh includes verification step" {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    local setup_script="${script_dir}/setup-dev.sh"
    
    # Check for verification
    run grep -q "verify_setup" "${setup_script}"
    [ "$status" -eq 0 ]
}
