"""Database initialization utility.

This module provides a unified way to initialize databases for both production and testing.
It ensures all tables are created and migrations are run properly.
"""

import asyncio
import logging
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.database import Base
from app.utils.migrations import _migrate_database_sync

logger = logging.getLogger(__name__)


async def initialize_database(
    database_path: Path,
    engine: AsyncEngine | None = None,
    run_migrations: bool = True,
) -> AsyncEngine:
    """
    Initialize a database: create all tables and run migrations.

    This function:
    1. Ensures the database file exists
    2. Creates all tables using SQLAlchemy's Base.metadata
    3. Runs migrations to handle any data migration

    Args:
        database_path: Path to the SQLite database file
        engine: Optional existing async engine. If None, creates a new one.
        run_migrations: Whether to run migrations after creating tables

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
    # This must be done before create_all()
    from app.models.db_models import (  # noqa: F401
        ConfigDB,
        KeyboardMappingDB,
        PluginDB,
        PluginTypeDB,
    )

    # Create all tables using SQLAlchemy
    # According to SQLAlchemy docs, when using run_sync with create_all,
    # we need to pass a callable that receives the sync connection
    async def create_tables():
        # Use begin() which auto-commits on success when context exits
        async with engine.begin() as conn:
            # run_sync provides the sync connection as the first argument to the callable
            # We need to explicitly pass it to create_all using bind parameter
            def create_all_tables(sync_conn):
                # create_all needs the bind parameter to know which connection to use
                Base.metadata.create_all(bind=sync_conn)

            await conn.run_sync(create_all_tables)

    await create_tables()

    # Verify tables were actually created (helps catch issues early)
    table_status = verify_database_tables(database_path)
    if not all(table_status.values()):
        missing = [table for table, exists in table_status.items() if not exists]
        logger.error(f"Database initialization failed! Missing tables: {missing}")
        raise RuntimeError(f"Failed to create database tables. Missing: {missing}")

    logger.debug(f"Created all tables in {database_path}")

    # Run migrations if requested
    if run_migrations:
        # Migrations use sync SQLite, so we need to run them in an executor
        # But first, we need to patch settings.database_url temporarily
        from app.config import settings

        original_db_url = settings.database_url
        settings.database_url = f"sqlite:///{database_path.resolve()}"

        try:
            # Run migrations synchronously in executor
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, _migrate_database_sync)
            logger.debug(f"Ran migrations for {database_path}")
        finally:
            # Restore original database URL
            settings.database_url = original_db_url

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
        return {table: table in existing_tables for table in required_tables}
    finally:
        conn.close()
