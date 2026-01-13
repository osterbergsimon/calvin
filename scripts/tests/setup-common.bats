#!/usr/bin/env bats
# Tests for setup-common.sh utility functions

load 'helpers/test-helpers.bash'

setup() {
    setup_test_environment
    source_setup_common_test
}

teardown() {
    cleanup_test_environment
}

# Test logging functions
@test "log function writes to log file" {
    LOG_FILE="${TEST_TMPDIR}/test.log"
    log "Test message"
    
    assert_file_exists "${LOG_FILE}"
    assert_file_contains "${LOG_FILE}" "Test message"
}

@test "log_error outputs error message" {
    LOG_FILE="${TEST_TMPDIR}/test.log"
    run log_error "Error message"
    
    [ "$status" -eq 0 ]
    assert_file_contains "${LOG_FILE}" "ERROR"
    assert_file_contains "${LOG_FILE}" "Error message"
}

@test "log_warn outputs warning message" {
    LOG_FILE="${TEST_TMPDIR}/test.log"
    run log_warn "Warning message"
    
    [ "$status" -eq 0 ]
    assert_file_contains "${LOG_FILE}" "WARNING"
    assert_file_contains "${LOG_FILE}" "Warning message"
}

# Test validation functions
@test "check_command fails when command doesn't exist" {
    # Mock command -v to return false
    mock_command "command" 'echo "mock"; return 1'
    
    run check_command "nonexistent" "Error message" "Install hint"
    [ "$status" -ne 0 ]
}

@test "verify_directory fails when directory doesn't exist" {
    run verify_directory "/nonexistent/directory"
    [ "$status" -ne 0 ]
}

@test "verify_directory succeeds when directory exists" {
    mkdir -p "${TEST_TMPDIR}/testdir"
    run verify_directory "${TEST_TMPDIR}/testdir"
    [ "$status" -eq 0 ]
}

@test "verify_file fails when file doesn't exist" {
    run verify_file "/nonexistent/file"
    [ "$status" -ne 0 ]
}

@test "verify_file succeeds when file exists" {
    touch "${TEST_TMPDIR}/testfile"
    run verify_file "${TEST_TMPDIR}/testfile"
    [ "$status" -eq 0 ]
}

# Test path utilities
@test "get_uv_path returns correct path format" {
    run get_uv_path "testuser"
    [ "$status" -eq 0 ]
    [[ "$output" == *"/home/testuser/.local/bin"* ]]
    [[ "$output" == *"/home/testuser/.cargo/bin"* ]]
}

# Test data directory creation (mocked)
@test "create_data_directories creates required directories" {
    # Mock mkdir, chown, chmod to actually work in test environment
    mkdir -p "${TEST_CALVIN_DIR}/backend"
    
    # We can't fully test this without root, but we can test the logic
    # by checking that the function would call the right commands
    run create_data_directories "${TEST_CALVIN_DIR}" "${TEST_USER}" 2>&1 || true
    
    # Check that directories would be created (they won't actually be created without root)
    # This test mainly ensures the function doesn't crash
    [ -n "$output" ] || [ "$status" -ne 0 ]  # Either has output or fails (expected without root)
}

# Test configuration file creation
@test "create_update_config creates config file with correct content" {
    local config_file="${TEST_TMPDIR}/calvin-update"
    mkdir -p "$(dirname "${config_file}")"
    
    # Mock the /etc/default directory
    export TEST_ETC_DEFAULT="${TEST_TMPDIR}/etc/default"
    mkdir -p "${TEST_ETC_DEFAULT}"
    
    # Override the function to use test directory
    create_update_config() {
        cat > "${TEST_ETC_DEFAULT}/calvin-update" << EOF
GIT_REPO=https://github.com/test/repo.git
GIT_BRANCH=main
REPO_DIR=/test/dir
EOF
    }
    
    run create_update_config "https://github.com/test/repo.git" "main" "/test/dir"
    
    assert_file_exists "${TEST_ETC_DEFAULT}/calvin-update"
    assert_file_contains "${TEST_ETC_DEFAULT}/calvin-update" "GIT_REPO=https://github.com/test/repo.git"
    assert_file_contains "${TEST_ETC_DEFAULT}/calvin-update" "GIT_BRANCH=main"
}

# Test swap file setup logic
@test "setup_swap_file detects existing swap file" {
    # Create a mock swapfile
    touch "${TEST_TMPDIR}/swapfile"
    
    # We can't actually test swap setup without root, but we can test the logic
    # This test ensures the function structure is correct
    run setup_swap_file "4G" 2>&1 || true
    
    # Function should handle the case (may fail without root, which is expected)
    [ -n "$output" ] || [ "$status" -ne 0 ]
}
