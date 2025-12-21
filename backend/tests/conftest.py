"""Pytest configuration and shared fixtures."""

import asyncio
import tempfile
from collections.abc import AsyncGenerator, Generator
from pathlib import Path

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def temp_db_path() -> Generator[Path, None, None]:
    """Create a temporary database file for testing."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = Path(tmp.name)
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
    async_session = sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        yield session


@pytest.fixture
def test_client(temp_db_path: Path) -> Generator[TestClient, None, None]:
    """Create a test client for FastAPI."""
    # Patch the database URL in settings BEFORE importing database modules
    import app.config

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
    # This ensures routes use the patched session factory
    import sys
    import importlib
    
    # Reload routes modules that might have cached the old AsyncSessionLocal
    routes_modules = [
        'app.api.routes.plugins',
        'app.api.routes.config',
        'app.api.routes.calendar',
        'app.api.routes.images',
        'app.api.routes.keyboard',
        'app.api.routes.system',
        'app.api.routes.web_services',
    ]
    for module_name in routes_modules:
        if module_name in sys.modules:
            importlib.reload(sys.modules[module_name])

    # Initialize test database using the unified utility
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        # Use the same initialization function as production
        # This will create tables and verify they exist
        loop.run_until_complete(initialize_database(test_db_path_abs, engine=test_engine, run_migrations=True))

        # Load plugins so they're available for tests
        from app.plugins.loader import plugin_loader

        plugin_loader.load_all_plugins()
        
        # Sync themes to database (same as production startup)
        # This registers built-in themes in PluginTypeDB so they appear in API responses
        from app.api.routes.plugins import sync_themes_to_db
        
        loop.run_until_complete(sync_themes_to_db())
    finally:
        loop.close()
    
    # Double-check tables exist (initialize_database should have verified, but be extra sure)
    from app.utils.db_init import verify_database_tables
    table_status = verify_database_tables(test_db_path_abs)
    if not all(table_status.values()):
        missing = [table for table, exists in table_status.items() if not exists]
        # This should never happen if initialize_database worked correctly
        error_msg = (
            f"Database initialization verification failed. "
            f"Missing tables: {missing}. "
            f"This indicates a bug in initialize_database."
        )
        raise RuntimeError(error_msg)

    # Create a test app without the complex lifespan
    # This avoids startup issues in tests
    # IMPORTANT: Reload routes AFTER patching to ensure they use patched AsyncSessionLocal
    import sys
    import importlib
    
    routes_modules = [
        'app.api.routes.plugins',
        'app.api.routes.config',
        'app.api.routes.calendar',
        'app.api.routes.images',
        'app.api.routes.keyboard',
        'app.api.routes.system',
        'app.api.routes.web_services',
    ]
    for module_name in routes_modules:
        if module_name in sys.modules:
            importlib.reload(sys.modules[module_name])
    
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
        web_services,
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
    test_app.include_router(web_services.router, prefix="/api", tags=["web-services"])
    test_app.include_router(plugins.router, prefix="/api", tags=["plugins"])
    test_app.include_router(system.router, prefix="/api", tags=["system"])

    @test_app.get("/")
    async def root():
        """Root endpoint."""
        return {"message": "Calvin Dashboard API", "version": "0.1.0"}

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
def patch_data_directories(monkeypatch, tmp_path, temp_plugins_dir, temp_frontend_dir, temp_themes_dir):
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
