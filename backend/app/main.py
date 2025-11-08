"""Main FastAPI application entry point."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import calendar, config, health, keyboard, images, web_services
from app.services.scheduler import calendar_scheduler
from app.database import init_db
from app.services.calendar_service import calendar_service
from app.services import image_service as image_service_module
from app.services.image_service import ImageService
from app.config import settings


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
    
    # Load calendar sources from database
    await calendar_service.load_sources_from_db()
    print(f"Loaded {len(calendar_service.sources)} calendar sources from database")
    
    # Initialize default keyboard mappings if none exist
    from app.services.keyboard_mapping_service import keyboard_mapping_service
    from app.services.config_service import config_service
    
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
        # Layout: 3 generic buttons (next, prev, expand/close) + 4 mode buttons (calendar, photos, services, spare)
        default_standard = {
            "KEY_RIGHT": "generic_next",           # Generic Next (context-aware)
            "KEY_LEFT": "generic_prev",            # Generic Previous (context-aware)
            "KEY_UP": "generic_expand_close",      # Generic Expand/Close (context-aware)
            "KEY_DOWN": "mode_calendar",            # Mode: Calendar
            "KEY_SPACE": "mode_photos",            # Mode: Photos
            "KEY_1": "mode_web_services",          # Mode: Web Services
            "KEY_2": "mode_spare",                 # Mode: Spare
            "KEY_S": "mode_settings",              # Settings (separate)
        }
        await keyboard_mapping_service.set_mappings("standard", default_standard)
        print("Initialized default keyboard mappings")
    
    # Initialize image service
    image_service_module.image_service = ImageService(settings.image_dir)
    # Do initial scan
    image_service_module.image_service.scan_images()
    print(f"Image service initialized: {len(image_service_module.image_service.get_images())} images found")
    
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
    
    # Start scheduler
    calendar_scheduler.start()
    print("Calendar scheduler started - refreshing every 15 minutes")
    yield
    # Shutdown
    calendar_scheduler.stop()
    print("Calendar scheduler stopped")


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


@app.get("/")
async def root():
    """Root endpoint."""
    return {"message": "Calvin Dashboard API", "version": "0.1.0"}

