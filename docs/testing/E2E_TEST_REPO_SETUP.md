# Test Repository Setup for E2E Tests

This document explains how to set up a test GitHub repository for end-to-end testing of the plugin installation system.

## Overview

The E2E tests (`test_github_plugin_e2e.py`) use a real GitHub repository to validate the full plugin installation flow. This provides confidence that the system works with real-world GitHub repositories.

## Creating a Test Repository

### Option 1: Use an Existing Test Repository

If a test repository already exists, set the environment variable:

```bash
export TEST_GITHUB_REPO="https://github.com/your-org/test-plugins"
export TEST_GITHUB_BRANCH="main"  # Optional, defaults to "main"
```

### Option 2: Create Your Own Test Repository

1. **Create a new GitHub repository** (public or private with appropriate access)

2. **Repository structure**:
   ```
   test-plugins/
   ├── plugins.json          # Optional: manifest file
   ├── plugin1/
   │   ├── plugin.json
   │   └── plugin.py
   ├── plugin2/
   │   ├── plugin.json
   │   ├── plugin.py
   │   └── frontend/
   │       └── dist.js
   └── README.md
   ```

3. **Example plugin.json**:
   ```json
   {
     "id": "test_e2e_plugin",
     "name": "Test E2E Plugin",
     "version": "1.0.0",
     "type": "service",
     "description": "A test plugin for E2E testing",
     "author": "Test Author",
     "license": "MIT"
   }
   ```

4. **Example plugin.py**:
   ```python
   """Test plugin for E2E testing."""
   from typing import Any
   from app.plugins.base import PluginType
   from app.plugins.hooks import hookimpl

   @hookimpl
   def register_plugin_types() -> list[dict[str, Any]]:
       """Register plugin type."""
       return [{
           "type_id": "test_e2e_plugin",
           "plugin_type": PluginType.SERVICE
       }]
   ```

5. **Optional: plugins.json manifest**:
   ```json
   {
     "plugins": [
       {
         "id": "test_e2e_plugin",
         "name": "Test E2E Plugin",
         "path": "plugin1",
         "version": "1.0.0",
         "type": "service",
         "description": "A test plugin for E2E testing"
       }
     ]
   }
   ```

6. **Push to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Test plugins for E2E testing"
   git remote add origin https://github.com/your-org/test-plugins.git
   git push -u origin main
   ```

## Running E2E Tests

### Run all E2E tests:
```bash
cd backend
uv run pytest tests/e2e/test_github_plugin_e2e.py -m e2e -v
```

### Run with custom repository:
```bash
TEST_GITHUB_REPO="https://github.com/your-org/test-plugins" \
uv run pytest tests/e2e/test_github_plugin_e2e.py -m e2e -v
```

### Skip E2E tests (default in CI):
```bash
# E2E tests are marked with @pytest.mark.e2e and @pytest.mark.slow
# They won't run unless explicitly requested
uv run pytest  # Skips E2E tests
```

## Test Behavior

- **Network check**: Tests skip if network is unavailable
- **Repository check**: Tests skip if repository doesn't exist or is inaccessible
- **Graceful degradation**: Tests provide helpful skip messages
- **Cleanup**: Tests clean up installed plugins after running

## CI/CD Integration

E2E tests are marked with `@pytest.mark.e2e` and `@pytest.mark.slow`, so they:

- **Skip by default** in CI/CD pipelines (fast, reliable builds)
- **Can be run manually** for validation
- **Can be run in scheduled jobs** (e.g., nightly builds)

### Example CI configuration:

```yaml
# .github/workflows/test.yml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Run unit and integration tests
        run: uv run pytest -m "not e2e"  # Skip E2E tests

  test-e2e:
    runs-on: ubuntu-latest
    if: github.event_name == 'schedule'  # Run on schedule only
    steps:
      - name: Run E2E tests
        run: |
          export TEST_GITHUB_REPO="https://github.com/calvin-dashboard/test-plugins"
          uv run pytest tests/e2e/ -m e2e -v
```

## Benefits of E2E Tests

1. **Real-world validation**: Tests actual GitHub API integration
2. **Catch integration issues**: Network problems, rate limits, API changes
3. **Validate branch fallback**: Real main/master branch behavior
4. **Test actual plugin structure**: Real plugin.json and plugin.py files

## Trade-offs

### Mocked Tests (Default)
- ✅ Fast (no network calls)
- ✅ Reliable (no external dependencies)
- ✅ Test error cases easily
- ✅ Run in CI/CD without network

### E2E Tests (Optional)
- ✅ Real-world validation
- ✅ Catch integration issues
- ❌ Slower (network calls)
- ❌ Can be flaky (network issues)
- ❌ Require internet connection

## Recommendation

- **Use mocked tests** for regular CI/CD (fast, reliable)
- **Use E2E tests** for:
  - Manual validation before releases
  - Scheduled nightly builds
  - Local development validation
  - Debugging integration issues
