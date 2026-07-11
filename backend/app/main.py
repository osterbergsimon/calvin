"""Main FastAPI application entry point."""

import logging
import os
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi.responses import (
    FileResponse,  # noqa: E402
    JSONResponse,  # noqa: E402
)

# Configure loguru for better, simpler logging
from loguru import logger

# Configure logging FIRST, before any other imports that might trigger database initialization
# Import settings first to get log level
from app.config import settings

# Remove loguru's default handler and configure our own
logger.remove()

# Map settings log level to loguru levels
log_level_map = {
    "DEBUG": "DEBUG",
    "INFO": "INFO",
    "WARNING": "WARNING",
    "ERROR": "ERROR",
    "CRITICAL": "CRITICAL",
}
log_level = log_level_map.get(settings.log_level.upper(), "INFO")

# Add handler with our desired format
logger.add(
    sys.stderr,
    format=(
        "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
        "<level>{level: <8}</level> | "
        "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - "
        "<level>{message}</level>"
    ),
    level=log_level,
    colorize=True,  # Enable colors for better readability
)


# Intercept standard logging and redirect to loguru
#
# WHY WE NEED THIS:
# Many third-party libraries (SQLAlchemy, FastAPI, uvicorn, httpx, etc.) use Python's
# standard logging module, not loguru. Without InterceptHandler, those library logs would
# go through standard logging with its own format/handlers, creating inconsistent output.
#
# InterceptHandler catches ALL standard logging calls and redirects them to loguru, so:
# - All logs use the same format and handlers (unified output)
# - All logs respect our log level configuration
# - We get consistent log formatting across the entire application
#
# This is especially important for SQLAlchemy query logs, FastAPI request logs, etc.
class InterceptHandler(logging.Handler):
    """Intercept standard logging messages and route them to loguru."""

    def emit(self, record):
        # Map standard logging numeric levels to loguru level names
        level_map = {
            logging.DEBUG: "DEBUG",
            logging.INFO: "INFO",
            logging.WARNING: "WARNING",
            logging.ERROR: "ERROR",
            logging.CRITICAL: "CRITICAL",
        }
        # Get loguru level name from the numeric level
        level_name = level_map.get(record.levelno, "INFO")

        # Find the caller frame that's not in logging module
        try:
            frame = sys._getframe(6)  # Skip logging internals
            depth = 6
            while frame and frame.f_code.co_filename == logging.__file__:
                frame = frame.f_back
                depth += 1
        except (ValueError, AttributeError):
            depth = 0

        # Use loguru's opt to log with proper exception info and depth
        # Import logger here to avoid circular import issues
        from loguru import logger as loguru_logger

        loguru_logger.opt(depth=depth, exception=record.exc_info).log(
            level_name, record.getMessage()
        )


# Set up standard logging interception for compatibility
logging.basicConfig(handlers=[InterceptHandler()], level=0, force=True)

# Configure SQL-related stdlib loggers to flow through InterceptHandler.
# CALVIN_SQL_ECHO=1 turns on SQL statement logging without editing this file.
# Runtime queries go Ormar -> `databases` lib -> aiosqlite, so `databases` is
# the useful logger; SQLAlchemy loggers cover metadata.create_all() in init.
# Must be done BEFORE database.py is imported (which creates the engine).
_sql_log_level = logging.DEBUG if os.environ.get("CALVIN_SQL_ECHO") == "1" else logging.WARNING
for sql_logger_name in (
    "databases",
    "sqlalchemy.engine",
    "sqlalchemy.pool",
    "sqlalchemy.dialects",
):
    sql_logger = logging.getLogger(sql_logger_name)
    sql_logger.setLevel(_sql_log_level)
    sql_logger.handlers = [InterceptHandler()]
    sql_logger.propagate = False

logger.info(f"Loguru logging configured with level: {log_level}")

from fastapi import FastAPI, HTTPException, Request  # noqa: E402
from fastapi.exceptions import RequestValidationError  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from starlette.exceptions import HTTPException as StarletteHTTPException  # noqa: E402

from app.api.routes import (  # noqa: E402
    calendar,
    config,
    health,
    images,
    keyboard,
    kiosks,
    plugins,
    system,
)
from app.services.scheduler import calendar_scheduler  # noqa: E402

