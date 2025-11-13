"""Configuration endpoints."""

from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.config_service import config_service

router = APIRouter()


class ConfigUpdate(BaseModel):
    """Configuration update model."""

    orientation: str | None = None
    orientationFlipped: bool | None = None  # Whether orientation is flipped (180° rotation)
    calendarSplit: float | None = None
    lastSideViewMode: str | None = None  # Last side view mode ('photos' | 'web_services')
    keyboardType: str | None = None
    photoFrameEnabled: bool | None = None
    photoFrameTimeout: int | None = None
    showUI: bool | None = None
    photoRotationInterval: int | None = None  # Photo rotation interval in seconds
    calendarViewMode: str | None = None  # 'month' | 'week' | 'day' | 'rolling'
    timeFormat: str | None = None  # '12h' or '24h' (default: '24h')
    showModeIndicator: bool | None = None  # Show mode indicator icon
    modeIndicatorTimeout: int | None = (
        None  # Mode indicator auto-hide timeout in seconds (0 = never hide)
    )
    weekStartDay: int | None = None  # Week starting day (0=Sunday, 1=Monday, ..., 6=Saturday)
    showWeekNumbers: bool | None = None  # Show week numbers in calendar
    sideViewPosition: str | None = (
        None  # Side view position: 'left' | 'right' for landscape, 'top' | 'bottom' for portrait
    )
    themeMode: str | None = None  # Theme mode: 'light' | 'dark' | 'auto' | 'time'
    darkModeStart: int | None = None  # Dark mode start hour (0-23)
    darkModeEnd: int | None = None  # Dark mode end hour (0-23)
    displayScheduleEnabled: bool | None = None  # Enable display power schedule
    # Display off time (format: "HH:MM") - deprecated, use displaySchedule
    displayOffTime: str | None = None
    # Display on time (format: "HH:MM") - deprecated, use displaySchedule
    displayOnTime: str | None = None
    # Display schedule as JSON string or array:
    # [{"day": 0-6, "enabled": bool, "onTime": "HH:MM", "offTime": "HH:MM"}, ...]
    displaySchedule: str | list[dict[str, Any]] | None = None
    displayTimeoutEnabled: bool | None = None  # Enable display timeout (screensaver)
    displayTimeout: int | None = None  # Display timeout in seconds (0 = never, default: 0)
    rebootComboKey1: str | None = None  # First key for reboot combo (e.g., "KEY_1")
    rebootComboKey2: str | None = None  # Second key for reboot combo (e.g., "KEY_7")
    rebootComboDuration: int | None = None  # Reboot combo duration in milliseconds (default: 10000)
    # Image display mode: 'fit', 'fill', 'crop', 'center', 'smart' (default: 'smart')
    imageDisplayMode: str | None = None
    randomizeImages: bool | None = None  # Randomize image order (default: False)
    # Timezone (e.g., "America/New_York", "Europe/London", "UTC") - null = system timezone
    timezone: str | None = None
    gitRepoUrl: str | None = None  # Git repository URL for updates (default: 'https://github.com/osterbergsimon/calvin.git')
    gitBranch: str | None = None  # Git branch to use for updates (default: 'main')

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
    if "orientationFlipped" not in config and "orientation_flipped" not in config:
        config["orientationFlipped"] = False  # Default to not flipped
    elif "orientation_flipped" in config and "orientationFlipped" not in config:
        config["orientationFlipped"] = config["orientation_flipped"]
    if "lastSideViewMode" not in config and "last_side_view_mode" not in config:
        config["lastSideViewMode"] = "photos"  # Default to photos
    elif "last_side_view_mode" in config and "lastSideViewMode" not in config:
        config["lastSideViewMode"] = config["last_side_view_mode"]
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
        config["calendarViewMode"] = "month"  # 'month' | 'week' | 'day' | 'rolling'
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
    # Handle themeMode - prioritize saved value from database
    if "theme_mode" in config:
        config["themeMode"] = config["theme_mode"]
    elif "themeMode" in config:
        # Already in camelCase, keep it
        pass
    else:
        config["themeMode"] = "auto"  # Auto theme by default
    # Handle darkModeStart - prioritize saved value from database
    if "dark_mode_start" in config:
        config["darkModeStart"] = config["dark_mode_start"]
    elif "darkModeStart" in config:
        # Already in camelCase, keep it
        pass
    else:
        config["darkModeStart"] = 18  # 6 PM default
    # Handle darkModeEnd - prioritize saved value from database
    if "dark_mode_end" in config:
        config["darkModeEnd"] = config["dark_mode_end"]
    elif "darkModeEnd" in config:
        # Already in camelCase, keep it
        pass
    else:
        config["darkModeEnd"] = 6  # 6 AM default
    if "displayScheduleEnabled" not in config and "display_schedule_enabled" not in config:
        config["displayScheduleEnabled"] = False  # Disabled by default
    elif "display_schedule_enabled" in config and "displayScheduleEnabled" not in config:
        config["displayScheduleEnabled"] = config["display_schedule_enabled"]
    if "displayOffTime" not in config and "display_off_time" not in config:
        config["displayOffTime"] = "22:00"  # 10 PM default
    elif "display_off_time" in config and "displayOffTime" not in config:
        config["displayOffTime"] = config["display_off_time"]
    if "displayOnTime" not in config and "display_on_time" not in config:
        config["displayOnTime"] = "06:00"  # 6 AM default
    elif "display_on_time" in config and "displayOnTime" not in config:
        config["displayOnTime"] = config["display_on_time"]
    # Handle display schedule (per-day schedule)
    # Check if we have a valid schedule (not None, not empty string, not empty list)
    has_schedule = False
    schedule_value = None

    if "displaySchedule" in config:
        schedule_value = config["displaySchedule"]
        is_valid = (
            schedule_value is not None
            and schedule_value != ""
            and (not isinstance(schedule_value, list) or len(schedule_value) > 0)
        )
        if is_valid:
            has_schedule = True
    elif "display_schedule" in config:
        schedule_value = config["display_schedule"]
        if schedule_value is not None and schedule_value != "":
            # Parse JSON string if needed (if stored as string - old format)
            # If stored with value_type="json", it's already parsed by _parse_value()
            import json
            if isinstance(schedule_value, str):
                try:
                    # Old format: stored as string, need to parse
                    parsed = json.loads(schedule_value)
                    if parsed is not None and isinstance(parsed, list) and len(parsed) > 0:
                        config["displaySchedule"] = parsed
                        has_schedule = True
                        # Migrate old format to new format (update value_type to "json")
                        # This ensures future retrievals work correctly
                        try:
                            await config_service.set_value(
                                "display_schedule", parsed, value_type="json"
                            )
                        except Exception:
                            # Migration failed, but we can still use the parsed value
                            pass
                except (json.JSONDecodeError, TypeError):
                    # Invalid JSON, skip
                    pass
            elif isinstance(schedule_value, list):
                # Already parsed (stored with value_type="json" - new format)
                if len(schedule_value) > 0:
                    config["displaySchedule"] = schedule_value
                    has_schedule = True
            elif schedule_value is not None:
                # Fallback for other types
                config["displaySchedule"] = schedule_value
                has_schedule = True

    # If no valid schedule found, use default
    if not has_schedule:
        # Default: all days enabled, 06:00-22:00
        default_schedule = [
            {"day": i, "enabled": True, "onTime": "06:00", "offTime": "22:00"}
            for i in range(7)
        ]
        config["displaySchedule"] = default_schedule
    if "rebootComboKey1" not in config and "reboot_combo_key1" not in config:
        config["rebootComboKey1"] = "KEY_1"  # Default first key
    elif "reboot_combo_key1" in config and "rebootComboKey1" not in config:
        config["rebootComboKey1"] = config["reboot_combo_key1"]
    if "rebootComboKey2" not in config and "reboot_combo_key2" not in config:
        config["rebootComboKey2"] = "KEY_7"  # Default second key
    elif "reboot_combo_key2" in config and "rebootComboKey2" not in config:
        config["rebootComboKey2"] = config["reboot_combo_key2"]
    if "rebootComboDuration" not in config and "reboot_combo_duration" not in config:
        config["rebootComboDuration"] = 10000  # 10 seconds default
    elif "reboot_combo_duration" in config and "rebootComboDuration" not in config:
        config["rebootComboDuration"] = config["reboot_combo_duration"]
    if "displayTimeoutEnabled" not in config and "display_timeout_enabled" not in config:
        config["displayTimeoutEnabled"] = False  # Disabled by default - keep display on
    elif "display_timeout_enabled" in config and "displayTimeoutEnabled" not in config:
        config["displayTimeoutEnabled"] = config["display_timeout_enabled"]
    if "displayTimeout" not in config and "display_timeout" not in config:
        config["displayTimeout"] = 0  # 0 = never (disabled by default - keep display on)
    elif "display_timeout" in config and "displayTimeout" not in config:
        config["displayTimeout"] = config["display_timeout"]
    if "imageDisplayMode" not in config and "image_display_mode" not in config:
        config["imageDisplayMode"] = "smart"  # Smart mode by default
    elif "image_display_mode" in config and "imageDisplayMode" not in config:
        config["imageDisplayMode"] = config["image_display_mode"]
    if "randomizeImages" not in config and "randomize_images" not in config:
        config["randomizeImages"] = False  # Don't randomize by default
    elif "randomize_images" in config and "randomizeImages" not in config:
        randomize_value = config["randomize_images"]
        is_randomize = (
            randomize_value == "true"
            if isinstance(randomize_value, str)
            else bool(randomize_value)
        )
        config["randomizeImages"] = is_randomize
    if "timezone" not in config:
        config["timezone"] = None  # No timezone set by default (use system timezone)
    # Note: timezone is stored as-is (no camelCase conversion needed)
    # Handle clock settings
    if "clockEnabled" not in config and "clock_enabled" not in config:
        config["clockEnabled"] = True  # Clock enabled by default
    elif "clock_enabled" in config and "clockEnabled" not in config:
        config["clockEnabled"] = config["clock_enabled"]
    if "clockDisplayMode" not in config and "clock_display_mode" not in config:
        config["clockDisplayMode"] = "header"  # Default: show only when header is visible
    elif "clock_display_mode" in config and "clockDisplayMode" not in config:
        config["clockDisplayMode"] = config["clock_display_mode"]
    if "clockShowDate" not in config and "clock_show_date" not in config:
        config["clockShowDate"] = False  # Don't show date by default
    elif "clock_show_date" in config and "clockShowDate" not in config:
        config["clockShowDate"] = config["clock_show_date"]
    if "clockShowSeconds" not in config and "clock_show_seconds" not in config:
        config["clockShowSeconds"] = False  # Don't show seconds by default
    elif "clock_show_seconds" in config and "clockShowSeconds" not in config:
        config["clockShowSeconds"] = config["clock_show_seconds"]
    if "clockPosition" not in config and "clock_position" not in config:
        config["clockPosition"] = "top-right"  # Default position
    elif "clock_position" in config and "clockPosition" not in config:
        config["clockPosition"] = config["clock_position"]
    if "clockSize" not in config and "clock_size" not in config:
        config["clockSize"] = "medium"  # Default size
    elif "clock_size" in config and "clockSize" not in config:
        config["clockSize"] = config["clock_size"]
    if "mealPlanCardSize" not in config and "meal_plan_card_size" not in config:
        config["mealPlanCardSize"] = "medium"  # Default size
    elif "meal_plan_card_size" in config and "mealPlanCardSize" not in config:
        config["mealPlanCardSize"] = config["meal_plan_card_size"]
    if "gitRepoUrl" not in config and "git_repo_url" not in config:
        config["gitRepoUrl"] = "https://github.com/osterbergsimon/calvin.git"  # Default repo
    elif "git_repo_url" in config and "gitRepoUrl" not in config:
        config["gitRepoUrl"] = config["git_repo_url"]
    if "gitBranch" not in config and "git_branch" not in config:
        config["gitBranch"] = "main"  # Default to main branch
    elif "git_branch" in config and "gitBranch" not in config:
        config["gitBranch"] = config["git_branch"]

    return config


