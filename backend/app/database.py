"""Database configuration and session management."""

import logging
import os

import databases
from sqlalchemy import MetaData

from app.config import settings

# CALVIN_SQL_ECHO=1 turns on SQL statement logging without editing this file.
#
# Runtime queries go Ormar -> `databases` lib -> aiosqlite (NOT through a SQLAlchemy
# engine), so the useful logger is `databases`. We also flip the SQLAlchemy loggers
# because metadata.create_all() in init/tests does run through a sync SA engine.
# All emitted records flow through loguru via InterceptHandler in app.main.
_SQL_ECHO = os.environ.get("CALVIN_SQL_ECHO") == "1"
_sql_log_level = logging.DEBUG if _SQL_ECHO else logging.WARNING

# Runtime queries — Ormar/databases lib
logging.getLogger("databases").setLevel(_sql_log_level)

# Schema/init — SQLAlchemy core (metadata.create_all, sync engine in init_db)
for _name in ("sqlalchemy.engine", "sqlalchemy.pool", "sqlalchemy.dialects"):
    _lg = logging.getLogger(_name)
    _lg.setLevel(_sql_log_level)
    _lg.propagate = True

# Create database connection for Ormar
# Use absolute path to avoid path resolution issues
database = databases.Database(
    settings.database_url_absolute.replace("sqlite:///", "sqlite+aiosqlite:///")
)

# Create metadata for Ormar models
metadata = MetaData()


async def connect_db():
    """Connect to database and configure SQLite for better concurrency."""
    await database.connect()

    # Enable WAL mode for better concurrency (allows multiple readers and one writer)
    # This significantly improves SQLite's ability to handle concurrent access
    try:
        await database.execute("PRAGMA journal_mode=WAL")
        # Set busy timeout to handle temporary locks (wait up to 5 seconds)
        await database.execute("PRAGMA busy_timeout=5000")
        # Set synchronous mode to NORMAL for better performance (WAL mode makes this safe)
        await database.execute("PRAGMA synchronous=NORMAL")
    except Exception as e:
        # If PRAGMA commands fail, log but don't fail connection
        # (might happen if database is read-only or other issues)
        logger = logging.getLogger(__name__)
        logger.warning(f"Failed to configure SQLite PRAGMA settings: {e}")


async def disconnect_db():
    """Disconnect from database."""
    await database.disconnect()


async def init_db():
    """Initialize database (create tables)."""
    # Connect if not already connected
    if not database.is_connected:
        await connect_db()  # Use connect_db() to ensure WAL mode is enabled

    # Create tables using metadata
    # Note: Ormar will create tables automatically when models are imported
    # But we can also use metadata.create_all for explicit control
    from sqlalchemy import create_engine

    # For table creation, we need a sync engine
    # Use absolute path to avoid path resolution issues
    sync_url = settings.database_url_absolute.replace("sqlite+aiosqlite:///", "sqlite:///")
    sync_engine = create_engine(sync_url, echo=False)

    # Enable WAL mode on sync engine as well (for table creation)
    with sync_engine.connect() as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.commit()

    metadata.create_all(sync_engine)
    sync_engine.dispose()