# Plugin classes are auto-discovered by the loader when modules are imported

# Use loguru logger (already imported at top of file)


async def _initialize_database():
    """Initialize database and run migrations."""
    from pathlib import Path

    from app.database import database
    from app.utils.db_init import initialize_database

    # Extract database path from settings
    db_path_str = settings.database_url.replace("sqlite:///", "")
    db_path = Path(db_path_str) if db_path_str.startswith("/") else Path(db_path_str).resolve()

    # Use the unified initialization function
    await initialize_database(db_path, database=database, run_migrations=True)
    logger.info("Database initialized and migrations completed")


async def _create_default_plugin_instance(
    plugin_registry, type_id: str, plugin_id: str, name: str, config: dict
):
    """Create a default plugin instance if the plugin type is enabled and no instance exists."""
    from app.models.db_models import PluginDB, PluginTypeDB

    # Check if plugin type exists and is enabled (default to enabled if not in DB)
    plugin_type = await PluginTypeDB.objects.get_or_none(type_id=type_id)
    is_enabled = plugin_type.enabled if plugin_type else True

    if not is_enabled:
        return

    # Check if an instance already exists
    instance = await PluginDB.objects.get_or_none(type_id=type_id)

    if not instance:
        logger.info(f"Creating default {name} plugin instance...")
        try:
            await plugin_registry.register_plugin(
                plugin_id=plugin_id,
                type_id=type_id,
                name=name,
                config=config,
                enabled=True,
            )
            logger.info(f"Default {name} plugin instance created")
        except Exception as e:
            logger.warning(f"Failed to create default {name} instance: {e}")


async def _initialize_plugins():
    """Load plugins from database and create default instances."""
    from app.plugins.registry import plugin_registry

    await plugin_registry.load_plugins_from_db()
    logger.info("Loaded plugins from database")

    # Auto-create default instances for image plugins if enabled and no instance exists
    # Local images plugin
    await _create_default_plugin_instance(
        plugin_registry,
        type_id="local",
        plugin_id="local-images",
        name="Local Images",
        config={
            "image_dir": "./data/images",
            "thumbnail_dir": "./data/images/thumbnails",
        },
    )


DEFAULT_KEYBOARD_MAPPINGS = {
    "KEY_1": "generic_prev",
    "KEY_2": "generic_expand_close",
    "KEY_3": "generic_next",
    "KEY_4": "region_next",
    "KEY_5": "screen_prev",
    "KEY_6": "screen_next",
    "KEY_7": "mode_settings",
}


async def _initialize_keyboard_mappings():
    """Seed the default keyboard mapping if none exist."""
    from app.services.keyboard_mapping_service import keyboard_mapping_service

    if not await keyboard_mapping_service.get_mappings():
        await keyboard_mapping_service.set_mappings(DEFAULT_KEYBOARD_MAPPINGS)
        logger.info("Initialized default keyboard mappings")


async def _initialize_image_service():
    """Initialize plugin image service and perform initial scan."""
    from app.services.plugin_image_service import PluginImageService

    plugin_image_service = PluginImageService()
    await plugin_image_service.scan_images()
    plugin_image_count = len(await plugin_image_service.get_images())
    logger.info(f"Plugin image service initialized: {plugin_image_count} images found")


async def _set_default_config_if_missing(config_service, key: str, default_value):
    """Set config value if it doesn't exist."""
    current = await config_service.get_value(key)
    if current is None:
        await config_service.set_value(key, default_value)


