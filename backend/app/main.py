"""Main FastAPI application entry point."""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.api.routes import calendar, config, health, images, keyboard, plugins, system, web_services
from app.config import settings
from app.services.scheduler import calendar_scheduler

# Plugins are auto-discovered via pluggy hooks when modules are imported


async def _initialize_database():
    """Initialize database and run migrations."""
    from app.database import init_db
    from app.utils.migrations import migrate_database

    await init_db()
    print("Database initialized")

    await migrate_database()
    print("Database migrations completed")


async def _create_default_plugin_instance(
    plugin_registry, session, type_id: str, plugin_id: str, name: str, config: dict
):
    """Create a default plugin instance if the plugin type is enabled and no instance exists."""
    from sqlalchemy import select

    from app.models.db_models import PluginDB, PluginTypeDB

    # Check if plugin type exists and is enabled (default to enabled if not in DB)
    result = await session.execute(select(PluginTypeDB).where(PluginTypeDB.type_id == type_id))
    plugin_type = result.scalar_one_or_none()
    is_enabled = plugin_type.enabled if plugin_type else True

    if not is_enabled:
        return

    # Check if an instance already exists
    result = await session.execute(select(PluginDB).where(PluginDB.type_id == type_id))
    instance = result.scalar_one_or_none()

    if not instance:
        print(f"Creating default {name} plugin instance...")
        try:
            await plugin_registry.register_plugin(
                plugin_id=plugin_id,
                type_id=type_id,
                name=name,
                config=config,
                enabled=True,
            )
            print(f"Default {name} plugin instance created")
        except Exception as e:
            print(f"Warning: Failed to create default {name} instance: {e}")


async def _initialize_plugins():
    """Load plugins from database and create default instances."""
    from app.database import AsyncSessionLocal
    from app.plugins.registry import plugin_registry

    await plugin_registry.load_plugins_from_db()
    print("Loaded plugins from database")

    # Auto-create default instances for image plugins if enabled and no instance exists
    async with AsyncSessionLocal() as session:
        # Unsplash plugin
        await _create_default_plugin_instance(
            plugin_registry,
            session,
            type_id="unsplash",
            plugin_id="unsplash-images",
            name="Unsplash Images",
            config={"api_key": "", "category": "popular", "count": 30},
        )

        # Picsum plugin
        await _create_default_plugin_instance(
            plugin_registry,
            session,
            type_id="picsum",
            plugin_id="picsum-images",
            name="Picsum Photos",
            config={"count": 30},
        )

        # Local images plugin
        await _create_default_plugin_instance(
            plugin_registry,
            session,
            type_id="local",
            plugin_id="local-images",
            name="Local Images",
            config={
                "image_dir": "./data/images",
                "thumbnail_dir": "./data/images/thumbnails",
            },
        )


async def _initialize_keyboard_mappings():
    """Initialize default keyboard mappings if none exist."""
    from app.services.keyboard_mapping_service import keyboard_mapping_service

    mappings = await keyboard_mapping_service.get_all_mappings()
    if not mappings:
        # Set default 7-button keyboard mappings
        default_7button = {
            "KEY_1": "generic_next",
            "KEY_2": "generic_prev",
            "KEY_3": "generic_expand_close",
            "KEY_4": "mode_calendar",
            "KEY_5": "mode_photos",
            "KEY_6": "mode_web_services",
            "KEY_7": "mode_spare",
        }
        await keyboard_mapping_service.set_mappings("7-button", default_7button)

        # Set default standard keyboard mappings
        default_standard = {
            "KEY_RIGHT": "generic_next",
            "KEY_LEFT": "generic_prev",
            "KEY_UP": "generic_expand_close",
            "KEY_DOWN": "mode_calendar",
            "KEY_SPACE": "mode_photos",
            "KEY_1": "mode_web_services",
            "KEY_2": "mode_spare",
            "KEY_S": "mode_settings",
        }
        await keyboard_mapping_service.set_mappings("standard", default_standard)
        print("Initialized default keyboard mappings")


