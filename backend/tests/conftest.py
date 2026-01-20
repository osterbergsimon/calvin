"""Pytest configuration and shared fixtures."""

import asyncio
import logging
import tempfile
import time
from collections.abc import AsyncGenerator, Generator
from pathlib import Path

import databases
import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from app.database import metadata
from app.models.db_models import (  # noqa: F401
    ConfigDB,
    KeyboardMappingDB,
    PluginDB,
    PluginTypeDB,
)

logger = logging.getLogger(__name__)

# Import all models to ensure they're registered in metadata
# This must be done at module level, before any fixtures run
# Ormar models register their tables with metadata when imported
# Verify that tables are registered (this will fail early if models aren't imported)
_expected_tables = {"config", "keyboard_mappings", "plugin_types", "plugins"}
_registered_tables = set(metadata.tables.keys())
if not _registered_tables.issuperset(_expected_tables):
    missing = _expected_tables - _registered_tables
    raise RuntimeError(
        f"Models not registered with metadata! Missing tables: {missing}. "
        f"Registered: {_registered_tables}. "
        "Make sure all Ormar models are imported before fixtures run."
    )


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

    # Removed base_test_db fixture - we now use Base.metadata.create_all() for each test
    # This is simpler and provides better isolation


@pytest.fixture
def temp_db_path() -> Generator[Path, None, None]:
    """
    Create a temporary database file for testing.

    For integration tests (test_client), this will be overridden to use base_test_db.
    For unit tests (test_engine), this creates a fresh empty database.
    """
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = Path(tmp.name)
    yield db_path
    # Cleanup
    if db_path.exists():
        db_path.unlink()


@pytest.fixture
def temp_db_path_for_integration() -> Generator[Path, None, None]:
    """
    Create a fresh temporary database file for each integration test.

    Each test gets a fresh database with migrations run - perfect isolation.
    This is simpler than copying a base database and avoids connection issues.
    """
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = Path(tmp.name)
    yield db_path
    # Cleanup
    if db_path.exists():
        db_path.unlink()