async def _initialize_default_config():
    """Initialize default configuration values if not present."""
    import json

    from app.services.config_service import config_service

    # Define all default config values
    default_configs = {
        "orientation": "landscape",
        "apply_display_rotation": True,
        "calendar_split": 70.0,
        "dashboard_layout": {
            "version": 1,
            "preset": "split_two",
            "regions": [
                {"id": "region-1", "kind": "calendar", "size": 70},
                {"id": "region-2", "kind": "photos", "serviceId": None, "size": 30},
            ],
        },
        "dashboard_screens": {
            "version": 2,
            "activeScreenId": "screen-home",
            "screens": [
                {
                    "id": "screen-home",
                    "name": "Home",
                    "layout": {
                        "version": 1,
                        "preset": "split_two",
                        "regions": [
                            {"id": "region-1", "kind": "calendar", "serviceId": None, "size": 70},
                            {"id": "region-2", "kind": "photos", "serviceId": None, "size": 30},
                        ],
                    },
                    "activeRegionId": "region-1",
                }
            ],
        },
        "photo_frame_enabled": False,
        "photo_frame_timeout": 300,  # 5 minutes
        "config_poll_interval": 30,  # 30 seconds
        "show_ui": True,
        "photo_rotation_interval": 30,  # 30 seconds
        "time_format": "24h",  # '12h' or '24h'
        "mode_indicator_timeout": 5,  # 5 seconds
        "keyboard_feedback_enabled": True,
        "keyboard_feedback_mode": "normal",
        "week_start_day": 1,  # Monday
        "show_week_numbers": False,
        "theme_mode": "auto",
        "dark_mode_start": 18,  # 6 PM
        "dark_mode_end": 6,  # 6 AM
        "display_schedule_enabled": False,
        "reboot_combo_key1": "KEY_1",
        "reboot_combo_key2": "KEY_7",
        "reboot_combo_duration": 10000,  # 10 seconds
        "display_timeout_enabled": False,
        "display_timeout": 0,  # 0 = never
        "image_display_mode": "smart",
        "randomize_images": "false",
    }

    # Set all defaults
    for key, value in default_configs.items():
        await _set_default_config_if_missing(config_service, key, value)

    # Handle display schedule separately (it's a JSON string)
    display_schedule = await config_service.get_value("display_schedule")
    if display_schedule is None:
        default_schedule = [
            {"day": i, "enabled": True, "onTime": "06:00", "offTime": "22:00"}
            for i in range(7)  # 0=Monday, 6=Sunday
        ]
        await config_service.set_value("display_schedule", json.dumps(default_schedule))


async def _start_schedulers():
    """Start background schedulers."""
    from app.services.backend_scheduler import backend_plugin_scheduler
    from app.services.display_power_service import display_power_service

    await calendar_scheduler.start()
    # Log message is now handled in scheduler.start()

    await display_power_service.start()
    logger.info("Display power scheduler started")

    # Start backend plugin scheduler (plugins will register their tasks on initialization)
    await backend_plugin_scheduler.start()


async def _sync_display_orientation():
    """Sync display orientation with config (on Raspberry Pi, if enabled)."""
    from app.services.config_service import config_service
    from app.services.display_orientation_service import display_orientation_service

    try:
        apply_rotation = await config_service.get_value("apply_display_rotation", True)
        if apply_rotation:
            result = await display_orientation_service.sync_with_config()
            if result.get("success"):
                logger.info(f"Display orientation synced: {result.get('message')}")
            elif result.get("message") and "Not running on Raspberry Pi" not in result.get(
                "message", ""
            ):
                logger.info(f"Display orientation sync: {result.get('message')}")
        else:
            logger.info("Display rotation is disabled - skipping physical display rotation")
    except Exception as e:
        # Don't fail startup if orientation sync fails
        logger.warning(f"Failed to sync display orientation on startup: {e}")


# Theme sync removed - themes are loaded from filesystem on-demand
# No database storage needed for themes (see ORMAR_MIGRATION_PLAN.md Part 7)