@router.post("/config")
async def update_config(config_update: ConfigUpdate):
    """Update configuration."""
    update_dict = config_update.model_dump(exclude_unset=True)

    # Convert camelCase to snake_case for storage
    if "orientationFlipped" in update_dict:
        update_dict["orientation_flipped"] = update_dict.pop("orientationFlipped")
    if "lastSideViewMode" in update_dict:
        update_dict["last_side_view_mode"] = update_dict.pop("lastSideViewMode")
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
    if "displayScheduleEnabled" in update_dict:
        update_dict["display_schedule_enabled"] = update_dict.pop("displayScheduleEnabled")
    if "displayOffTime" in update_dict:
        update_dict["display_off_time"] = update_dict.pop("displayOffTime")
    if "displayOnTime" in update_dict:
        update_dict["display_on_time"] = update_dict.pop("displayOnTime")
    if "displaySchedule" in update_dict:
        # Store schedule with explicit type
        # Pass the schedule directly (list/array) to set_value, which will serialize it
        import json
        schedule = update_dict.pop("displaySchedule")
        if isinstance(schedule, str):
            # If it's already a JSON string, parse it first so we store the actual data structure
            try:
                schedule = json.loads(schedule)
            except json.JSONDecodeError:
                # Invalid JSON, skip storing
                pass

        # Store with explicit value_type="json" so it gets parsed correctly on retrieval
        # Pass the list directly - set_value will serialize it with json.dumps()
        # This will also update any old entries that were stored with value_type="string"
        await config_service.set_value("display_schedule", schedule, value_type="json")
    if "rebootComboKey1" in update_dict:
        update_dict["reboot_combo_key1"] = update_dict.pop("rebootComboKey1")
    if "rebootComboKey2" in update_dict:
        update_dict["reboot_combo_key2"] = update_dict.pop("rebootComboKey2")
    if "rebootComboDuration" in update_dict:
        update_dict["reboot_combo_duration"] = update_dict.pop("rebootComboDuration")
    if "displayTimeoutEnabled" in update_dict:
        update_dict["display_timeout_enabled"] = update_dict.pop("displayTimeoutEnabled")
    if "displayTimeout" in update_dict:
        update_dict["display_timeout"] = update_dict.pop("displayTimeout")
    if "imageDisplayMode" in update_dict:
        update_dict["image_display_mode"] = update_dict.pop("imageDisplayMode")
    if "randomizeImages" in update_dict:
        # Convert boolean to string for storage
        randomize_value = update_dict.pop("randomizeImages")
        update_dict["randomize_images"] = "true" if randomize_value else "false"
    if "timezone" in update_dict:
        # Store timezone as-is (no camelCase conversion needed)
        update_dict["timezone"] = update_dict.pop("timezone")
    if "gitRepoUrl" in update_dict:
        update_dict["git_repo_url"] = update_dict.pop("gitRepoUrl")
        # Also update /etc/default/calvin-update file
        import os
        calvin_update_file = Path("/etc/default/calvin-update")
        if calvin_update_file.exists():
            try:
                # Read existing file
                with open(calvin_update_file) as f:
                    lines = f.readlines()

                # Update or add GIT_REPO line
                updated = False
                new_lines = []
                for line in lines:
                    if line.startswith("GIT_REPO="):
                        new_lines.append(f"GIT_REPO={update_dict['git_repo_url']}\n")
                        updated = True
                    else:
                        new_lines.append(line)

                if not updated:
                    # Add GIT_REPO if it doesn't exist
                    new_lines.append(f"GIT_REPO={update_dict['git_repo_url']}\n")

                # Write back
                with open(calvin_update_file, "w") as f:
                    f.writelines(new_lines)
            except Exception as e:
                # Log error but don't fail the config update
                print(f"Warning: Failed to update /etc/default/calvin-update: {e}")
    if "gitBranch" in update_dict:
        update_dict["git_branch"] = update_dict.pop("gitBranch")
        # Also update /etc/default/calvin-update file
        calvin_update_file = Path("/etc/default/calvin-update")
        if calvin_update_file.exists():
            try:
                # Read existing file
                with open(calvin_update_file) as f:
                    lines = f.readlines()

                # Update or add GIT_BRANCH line
                updated = False
                new_lines = []
                for line in lines:
                    if line.startswith("GIT_BRANCH="):
                        new_lines.append(f"GIT_BRANCH={update_dict['git_branch']}\n")
                        updated = True
                    else:
                        new_lines.append(line)

                if not updated:
                    # Add GIT_BRANCH if it doesn't exist
                    new_lines.append(f"GIT_BRANCH={update_dict['git_branch']}\n")

                # Write back
                with open(calvin_update_file, "w") as f:
                    f.writelines(new_lines)
            except Exception as e:
                # Log error but don't fail the config update
                print(f"Warning: Failed to update /etc/default/calvin-update: {e}")

    await config_service.update_config(update_dict)

    # Return updated config
    return await get_config()


