"""Configuration endpoints."""

from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.config_service import config_service


router = APIRouter()


class ConfigUpdate(BaseModel):
    """Configuration update model."""
    orientation: Optional[str] = None
    calendarSplit: Optional[float] = None
    keyboardType: Optional[str] = None
    photoFrameEnabled: Optional[bool] = None
    photoFrameTimeout: Optional[int] = None
    showUI: Optional[bool] = None
    photoRotationInterval: Optional[int] = None  # Photo rotation interval in seconds
    calendarViewMode: Optional[str] = None  # 'month' or 'rolling'
    timeFormat: Optional[str] = None  # '12h' or '24h' (default: '24h')
    showModeIndicator: Optional[bool] = None  # Show mode indicator icon
    modeIndicatorTimeout: Optional[int] = None  # Mode indicator auto-hide timeout in seconds (0 = never hide)
    weekStartDay: Optional[int] = None  # Week starting day (0=Sunday, 1=Monday, ..., 6=Saturday)
    showWeekNumbers: Optional[bool] = None  # Show week numbers in calendar
    sideViewPosition: Optional[str] = None  # Side view position: 'left' | 'right' for landscape, 'top' | 'bottom' for portrait
    themeMode: Optional[str] = None  # Theme mode: 'light' | 'dark' | 'auto' | 'time'
    darkModeStart: Optional[int] = None  # Dark mode start hour (0-23)
    darkModeEnd: Optional[int] = None  # Dark mode end hour (0-23)
    # Allow arbitrary fields for extensibility
    class Config:
        extra = "allow"


@router.get("/config")
async def get_config():
    """Get current configuration."""
    config = await config_service.get_config()
    
    # Set defaults if not present
    if "orientation" not in config:
        config["orientation"] = "landscape"
    if "calendarSplit" not in config and "calendar_split" not in config:
        config["calendarSplit"] = 70.0
    elif "calendar_split" in config and "calendarSplit" not in config:
        config["calendarSplit"] = config["calendar_split"]
    if "keyboardType" not in config and "keyboard_type" not in config:
        config["keyboardType"] = "7-button"
    elif "keyboard_type" in config and "keyboardType" not in config:
        config["keyboardType"] = config["keyboard_type"]
    if "photoFrameEnabled" not in config and "photo_frame_enabled" not in config:
        config["photoFrameEnabled"] = False
    elif "photo_frame_enabled" in config and "photoFrameEnabled" not in config:
        config["photoFrameEnabled"] = config["photo_frame_enabled"]
    if "photoFrameTimeout" not in config and "photo_frame_timeout" not in config:
        config["photoFrameTimeout"] = 300
    elif "photo_frame_timeout" in config and "photoFrameTimeout" not in config:
        config["photoFrameTimeout"] = config["photo_frame_timeout"]
    if "showUI" not in config and "show_ui" not in config:
        config["showUI"] = True
    elif "show_ui" in config and "showUI" not in config:
        config["showUI"] = config["show_ui"]
    if "photoRotationInterval" not in config and "photo_rotation_interval" not in config:
        config["photoRotationInterval"] = 30  # 30 seconds default
    elif "photo_rotation_interval" in config and "photoRotationInterval" not in config:
        config["photoRotationInterval"] = config["photo_rotation_interval"]
    if "calendarViewMode" not in config and "calendar_view_mode" not in config:
        config["calendarViewMode"] = "month"  # 'month' or 'rolling'
    elif "calendar_view_mode" in config and "calendarViewMode" not in config:
        config["calendarViewMode"] = config["calendar_view_mode"]
    if "timeFormat" not in config and "time_format" not in config:
        config["timeFormat"] = "24h"  # '12h' or '24h' (default: '24h')
    elif "time_format" in config and "timeFormat" not in config:
        config["timeFormat"] = config["time_format"]
    if "showModeIndicator" not in config and "show_mode_indicator" not in config:
        config["showModeIndicator"] = True  # Show mode indicator by default
    elif "show_mode_indicator" in config and "showModeIndicator" not in config:
        config["showModeIndicator"] = config["show_mode_indicator"]
    if "modeIndicatorTimeout" not in config and "mode_indicator_timeout" not in config:
        config["modeIndicatorTimeout"] = 5  # 5 seconds default
    elif "mode_indicator_timeout" in config and "modeIndicatorTimeout" not in config:
        config["modeIndicatorTimeout"] = config["mode_indicator_timeout"]
    if "weekStartDay" not in config and "week_start_day" not in config:
        config["weekStartDay"] = 0  # Sunday default
    elif "week_start_day" in config and "weekStartDay" not in config:
        config["weekStartDay"] = config["week_start_day"]
    if "showWeekNumbers" not in config and "show_week_numbers" not in config:
        config["showWeekNumbers"] = False  # Hide week numbers by default
    elif "show_week_numbers" in config and "showWeekNumbers" not in config:
        config["showWeekNumbers"] = config["show_week_numbers"]
    if "sideViewPosition" not in config and "side_view_position" not in config:
        config["sideViewPosition"] = "right"  # Right/bottom default
    elif "side_view_position" in config and "sideViewPosition" not in config:
        config["sideViewPosition"] = config["side_view_position"]
    if "themeMode" not in config and "theme_mode" not in config:
        config["themeMode"] = "auto"  # Auto theme by default
    elif "theme_mode" in config and "themeMode" not in config:
        config["themeMode"] = config["theme_mode"]
    if "darkModeStart" not in config and "dark_mode_start" not in config:
        config["darkModeStart"] = 18  # 6 PM default
    elif "dark_mode_start" in config and "darkModeStart" not in config:
        config["darkModeStart"] = config["dark_mode_start"]
    if "darkModeEnd" not in config and "dark_mode_end" not in config:
        config["darkModeEnd"] = 6  # 6 AM default
    elif "dark_mode_end" in config and "darkModeEnd" not in config:
        config["darkModeEnd"] = config["dark_mode_end"]
    
    return config