@pytest_asyncio.fixture
async def test_database(temp_db_path: Path) -> AsyncGenerator[databases.Database, None]:
    """Create a test database connection."""
    # CRITICAL: Models are already imported at module level (lines 17-22),
    # so they're registered with metadata. Accessing them here ensures
    # they're fully initialized (especially important in CI).
    # We access the metadata through the models to force registration
    _ = ConfigDB.ormar_config.metadata
    _ = PluginDB.ormar_config.metadata
    _ = PluginTypeDB.ormar_config.metadata
    _ = KeyboardMappingDB.ormar_config.metadata

    # CRITICAL: Create tables BEFORE connecting to avoid connection caching issues
    # SQLite can cache the database state when a connection is opened, so we must
    # create tables before any async connection is established

    # Debug: Log what tables are registered in metadata
    registered_tables = list(metadata.tables.keys())
    print(f"[test_database] Creating tables in {temp_db_path}")
    print(f"[test_database] Registered tables in metadata: {registered_tables}")

    # Verify metadata has tables before creating
    # This is critical - if tables aren't registered, create_all will silently do nothing
    if not metadata.tables:
        # Try to force registration by accessing model metadata
        try:
            _ = ConfigDB.ormar_config.metadata
            _ = PluginDB.ormar_config.metadata
            _ = PluginTypeDB.ormar_config.metadata
            _ = KeyboardMappingDB.ormar_config.metadata
        except Exception as e:
            raise RuntimeError(
                f"Failed to access model metadata: {e}. Models may not be properly initialized."
            ) from e

        # Check again after accessing model metadata
        if not metadata.tables:
            raise RuntimeError(
                f"No tables registered in metadata after model import! "
                f"Expected tables: ['config', 'keyboard_mappings', 'plugin_types', 'plugins']. "
                f"Metadata object: {metadata}. "
                f"ConfigDB metadata: {ConfigDB.ormar_config.metadata}. "
                f"Same object? {metadata is ConfigDB.ormar_config.metadata}"
            )

    # Create all tables using sync engine BEFORE connecting
    # Use absolute path to ensure we're using the same file
    abs_db_path = temp_db_path.resolve()
    sync_url = f"sqlite:///{abs_db_path}"
    sync_engine = create_engine(sync_url, echo=False)
    try:
        # Explicitly create tables - this will fail if metadata is empty
        if not metadata.tables:
            raise RuntimeError(
                f"Cannot create tables: metadata is empty! "
                f"This means models weren't imported correctly. "
                f"Metadata object: {metadata}"
            )
        metadata.create_all(sync_engine)
        # Verify tables were actually created in the database
        import sqlite3

        with sqlite3.connect(str(abs_db_path)) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            created_tables = {row[0] for row in cursor.fetchall()}
            if not created_tables:
                raise RuntimeError(
                    f"metadata.create_all() completed but no tables were created! "
                    f"Database file: {abs_db_path}, "
                    f"Metadata tables: {list(metadata.tables.keys())}"
                )
    except Exception as e:
        print(f"[test_database] ERROR creating tables: {e}")
        print(f"[test_database] Metadata tables: {list(metadata.tables.keys())}")
        print(f"[test_database] Database path: {abs_db_path}")
        print(f"[test_database] Database exists: {abs_db_path.exists()}")
        raise
    finally:
        sync_engine.dispose()

    # NOW connect to the database after tables are created
    # Use absolute path to ensure we're using the same file
    test_db_url = f"sqlite+aiosqlite:///{abs_db_path}"
    test_db = databases.Database(test_db_url)
    await test_db.connect()

    # Verify tables were actually created
    import sqlite3

    try:
        conn = sqlite3.connect(str(temp_db_path))
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        created_tables = {row[0] for row in cursor.fetchall()}
        conn.close()

        required_tables = {"config", "keyboard_mappings", "plugin_types", "plugins"}
        missing_tables = required_tables - created_tables

        if missing_tables:
            error_msg = (
                f"[test_database] Tables NOT created in {temp_db_path}! "
                f"Missing: {missing_tables}. Created: {sorted(created_tables)}. "
                f"Registered in metadata: {registered_tables}"
            )
            print(f"ERROR: {error_msg}")
            raise RuntimeError(error_msg)
        else:
            print(f"[test_database] Successfully created tables: {sorted(created_tables)}")
    except Exception as e:
        print(f"[test_database] ERROR verifying tables in {temp_db_path}: {e}")
        raise

    yield test_db

    # Cleanup
    await test_db.disconnect()


@pytest_asyncio.fixture
async def test_db(test_database: databases.Database) -> AsyncGenerator[databases.Database, None]:
    """Create a test database connection (for backward compatibility with tests)."""
    # Patch database for unit tests so plugin_registry uses the test database
    import app.database as db_module

    original_database = db_module.database

    # Patch database connection
    db_module.database = test_database

    try:
        # Reload service modules that use database
        # IMPORTANT: Must reload AFTER patching database so services get the new reference
        import importlib
        import sys

        service_modules = [
            "app.services.config_service",
            "app.services.keyboard_mapping_service",
        ]
        for module_name in service_modules:
            if module_name in sys.modules:
                importlib.reload(sys.modules[module_name])

        # Also reload plugin_registry modules so they use the patched database
        # This ensures plugin_registry operations use the test database
        # Note: We don't restore plugin_registry here because integration tests
        # (using test_client) will reload it with their own database setup
        registry_modules = [
            "app.plugins.registry",
            "app.plugins.registry.loader",
            "app.plugins.registry.manager",
        ]
        for module_name in registry_modules:
            if module_name in sys.modules:
                importlib.reload(sys.modules[module_name])

        yield test_database
    finally:
        # Restore original database connection
        # Don't reload plugin_registry here - let test_client handle it for integration tests
        db_module.database = original_database


