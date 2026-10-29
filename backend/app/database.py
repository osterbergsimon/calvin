"""Database configuration and session management."""

import databases
from loguru import logger
from sqlalchemy import MetaData

from app.config import settings

# SQL logger configuration (CALVIN_SQL_ECHO) lives in app.main alongside the
# rest of the loguru/InterceptHandler bridge.

# How long SQLite waits for a lock before raising "database is locked".
SQLITE_BUSY_TIMEOUT_SECONDS = 5.0
SQLITE_BUSY_TIMEOUT_MS = int(SQLITE_BUSY_TIMEOUT_SECONDS * 1000)


def _database_dialect(database: databases.Database):
    return getattr(getattr(database, "_backend", None), "_dialect", None)


if not hasattr(databases.Database, "dialect"):
    setattr(databases.Database, "dialect", property(_database_dialect))


def ensure_database_dialect(database: databases.Database) -> databases.Database:
    """Expose the SQLAlchemy dialect where Ormar 0.21 expects it."""

    return database


def create_database(url: str) -> databases.Database:
    """Create a Database instance with Ormar compatibility shims applied.

    The SQLite backend opens a fresh aiosqlite connection per transaction, so
    `PRAGMA busy_timeout` on the first connection only ever applied to that one
    connection (audit R11). The driver-level `timeout` argument applies to every
    connection the pool opens.
    """

    if "sqlite" in url:
        return ensure_database_dialect(databases.Database(url, timeout=SQLITE_BUSY_TIMEOUT_SECONDS))
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
        await database.execute(f"PRAGMA busy_timeout={SQLITE_BUSY_TIMEOUT_MS}")
        # Set synchronous mode to NORMAL for better performance (WAL mode makes this safe)
        await database.execute("PRAGMA synchronous=NORMAL")
    except Exception as e:
        # If PRAGMA commands fail, log but don't fail connection
        # (might happen if database is read-only or other issues)
        logger.warning(f"Failed to configure SQLite PRAGMA settings: {e}")


async def disconnect_db():
    """Disconnect from database."""
    await database.disconnect()
