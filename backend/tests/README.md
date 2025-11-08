# Backend Tests

This directory contains tests for the Calvin backend.

## Structure

- `conftest.py` - Pytest configuration and shared fixtures
- `unit/` - Unit tests for individual components
- `integration/` - Integration tests for API endpoints

## Running Tests

### All tests
```bash
cd backend
uv run pytest
```

### Unit tests only
```bash
uv run pytest tests/unit/
```

### Integration tests only
```bash
uv run pytest tests/integration/
```

### With coverage
```bash
uv run pytest --cov=app --cov-report=html --cov-report=term
```

### Specific test file
```bash
uv run pytest tests/unit/test_config_service.py
```

### Specific test
```bash
uv run pytest tests/unit/test_config_service.py::test_set_and_get_value
```

## Test Markers

Tests are marked with markers for easy filtering:

- `@pytest.mark.unit` - Unit tests
- `@pytest.mark.integration` - Integration tests
- `@pytest.mark.e2e` - End-to-end tests
- `@pytest.mark.slow` - Slow running tests

Run tests by marker:
```bash
uv run pytest -m unit
uv run pytest -m integration
```

## Fixtures

Common fixtures available in `conftest.py`:

- `test_db` - Async database session for testing
- `test_client` - FastAPI test client
- `temp_db_path` - Temporary database file path
- `temp_image_dir` - Temporary directory for test images
- `mock_env_vars` - Mocked environment variables

