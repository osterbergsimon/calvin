"""Pytest configuration and shared fixtures."""

import asyncio
import logging
import shutil
import tempfile
from collections.abc import AsyncGenerator, Generator
from pathlib import Path

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.db_models import (  # noqa: F401
    ConfigDB,
    KeyboardMappingDB,
    PluginDB,
    PluginTypeDB,
)

logger = logging.getLogger(__name__)

# Import all models to ensure they're registered in Base.metadata
# This must be done at module level, before any fixtures run


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def base_test_db(tmp_path_factory) -> Path:
    """
    Create a base test database with all migrations applied and test data.

    This database is created once per test session and copied for each test,
    avoiding the need to run migrations for every test. This is faster and
    avoids test isolation issues with Alembic/SQLite.
    """
    from datetime import datetime

    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    from app.utils.db_init import initialize_database

    # Create a temporary directory for the base database
    base_dir = tmp_path_factory.mktemp("base_db")
    base_db_path = base_dir / "base_test.db"

    # Create the base database with migrations
    logger = logging.getLogger(__name__)
    logger.info(f"Creating base test database: {base_db_path}")

    # Create engine for base database
    base_db_url = f"sqlite+aiosqlite:///{base_db_path}"
    base_engine = create_async_engine(base_db_url, echo=False, future=True)

    # Initialize database with migrations
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(
            initialize_database(base_db_path, engine=base_engine, run_migrations=True)
        )

        # Add test data to the base database
        base_session_factory = async_sessionmaker(
            base_engine, class_=AsyncSession, expire_on_commit=False
        )

        async def add_test_data():
            async with base_session_factory() as session:
                # Add plugin types
                plugin_types = [
                    PluginTypeDB(
                        type_id="local",
                        plugin_type="image",
                        name="Local Images",
                        description="Load images from local directory",
                        version="1.0.0",
                        enabled=True,
                        created_at=datetime.utcnow(),
                        updated_at=datetime.utcnow(),
                    ),
                    PluginTypeDB(
                        type_id="ical",
                        plugin_type="calendar",
                        name="iCal",
                        description="Load calendar from iCal URL",
                        version="1.0.0",
                        enabled=True,
                        created_at=datetime.utcnow(),
                        updated_at=datetime.utcnow(),
                    ),
                    PluginTypeDB(
                        type_id="google",
                        plugin_type="calendar",
                        name="Google Calendar",
                        description="Load calendar from Google Calendar API",
                        version="1.0.0",
                        enabled=True,
                        created_at=datetime.utcnow(),
                        updated_at=datetime.utcnow(),
                    ),
                    PluginTypeDB(
                        type_id="weather",
                        plugin_type="service",
                        name="Weather",
                        description="Weather service plugin",
                        version="1.0.0",
                        enabled=True,
                        created_at=datetime.utcnow(),
                        updated_at=datetime.utcnow(),
                    ),
                    PluginTypeDB(
                        type_id="iframe",
                        plugin_type="service",
                        name="iFrame",
                        description="iFrame service plugin",
                        version="1.0.0",
                        enabled=True,
                        created_at=datetime.utcnow(),
                        updated_at=datetime.utcnow(),
                    ),
                ]

                for plugin_type in plugin_types:
                    session.add(plugin_type)

                # Add some default plugins
                plugins = [
                    PluginDB(
                        id="local-images",
                        type_id="local",
                        plugin_type="image",
                        name="Local Images",
                        enabled=True,
                        display_order=0,
                        created_at=datetime.utcnow(),
                        updated_at=datetime.utcnow(),
                    ),
                ]

                for plugin in plugins:
                    session.add(plugin)

                # Add some default config entries
                config_entries = [
                    ConfigDB(key="show_ui", value="true", value_type="bool"),
                    ConfigDB(key="theme", value="default", value_type="string"),
                ]

                for config_entry in config_entries:
                    session.add(config_entry)

                # Themes are already added by migrations (747053ae503f and 2e2f87ec8be2)
                # So we don't need to add them here

                await session.commit()
                logger.info("Added test data to base database")

        loop.run_until_complete(add_test_data())

        # Close the engine (sync dispose)
        loop.run_until_complete(base_engine.dispose())

    finally:
        loop.close()

    logger.info(f"Base test database created: {base_db_path}")
    yield base_db_path

    # Cleanup
    if base_db_path.exists():
        base_db_path.unlink()