@router.post("/config")
async def update_config(config_update: ConfigUpdate):
    """Update configuration."""
    update_dict = config_update.model_dump(exclude_unset=True)
    
    # Convert camelCase to snake_case for storage
    if "calendarSplit" in update_dict:
        update_dict["calendar_split"] = update_dict.pop("calendarSplit")
    if "keyboardType" in update_dict:
        update_dict["keyboard_type"] = update_dict.pop("keyboardType")
    if "photoFrameEnabled" in update_dict:
        update_dict["photo_frame_enabled"] = update_dict.pop("photoFrameEnabled")
    if "photoFrameTimeout" in update_dict:
        update_dict["photo_frame_timeout"] = update_dict.pop("photoFrameTimeout")
    if "showUI" in update_dict:
        update_dict["show_ui"] = update_dict.pop("showUI")
    if "photoRotationInterval" in update_dict:
        update_dict["photo_rotation_interval"] = update_dict.pop("photoRotationInterval")
    if "calendarViewMode" in update_dict:
        update_dict["calendar_view_mode"] = update_dict.pop("calendarViewMode")
    if "timeFormat" in update_dict:
        update_dict["time_format"] = update_dict.pop("timeFormat")
    if "showModeIndicator" in update_dict:
        update_dict["show_mode_indicator"] = update_dict.pop("showModeIndicator")
    if "modeIndicatorTimeout" in update_dict:
        update_dict["mode_indicator_timeout"] = update_dict.pop("modeIndicatorTimeout")
    if "weekStartDay" in update_dict:
        update_dict["week_start_day"] = update_dict.pop("weekStartDay")
    if "showWeekNumbers" in update_dict:
        update_dict["show_week_numbers"] = update_dict.pop("showWeekNumbers")
    if "sideViewPosition" in update_dict:
        update_dict["side_view_position"] = update_dict.pop("sideViewPosition")
    if "themeMode" in update_dict:
        update_dict["theme_mode"] = update_dict.pop("themeMode")
    if "darkModeStart" in update_dict:
        update_dict["dark_mode_start"] = update_dict.pop("darkModeStart")
    if "darkModeEnd" in update_dict:
        update_dict["dark_mode_end"] = update_dict.pop("darkModeEnd")
    
    await config_service.update_config(update_dict)
    
    # Return updated config
    return await get_config()