async def _shutdown_services():
    """Shutdown all services and schedulers."""
    from app.plugins.manager import plugin_manager
    from app.services.backend_scheduler import backend_plugin_scheduler
    from app.services.display_power_service import display_power_service

    await display_power_service.stop()
    logger.info("Display power scheduler stopped")

    calendar_scheduler.stop()
    logger.info("Calendar scheduler stopped")

    # Stop backend plugin scheduler (cleanup scheduled tasks)
    backend_plugin_scheduler.stop()

    await plugin_manager.cleanup_all()
    logger.info("Plugins cleaned up")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown."""
    from app.database import connect_db, disconnect_db

    # Startup
    try:
        logger.info("Starting application lifecycle...")
        await connect_db()
        logger.info("Database connected")
        await _initialize_database()
        logger.info("Database initialized")
        await _initialize_plugins()
        logger.info("Plugins initialized")
        await _initialize_keyboard_mappings()
        logger.info("Keyboard mappings initialized")
        await _initialize_image_service()
        logger.info("Image service initialized")
        await _initialize_default_config()
        logger.info("Default config initialized")
        await _start_schedulers()
        logger.info("Schedulers started")
        await _sync_display_orientation()
        logger.info("Display orientation synced")
        # Themes are loaded from filesystem on-demand - no database sync needed
        logger.info("Application startup complete - ready to serve requests")
    except Exception as e:
        logger.exception(f"Error during startup: {e}")
        raise

    yield

    # Shutdown
    logger.info("Shutting down application...")
    await _shutdown_services()
    await disconnect_db()
    logger.info("Application shutdown complete")


app = FastAPI(
    title="Calvin Dashboard API",
    description="Lightweight DAKBoard alternative for Raspberry Pi",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
# Parse CORS origins from config
if settings.cors_allow_all:
    # Allow all origins (development only)
    cors_origins = ["*"]
else:
    # Parse comma-separated origins from config
    cors_origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Dev-only HTTP request logging — enable with CALVIN_DEV_LOG_HTTP=1
if os.environ.get("CALVIN_DEV_LOG_HTTP") == "1":
    from starlette.middleware.base import BaseHTTPMiddleware

    class DevHTTPLogMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request, call_next):
            start = time.perf_counter()
            response = await call_next(request)
            duration_ms = (time.perf_counter() - start) * 1000
            logger.info(
                f"{request.method} {request.url.path} {response.status_code} {duration_ms:.1f}ms"
            )
            return response

    app.add_middleware(DevHTTPLogMiddleware)
    logger.info("Dev HTTP logging enabled (CALVIN_DEV_LOG_HTTP=1)")


# Global exception handlers for comprehensive error logging
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Handle HTTP exceptions (404, 401, etc.) with logging."""
    logger.warning(
        f"HTTP {exc.status_code} error: {exc.detail} | "
        f"Path: {request.url.path} | Method: {request.method}"
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )


@app.exception_handler(HTTPException)
async def fastapi_http_exception_handler(request: Request, exc: HTTPException):
    """Handle FastAPI HTTP exceptions with logging."""
    logger.warning(
        f"HTTP {exc.status_code} error: {exc.detail} | "
        f"Path: {request.url.path} | Method: {request.method}"
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle request validation errors with detailed logging."""
    errors = exc.errors()
    # Try to get request body for logging, but don't fail if we can't read it
    body_info = "N/A"
    try:
        if request.method in ("POST", "PUT", "PATCH"):
            body = await request.body()
            body_info = body.decode("utf-8", errors="replace")[:500]  # Limit length
    except Exception:
        pass  # Ignore errors reading body

    logger.error(
        f"Validation error: {errors} | "
        f"Path: {request.url.path} | Method: {request.method} | "
        f"Body: {body_info}"
    )
    return JSONResponse(
        status_code=422,
        content={"detail": errors, "body": "Validation error"},
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Catch-all exception handler to log all unhandled errors."""
    import traceback

    # Log full exception details with stack trace
    logger.error(
        f"Unhandled exception: {type(exc).__name__}: {exc} | "
        f"Path: {request.url.path} | Method: {request.method} | "
        f"Client: {request.client.host if request.client else 'unknown'}"
    )
    logger.error(f"Full traceback:\n{traceback.format_exc()}")

    # Include error details in response for debugging (only in development)
    error_detail = (
        str(exc) if settings.log_level.upper() in ("DEBUG", "INFO") else "Internal server error"
    )

    return JSONResponse(
        status_code=500,
        content={"detail": error_detail, "type": type(exc).__name__},
    )


# Include routers
app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(config.router, prefix="/api", tags=["config"])
app.include_router(kiosks.router, prefix="/api", tags=["kiosks"])
app.include_router(calendar.router, prefix="/api", tags=["calendar"])
app.include_router(keyboard.router, prefix="/api", tags=["keyboard"])
app.include_router(images.router, prefix="/api", tags=["images"])
app.include_router(plugins.router, prefix="/api", tags=["plugins"])
app.include_router(system.router, prefix="/api/system", tags=["system"])

# Serve static files from frontend dist directory
# Get the project root (parent of backend directory)
project_root = Path(__file__).parent.parent.parent
frontend_dist = project_root / "frontend" / "dist"

# Mount static assets (JS, CSS, images, etc.) with cache control headers
# This must be mounted BEFORE the catch-all route to take precedence
if frontend_dist.exists():
    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        # Use custom static file handler to add cache control headers
        @app.get("/assets/{file_path:path}", include_in_schema=False)
        async def serve_asset(file_path: str):
            """Serve static assets with cache control headers for development."""
            asset_path = assets_dir / file_path
            if asset_path.exists() and asset_path.is_file():
                # In development/debug mode, disable caching to ensure updates are visible
                # In production, you might want to enable caching with a hash-based filename
                return FileResponse(
                    str(asset_path),
                    headers={
                        "Cache-Control": "no-cache, no-store, must-revalidate",
                        "Pragma": "no-cache",
                        "Expires": "0",
                    },
                )
            from fastapi import HTTPException

            raise HTTPException(status_code=404, detail="Asset not found")

        logger.info(f"Mounted static assets from: {assets_dir} (with no-cache headers)")
    else:
        logger.warning(f"Assets directory not found: {assets_dir}")

    # Serve Vite public/ root assets (favicon, PWA manifest, touch icons) before
    # the SPA catch-all. Without this, /favicon.svg returns index.html.
    async def serve_frontend_public_file(file_name: str):
        public_path = frontend_dist / file_name
        if public_path.exists() and public_path.is_file():
            return FileResponse(
                str(public_path),
                headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0",
                },
            )

        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Not found")

    @app.api_route("/favicon.svg", methods=["GET", "HEAD"], include_in_schema=False)
    async def serve_favicon_svg():
        return await serve_frontend_public_file("favicon.svg")

    @app.api_route("/apple-touch-icon.png", methods=["GET", "HEAD"], include_in_schema=False)
    async def serve_apple_touch_icon():
        return await serve_frontend_public_file("apple-touch-icon.png")

    @app.api_route("/site.webmanifest", methods=["GET", "HEAD"], include_in_schema=False)
    async def serve_site_webmanifest():
        return await serve_frontend_public_file("site.webmanifest")

    @app.api_route("/icon-192.png", methods=["GET", "HEAD"], include_in_schema=False)
    async def serve_icon_192():
        return await serve_frontend_public_file("icon-192.png")

    @app.api_route("/icon-512.png", methods=["GET", "HEAD"], include_in_schema=False)
    async def serve_icon_512():
        return await serve_frontend_public_file("icon-512.png")

    @app.api_route("/sw.js", methods=["GET", "HEAD"], include_in_schema=False)
    async def serve_service_worker():
        return await serve_frontend_public_file("sw.js")

    # Serve index.html for root path
    @app.get("/", operation_id="root__get", summary="Root")
    async def serve_frontend_root():
        """Root endpoint."""
        index_path = frontend_dist / "index.html"
        if index_path.exists():
            return FileResponse(
                str(index_path),
                headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0",
                },
            )
        return {"message": "Calvin Dashboard API", "version": "0.1.0"}

    # Serve index.html for all other non-API routes (SPA routing)
    # This must come after API routes and asset mounts to avoid intercepting them
    # Only handle GET requests for SPA routing - POST requests should only go to API routes
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend_get(full_path: str):
        """Serve frontend index.html for SPA routing (GET only)."""
        # Don't handle API routes, docs, or assets (already handled by mounts/routers)
        if (
            full_path.startswith("api/")
            or full_path.startswith("docs")
            or full_path.startswith("openapi.json")
            or full_path.startswith("assets/")
        ):
            # Return 404 for API routes that don't exist (let routers handle it)
            from fastapi import HTTPException

            raise HTTPException(status_code=404, detail="Not found")

        index_path = frontend_dist / "index.html"
        if index_path.exists():
            return FileResponse(
                str(index_path),
                headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0",
                },
            )
        return {"message": "Calvin Dashboard API", "version": "0.1.0"}
else:
    # Fallback if frontend dist doesn't exist (development mode)
    @app.get("/")
    async def root():
        """Root endpoint."""
        return {"message": "Calvin Dashboard API", "version": "0.1.0"}