@pytest.fixture
def test_client(
    temp_db_path_for_integration: Path, temp_image_dir: Path
) -> Generator[TestClient, None, None]:
    """
    Create a test client for FastAPI.

    Based on https://notes.kodekloud.com/docs/Python-API-Development-with-FastAPI/Testing/Create-Destroy-Database-After-Each-Test
    Uses Base.metadata.create_all() instead of migrations for simplicity and speed.
    """
    import asyncio
    import os

    import app.config
    from app.database import metadata

    # Set IMAGE_DIR environment variable before plugins are loaded
    original_image_dir = os.environ.get("IMAGE_DIR")
    os.environ["IMAGE_DIR"] = str(temp_image_dir.resolve())

    original_db_url = app.config.settings.database_url
    # Use absolute path to avoid path resolution issues
    test_db_path_abs = temp_db_path_for_integration.resolve()
    app.config.settings.database_url = f"sqlite:///{test_db_path_abs}"

    # CRITICAL: Create tables BEFORE connecting to avoid connection caching issues
    # SQLite can cache the database state when a connection is opened, so we must
    # create tables before any async connection is established

    # Setup: Create all tables using metadata.create_all()
    # This is simpler and faster than running migrations for tests
    # All tables are defined in models, so this is sufficient
    # CRITICAL: Models are already imported at module level (lines 17-22),
    # so they're registered with metadata. Accessing them here ensures
    # they're fully initialized (especially important in CI).
    _ = ConfigDB.ormar_config.metadata
    _ = PluginDB.ormar_config.metadata
    _ = PluginTypeDB.ormar_config.metadata
    _ = KeyboardMappingDB.ormar_config.metadata

    # Debug: Log what tables are registered in metadata
    registered_tables = list(metadata.tables.keys())
    print(f"[test_client] Creating tables in {test_db_path_abs}")
    print(f"[test_client] Registered tables in metadata: {registered_tables}")

    # Verify metadata has tables before creating
    # This is critical - if tables aren't registered, create_all will silently do nothing
    if not metadata.tables:
        # Try to force registration by accessing model metadata
        try:
            _ = ConfigDB.ormar_config.metadata
            _ = PluginDB.ormar_config.metadata
            _ = PluginTypeDB.ormar_config.metadata
            _ = KeyboardMappingDB.ormar_config.metadata
        except Exception as e:
            raise RuntimeError(
                f"Failed to access model metadata: {e}. Models may not be properly initialized."
            ) from e

        # Check again after accessing model metadata
        if not metadata.tables:
            raise RuntimeError(
                f"No tables registered in metadata after model import! "
                f"Expected tables: ['config', 'keyboard_mappings', 'plugin_types', 'plugins']. "
                f"Metadata object: {metadata}. "
                f"ConfigDB metadata: {ConfigDB.ormar_config.metadata}. "
                f"Same object? {metadata is ConfigDB.ormar_config.metadata}"
            )

    # Create tables using sync engine BEFORE connecting
    sync_url = f"sqlite:///{test_db_path_abs}"
    sync_engine = create_engine(sync_url, echo=False)
    try:
        metadata.create_all(sync_engine)
        # Verify tables were actually created
        import sqlite3

        with sqlite3.connect(str(test_db_path_abs)) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            created_tables = {row[0] for row in cursor.fetchall()}
            if not created_tables:
                raise RuntimeError(
                    f"metadata.create_all() completed but no tables were created! "
                    f"Database file: {test_db_path_abs}, "
                    f"Metadata tables: {list(metadata.tables.keys())}"
                )
    except Exception as e:
        print(f"[test_client] ERROR creating tables: {e}")
        print(f"[test_client] Metadata tables: {list(metadata.tables.keys())}")
        raise
    finally:
        sync_engine.dispose()

    # NOW connect to the database after tables are created
    test_db_url = f"sqlite+aiosqlite:///{test_db_path_abs}"
    test_database = databases.Database(test_db_url)
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(test_database.connect())
    finally:
        loop.close()

    # Verify tables were actually created (before module reloads)
    import sqlite3

    try:
        conn = sqlite3.connect(str(test_db_path_abs))
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        created_tables = {row[0] for row in cursor.fetchall()}
        conn.close()

        required_tables = {"config", "keyboard_mappings", "plugin_types", "plugins"}
        missing_tables = required_tables - created_tables

        if missing_tables:
            error_msg = (
                f"[test_client] Tables NOT created in {test_db_path_abs}! "
                f"Missing: {missing_tables}. Created: {sorted(created_tables)}. "
                f"Registered in metadata: {registered_tables}"
            )
            print(f"ERROR: {error_msg}")
            raise RuntimeError(error_msg)
        else:
            print(f"[test_client] Successfully created tables: {sorted(created_tables)}")
    except Exception as e:
        print(f"[test_client] ERROR verifying tables in {test_db_path_abs}: {e}")
        raise

    # Patch the database module to use our test database
    # IMPORTANT: Do this BEFORE importing any routes
    import app.database as db_module

    original_database = db_module.database

    db_module.database = test_database

    # CRITICAL: Reload modules AFTER patching database, not before
    # This ensures all modules use the NEW patched database
    # If we reload before patching, modules will import the OLD database
    import importlib
    import sys

    # Reload service modules that use database
    # IMPORTANT: Must reload BEFORE routes so routes get services with new database
    service_modules = [
        "app.services.config_service",
        "app.services.keyboard_mapping_service",
        "app.services.plugin_calendar_service",
        "app.services.plugin_image_service",
    ]
    for module_name in service_modules:
        if module_name in sys.modules:
            importlib.reload(sys.modules[module_name])

    # Reload plugin_registry modules so they use the patched database
    registry_modules = [
        "app.plugins.registry",
        "app.plugins.registry.loader",
        "app.plugins.registry.manager",
    ]
    for module_name in registry_modules:
        if module_name in sys.modules:
            importlib.reload(sys.modules[module_name])

    # Reload routes modules that use database
    # IMPORTANT: Must reload AFTER patching database so they get the new database
    routes_modules = [
        "app.api.routes.plugins",
        "app.api.routes.plugins.management",
        "app.api.routes.plugins.instances",
        "app.api.routes.plugins.themes",
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

    # Add test data to the fresh database
    # (tables already created via metadata.create_all above)
    import logging

    logger = logging.getLogger(__name__)

    # Add test data
    loop_data = asyncio.new_event_loop()
    asyncio.set_event_loop(loop_data)
    try:

        async def add_test_data():
            from datetime import datetime

            # Patch database for test data creation
            import app.database as db_module

            original_db = db_module.database
            db_module.database = test_database

            try:
                import ormar

                # Add plugin types (use get_or_create to avoid UNIQUE constraint errors)
                async def get_or_create_plugin_type(
                    type_id, plugin_type, name, description, version="1.0.0", enabled=True
                ):
                    """Get or create a plugin type."""
                    try:
                        existing = await PluginTypeDB.objects.get(type_id=type_id)
                        return existing
                    except ormar.NoMatch:
                        return await PluginTypeDB.objects.create(
                            type_id=type_id,
                            plugin_type=plugin_type,
                            name=name,
                            description=description,
                            version=version,
                            enabled=enabled,
                            created_at=datetime.utcnow(),
                            updated_at=datetime.utcnow(),
                        )

                # Create plugin types (results not needed, just side effects)
                await get_or_create_plugin_type(
                    type_id="local",
                    plugin_type="image",
                    name="Local Images",
                    description="Load images from local directory",
                )
                await get_or_create_plugin_type(
                    type_id="ical",
                    plugin_type="calendar",
                    name="iCal",
                    description="Load calendar from iCal URL",
                )
                await get_or_create_plugin_type(
                    type_id="google",
                    plugin_type="calendar",
                    name="Google Calendar",
                    description="Load calendar from Google Calendar API",
                )
                await get_or_create_plugin_type(
                    type_id="weather",
                    plugin_type="service",
                    name="Weather",
                    description="Weather service plugin",
                )
                await get_or_create_plugin_type(
                    type_id="iframe",
                    plugin_type="service",
                    name="iFrame",
                    description="iFrame service plugin",
                )

                # Add some default plugins (use get_or_create to avoid UNIQUE constraint errors)
                try:
                    await PluginDB.objects.get(id="local-images")
                except ormar.NoMatch:
                    await PluginDB.objects.create(
                        id="local-images",
                        type_id="local",
                        plugin_type="image",
                        name="Local Images",
                        enabled=True,
                        display_order=0,
                        created_at=datetime.utcnow(),
                        updated_at=datetime.utcnow(),
                    )

                # Add some default config entries (use get_or_create to avoid UNIQUE constraint errors)
                async def get_or_create_config(key, value, value_type):
                    """Get or create a config entry."""
                    try:
                        existing = await ConfigDB.objects.get(key=key)
                        return existing
                    except ormar.NoMatch:
                        return await ConfigDB.objects.create(
                            key=key, value=value, value_type=value_type
                        )

                await get_or_create_config(key="show_ui", value="true", value_type="bool")
                await get_or_create_config(key="theme", value="default", value_type="string")

                # Note: Themes are NOT stored in the database for fresh databases
                # They are loaded from filesystem on-demand per ORMAR_MIGRATION_PLAN.md
                # No theme plugin types need to be created here

                logger.debug("Added test data (including themes) to test database")
            finally:
                db_module.database = original_db

        loop_data.run_until_complete(add_test_data())
    finally:
        loop_data.close()

    # Verify database has tables
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
                f"Existing tables: {sorted(tables)}"
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

        # Plugin types are already in the base database, so we don't need to load them
        # Calling load_plugin_types() can cause issues because:
        # 1. It tries to load ALL plugin types from plugin_loader, including ones that might fail
        # 2. When a plugin type fails, it tries to update the database, which can cause
        #    "no such table" errors if the session is using the wrong database connection
        # 3. The base database already has all the plugin types we need for tests
        #
        # If we need to update plugin types, we should do it explicitly in tests, not here
        from app.plugins.registry.loader import load_plugin_instances

        # Load plugin instances from database and register them in plugin manager
        # This is critical - without this, plugin instances exist in DB but aren't
        # registered in the plugin manager, causing "plugin not found" errors
        #
        # IMPORTANT: Verify the database connection is using the correct database before loading
        # The loader module was reloaded above, so it should use the patched database
        try:
            # Quick verification that database is using the test database
            async def verify_database():
                # Try a simple query to verify the database has tables
                from app.models.db_models import PluginTypeDB

                # Try to query plugin_types table
                count = await PluginTypeDB.objects.count()
                if count == 0:
                    # Check if table exists at least
                    import sqlite3

                    conn = sqlite3.connect(str(test_db_path_abs))
                    cursor = conn.cursor()
                    cursor.execute(
                        "SELECT name FROM sqlite_master WHERE type='table' AND name='plugin_types'"
                    )
                    row = cursor.fetchone()
                    conn.close()
                    if not row:
                        raise RuntimeError(
                            f"Database is not using the correct database! "
                            f"Expected plugin_types table in {test_db_path_abs}"
                        )

            loop.run_until_complete(verify_database())
        except Exception as e:
            logger.error(f"Database verification failed before load_plugin_instances(): {e}")
            raise

        loop.run_until_complete(load_plugin_instances())

        # Themes are already in the base database, so we don't need to sync them
        # This avoids the "no such table" errors from sync_themes_to_db() using
        # the wrong database reference
    finally:
        loop.close()

    # Tables are already created and verified above, no need to double-check

    # Create a test app without the complex lifespan
    # This avoids startup issues in tests
    # Note: plugin_registry and routes were already reloaded above (before database init)
    # so they're already using the patched database

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

    # Cleanup: Clear plugin manager state before disposing engine
    # plugin_manager is a singleton and retains state between tests
    # We need to unregister all plugins to avoid them pointing to the wrong database
    from app.plugins.manager import plugin_manager

    # Get list of plugin IDs before unregistering (can't modify dict while iterating)
    plugin_ids = list(plugin_manager._plugins.keys())
    for plugin_id in plugin_ids:
        try:
            plugin = plugin_manager.get_plugin(plugin_id)
            if plugin:
                # Cleanup plugin before unregistering
                loop_cleanup = asyncio.new_event_loop()
                asyncio.set_event_loop(loop_cleanup)
                try:

                    async def cleanup_plugin():
                        try:
                            await plugin.cleanup()
                        except Exception:
                            pass  # Ignore cleanup errors

                    loop_cleanup.run_until_complete(cleanup_plugin())
                finally:
                    loop_cleanup.close()

            # Unregister plugin
            async def unregister_plugin():
                try:
                    await plugin_manager.unregister(plugin_id)
                except Exception:
                    pass  # Ignore unregister errors

            loop_unregister = asyncio.new_event_loop()
            asyncio.set_event_loop(loop_unregister)
            try:
                loop_unregister.run_until_complete(unregister_plugin())
            finally:
                loop_unregister.close()
        except Exception:
            pass  # Ignore errors during cleanup

    # Cleanup: disconnect test database and restore original database
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(test_database.disconnect())
        finally:
            loop.close()
    except Exception:
        pass

    # Restore original database URL and database connection
    app.config.settings.database_url = original_db_url
    db_module.database = original_database

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