@router.get("/config/git/branches")
async def get_git_branches(repo_url: str | None = None):
    """
    Fetch available branches from a git repository.

    Args:
        repo_url: Git repository URL (e.g., https://github.com/user/repo.git)
                 If not provided, uses the configured git_repo_url or default

    Returns:
        List of branch names
    """
    import re
    import subprocess

    # Get repo URL from parameter, config, or default
    if not repo_url:
        from app.services.config_service import config_service
        repo_url = await config_service.get_value("git_repo_url")
        if not repo_url:
            repo_url = "https://github.com/osterbergsimon/calvin.git"
    
    try:
        # Use git ls-remote to fetch branches without cloning
        # This works for public repos and doesn't require authentication
        result = subprocess.run(
            ["git", "ls-remote", "--heads", repo_url],
            capture_output=True,
            text=True,
            timeout=10,
        )

        if result.returncode != 0:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to fetch branches: {result.stderr}"
            )

        # Parse branch names from output
        # Format: <commit_hash>	refs/heads/branch_name
        branches = []
        for line in result.stdout.strip().split("\n"):
            if line:
                # Extract branch name from refs/heads/branch_name
                match = re.search(r"refs/heads/(.+)$", line)
                if match:
                    branches.append(match.group(1))

        # Sort branches (main/master first, then alphabetically)
        def sort_key(branch):
            if branch in ["main", "master"]:
                return (0, branch)
            return (1, branch)

        branches.sort(key=sort_key)

        return {"branches": branches, "repo_url": repo_url}

    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=408,
            detail="Request timeout while fetching branches"
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail="Git is not installed on this system"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch branches: {str(e)}"
        )
