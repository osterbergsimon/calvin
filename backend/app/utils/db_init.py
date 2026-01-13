"""Database initialization utility.

This module provides a unified way to initialize databases for both production and testing.
It ensures all tables are created and migrations are run properly.
"""

import asyncio
import logging
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.database import Base

logger = logging.getLogger(__name__)


async def initialize_database(
    database_path: Path,
    engine: AsyncEngine | None = None,
    run_migrations: bool = True,
) -> AsyncEngine:
    """
    Initialize a database: run migrations to create all tables.

    This function:
    1. Ensures the database file exists
    2. Runs Alembic migrations to create all tables and handle data migrations
    3. If migrations are disabled, falls back to Base.metadata.create_all()

    Args:
        database_path: Path to the SQLite database file
        engine: Optional existing async engine. If None, creates a new one.
        run_migrations: Whether to run migrations (default: True).
                       If False, uses Base.metadata.create_all() instead.

    Returns:
        The async engine (either the provided one or a newly created one)
    """
    # Ensure database directory exists
    database_path.parent.mkdir(parents=True, exist_ok=True)

    # Create engine if not provided
    if engine is None:
        db_url = f"sqlite+aiosqlite:///{database_path.resolve()}"
        engine = create_async_engine(db_url, echo=False, future=True)

    # Import all models to ensure they're registered in Base.metadata
    # This is needed for Alembic to know about the models
    from app.models.db_models import (  # noqa: F401
        ConfigDB,
        KeyboardMappingDB,
        PluginDB,
        PluginTypeDB,
    )

    # Run migrations if requested - migrations will create all tables
    # We rely on Alembic migrations instead of Base.metadata.create_all()
    # to ensure consistency and proper schema management
    if run_migrations:
        # Use Alembic for migrations
        from alembic.config import Config

        from alembic import command

        # Get database URL for Alembic (convert async to sync)
        db_url = f"sqlite:///{database_path.resolve()}"

        # Get absolute path to alembic.ini
        # Try multiple strategies to find alembic.ini
        alembic_ini_path = None

        # Strategy 1: Relative to database path (production structure)
        # database_path structure: backend/data/db/calvin.db (when resolved)
        # alembic.ini is at: backend/alembic.ini
        # So we go up 2 levels from database_path to get to backend
        backend_dir = database_path.resolve().parent.parent.parent
        potential_path = backend_dir / "alembic.ini"
        if potential_path.exists():
            alembic_ini_path = potential_path

        # Strategy 2: Current working directory (for tests)
        if alembic_ini_path is None or not alembic_ini_path.exists():
            import os

            cwd = Path(os.getcwd())
            potential_path = cwd / "alembic.ini"
            if potential_path.exists():
                alembic_ini_path = potential_path

        # Strategy 3: Search upward from database path
        if alembic_ini_path is None or not alembic_ini_path.exists():
            current = database_path.resolve().parent
            while current != current.parent:  # Stop at filesystem root
                potential_path = current / "alembic.ini"
                if potential_path.exists():
                    alembic_ini_path = potential_path
                    break
                current = current.parent

        if alembic_ini_path is None or not alembic_ini_path.exists():
            logger.warning(
                f"Alembic config not found, migrations may fail. "
                f"Tried: {backend_dir / 'alembic.ini'}, {Path.cwd() / 'alembic.ini'}"
            )
            # Don't fail, just skip migrations
            return engine

        # Configure Alembic
        # IMPORTANT: Known issue - alembic/env.py reads settings.database_url at import time
        # (line 33). This causes problems in tests. Solution: Set URL in config first,
        # then patch settings, and ensure env.py uses config.get_main_option() which
        # takes precedence.
        import sys

        import app.config

        # Create Alembic config FIRST and set the URL explicitly
        # This ensures config.get_main_option() returns the correct URL
        alembic_cfg = Config(str(alembic_ini_path))
        alembic_cfg.set_main_option("sqlalchemy.url", db_url)

        # Patch settings.database_url as backup (env.py reads it at import time)
        # But config.get_main_option() takes precedence in run_migrations_online()
        original_settings_url = app.config.settings.database_url
        app.config.settings.database_url = db_url.replace("sqlite:///", "sqlite+aiosqlite:///")

        # Delete and reload alembic.env module to force it to re-read settings
        # This is critical because env.py reads settings at module import time
        if "alembic.env" in sys.modules:
            del sys.modules["alembic.env"]
            # Module will be re-imported when command.upgrade is called
            # This ensures it reads the patched settings.database_url

        # Run migrations in executor (Alembic is sync)
        try:
            loop = asyncio.get_event_loop()
            # Log the database path being used for debugging
            logger.debug(
                f"Running Alembic migrations. Database path: {database_path}. "
                f"Config URL: {alembic_cfg.get_main_option('sqlalchemy.url')}"
            )
            # Verify the config URL is correct before running migrations
            actual_url = alembic_cfg.get_main_option("sqlalchemy.url")
            if actual_url != db_url:
                logger.warning(
                    f"Config URL mismatch! Expected: {db_url}, Got: {actual_url}. "
                    f"Database path: {database_path}"
                )

            await loop.run_in_executor(None, command.upgrade, alembic_cfg, "head")
            logger.debug(f"Ran Alembic migrations for {database_path}. URL used: {actual_url}")
        finally:
            # Restore original settings URL
            app.config.settings.database_url = original_settings_url

        # Verify tables were actually created by migrations
        # Add a small delay to ensure file system has flushed writes (Windows)
        import time

        time.sleep(0.1)

        table_status = verify_database_tables(database_path)
        if not all(table_status.values()):
            missing = [table for table, exists in table_status.items() if not exists]
            # Try to check what tables actually exist for debugging
            import sqlite3

            existing_tables = []
            try:
                conn = sqlite3.connect(str(database_path))
                cursor = conn.cursor()
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
                existing_tables = [row[0] for row in cursor.fetchall()]
                conn.close()
            except Exception as e:
                logger.warning(f"Could not check existing tables: {e}")

            logger.error(
                f"Database initialization failed! Missing tables: {missing}. "
                f"Database path: {database_path}. "
                f"URL used: {db_url}. "
                f"Existing tables: {existing_tables}"
            )
            raise RuntimeError(
                f"Failed to create database tables via migrations. Missing: {missing}. "
                f"Database: {database_path}. Existing tables: {existing_tables}"
            )
    else:
        # If migrations are disabled, fall back to create_all() for backward compatibility
        # This should only be used in special cases
        async def create_tables():
            async with engine.begin() as conn:

                def create_all_tables(sync_conn):
                    Base.metadata.create_all(bind=sync_conn)

                await conn.run_sync(create_all_tables)

        await create_tables()
        logger.debug(f"Created all tables using Base.metadata.create_all() in {database_path}")

    return engine


def verify_database_tables(database_path: Path) -> dict[str, bool]:
    """
    Verify that all required tables exist in the database.

    Args:
        database_path: Path to the SQLite database file

    Returns:
        Dictionary mapping table names to whether they exist
    """
    import sqlite3

    if not database_path.exists():
        return {}

    conn = sqlite3.connect(str(database_path))
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        existing_tables = {row[0] for row in cursor.fetchall()}

        required_tables = {"plugins", "plugin_types", "config", "keyboard_mappings"}
        # Also check if alembic_version table exists (indicates migrations ran)
        has_alembic_version = "alembic_version" in existing_tables
        result = {table: table in existing_tables for table in required_tables}
        result["alembic_version"] = has_alembic_version
        return result
    finally:
        conn.close()
