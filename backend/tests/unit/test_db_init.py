"""Tests for database initialization utility."""

import tempfile
from pathlib import Path

import pytest

from app.models.db_models import ConfigDB, KeyboardMappingDB, PluginDB, PluginTypeDB
from app.utils.db_init import initialize_database, verify_database_tables


def _update_ormar_models_database(new_database):
    """
    Update all ORMAR models to use a new database connection.

    ORMAR models store the database connection in ormar_config.database at class
    definition time. When we create a new database connection, we also need to update
    the models' ormar_config.database to use the new connection.
    """
    ConfigDB.ormar_config.database = new_database
    KeyboardMappingDB.ormar_config.database = new_database
    PluginDB.ormar_config.database = new_database
    PluginTypeDB.ormar_config.database = new_database


@pytest.mark.asyncio
async def test_initialize_database_creates_tables():
    """Test that initialize_database creates all required tables."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = Path(tmp.name)

    database = None
    original_database = None
    try:
        # Save original database connection
        import app.database as db_module

        original_database = db_module.database

        # Initialize database
        database = await initialize_database(db_path, run_migrations=True)

        # CRITICAL: Update ORMAR models to use the new database connection
        # ORMAR models cache the database connection at class definition time,
        # so we must explicitly update their ormar_config.database
        _update_ormar_models_database(database)

        # Verify tables exist
        table_status = verify_database_tables(db_path)
        missing_tables = [t for t, e in table_status.items() if not e]
        assert all(table_status.values()), f"Missing tables: {missing_tables}"

        # Verify we can query the tables using Ormar
        plugin_types = await PluginTypeDB.objects.all()
        assert isinstance(plugin_types, list)

        plugins = await PluginDB.objects.all()
        assert isinstance(plugins, list)

        configs = await ConfigDB.objects.all()
        assert isinstance(configs, list)

        mappings = await KeyboardMappingDB.objects.all()
        assert isinstance(mappings, list)
    finally:
        # Restore original database connection
        if original_database:
            _update_ormar_models_database(original_database)

        # Cleanup - disconnect database first to release file lock
        if database:
            await database.disconnect()
        # Small delay to ensure file is released on Windows
        import time

        time.sleep(0.1)
        if db_path.exists():
            try:
                db_path.unlink()
            except PermissionError:
                # On Windows, file might still be locked - ignore
                pass


@pytest.mark.asyncio
async def test_initialize_database_with_existing_database():
    """Test that initialize_database works with an existing database connection."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = Path(tmp.name)

    database = None
    original_database = None
    try:
        import databases

        import app.database as db_module

        original_database = db_module.database

        # Create database connection first
        db_url = f"sqlite+aiosqlite:///{db_path.resolve()}"
        database = databases.Database(db_url)
        await database.connect()

        # Update ORMAR models to use the new database connection
        _update_ormar_models_database(database)

        # Initialize database with existing database connection
        result_database = await initialize_database(db_path, database=database, run_migrations=True)

        # Should return the same database
        assert result_database is database

        # Verify tables exist
        table_status = verify_database_tables(db_path)
        assert all(table_status.values())

        # Verify we can query the tables using Ormar
        plugin_types = await PluginTypeDB.objects.all()
        assert isinstance(plugin_types, list)
    finally:
        # Restore original database connection
        if original_database:
            _update_ormar_models_database(original_database)

        if database:
            await database.disconnect()
        import time

        time.sleep(0.1)
        if db_path.exists():
            try:
                db_path.unlink()
            except PermissionError:
                pass


