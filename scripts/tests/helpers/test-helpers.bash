#!/bin/bash
# Test helper functions for setup script tests

# Mock directories for testing
export TEST_TMPDIR=""
export TEST_USER="testuser"
export TEST_CALVIN_DIR=""

# Setup test environment
setup_test_environment() {
    TEST_TMPDIR=$(mktemp -d)
    TEST_CALVIN_DIR="${TEST_TMPDIR}/calvin"
    mkdir -p "${TEST_CALVIN_DIR}"/{backend,frontend}
    mkdir -p "${TEST_TMPDIR}"/log
}

# Cleanup test environment
cleanup_test_environment() {
    if [ -n "${TEST_TMPDIR}" ] && [ -d "${TEST_TMPDIR}" ]; then
        rm -rf "${TEST_TMPDIR}"
    fi
}

# Mock command wrapper
mock_command() {
    local cmd="$1"
    local mock_script="$2"
    
    # Create a mock script in a temporary bin directory
    local mock_bin="${TEST_TMPDIR}/bin"
    mkdir -p "${mock_bin}"
    
    cat > "${mock_bin}/${cmd}" << EOF
#!/bin/bash
${mock_script}
EOF
    chmod +x "${mock_bin}/${cmd}"
    
    # Add to PATH (prepend so it's found first)
    export PATH="${mock_bin}:${PATH}"
}

# Assert that a command exists in PATH
assert_command_exists() {
    local cmd="$1"
    if ! command -v "${cmd}" &> /dev/null; then
        echo "ERROR: Command ${cmd} not found in PATH"
        return 1
    fi
    return 0
}

# Assert file exists
assert_file_exists() {
    local file="$1"
    if [ ! -f "${file}" ]; then
        echo "ERROR: File ${file} does not exist"
        return 1
    fi
    return 0
}

# Assert directory exists
assert_dir_exists() {
    local dir="$1"
    if [ ! -d "${dir}" ]; then
        echo "ERROR: Directory ${dir} does not exist"
        return 1
    fi
    return 0
}

# Assert file contains text
assert_file_contains() {
    local file="$1"
    local text="$2"
    if ! grep -q "${text}" "${file}"; then
        echo "ERROR: File ${file} does not contain '${text}'"
        return 1
    fi
    return 0
}

# Source setup-common.sh in test mode (with mocked functions)
source_setup_common_test() {
    # Source the actual setup-common.sh
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
    if [ -f "${script_dir}/setup-common.sh" ]; then
        # Source it but override system commands with mocks
        source "${script_dir}/setup-common.sh"
    else
        echo "ERROR: setup-common.sh not found"
        return 1
    fi
}
