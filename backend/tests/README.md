# Backend tests

## Schema is built from Alembic migrations

`create_tables_with_verify()` runs `alembic upgrade head` against each test's
temp SQLite file. This means a broken migration fails the suite instead of
slipping through — `metadata.create_all()` would have hidden it.

If you change a model: generate a migration (`alembic revision --autogenerate`)
and run the tests. If you change a migration: the existing tests are your
parity check.

The Alembic env (`backend/alembic/env.py`) honors a programmatic URL set via
`Config.set_main_option("sqlalchemy.url", ...)`; it only falls back to
`settings.database_url` when the .ini's placeholder is still in place.

## Ormar model registration ordering

The single most important rule for working in `conftest.py` and `_support/db.py`:

> **Import `app.models.db_models` at module top, before any fixture runs.**

### Why

Ormar registers each model's table on `app.database.metadata` as a side effect of
class definition. If a fixture is the first place a model is imported, Ormar
registers the table inside the fixture's call frame — but `metadata.create_all()`
calls in *other* fixtures (or earlier in the same fixture) have already run
against an empty `metadata` object, silently creating zero tables.

The symptom is opaque: `metadata.create_all()` returns success, then the first
query fails with `no such table: plugins`.

### The guard

`tests/_support/db.py::assert_models_registered()` runs at conftest import time
and raises if `metadata.tables` doesn't contain the expected set. This catches a
broken import order before any test runs, instead of mid-suite.

If you add a new Ormar model:

1. Add it to the `from app.models.db_models import (...)` block at the top of
   `conftest.py` (the `# noqa: F401` comment is intentional — the import is
   *for the side effect*, not the name).
2. Add its table name to `REQUIRED_TABLES` in `tests/_support/db.py`.

### When you patch `app.database.database`

Ormar models cache the database connection on `ormar_config.database` at class
definition time. Re-binding `app.database.database` alone is not enough — you
must also call `update_ormar_models_database(new_database)` so the models
themselves point at the new connection. The `test_db` and `test_client` fixtures
already do this; follow the same pattern in any new fixture that swaps the
database.

## Helpers reference (`tests/_support/db.py`)

| Helper | Use it when |
|---|---|
| `assert_models_registered()` | Once at conftest top — fails fast if imports drifted |
| `cleanup_db_file(path)` | Tearing down a temp SQLite file (handles Windows file-lock races) |
| `create_tables_with_verify(path)` | After creating a temp DB file, before connecting async — runs `alembic upgrade head` |
| `assert_required_tables(path, retries=N)` | Final readiness check before yielding a TestClient |
| `update_ormar_models_database(db)` | Whenever you patch `app.database.database` in a fixture |
| `windows_settle()` | After `disconnect()` in async fixtures, to release file handles |