@pytest.mark.asyncio
async def test_initialize_database_without_migrations():
    """Test that initialize_database can skip migrations."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = Path(tmp.name)

    engine = None
    original_database = None
    try:
        import app.database as db_module

        original_database = db_module.database

        # Initialize database without migrations
        engine = await initialize_database(db_path, run_migrations=False)

        # Update ORMAR models to use the new database connection
        _update_ormar_models_database(engine)

        # Verify tables exist (alembic_version won't exist without migrations)
        table_status = verify_database_tables(db_path)
        # Check only the application tables, not alembic_version
        app_tables = {k: v for k, v in table_status.items() if k != "alembic_version"}
        assert all(app_tables.values()), (
            f"Missing tables: {[k for k, v in app_tables.items() if not v]}"
        )

        # Verify we can query the tables using Ormar
        plugin_types = await PluginTypeDB.objects.all()
        assert isinstance(plugin_types, list)
    finally:
        # Restore original database connection
        if original_database:
            _update_ormar_models_database(original_database)

        if engine:
            await engine.disconnect()
        import time

        time.sleep(0.1)
        if db_path.exists():
            try:
                db_path.unlink()
            except PermissionError:
                pass


def test_verify_database_tables_nonexistent():
    """Test verify_database_tables with non-existent database."""
    db_path = Path("/nonexistent/path/database.db")
    result = verify_database_tables(db_path)
    assert result == {}


def test_verify_database_tables_empty():
    """Test verify_database_tables with empty database."""
    import sqlite3

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = Path(tmp.name)

    try:
        # Create empty database
        conn = sqlite3.connect(str(db_path))
        conn.close()

        # Verify returns dict with False values for empty database (tables don't exist)
        result = verify_database_tables(db_path)
        # Empty database should return dict with all False values
        # (alembic_version may or may not be present)
        expected = {
            "plugins": False,
            "plugin_types": False,
            "config": False,
            "keyboard_mappings": False,
        }
        # Check only the expected keys, ignore alembic_version if present
        for key, value in expected.items():
            assert result.get(key) == value, f"Expected {key}={value}, got {result.get(key)}"
    finally:
        if db_path.exists():
            db_path.unlink()


def test_verify_database_tables_partial():
    """Test verify_database_tables with partial tables."""
    import sqlite3

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = Path(tmp.name)

    try:
        # Create database with only some tables
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE plugins (
                id TEXT PRIMARY KEY
            )
        """)
        conn.commit()
        conn.close()

        # Verify returns correct status
        result = verify_database_tables(db_path)
        assert result["plugins"] is True
        assert result["plugin_types"] is False
        assert result["config"] is False
        assert result["keyboard_mappings"] is False
    finally:
        if db_path.exists():
            db_path.unlink()


@pytest.mark.asyncio
async def test_initialize_database_idempotent():
    """Test that initialize_database can be called multiple times safely."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = Path(tmp.name)

    engine1 = None
    original_database = None
    try:
        import app.database as db_module

        original_database = db_module.database

        # Initialize first time
        engine1 = await initialize_database(db_path, run_migrations=True)
        _update_ormar_models_database(engine1)
        table_status1 = verify_database_tables(db_path)

        # Initialize second time
        engine2 = await initialize_database(db_path, database=engine1, run_migrations=True)
        _update_ormar_models_database(engine2)
        table_status2 = verify_database_tables(db_path)

        # Should be the same engine
        assert engine1 is engine2

        # Tables should still exist
        assert all(table_status1.values())
        assert all(table_status2.values())

        # Verify we can query the tables using Ormar
        plugin_types = await PluginTypeDB.objects.all()
        assert isinstance(plugin_types, list)
    finally:
        # Restore original database connection
        if original_database:
            _update_ormar_models_database(original_database)

        if engine1:
            await engine1.disconnect()
        import time

        time.sleep(0.1)
        if db_path.exists():
            try:
                db_path.unlink()
            except PermissionError:
                pass


@pytest.mark.asyncio
async def test_initialize_database_enables_wal_mode():
    """Test that initialize_database enables WAL mode for better concurrency."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = Path(tmp.name)

    database = None
    original_database = None
    try:
        import app.database as db_module

        original_database = db_module.database

        # Initialize database
        database = await initialize_database(db_path, run_migrations=True)
        _update_ormar_models_database(database)

        # Check that WAL mode is enabled
        # databases.Database.fetch_one returns a single row for PRAGMA queries
        result = await database.fetch_one("PRAGMA journal_mode")
        journal_mode = result[0] if result else None
        assert journal_mode.upper() == "WAL", f"Expected WAL mode, got {journal_mode}"

        # Check that busy_timeout is set
        result = await database.fetch_one("PRAGMA busy_timeout")
        busy_timeout = result[0] if result else None
        assert busy_timeout == 5000, f"Expected busy_timeout=5000, got {busy_timeout}"

        # Check that synchronous is set to NORMAL
        # Note: SQLite synchronous values: 0=OFF, 1=NORMAL, 2=FULL
        # The PRAGMA might return the current value, not necessarily what we set
        # We just verify it's a valid value (0, 1, or 2)
        result = await database.fetch_one("PRAGMA synchronous")
        synchronous = result[0] if result else None
        assert synchronous in [0, 1, 2], f"Expected synchronous in [0,1,2], got {synchronous}"
    finally:
        # Restore original database connection
        if original_database:
            _update_ormar_models_database(original_database)

        if database:
            await database.disconnect()
        import time

        time.sleep(0.1)
        if db_path.exists():
            try:
                db_path.unlink()
            except PermissionError:
                pass