@pytest.fixture
def temp_db_path(base_test_db: Path) -> Generator[Path, None, None]:
    """
    Create a temporary database file for testing by copying the base test database.

    This avoids running migrations for each test and ensures test isolation.
    """
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = Path(tmp.name)

    # Copy the base database to the temporary location
    shutil.copy2(base_test_db, db_path)
    logger.debug(f"Copied base database to: {db_path}")

    yield db_path

    # Cleanup
    if db_path.exists():
        db_path.unlink()


@pytest_asyncio.fixture
async def test_engine(temp_db_path: Path) -> AsyncGenerator[AsyncEngine, None]:
    """Create a test database engine."""
    test_db_url = f"sqlite+aiosqlite:///{temp_db_path}"
    engine = create_async_engine(test_db_url, echo=False)

    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    # Cleanup
    await engine.dispose()


@pytest_asyncio.fixture
async def test_db(test_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session."""
    # Patch AsyncSessionLocal for unit tests so plugin_registry uses the test database
    import app.database as db_module

    original_session_factory = db_module.AsyncSessionLocal

    # Create session factory for this test database
    # Use the same factory so all sessions share the same engine/connection pool
    async_session_factory = sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    db_module.AsyncSessionLocal = async_session_factory

    try:
        # Also reload plugin_registry so it uses the patched AsyncSessionLocal
        # This ensures plugin_registry operations use the test database
        # Note: We don't restore plugin_registry here because integration tests
        # (using test_client) will reload it with their own database setup
        import importlib
        import sys

        if "app.plugins.registry" in sys.modules:
            importlib.reload(sys.modules["app.plugins.registry"])

        async_session = sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
        async with async_session() as session:
            yield session
    finally:
        # Restore original session factory
        # Don't reload plugin_registry here - let test_client handle it for integration tests
        db_module.AsyncSessionLocal = original_session_factory


@pytest.fixture
def test_client(temp_db_path: Path, temp_image_dir: Path) -> Generator[TestClient, None, None]:
    """Create a test client for FastAPI."""
    # Patch the database URL in settings BEFORE importing database modules
    import os

    import app.config

    # Set IMAGE_DIR environment variable before plugins are loaded
    # This ensures the local image plugin uses the test directory
    original_image_dir = os.environ.get("IMAGE_DIR")
    os.environ["IMAGE_DIR"] = str(temp_image_dir.resolve())

    original_db_url = app.config.settings.database_url
    # Use absolute path to avoid path resolution issues
    test_db_path_abs = temp_db_path.resolve()
    app.config.settings.database_url = f"sqlite:///{test_db_path_abs}"

    # Recreate database engine and session factory with test database
    import asyncio

    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    from app.utils.db_init import initialize_database

    # Create new engine with test database URL
    test_db_url = f"sqlite+aiosqlite:///{test_db_path_abs}"
    test_engine = create_async_engine(test_db_url, echo=False, future=True)
    test_session_factory = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    # Patch the database module to use our test engine
    # IMPORTANT: Do this BEFORE importing any routes,
    # as they import AsyncSessionLocal at module level
    import app.database as db_module

    original_engine = db_module.engine
    original_session_factory = db_module.AsyncSessionLocal

    db_module.engine = test_engine
    db_module.AsyncSessionLocal = test_session_factory

    # Also need to reload any modules that imported AsyncSessionLocal before patching
    # This ensures routes and plugin_registry use the patched session factory
    import importlib
    import sys

    # Reload plugin_registry modules FIRST so they use the patched AsyncSessionLocal
    # This is critical because these modules import AsyncSessionLocal at module level
    # and we need them to use the test database before we load plugin types/instances
    registry_modules = [
        "app.plugins.registry",
        "app.plugins.registry.loader",  # Must reload loader to use patched AsyncSessionLocal
        "app.plugins.registry.manager",  # Must reload manager to use patched AsyncSessionLocal
    ]
    for module_name in registry_modules:
        if module_name in sys.modules:
            importlib.reload(sys.modules[module_name])

    # Reload routes modules that might have cached the old AsyncSessionLocal
    # IMPORTANT: Must reload themes module since it uses AsyncSessionLocal directly
    routes_modules = [
        "app.api.routes.plugins",
        "app.api.routes.plugins.themes",  # Must reload themes to use patched AsyncSessionLocal
        "app.api.routes.config",
        "app.api.routes.calendar",
        "app.api.routes.images",
        "app.api.routes.keyboard",
        "app.api.routes.system",
        "app.api.routes.web_services",
    ]
    for module_name in routes_modules:
        if module_name in sys.modules:
            importlib.reload(sys.modules[module_name])

    # Database is already initialized (copied from base_test_db)
    # No need to run migrations - the base database already has all tables and test data
    import logging

    logger = logging.getLogger(__name__)
    logger.info(f"Using test database (copied from base): {test_db_path_abs}")

    # Verify database file exists and has tables (quick sanity check)
    import sqlite3

    try:
        conn = sqlite3.connect(str(test_db_path_abs))
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = {row[0] for row in cursor.fetchall()}
        conn.close()
        logger.debug(f"Database {test_db_path_abs} has tables: {sorted(tables)}")
        required = {"plugins", "plugin_types", "config", "keyboard_mappings"}
        if not (required <= tables):
            missing = required - tables
            raise RuntimeError(
                f"Database {test_db_path_abs} missing tables: {missing}. "
                f"Existing tables: {sorted(tables)}. "
                f"This should not happen if base_test_db was created correctly."
            )
    except Exception as e:
        logger.error(f"Failed to verify database: {e}")
        raise

    # Load plugins and sync plugin types/themes (but don't run migrations)
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        # Load plugins so they're available for tests
        from app.plugins.loader import plugin_loader

        plugin_loader.load_all_plugins()

        # Load plugin types into database (same as production startup)
        # This registers plugin types in PluginTypeDB so they can be used
        # IMPORTANT: Import AFTER reloading modules to ensure it uses patched AsyncSessionLocal
        # Verify database connection is working before loading
        import sqlite3

        from app.plugins.registry.loader import load_plugin_instances, load_plugin_types

        try:
            conn = sqlite3.connect(str(test_db_path_abs))
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = {row[0] for row in cursor.fetchall()}
            conn.close()
            if "plugin_types" not in tables:
                raise RuntimeError(
                    f"plugin_types table missing before load_plugin_types(). "
                    f"Tables: {sorted(tables)}"
                )
        except Exception as e:
            logger.error(f"Database verification failed before load_plugin_types(): {e}")
            raise

        loop.run_until_complete(load_plugin_types())

        # Load plugin instances from database and register them in plugin manager
        # This is critical - without this, plugin instances exist in DB but aren't
        # registered in the plugin manager, causing "plugin not found" errors
        loop.run_until_complete(load_plugin_instances())

        # Themes are already in the base database, so we don't need to sync them
        # This avoids the "no such table" errors from sync_themes_to_db() using
        # the wrong AsyncSessionLocal reference
    finally:
        loop.close()

    # Double-check tables exist (initialize_database should have verified, but be extra sure)
    # Wait a moment for database file to be fully written (Windows file system delay)
    import time

    from app.utils.db_init import verify_database_tables

    time.sleep(0.1)

    table_status = verify_database_tables(test_db_path_abs)
    if not all(table_status.values()):
        missing = [table for table, exists in table_status.items() if not exists]
        # This should never happen if initialize_database worked correctly
        # But if it does, try to re-initialize once
        logger = logging.getLogger(__name__)
        logger.warning(
            f"Database tables missing after initialization: {missing}. "
            f"Attempting to re-initialize..."
        )
        try:
            loop2 = asyncio.new_event_loop()
            asyncio.set_event_loop(loop2)
            try:
                loop2.run_until_complete(
                    initialize_database(test_db_path_abs, engine=test_engine, run_migrations=False)
                )
                # Verify again
                time.sleep(0.1)
                table_status = verify_database_tables(test_db_path_abs)
                if not all(table_status.values()):
                    missing = [table for table, exists in table_status.items() if not exists]
                    error_msg = (
                        f"Database initialization failed after retry. "
                        f"Missing tables: {missing}. "
                        f"Database path: {test_db_path_abs}"
                    )
                    raise RuntimeError(error_msg)
            finally:
                loop2.close()
        except Exception as e:
            error_msg = (
                f"Database initialization verification failed. "
                f"Missing tables: {missing}. "
                f"Database path: {test_db_path_abs}. "
                f"Error: {e}"
            )
            raise RuntimeError(error_msg) from e

    # Create a test app without the complex lifespan
    # This avoids startup issues in tests
    # Note: plugin_registry and routes were already reloaded above (before database init)
    # so they're already using the patched AsyncSessionLocal

    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware

    from app.api.routes import (
        calendar,
        config,
        health,
        images,
        keyboard,
        plugins,
        system,
    )

    test_app = FastAPI(title="Calvin Test API")
    test_app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    test_app.include_router(health.router, prefix="/api", tags=["health"])
    test_app.include_router(config.router, prefix="/api", tags=["config"])
    test_app.include_router(calendar.router, prefix="/api", tags=["calendar"])
    test_app.include_router(keyboard.router, prefix="/api", tags=["keyboard"])
    test_app.include_router(images.router, prefix="/api", tags=["images"])
    test_app.include_router(plugins.router, prefix="/api", tags=["plugins"])
    test_app.include_router(system.router, prefix="/api", tags=["system"])

    @test_app.get("/")
    async def root():
        """Root endpoint."""
        return {"message": "Calvin Dashboard API", "version": "0.1.0"}

    # Verify database is ready before yielding client
    # This ensures tables exist before any test runs
    import sqlite3

    max_retries = 5
    for attempt in range(max_retries):
        try:
            conn = sqlite3.connect(str(test_db_path_abs))
            cursor = conn.cursor()
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' "
                "AND name IN ('plugins', 'plugin_types', 'config', 'keyboard_mappings')"
            )
            tables = {row[0] for row in cursor.fetchall()}
            conn.close()

            required_tables = {"plugins", "plugin_types", "config", "keyboard_mappings"}
            if tables >= required_tables:
                break
            elif attempt < max_retries - 1:
                time.sleep(0.2 * (attempt + 1))  # Exponential backoff
            else:
                missing = required_tables - tables
                raise RuntimeError(
                    f"Database tables not ready after {max_retries} attempts. "
                    f"Missing: {missing}. Database: {test_db_path_abs}"
                )
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(0.2 * (attempt + 1))
            else:
                raise RuntimeError(
                    f"Failed to verify database tables: {e}. Database: {test_db_path_abs}"
                ) from e

    with TestClient(test_app) as client:
        yield client

    # Cleanup: dispose test engine and restore original database
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(test_engine.dispose())
        finally:
            loop.close()
    except Exception:
        pass

    # Restore original database URL and engine
    app.config.settings.database_url = original_db_url
    db_module.engine = original_engine
    db_module.AsyncSessionLocal = original_session_factory

    # Restore original IMAGE_DIR environment variable
    if original_image_dir is None:
        os.environ.pop("IMAGE_DIR", None)
    else:
        os.environ["IMAGE_DIR"] = original_image_dir


@pytest.fixture
def temp_image_dir() -> Generator[Path, None, None]:
    """Create a temporary directory for test images."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def mock_env_vars(monkeypatch, temp_db_path: Path, temp_image_dir: Path):
    """Mock environment variables for testing."""
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{temp_db_path}")
    monkeypatch.setenv("IMAGE_DIR", str(temp_image_dir))
    monkeypatch.setenv("LOG_LEVEL", "INFO")


@pytest.fixture
def temp_plugins_dir(tmp_path):
    """Create a temporary plugins directory."""
    plugins_dir = tmp_path / "plugins"
    plugins_dir.mkdir()
    return plugins_dir


@pytest.fixture
def temp_frontend_dir(tmp_path):
    """Create a temporary frontend directory."""
    frontend_dir = tmp_path / "frontend" / "src" / "components" / "plugins"
    frontend_dir.mkdir(parents=True)
    return frontend_dir


@pytest.fixture
def temp_themes_dir(tmp_path):
    """Create a temporary themes directory."""
    themes_dir = tmp_path / "themes"
    themes_dir.mkdir(parents=True)
    return themes_dir


@pytest.fixture(autouse=True)
def patch_data_directories(
    monkeypatch, tmp_path, temp_plugins_dir, temp_frontend_dir, temp_themes_dir
):
    """
    Automatically patch plugin and theme installers to use temporary directories.
    This ensures tests don't affect real application data.
    """
    # Patch plugin installer
    from app.services.plugin_installer import plugin_installer

    original_plugins_dir = plugin_installer.plugins_dir
    original_frontend_dir = plugin_installer.frontend_plugins_dir

    plugin_installer.plugins_dir = temp_plugins_dir
    plugin_installer.frontend_plugins_dir = temp_frontend_dir

    # Patch theme installer
    from app.services.theme_installer import theme_installer

    original_themes_dir = theme_installer.themes_dir

    theme_installer.themes_dir = temp_themes_dir

    yield

    # Restore original directories
    plugin_installer.plugins_dir = original_plugins_dir
    plugin_installer.frontend_plugins_dir = original_frontend_dir
    theme_installer.themes_dir = original_themes_dir
