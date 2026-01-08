"""Tests for database initialization utility."""

import tempfile
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine

from app.models.db_models import ConfigDB, KeyboardMappingDB, PluginDB, PluginTypeDB
from app.utils.db_init import initialize_database, verify_database_tables


@pytest.mark.asyncio
async def test_initialize_database_creates_tables():
    """Test that initialize_database creates all required tables."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = Path(tmp.name)

    engine = None
    try:
        # Initialize database
        engine = await initialize_database(db_path, run_migrations=True)

        # Verify tables exist
        table_status = verify_database_tables(db_path)
        missing_tables = [t for t, e in table_status.items() if not e]
        assert all(table_status.values()), f"Missing tables: {missing_tables}"

        # Verify we can query the tables using SQLAlchemy
        from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

        session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with session_factory() as session:
            # Query each table to ensure they're accessible
            result = await session.execute(select(PluginTypeDB))
            plugin_types = result.scalars().all()
            assert isinstance(plugin_types, list)

            result = await session.execute(select(PluginDB))
            plugins = result.scalars().all()
            assert isinstance(plugins, list)

            result = await session.execute(select(ConfigDB))
            configs = result.scalars().all()
            assert isinstance(configs, list)

            result = await session.execute(select(KeyboardMappingDB))
            mappings = result.scalars().all()
            assert isinstance(mappings, list)
    finally:
        # Cleanup - dispose engine first to release file lock
        if engine:
            await engine.dispose()
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
async def test_initialize_database_with_existing_engine():
    """Test that initialize_database works with an existing engine."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = Path(tmp.name)

    engine = None
    try:
        # Create engine first
        db_url = f"sqlite+aiosqlite:///{db_path.resolve()}"
        engine = create_async_engine(db_url, echo=False, future=True)

        # Initialize database with existing engine
        result_engine = await initialize_database(db_path, engine=engine, run_migrations=True)

        # Should return the same engine
        assert result_engine is engine

        # Verify tables exist
        table_status = verify_database_tables(db_path)
        assert all(table_status.values())
    finally:
        if engine:
            await engine.dispose()
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
    try:
        # Initialize database without migrations
        engine = await initialize_database(db_path, run_migrations=False)

        # Verify tables exist (alembic_version won't exist without migrations)
        table_status = verify_database_tables(db_path)
        # Check only the application tables, not alembic_version
        app_tables = {k: v for k, v in table_status.items() if k != "alembic_version"}
        assert all(
            app_tables.values()
        ), f"Missing tables: {[k for k, v in app_tables.items() if not v]}"
    finally:
        if engine:
            await engine.dispose()
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
    try:
        # Initialize first time
        engine1 = await initialize_database(db_path, run_migrations=True)
        table_status1 = verify_database_tables(db_path)

        # Initialize second time
        engine2 = await initialize_database(db_path, engine=engine1, run_migrations=True)
        table_status2 = verify_database_tables(db_path)

        # Should be the same engine
        assert engine1 is engine2

        # Tables should still exist
        assert all(table_status1.values())
        assert all(table_status2.values())
    finally:
        if engine1:
            await engine1.dispose()
        import time

        time.sleep(0.1)
        if db_path.exists():
            try:
                db_path.unlink()
            except PermissionError:
                pass
