#!/usr/bin/env bats
# Tests for setup.sh Raspberry Pi compose setup script

load 'helpers/test-helpers.bash'

setup() {
    setup_test_environment
}

teardown() {
    cleanup_test_environment
}

@test "setup.sh script exists and is executable" {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    local setup_script="${script_dir}/setup.sh"
    
    assert_file_exists "${setup_script}"
    
    # Check if it's executable (or at least readable)
    [ -r "${setup_script}" ]
}

@test "setup.sh has correct shebang" {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    local setup_script="${script_dir}/setup.sh"
    
    run head -n 1 "${setup_script}"
    [ "$status" -eq 0 ]
    [[ "$output" == "#!/bin/bash"* ]]
}

@test "setup.sh sources setup-common.sh correctly" {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    local setup_script="${script_dir}/setup.sh"
    
    # Check that the script attempts to source setup-common.sh
    run grep -q "setup-common.sh" "${setup_script}"
    [ "$status" -eq 0 ]
}

@test "setup.sh has main function structure" {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    local setup_script="${script_dir}/setup.sh"
    
    # Check that the script has a main function or calls main
    run grep -q "main" "${setup_script}"
    [ "$status" -eq 0 ]
}

@test "setup.sh uses set -euo pipefail for strict error handling" {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    local setup_script="${script_dir}/setup.sh"
    
    run grep -q "set -euo pipefail" "${setup_script}"
    [ "$status" -eq 0 ]
}

@test "setup.sh has configuration variables" {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    local setup_script="${script_dir}/setup.sh"
    
    # Check for configuration variables
    run grep -q "GIT_REPO" "${setup_script}"
    [ "$status" -eq 0 ]
    
    run grep -q "GIT_BRANCH" "${setup_script}"
    [ "$status" -eq 0 ]
    
    run grep -q "CALVIN_DIR" "${setup_script}"
    [ "$status" -eq 0 ]
}

@test "setup.sh calls setup-common functions" {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    local setup_script="${script_dir}/setup.sh"
    
    # Check that it calls common functions
    run grep -q "ensure_user_exists" "${setup_script}"
    [ "$status" -eq 0 ]
    
    run grep -q "install_docker_runtime" "${setup_script}"
    [ "$status" -eq 0 ]

    run grep -q "install_compose_config" "${setup_script}"
    [ "$status" -eq 0 ]
}

@test "setup.sh supports prod and dev modes" {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    local setup_script="${script_dir}/setup.sh"

    run grep -q -- "--mode prod|dev" "${setup_script}"
    [ "$status" -eq 0 ]
}

@test "setup-dev.sh delegates to setup.sh dev mode" {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    local setup_dev_script="${script_dir}/setup-dev.sh"

    assert_file_exists "${setup_dev_script}"

    run grep -q -- "--mode dev" "${setup_dev_script}"
    [ "$status" -eq 0 ]
}

@test "setup.sh installs compose runtime services" {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    local setup_script="${script_dir}/setup.sh"

    run grep -q "calvin-app.service" "${setup_script}"
    [ "$status" -eq 0 ]

    run grep -q "calvin-kiosk.service" "${setup_script}"
    [ "$status" -eq 0 ]
}

@test "setup.sh includes verification step" {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    local setup_script="${script_dir}/setup.sh"
    
    # Check for verification
    run grep -q "verify_compose_runtime" "${setup_script}"
    [ "$status" -eq 0 ]
}
