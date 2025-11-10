"""Main FastAPI application entry point."""

from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.api.routes import calendar, config, health, images, keyboard, system, web_services
from app.config import settings
from app.database import init_db
from app.services import image_service as image_service_module
from app.services.calendar_service import calendar_service
from app.services.image_service import ImageService
from app.services.scheduler import calendar_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown."""
    # Startup
    # Initialize database
    await init_db()
    print("Database initialized")

    # Run migrations
    from app.utils.migrations import migrate_database

    await migrate_database()
    print("Database migrations completed")

    # Load plugins from database
    from app.plugins.registry import plugin_registry
    await plugin_registry.load_plugins_from_db()
    print(f"Loaded plugins from database")
    
    # Also load calendar sources from database (for backward compatibility during migration)
    await calendar_service.load_sources_from_db()
    print(f"Loaded {len(calendar_service.sources)} calendar sources from database (legacy)")

    # Initialize default keyboard mappings if none exist
    from app.services.config_service import config_service
    from app.services.keyboard_mapping_service import keyboard_mapping_service

    # Check if keyboard mappings exist, if not, create defaults
    mappings = await keyboard_mapping_service.get_all_mappings()
    if not mappings:
        # Set default 7-button keyboard mappings
        # Generic buttons (context-aware): KEY_1, KEY_2, KEY_3
        # Mode buttons: KEY_4, KEY_5, KEY_6, KEY_7
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
        # Layout: 3 generic buttons (next, prev, expand/close) +
        # 4 mode buttons (calendar, photos, services, spare)
        default_standard = {
            "KEY_RIGHT": "generic_next",  # Generic Next (context-aware)
            "KEY_LEFT": "generic_prev",  # Generic Previous (context-aware)
            "KEY_UP": "generic_expand_close",  # Generic Expand/Close (context-aware)
            "KEY_DOWN": "mode_calendar",  # Mode: Calendar
            "KEY_SPACE": "mode_photos",  # Mode: Photos
            "KEY_1": "mode_web_services",  # Mode: Web Services
            "KEY_2": "mode_spare",  # Mode: Spare
            "KEY_S": "mode_settings",  # Settings (separate)
        }
        await keyboard_mapping_service.set_mappings("standard", default_standard)
        print("Initialized default keyboard mappings")

    # Initialize image service (legacy - will be replaced by plugin system)
    thumbnail_dir = settings.image_cache_dir / "thumbnails"
    image_service_module.image_service = ImageService(settings.image_dir, thumbnail_dir)
    # Do initial scan
    image_service_module.image_service.scan_images()
    image_count = len(image_service_module.image_service.get_images())
    print(f"Image service initialized: {image_count} images found (legacy)")
    
    # Initialize plugin image service
    from app.services.plugin_image_service import PluginImageService
    plugin_image_service = PluginImageService()
    # Do initial scan
    await plugin_image_service.scan_images()
    plugin_image_count = len(await plugin_image_service.get_images())
    print(f"Plugin image service initialized: {plugin_image_count} images found")

    # Initialize default config if not present
    orientation = await config_service.get_value("orientation")
    if orientation is None:
        await config_service.set_value("orientation", "landscape")
    calendar_split = await config_service.get_value("calendar_split")
    if calendar_split is None:
        await config_service.set_value("calendar_split", 70.0)
    keyboard_type = await config_service.get_value("keyboard_type")
    if keyboard_type is None:
        await config_service.set_value("keyboard_type", "7-button")
    photo_frame_enabled = await config_service.get_value("photo_frame_enabled")
    if photo_frame_enabled is None:
        await config_service.set_value("photo_frame_enabled", False)
    photo_frame_timeout = await config_service.get_value("photo_frame_timeout")
    if photo_frame_timeout is None:
        await config_service.set_value("photo_frame_timeout", 300)  # 5 minutes
    show_ui = await config_service.get_value("show_ui")
    if show_ui is None:
        await config_service.set_value("show_ui", True)
    photo_rotation_interval = await config_service.get_value("photo_rotation_interval")
    if photo_rotation_interval is None:
        await config_service.set_value("photo_rotation_interval", 30)  # 30 seconds
    calendar_view_mode = await config_service.get_value("calendar_view_mode")
    if calendar_view_mode is None:
        await config_service.set_value("calendar_view_mode", "month")  # 'month' or 'rolling'
    time_format = await config_service.get_value("time_format")
    if time_format is None:
        await config_service.set_value("time_format", "24h")  # '12h' or '24h' (default: '24h')
    mode_indicator_timeout = await config_service.get_value("mode_indicator_timeout")
    if mode_indicator_timeout is None:
        await config_service.set_value("mode_indicator_timeout", 5)  # 5 seconds default
    week_start_day = await config_service.get_value("week_start_day")
    if week_start_day is None:
        await config_service.set_value("week_start_day", 0)  # Sunday default
    show_week_numbers = await config_service.get_value("show_week_numbers")
    if show_week_numbers is None:
        await config_service.set_value("show_week_numbers", False)  # Hide by default
    side_view_position = await config_service.get_value("side_view_position")
    if side_view_position is None:
        await config_service.set_value("side_view_position", "right")  # Right/bottom default
    theme_mode = await config_service.get_value("theme_mode")
    if theme_mode is None:
        await config_service.set_value("theme_mode", "auto")  # Auto theme by default
    dark_mode_start = await config_service.get_value("dark_mode_start")
    if dark_mode_start is None:
        await config_service.set_value("dark_mode_start", 18)  # 6 PM default
    dark_mode_end = await config_service.get_value("dark_mode_end")
    if dark_mode_end is None:
        await config_service.set_value("dark_mode_end", 6)  # 6 AM default
    display_schedule_enabled = await config_service.get_value("display_schedule_enabled")
    if display_schedule_enabled is None:
        await config_service.set_value("display_schedule_enabled", False)  # Disabled by default
    display_off_time = await config_service.get_value("display_off_time")
    if display_off_time is None:
        await config_service.set_value("display_off_time", "22:00")  # 10 PM default
    display_on_time = await config_service.get_value("display_on_time")
    if display_on_time is None:
        await config_service.set_value("display_on_time", "06:00")  # 6 AM default
    # Initialize display schedule if not exists (per-day schedule)
    display_schedule = await config_service.get_value("display_schedule")
    if display_schedule is None:
        # Default: all days enabled, 06:00-22:00
        import json
        default_schedule = [
            {"day": i, "enabled": True, "onTime": "06:00", "offTime": "22:00"}
            for i in range(7)  # 0=Monday, 6=Sunday
        ]
        await config_service.set_value("display_schedule", json.dumps(default_schedule))
    reboot_combo_key1 = await config_service.get_value("reboot_combo_key1")
    if reboot_combo_key1 is None:
        await config_service.set_value("reboot_combo_key1", "KEY_1")  # Default first key
    reboot_combo_key2 = await config_service.get_value("reboot_combo_key2")
    if reboot_combo_key2 is None:
        await config_service.set_value("reboot_combo_key2", "KEY_7")  # Default second key
    reboot_combo_duration = await config_service.get_value("reboot_combo_duration")
    if reboot_combo_duration is None:
        await config_service.set_value("reboot_combo_duration", 10000)  # 10 seconds default
    # Initialize display timeout settings (default: disabled - keep display on)
    display_timeout_enabled = await config_service.get_value("display_timeout_enabled")
    if display_timeout_enabled is None:
        await config_service.set_value("display_timeout_enabled", False)  # Disabled by default - keep display on
    display_timeout = await config_service.get_value("display_timeout")
    if display_timeout is None:
        await config_service.set_value("display_timeout", 0)  # 0 = never (disabled by default - keep display on)
    image_display_mode = await config_service.get_value("image_display_mode")
    if image_display_mode is None:
        await config_service.set_value("image_display_mode", "smart")  # Smart mode by default

    # Start schedulers
    calendar_scheduler.start()
    print("Calendar scheduler started - refreshing every 15 minutes")
    
    # Start display power scheduler
    from app.services.display_power_service import display_power_service
    await display_power_service.start()
    print("Display power scheduler started")
    
    yield
    # Shutdown
    await display_power_service.stop()
    print("Display power scheduler stopped")
    calendar_scheduler.stop()
    print("Calendar scheduler stopped")
    
    # Cleanup plugins
    from app.plugins.manager import plugin_manager
    await plugin_manager.cleanup_all()
    print("Plugins cleaned up")


app = FastAPI(
    title="Calvin Dashboard API",
    description="Lightweight DAKBoard alternative for Raspberry Pi",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8000"],
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
app.include_router(system.router, prefix="/api/system", tags=["system"])

# Serve static files from frontend dist directory
# Get the project root (parent of backend directory)
project_root = Path(__file__).parent.parent.parent
frontend_dist = project_root / "frontend" / "dist"

# Mount static assets (JS, CSS, images, etc.)
# This must be mounted BEFORE the catch-all route to take precedence
if frontend_dist.exists():
    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")
        print(f"Mounted static assets from: {assets_dir}")
    else:
        print(f"WARNING: Assets directory not found: {assets_dir}")
    
    # Serve index.html for root path
    @app.get("/")
    async def serve_frontend_root():
        """Serve frontend index.html for root path."""
        index_path = frontend_dist / "index.html"
        if index_path.exists():
            return FileResponse(str(index_path))
        return {"message": "Calvin Dashboard API", "version": "0.1.0"}
    
    # Serve index.html for all other non-API routes (SPA routing)
    # This must come after API routes and asset mounts to avoid intercepting them
    # Only handle GET requests for SPA routing - POST requests should only go to API routes
    @app.get("/{full_path:path}")
    async def serve_frontend_get(full_path: str):
        """Serve frontend index.html for SPA routing (GET only)."""
        # Don't handle API routes, docs, or assets (already handled by mounts/routers)
        if (full_path.startswith("api/") or 
            full_path.startswith("docs") or 
            full_path.startswith("openapi.json") or
            full_path.startswith("assets/")):
            # Return 404 for API routes that don't exist (let routers handle it)
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Not found")
        
        index_path = frontend_dist / "index.html"
        if index_path.exists():
            return FileResponse(str(index_path))
        return {"message": "Calvin Dashboard API", "version": "0.1.0"}
else:
    # Fallback if frontend dist doesn't exist (development mode)
    @app.get("/")
    async def root():
        """Root endpoint."""
        return {"message": "Calvin Dashboard API", "version": "0.1.0"}