async def _initialize_image_service():
    """Initialize plugin image service and perform initial scan."""
    from app.services.plugin_image_service import PluginImageService

    plugin_image_service = PluginImageService()
    await plugin_image_service.scan_images()
    plugin_image_count = len(await plugin_image_service.get_images())
    print(f"Plugin image service initialized: {plugin_image_count} images found")


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
        "keyboard_type": "7-button",
        "photo_frame_enabled": False,
        "photo_frame_timeout": 300,  # 5 minutes
        "config_poll_interval": 30,  # 30 seconds
        "show_ui": True,
        "photo_rotation_interval": 30,  # 30 seconds
        "calendar_view_mode": "month",  # 'month' | 'week' | 'day' | 'rolling'
        "time_format": "24h",  # '12h' or '24h'
        "mode_indicator_timeout": 5,  # 5 seconds
        "keyboard_feedback_enabled": True,
        "keyboard_feedback_mode": "normal",
        "week_start_day": 0,  # Sunday
        "show_week_numbers": False,
        "side_view_position": "right",
        "theme_mode": "auto",
        "dark_mode_start": 18,  # 6 PM
        "dark_mode_end": 6,  # 6 AM
        "display_schedule_enabled": False,
        "display_off_time": "22:00",  # 10 PM
        "display_on_time": "06:00",  # 6 AM
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
    from app.services.display_power_service import display_power_service

    calendar_scheduler.start()
    print("Calendar scheduler started - refreshing every 15 minutes")

    await display_power_service.start()
    print("Display power scheduler started")


async def _sync_display_orientation():
    """Sync display orientation with config (on Raspberry Pi, if enabled)."""
    from app.services.config_service import config_service
    from app.services.display_orientation_service import display_orientation_service

    try:
        apply_rotation = await config_service.get_value("apply_display_rotation", True)
        if apply_rotation:
            result = await display_orientation_service.sync_with_config()
            if result.get("success"):
                print(f"Display orientation synced: {result.get('message')}")
            elif result.get("message") and "Not running on Raspberry Pi" not in result.get(
                "message", ""
            ):
                print(f"Display orientation sync: {result.get('message')}")
        else:
            print("Display rotation is disabled - skipping physical display rotation")
    except Exception as e:
        # Don't fail startup if orientation sync fails
        print(f"Warning: Failed to sync display orientation on startup: {e}")


async def _shutdown_services():
    """Shutdown all services and schedulers."""
    from app.plugins.manager import plugin_manager
    from app.services.display_power_service import display_power_service

    await display_power_service.stop()
    print("Display power scheduler stopped")

    calendar_scheduler.stop()
    print("Calendar scheduler stopped")

    await plugin_manager.cleanup_all()
    print("Plugins cleaned up")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown."""
    # Startup
    await _initialize_database()
    await _initialize_plugins()
    await _initialize_keyboard_mappings()
    await _initialize_image_service()
    await _initialize_default_config()
    await _start_schedulers()
    await _sync_display_orientation()

    yield

    # Shutdown
    await _shutdown_services()


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

# Include routers
app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(config.router, prefix="/api", tags=["config"])
app.include_router(calendar.router, prefix="/api", tags=["calendar"])
app.include_router(keyboard.router, prefix="/api", tags=["keyboard"])
app.include_router(images.router, prefix="/api", tags=["images"])
app.include_router(web_services.router, prefix="/api", tags=["web-services"])
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
        @app.get("/assets/{file_path:path}")
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

        print(f"Mounted static assets from: {assets_dir} (with no-cache headers)")
    else:
        print(f"WARNING: Assets directory not found: {assets_dir}")

    # Serve index.html for root path
    @app.get("/")
    async def serve_frontend_root():
        """Serve frontend index.html for root path."""
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
    @app.get("/{full_path:path}")
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
