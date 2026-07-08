"""Database configuration and session management."""

import databases
from loguru import logger
from sqlalchemy import MetaData

from app.config import settings

# SQL logger configuration (CALVIN_SQL_ECHO) lives in app.main alongside the
# rest of the loguru/InterceptHandler bridge.


def _database_dialect(database: databases.Database):
    return getattr(getattr(database, "_backend", None), "_dialect", None)


if not hasattr(databases.Database, "dialect"):
    databases.Database.dialect = property(_database_dialect)


def ensure_database_dialect(database: databases.Database) -> databases.Database:
    """Expose the SQLAlchemy dialect where Ormar 0.21 expects it."""

    return database


def create_database(url: str) -> databases.Database:
    """Create a Database instance with Ormar compatibility shims applied."""

    return ensure_database_dialect(databases.Database(url))


# Create database connection for Ormar
# Use absolute path to avoid path resolution issues
database = create_database(
    settings.database_url_absolute.replace("sqlite:///", "sqlite+aiosqlite:///")
)

# Create metadata for Ormar models
metadata = MetaData()


async def connect_db():
    """Connect to database and configure SQLite for better concurrency."""
    await database.connect()
    ensure_database_dialect(database)

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
