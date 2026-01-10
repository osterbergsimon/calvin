"""Calendar API endpoints."""

from datetime import UTC, datetime, timedelta

import httpx
from fastapi import APIRouter, HTTPException, Query
from loguru import logger

from app.models.calendar import (
    CalendarEventsResponse,
    CalendarSource,
    CalendarSourcesResponse,
)
from app.plugins.calendar.google import _normalize_google_calendar_url
from app.services import plugin_calendar_service

# Loguru automatically includes module/function info in logs
router = APIRouter()


def normalize_datetime(dt: datetime | None) -> datetime | None:
    """Normalize datetime to timezone-aware (UTC if naive)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


async def validate_calendar_url(ical_url: str, calendar_type: str) -> None:
    """
    Validate that a calendar URL exists and is accessible.

    Args:
        ical_url: The calendar iCal URL to validate
        calendar_type: Type of calendar ('google', 'proton', or 'ical')

    Raises:
        HTTPException: If the calendar URL is invalid, inaccessible, or doesn't exist
    """
    if not ical_url or not ical_url.strip():
        raise HTTPException(
            status_code=400,
            detail="Calendar URL is required",
        )

    # Normalize Google Calendar URLs first
    url_to_check = ical_url
    if calendar_type == "google":
        try:
            url_to_check = _normalize_google_calendar_url(ical_url)
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid Google Calendar URL format: {str(e)}",
            ) from e

    # Try to fetch the calendar URL to verify it exists and is accessible
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            # Use HEAD request first (lighter weight, doesn't download content)
            try:
                response = await client.head(url_to_check)
                # If HEAD is not supported (405 Method Not Allowed), try GET instead
                if response.status_code == 405:
                    response = await client.get(url_to_check, headers={"Range": "bytes=0-8192"})
            except httpx.HTTPError:
                # If HEAD fails for other reasons, try GET with limited range
                response = await client.get(url_to_check, headers={"Range": "bytes=0-8192"})

            # Check if the request was successful
            # Accept 200 (OK), 206 (Partial Content), or 301/302
            # (redirects handled by follow_redirects=True)
            if response.status_code >= 400:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Calendar URL is not accessible (HTTP {response.status_code}). "
                        f"Please verify the URL is correct and the calendar is publicly accessible."
                    ),
                )

    except httpx.TimeoutException as e:
        raise HTTPException(
            status_code=400,
            detail=(
                "Timeout while trying to access calendar URL. "
                "Please check your internet connection and verify the URL is correct."
            ),
        ) from e
    except httpx.ConnectError as e:
        raise HTTPException(
            status_code=400,
            detail=(
                "Unable to connect to calendar URL. "
                "Please verify the URL is correct and the server is reachable."
            ),
        ) from e
    except httpx.HTTPStatusError as e:
        # This is raised by httpx when status_code >= 400 and raise_for_status() is called
        # But we're checking status_code manually, so this should be rare
        raise HTTPException(
            status_code=400,
            detail=(
                f"Calendar URL returned HTTP {e.response.status_code}. "
                f"Please verify the URL is correct and the calendar is publicly accessible."
            ),
        ) from e
    except HTTPException:
        # Re-raise HTTPException that we've already raised
        raise
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Error validating calendar URL: {str(e)}. Please verify the URL is correct.",
        ) from e


@router.get("/calendar/events", response_model=CalendarEventsResponse)
async def get_calendar_events(
    start_date: datetime | None = Query(None, description="Start date for events"),
    end_date: datetime | None = Query(None, description="End date for events"),
    source_ids: str | None = Query(None, description="Comma-separated source IDs"),
    refresh: bool | None = Query(False, description="Force refresh (clear cache)"),
):
    """
    Get calendar events for a date range.

    If start_date and end_date are not provided, defaults to current month.
    """
    # Normalize datetimes to timezone-aware (UTC if naive)
    start_date_normalized = normalize_datetime(start_date)
    end_date_normalized = normalize_datetime(end_date)

    logger.info(
        f"[CALENDAR API] get_calendar_events called: "
        f"start_date={start_date} -> {start_date_normalized}, "
        f"end_date={end_date} -> {end_date_normalized}, "
        f"source_ids={source_ids}, refresh={refresh}"
    )

    start_date = start_date_normalized
    end_date = end_date_normalized

    # Default to current month if not provided
    if not start_date:
        now = datetime.now(UTC)
        start_date = datetime(now.year, now.month, 1, tzinfo=UTC)

    if not end_date:
        if start_date:
            # End of month
            if start_date.month == 12:
                end_date = datetime(start_date.year + 1, 1, 1, tzinfo=UTC) - timedelta(days=1)
            else:
                end_date = datetime(
                    start_date.year, start_date.month + 1, 1, tzinfo=UTC
                ) - timedelta(days=1)
        else:
            now = datetime.now(UTC)
            if now.month == 12:
                end_date = datetime(now.year + 1, 1, 1, tzinfo=UTC) - timedelta(days=1)
            else:
                end_date = datetime(now.year, now.month + 1, 1, tzinfo=UTC) - timedelta(days=1)

    # Parse source IDs if provided
    source_id_list = None
    if source_ids:
        source_id_list = [s.strip() for s in source_ids.split(",")]

    # Clear cache if refresh is requested (only for the requested month, not entire cache)
    if refresh:
        # Extract month and year from start_date to clear only that month's cache
        # This prevents clearing the entire cache when just navigating months
        month = start_date.month
        year = start_date.year
        await plugin_calendar_service.clear_cache(month=month, year=year)
        logger.debug(f"Cleared cache for {year}-{month:02d} due to refresh request")

    # Get events from plugin service (aggregates from all calendar plugins)
    events = await plugin_calendar_service.get_events(start_date, end_date, source_id_list)

    return CalendarEventsResponse(
        events=events,
        start_date=start_date,
        end_date=end_date,
        total=len(events),
    )


@router.get("/calendar/sources", response_model=CalendarSourcesResponse)
async def get_calendar_sources():
    """Get all calendar sources from plugins (only from enabled plugin types)."""
    from sqlalchemy import select

    from app.database import AsyncSessionLocal
    from app.models.calendar import CalendarSource as CalendarSourceModel
    from app.models.db_models import PluginTypeDB
    from app.plugins.base import PluginType
    from app.plugins.loader import plugin_loader

    try:
        sources = await plugin_calendar_service.get_sources()

        # Filter out sources from disabled plugin types
        enabled_plugin_types = set()
        # Get plugin types from pluggy hooks
        plugin_types = plugin_loader.get_plugin_types()
        calendar_types = [t for t in plugin_types if t.get("plugin_type") == PluginType.CALENDAR]

        # Check enabled status from database
        async with AsyncSessionLocal() as session:
            for type_info in calendar_types:
                type_id = type_info.get("type_id")
                result = await session.execute(
                    select(PluginTypeDB).where(PluginTypeDB.type_id == type_id)
                )
                db_type = result.scalar_one_or_none()
                enabled = db_type.enabled if db_type else True  # Default to enabled
                if enabled:
                    enabled_plugin_types.add(type_id)

        # Filter sources to only include enabled plugin types
        legacy_types = ["google", "proton", "ical"]
        filtered_sources = [
            s
            for s in sources
            if s.get("type") in enabled_plugin_types or s.get("type") in legacy_types
        ]

        # Convert to CalendarSource models for response
        source_models = [
            CalendarSourceModel(
                id=s["id"],
                type=s["type"],
                name=s["name"],
                enabled=s["enabled"],
                running=s.get("running", False),  # Include running state
                ical_url=s.get("ical_url"),
                api_key=s.get("api_key"),
                color=s.get("color"),
                show_time=s.get("show_time", True),
            )
            for s in filtered_sources
        ]
        return CalendarSourcesResponse(sources=source_models, total=len(source_models))
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error fetching calendar sources: {str(e)}")


@router.post("/calendar/sources", response_model=CalendarSource)
async def add_calendar_source(source: CalendarSource):
    """
    Add a new calendar source plugin.

    For Google Calendar:
    - type: "google"
    - ical_url: The public iCal URL or share URL from Google Calendar
    - Share URL example: https://calendar.google.com/calendar/u/0?cid=...
    - iCal URL example: https://calendar.google.com/calendar/ical/.../basic.ics
    - The service will automatically convert share URLs to iCal format.

    For Proton Calendar or other iCal sources:
    - type: "proton" or "ical"
    - ical_url: The iCal feed URL
    - URL format: https://calendar.proton.me/api/calendar/v1/url/{calendar_id}/calendar.ics?CacheKey=...&PassphraseKey=...
    - You can get this URL from Proton Calendar's sharing settings.
    - The URL includes authentication parameters (CacheKey and PassphraseKey) in the query string.

    Calendar events are cached for 5 minutes and automatically refreshed.

    Note: Google Calendar URLs are automatically normalized by the plugin during initialization.
    """
    # Validate Proton Calendar URL format
    if source.type == "proton" and source.ical_url:
        proton_url_prefix = "https://calendar.proton.me/api/calendar/v1/url/"
        if not source.ical_url.startswith(proton_url_prefix):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Invalid Proton Calendar URL. Expected format: "
                    "https://calendar.proton.me/api/calendar/v1/url/"
                    "{calendar_id}/calendar.ics?CacheKey=...&PassphraseKey=..."
                ),
            )
        if "/calendar.ics" not in source.ical_url:
            raise HTTPException(
                status_code=400,
                detail="Invalid Proton Calendar URL. Must include '/calendar.ics' endpoint.",
            )

    # Validate that the calendar URL exists and is accessible
    # Check if ical_url is provided (even if empty, we want to validate it)
    if source.ical_url is not None:
        await validate_calendar_url(source.ical_url, source.type)

    # Determine plugin type_id
    type_id = (
        "google" if source.type == "google" else ("proton" if source.type == "proton" else "ical")
    )

    # Register plugin using unified system
    from app.plugins.registry import plugin_registry

    await plugin_registry.register_plugin(
        plugin_id=source.id,
        type_id=type_id,
        name=source.name,
        config={
            "ical_url": source.ical_url,
            "api_key": source.api_key,
            "color": source.color,
            "show_time": source.show_time,
        },
        enabled=source.enabled,
    )

    return source


@router.put("/calendar/sources/{source_id}", response_model=CalendarSource)
async def update_calendar_source(source_id: str, source: CalendarSource):
    """Update a calendar source plugin (e.g., color, show_time)."""
    from sqlalchemy import select

    from app.database import AsyncSessionLocal
    from app.models.db_models import PluginDB
    from app.plugins.loader import plugin_loader
    from app.plugins.manager import plugin_manager
    from app.plugins.protocols import CalendarPlugin

    # Validate Proton Calendar URL format if URL is provided
    if source.type == "proton" and source.ical_url:
        proton_url_prefix = "https://calendar.proton.me/api/calendar/v1/url/"
        if not source.ical_url.startswith(proton_url_prefix):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Invalid Proton Calendar URL. Expected format: "
                    "https://calendar.proton.me/api/calendar/v1/url/"
                    "{calendar_id}/calendar.ics?CacheKey=...&PassphraseKey=..."
                ),
            )
        if "/calendar.ics" not in source.ical_url:
            raise HTTPException(
                status_code=400,
                detail="Invalid Proton Calendar URL. Must include '/calendar.ics' endpoint.",
            )

    # Validate that the calendar URL exists and is accessible if URL is provided
    # Check if ical_url is provided (even if empty, we want to validate it)
    if source.ical_url is not None:
        await validate_calendar_url(source.ical_url, source.type)

    # Update in database first
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(PluginDB).where(PluginDB.id == source_id))
        db_plugin = result.scalar_one_or_none()
        if not db_plugin:
            raise HTTPException(status_code=404, detail="Calendar source not found")

        # Update database
        db_plugin.name = source.name
        db_plugin.enabled = source.enabled
        config = db_plugin.config or {}
        config.update(
            {
                "ical_url": source.ical_url,
                "api_key": source.api_key,
                "color": source.color,
                "show_time": source.show_time,
            }
        )
        db_plugin.config = config
        await session.commit()
        await session.refresh(db_plugin)

    # Handle instance creation/removal based on enabled status
    existing_plugin = plugin_manager.get_plugin(source_id)

    if source.enabled:
        # Plugin is being enabled - create instance if it doesn't exist
        if not existing_plugin or not isinstance(existing_plugin, CalendarPlugin):
            # Create and register the plugin instance
            plugin = plugin_loader.create_plugin_instance(
                plugin_id=source_id,
                type_id=db_plugin.type_id,
                name=source.name,
                config={**config, "enabled": True},
            )
            if plugin:
                await plugin.configure(config)
                plugin.enable()
                plugin_manager.register(plugin)
                # Initialize and start the plugin
                await plugin.initialize()
                plugin.start()
        else:
            # Plugin exists, just update it
            await existing_plugin.configure(config)
            if not existing_plugin.enabled:
                existing_plugin.enable()
            # Start the plugin if it's not running
            if not existing_plugin.is_running():
                await existing_plugin.initialize()
                existing_plugin.start()
    else:
        # Plugin is being disabled - stop and remove instance
        if existing_plugin and isinstance(existing_plugin, CalendarPlugin):
            try:
                # Stop the plugin first
                if existing_plugin.is_running():
                    existing_plugin.stop()
                    await existing_plugin.cleanup()
                # Then unregister it
                plugin_manager.unregister(source_id)
            except Exception:
                import logging

                logger = logging.getLogger(__name__)
                logger.exception("Error cleaning up disabled plugin {}", source_id)

    return source


@router.delete("/calendar/sources/{source_id}")
async def remove_calendar_source(source_id: str):
    """Remove a calendar source plugin."""
    from app.plugins.registry import plugin_registry

    # Unregister plugin using unified system
    removed = await plugin_registry.unregister_plugin(source_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Calendar source not found")

    return {"message": "Calendar source removed", "source_id": source_id}


@router.post("/calendar/refresh")
async def refresh_calendar_cache(
    month: int | None = Query(None, description="Optional month (1-12) to refresh specific month"),
    year: int | None = Query(None, description="Optional year to refresh specific month"),
):
    """
    Manually refresh calendar cache.

    If month and year are provided, only refreshes that specific month.
    Otherwise, refreshes all cached months (current, previous, next).
    """
    if month is not None and year is not None:
        if month < 1 or month > 12:
            raise HTTPException(status_code=400, detail="Month must be between 1 and 12")

        # Clear cache for specific month
        await plugin_calendar_service.clear_cache(month=month, year=year)

        # Preload that specific month
        from datetime import UTC

        start_date = datetime(year, month, 1, tzinfo=UTC)
        if month == 12:
            end_date = datetime(year + 1, 1, 1, tzinfo=UTC) - timedelta(days=1)
        else:
            end_date = datetime(year, month + 1, 1, tzinfo=UTC) - timedelta(days=1)
        end_date = end_date.replace(hour=23, minute=59, second=59, microsecond=999999)

        # Add buffer days for multi-day events
        start_date = start_date - timedelta(days=7)
        end_date = end_date + timedelta(days=7)

        await plugin_calendar_service.get_events(start_date, end_date)

        return {
            "message": f"Calendar cache refreshed for {year}-{month:02d}",
            "month": month,
            "year": year,
        }
    else:
        # Refresh all cached months (current, previous, next)
        await plugin_calendar_service.preload_months(months_to_preload=1)
        return {"message": "Calendar cache refreshed for all cached months"}
