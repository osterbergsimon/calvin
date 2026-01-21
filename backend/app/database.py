"""Database configuration and session management."""

import logging

import databases
from sqlalchemy import MetaData

from app.config import settings

# Ensure SQLAlchemy loggers are set to WARNING to reduce noise
# This must be done BEFORE creating the engine
# Set level explicitly to override any default or inherited level
sqlalchemy_engine_logger = logging.getLogger("sqlalchemy.engine")
sqlalchemy_engine_logger.setLevel(logging.WARNING)
sqlalchemy_engine_logger.propagate = True

sqlalchemy_pool_logger = logging.getLogger("sqlalchemy.pool")
sqlalchemy_pool_logger.setLevel(logging.WARNING)
sqlalchemy_pool_logger.propagate = True

sqlalchemy_dialects_logger = logging.getLogger("sqlalchemy.dialects")
sqlalchemy_dialects_logger.setLevel(logging.WARNING)
sqlalchemy_dialects_logger.propagate = True

# Create database connection for Ormar
# Use absolute path to avoid path resolution issues
database = databases.Database(
    settings.database_url_absolute.replace("sqlite:///", "sqlite+aiosqlite:///")
)

# Create metadata for Ormar models
metadata = MetaData()


async def connect_db():
    """Connect to database."""
    await database.connect()


async def disconnect_db():
    """Disconnect from database."""
    await database.disconnect()


async def init_db():
    """Initialize database (create tables)."""
    # Connect if not already connected
    if not database.is_connected:
        await database.connect()

    # Create tables using metadata
    # Note: Ormar will create tables automatically when models are imported
    # But we can also use metadata.create_all for explicit control
    from sqlalchemy import create_engine

    # For table creation, we need a sync engine
    # Use absolute path to avoid path resolution issues
    sync_url = settings.database_url_absolute.replace("sqlite+aiosqlite:///", "sqlite:///")
    sync_engine = create_engine(sync_url, echo=False)
    metadata.create_all(sync_engine)
    sync_engine.dispose()
