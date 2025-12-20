# Test Coverage for New Features

## Overview

This document outlines the test coverage for the new plugin installation and system management features.

## Test Strategy

We use a **hybrid approach** for testing GitHub plugin installation:

1. **Mocked Tests** (default, fast, reliable)
   - Unit and integration tests with mocked GitHub API
   - Fast execution, no network dependencies
   - Run in all CI/CD pipelines
   - Test error cases and edge cases easily

2. **E2E Tests** (optional, real GitHub repository)
   - End-to-end tests using a real GitHub repository
   - Validate actual GitHub API integration
   - Marked as `@pytest.mark.e2e` and `@pytest.mark.slow`
   - Skip gracefully if network/repo unavailable
   - Can be run manually or in scheduled jobs

## New Test Files

### 1. `backend/tests/unit/test_plugin_installer_github.py`

**Purpose**: Unit tests for GitHub plugin installation functionality

**Test Classes**:
- `TestPluginEnumeration`: Tests plugin enumeration from repositories
  - Auto-discovery of plugins
  - Enumeration using `plugins.json` manifest
  - Skipping invalid plugins
  - Skipping common non-plugin directories

- `TestPluginInstallFromRepo`: Tests installing plugins from repositories
  - Basic installation from repo
  - Installation with frontend components
  - Path traversal protection
  - Error handling for non-existent plugins
  - Error handling for already installed plugins

- `TestVersionChecking`: Tests version checking during installation
  - Installing newer versions
  - Rejecting older versions
  - Disabling version checking

**Coverage**:
- ✅ Plugin enumeration (auto-discovery and manifest-based)
- ✅ Repository installation
- ✅ Frontend component installation from repos
- ✅ Version checking
- ✅ Security (path traversal protection)

### 2. `backend/tests/integration/test_api_plugins_github.py`

**Purpose**: Integration tests for GitHub plugin API endpoints

**Test Classes**:
- `TestGitHubPluginEnumeration`: Tests `/api/plugins/enumerate-from-github` endpoint
  - Successful enumeration
  - Branch fallback (main → master)
  - Error handling (not found, invalid URL)

- `TestGitHubPluginInstallation`: Tests `/api/plugins/install-from-github` endpoint
  - Successful installation
  - Branch fallback during installation
  - Missing parameters validation
  - Path traversal protection

- `TestPluginUninstallAPI`: Tests `/api/plugins/installed/{id}` DELETE endpoint
  - Successful uninstall
  - Uninstall with frontend components
  - Error handling for non-existent plugins

**Coverage**:
- ✅ GitHub enumeration API
- ✅ GitHub installation API
- ✅ Branch fallback logic
- ✅ Uninstall API
- ✅ Frontend component cleanup on uninstall

### 3. `backend/tests/integration/test_api_system.py`

**Purpose**: Integration tests for system management API endpoints

**Test Classes**:
- `TestSystemRestartEndpoints`: Tests restart endpoints
  - Restart backend (`/api/system/restart-backend`)
  - Restart frontend (`/api/system/restart-frontend`)
  - Fallback to dbus if systemctl fails
  - Error handling when all methods fail
  - Reload UI endpoint

- `TestSystemUpdateEndpoints`: Tests update endpoints
  - Get update status
  - Trigger update

**Coverage**:
- ✅ Backend restart API
- ✅ Frontend restart API
- ✅ Systemctl and dbus fallback
- ✅ Error handling
- ✅ Update status API

### 4. `backend/tests/e2e/test_github_plugin_e2e.py`

**Purpose**: End-to-end tests using a real GitHub repository

**Test Classes**:
- `TestGitHubPluginE2E`: Tests with real GitHub repository
  - Enumerate plugins from real repo
  - Install plugin from real repo
  - Branch fallback with real repo
  - Install plugin with frontend from real repo

**Coverage**:
- ✅ Real GitHub API integration
- ✅ Actual repository structure
- ✅ Network error handling
- ✅ Graceful skipping when unavailable

**Note**: These tests are marked `@pytest.mark.e2e` and `@pytest.mark.slow` and skip by default. See `backend/tests/e2e/TEST_REPO_SETUP.md` for setup instructions.

## Updated Test Files

### `backend/tests/conftest.py`
- Added `system` router to test app
- Added `temp_plugins_dir` and `temp_frontend_dir` fixtures (moved from test_plugin_installer.py for reuse)

## Test Statistics

### Unit Tests
- **New**: 12 tests in `test_plugin_installer_github.py`
- **Total**: All passing ✅

### Integration Tests
- **New**: ~15 tests across 2 new files
- **Total**: Tests for GitHub APIs, uninstall, and system endpoints

## Running Tests

### Run all new tests (mocked, fast)
```bash
cd backend
uv run pytest tests/unit/test_plugin_installer_github.py tests/integration/test_api_plugins_github.py tests/integration/test_api_system.py -v
```

### Run E2E tests (real GitHub, requires network)
```bash
# Set test repository (optional, has default)
export TEST_GITHUB_REPO="https://github.com/your-org/test-plugins"
uv run pytest tests/e2e/test_github_plugin_e2e.py -m e2e -v
```

### Run specific test class
```bash
uv run pytest tests/unit/test_plugin_installer_github.py::TestVersionChecking -v
```

### Run with coverage
```bash
uv run pytest --cov=app --cov-report=html tests/unit/test_plugin_installer_github.py
```

### Skip E2E tests (default in CI)
```bash
# E2E tests are skipped by default unless explicitly requested
uv run pytest -m "not e2e"  # Explicitly skip E2E
uv run pytest  # Also skips E2E (they're marked slow)
```

## Test Coverage Areas

### ✅ Fully Covered
- Plugin enumeration from repositories
- Plugin installation from repositories
- Frontend component installation
- Version checking
- Path traversal protection
- GitHub API integration (mocked)
- Branch fallback logic
- Plugin uninstall
- System restart endpoints

### ⚠️ Partially Covered
- Real GitHub API calls (mocked in integration tests, real in E2E tests)
- Polkit rules (tested via mocked subprocess calls)
- Frontend rebuild after component installation (not tested - requires build step)

### ✅ E2E Coverage (Optional)
- Real GitHub repository integration
- Actual network calls and error handling
- Real branch fallback behavior
- Actual plugin structure validation

### ❌ Not Covered (Future Work)
- End-to-end plugin installation flow
- Real GitHub repository access
- Frontend component loading after installation
- Polkit rule file creation (tested in integration, not unit)

## Testing Strategy

### Mocked Tests (Default)
**GitHub API**:
- Uses `unittest.mock.patch` to mock `httpx.AsyncClient.get`
- Returns mock zip file content
- Tests branch fallback by returning 404 then 200
- Fast, reliable, no network dependencies

**System Commands**:
- Uses `unittest.mock.patch` to mock `subprocess.run`
- Tests both success and failure scenarios
- Tests fallback from systemctl to dbus

### E2E Tests (Optional)
**Real GitHub Repository**:
- Uses actual `httpx.AsyncClient` to call GitHub API
- Tests with real repository structure
- Validates actual branch fallback behavior
- Gracefully skips if network/repo unavailable
- Can be configured via `TEST_GITHUB_REPO` environment variable

## Notes

- All tests use temporary directories for isolation
- Tests clean up after themselves
- Integration tests use mocked external services
- Unit tests focus on business logic
- Integration tests focus on API contracts

