"""Database configuration and session management."""

import logging

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base

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

# Create async engine
# Set echo=False to prevent SQLAlchemy from creating its own handlers
# SQL logging can be enabled via logger level if needed (set to DEBUG)
# The echo parameter creates handlers that bypass logger level settings
engine = create_async_engine(
    settings.database_url.replace("sqlite:///", "sqlite+aiosqlite:///"),
    echo=False,  # Disable echo to prevent handler creation - use logger level instead
    future=True,
)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# Base class for models
Base = declarative_base()


async def get_db() -> AsyncSession:
    """Get database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """Initialize database (create tables)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
