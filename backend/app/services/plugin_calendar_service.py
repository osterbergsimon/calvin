"""Calendar service using plugin architecture."""

from datetime import UTC, datetime, timedelta

import httpx
from loguru import logger

from app.models.calendar import CalendarEvent
from app.plugins.base import PluginType
from app.plugins.manager import plugin_manager
from app.plugins.protocols import CalendarPlugin

# Loguru automatically includes module/function info in logs via format string


class PluginCalendarService:
    """Calendar service using plugin architecture."""

    def __init__(self):
        """Initialize calendar service."""
        self._cache: dict = {}
        self._cache_ttl = timedelta(minutes=5)
        self._default_refresh_interval_minutes = 15  # Default refresh interval in minutes

    async def clear_cache(self, month: int | None = None, year: int | None = None) -> None:
        """
        Clear the event cache.

        Args:
            month: Optional month (1-12) to clear specific month cache
            year: Optional year to clear specific month cache (required if month is provided)
        """
        if month is not None and year is not None:
            # Clear cache for specific month
            # Cache keys are in format: "{plugin_id}:{start_date}:{end_date}"
            # We need to match keys that fall within the specified month/year
            keys_to_remove = []
            for key in self._cache.keys():
                # Extract date range from cache key
                parts = key.split(":")
                if len(parts) >= 3:
                    try:
                        start_date_str = parts[1]
                        start_date = datetime.fromisoformat(start_date_str.replace("Z", "+00:00"))
                        # Check if start date falls within the specified month/year
                        if start_date.year == year and start_date.month == month:
                            keys_to_remove.append(key)
                    except (ValueError, IndexError):
                        # Invalid key format, skip
                        continue

            for key in keys_to_remove:
                del self._cache[key]

            logger.info(f"Cleared cache for {year}-{month:02d} ({len(keys_to_remove)} entries)")
        else:
            # Clear all cache
            cache_size = len(self._cache)
            self._cache.clear()
            logger.info(f"Cleared entire calendar cache ({cache_size} entries)")

    async def preload_months(self, months_to_preload: int = 1) -> None:
        """
        Preload events for current month and adjacent months.

        Args:
            months_to_preload: Number of months before/after current month to preload (default: 1)
        """
        from datetime import UTC

        now = datetime.now(UTC)
        current_year = now.year
        current_month = now.month

        # Calculate date ranges for each month to preload
        months_to_fetch = []

        # Previous months
        for i in range(months_to_preload, 0, -1):
            target_month = current_month - i
            target_year = current_year
            if target_month <= 0:
                target_month += 12
                target_year -= 1
            months_to_fetch.append((target_year, target_month))

        # Current month
        months_to_fetch.append((current_year, current_month))

        # Next months
        for i in range(1, months_to_preload + 1):
            target_month = current_month + i
            target_year = current_year
            if target_month > 12:
                target_month -= 12
                target_year += 1
            months_to_fetch.append((target_year, target_month))

        # Fetch events for each month
        for year, month in months_to_fetch:
            start_date = datetime(year, month, 1, tzinfo=UTC)
            if month == 12:
                end_date = datetime(year + 1, 1, 1, tzinfo=UTC) - timedelta(days=1)
            else:
                end_date = datetime(year, month + 1, 1, tzinfo=UTC) - timedelta(days=1)
            end_date = end_date.replace(hour=23, minute=59, second=59, microsecond=999999)

            # Add buffer days for multi-day events
            start_date = start_date - timedelta(days=7)
            end_date = end_date + timedelta(days=7)

            try:
                await self.get_events(start_date, end_date)
                logger.info(f"Preloaded events for {year}-{month:02d}")
            except Exception as e:
                logger.warning(f"Failed to preload events for {year}-{month:02d}: {e}")

    async def get_events(
        self,
        start_date: datetime,
        end_date: datetime,
        source_ids: list[str] | None = None,
    ) -> list[CalendarEvent]:
        """
        Get calendar events for a date range from all enabled calendar plugins.

        Args:
            start_date: Start date for events (timezone-aware or naive)
            end_date: End date for events (timezone-aware or naive)
            source_ids: Optional list of source IDs to filter by

        Returns:
            List of calendar events (all timezone-aware)
        """
        # Diagnostic: Log at ERROR level first to ensure it's visible
        logger.error("[CALENDAR SERVICE] ⚠️ DIAGNOSTIC: Logger initialized and working")

        logger.info(
            "get_events called: start_date={}, end_date={}, source_ids={}, cache_size={}",
            start_date,
            end_date,
            source_ids,
            len(self._cache),
        )
        events: list[CalendarEvent] = []

        # Normalize start_date and end_date to timezone-aware (UTC if naive)
        if start_date.tzinfo is None:
            start_date = start_date.replace(tzinfo=UTC)
        if end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=UTC)

        logger.debug(
            f"[CALENDAR SERVICE] Normalized dates: start_date={start_date.isoformat()}, "
            f"end_date={end_date.isoformat()}"
        )

        # Get all enabled calendar plugins
        plugins = plugin_manager.get_plugins(PluginType.CALENDAR, enabled_only=True)
        logger.info(f"[CALENDAR SERVICE] Found {len(plugins)} enabled calendar plugins")

        # Filter by source IDs if specified
        if source_ids:
            plugins = [p for p in plugins if p.plugin_id in source_ids]

        # Fetch events from all plugins
        for plugin in plugins:
            if not isinstance(plugin, CalendarPlugin):
                continue

            # Try to find cached events that overlap with the requested date range
            cached_events = []
            cached_event_ids = set()  # Track event IDs to avoid duplicates
            needs_fetch = True
            fully_covered = False

            # Log all cache keys for this plugin for debugging
            all_cache_keys = [k for k in self._cache.keys() if k.startswith(f"{plugin.plugin_id}:")]
            msg = (
                f"[CALENDAR SERVICE] Checking cache for {plugin.plugin_id}. "
                f"Requested range: {start_date.date()} to {end_date.date()} "
                f"({start_date.isoformat()} to {end_date.isoformat()}). "
                f"Total cache entries: {len(self._cache)}, "
                f"Entries for this plugin: {len(all_cache_keys)}"
            )
            logger.info(msg)
            if all_cache_keys:
                logger.info(f"[CALENDAR SERVICE] Existing cache keys for {plugin.plugin_id}:")
                for cache_key in all_cache_keys[:5]:  # Show first 5 cache keys
                    # Extract dates from cache key for readability
                    try:
                        parts = cache_key.split(":", 2)
                        if len(parts) >= 3:
                            cached_start_str = parts[1].replace("Z", "+00:00")
                            cached_end_str = parts[2].replace("Z", "+00:00")
                            cached_start = datetime.fromisoformat(cached_start_str)
                            cached_end = datetime.fromisoformat(cached_end_str)
                            if cached_start.tzinfo is None:
                                cached_start = cached_start.replace(tzinfo=UTC)
                            if cached_end.tzinfo is None:
                                cached_end = cached_end.replace(tzinfo=UTC)
                            cache_age = datetime.now(UTC) - self._cache[cache_key]["timestamp"]
                            logger.info(
                                f"  - Cache key: {cache_key[:80]}... "
                                f"({cached_start.date()} to {cached_end.date()}), "
                                f"age: {cache_age.total_seconds():.0f}s, "
                                f"events: {len(self._cache[cache_key]['events'])}"
                            )
                    except Exception:
                        logger.info(f"  - Cache key: {cache_key[:80]}... (parse error)")
                if len(all_cache_keys) > 5:
                    logger.info(f"  ... and {len(all_cache_keys) - 5} more cache entries")

            # Look for overlapping cached date ranges
            checked_count = 0
            expired_count = 0
            for cache_key, cached_data in self._cache.items():
                checked_count += 1
                # Skip if cache entry is expired
                cache_age = datetime.now(UTC) - cached_data["timestamp"]
                if cache_age >= self._cache_ttl:
                    expired_count += 1
                    if cache_key.startswith(f"{plugin.plugin_id}:"):
                        logger.debug(
                            f"[CALENDAR SERVICE] Cache entry expired for {plugin.plugin_id}: "
                            f"{cache_key[:80]}... (age: {cache_age.total_seconds():.0f}s, "
                            f"TTL: {self._cache_ttl.total_seconds():.0f}s)"
                        )
                    continue

                # Extract plugin_id and date range from cache key
                # Format: "{plugin_id}:{start_date}:{end_date}"
                if not cache_key.startswith(f"{plugin.plugin_id}:"):
                    continue

                try:
                    parts = cache_key.split(":", 2)
                    if len(parts) < 3:
                        continue

                    # Parse cached date range and ensure timezone-aware (UTC)
                    cached_start_str = parts[1].replace("Z", "+00:00")
                    cached_end_str = parts[2].replace("Z", "+00:00")
                    cached_start = datetime.fromisoformat(cached_start_str)
                    cached_end = datetime.fromisoformat(cached_end_str)

                    # Ensure timezone-aware for comparison
                    if cached_start.tzinfo is None:
                        cached_start = cached_start.replace(tzinfo=UTC)
                    if cached_end.tzinfo is None:
                        cached_end = cached_end.replace(tzinfo=UTC)

                    # Check if cached range overlaps with requested range
                    # Overlap exists if: cached_start <= end_date AND cached_end >= start_date
                    overlaps = cached_start <= end_date and cached_end >= start_date

                    if overlaps:
                        # Check if this cache entry fully covers the requested range
                        entry_fully_covers = cached_start <= start_date and cached_end >= end_date
                        if entry_fully_covers:
                            fully_covered = True

                        logger.info(
                            "✅ Found OVERLAPPING cache entry for {}: "
                            "cached_range=({} to {}), "
                            "requested_range=({} to {}), "
                            "fully_covers={}, events_in_cache={}",
                            plugin.plugin_id,
                            cached_start.date(),
                            cached_end.date(),
                            start_date.date(),
                            end_date.date(),
                            entry_fully_covers,
                            len(cached_data["events"]),
                        )

                        # Filter events that fall within the requested range
                        for event in cached_data["events"]:
                            event_id = str(event.id)
                            # Skip if we already have this event (from another cache entry)
                            if event_id in cached_event_ids:
                                continue

                            # Get event dates (timezone-aware CalendarEvent objects)
                            event_start = event.start
                            event_end = event.end

                            # Ensure timezone-aware
                            if isinstance(event_start, datetime):
                                if event_start.tzinfo is None:
                                    event_start = event_start.replace(tzinfo=UTC)
                            else:
                                event_start = datetime.fromisoformat(
                                    str(event_start).replace("Z", "+00:00")
                                )
                                if event_start.tzinfo is None:
                                    event_start = event_start.replace(tzinfo=UTC)

                            if isinstance(event_end, datetime):
                                if event_end.tzinfo is None:
                                    event_end = event_end.replace(tzinfo=UTC)
                            else:
                                event_end = datetime.fromisoformat(
                                    str(event_end).replace("Z", "+00:00")
                                )
                                if event_end.tzinfo is None:
                                    event_end = event_end.replace(tzinfo=UTC)

                            # Include event if it overlaps with requested range
                            if event_start <= end_date and event_end >= start_date:
                                cached_events.append(event)
                                cached_event_ids.add(event_id)

                        logger.debug(
                            "Filtered events from cache entry. "
                            "Events in cache entry: {}, "
                            "Total unique cached events collected so far: {}",
                            len(cached_data["events"]),
                            len(cached_events),
                        )

                        # If we found full coverage from this entry, we can break early
                        # (we've already collected all events from this entry)
                        if fully_covered:
                            logger.info(
                                "✅ Full coverage found for {}, cache key: {}...",
                                plugin.plugin_id,
                                cache_key[:120],
                            )
                            # Break early - we have full coverage from this entry
                            break
                    else:
                        logger.debug(
                            "Cache entry does NOT overlap for {}: "
                            "cached_range=({} to {}), "
                            "requested_range=({} to {}), "
                            "reason: cached_end={} < requested_start={} "
                            "OR cached_start={} > requested_end={}",
                            plugin.plugin_id,
                            cached_start.date(),
                            cached_end.date(),
                            start_date.date(),
                            end_date.date(),
                            cached_end.date(),
                            start_date.date(),
                            cached_start.date(),
                            end_date.date(),
                        )
                        continue
                except (ValueError, IndexError) as e:
                    # Invalid cache key format, skip
                    logger.warning(
                        "Invalid cache key format: {}..., error: {}",
                        cache_key[:80],
                        e,
                    )
                    continue

            logger.info(
                "Cache lookup complete for {}: "
                "checked={} entries, expired={}, "
                "found_cached_events={}, fully_covered={}",
                plugin.plugin_id,
                checked_count,
                expired_count,
                len(cached_events),
                fully_covered,
            )

            # If we found cached events that fully cover the range, use them
            if cached_events and fully_covered:
                logger.info(
                    "✅ Cache HIT: Using fully cached events for "
                    "{} ({} to {}) - {} events - NO FETCH NEEDED",
                    plugin.plugin_id,
                    start_date.date(),
                    end_date.date(),
                    len(cached_events),
                )
                events.extend(cached_events)
                continue

            # Determine if we need to fetch based on whether we have full coverage
            needs_fetch = not fully_covered

            # Fetch events from plugin if we don't have complete coverage
            if needs_fetch:
                if cached_events:
                    logger.warning(
                        "⚠️  Cache PARTIAL for {}: "
                        "Found {} cached events, but range not fully covered. "
                        "Requested: {} to {}, FETCHING from plugin to complete range",
                        plugin.plugin_id,
                        len(cached_events),
                        start_date.date(),
                        end_date.date(),
                    )
                else:
                    logger.warning(
                        "❌ Cache MISS for {}: "
                        "No cached events found for range {} to {}, "
                        "FETCHING from plugin NOW",
                        plugin.plugin_id,
                        start_date.date(),
                        end_date.date(),
                    )

                    # Log cache state for debugging
                    cache_keys_for_plugin = [
                        k for k in self._cache.keys() if k.startswith(f"{plugin.plugin_id}:")
                    ]
                    logger.info(
                        f"[CALENDAR SERVICE] Available cache keys for {plugin.plugin_id}: "
                        f"{len(cache_keys_for_plugin)} entries (may be expired or non-overlapping)"
                    )
                    for key in cache_keys_for_plugin[:5]:  # Show first 5 cache keys
                        logger.info(f"  - {key[:120]}")

            try:
                if needs_fetch:
                    logger.warning(
                        f"[CALENDAR SERVICE] 🌐 FETCHING events from {plugin.plugin_id} "
                        f"({start_date.date()} to {end_date.date()}) - "
                        f"This will make HTTP request to calendar URL"
                    )
                plugin_events = await plugin.fetch_events(start_date, end_date)
                logger.info(
                    "✅ Fetched {} events from {}",
                    len(plugin_events),
                    plugin.plugin_id,
                )

                # Merge with cached events (avoid duplicates)
                if cached_events:
                    # Only add new events that aren't already cached
                    new_events = [e for e in plugin_events if str(e.id) not in cached_event_ids]
                    plugin_events = cached_events + new_events
                    logger.debug(
                        "Merged {} cached events with {} new events",
                        len(cached_events),
                        len(new_events),
                    )

                # Cache the results with the exact requested date range
                if needs_fetch:
                    cache_key = (
                        f"{plugin.plugin_id}:{start_date.isoformat()}:{end_date.isoformat()}"
                    )
                    self._cache[cache_key] = {
                        "events": plugin_events,
                        "timestamp": datetime.now(UTC),
                    }
                    logger.info(
                        "💾 Cached {} events for {} "
                        "with key: {}:{} to {} (full key: {}...)",
                        len(plugin_events),
                        plugin.plugin_id,
                        plugin.plugin_id,
                        start_date.date(),
                        end_date.date(),
                        cache_key[:120],
                    )
                    logger.debug(
                        f"[CALENDAR SERVICE] Cache now has {len(self._cache)} total entries"
                    )

                events.extend(plugin_events)
            except httpx.HTTPStatusError as e:
                # Handle HTTP errors, especially 404
                if e.response.status_code == 404:
                    logger.error(
                        "404 error fetching from {}: {}. "
                        "Calendar URL may be invalid or expired. Disabling calendar.",
                        plugin.plugin_id,
                        e,
                    )
                    # Disable the calendar plugin
                    try:
                        plugin.disable()
                        # Also update in database
                        from sqlalchemy import select

                        from app.database import AsyncSessionLocal
                        from app.models.db_models import PluginDB

                        async with AsyncSessionLocal() as session:
                            result = await session.execute(
                                select(PluginDB).where(PluginDB.id == plugin.plugin_id)
                            )
                            db_plugin = result.scalar_one_or_none()
                            if db_plugin:
                                db_plugin.enabled = False
                                await session.commit()
                                logger.info(
                                    f"[CALENDAR SERVICE] Disabled calendar {plugin.plugin_id} "
                                    f"in database due to 404 error"
                                )
                    except Exception as disable_error:
                        logger.exception(
                            "Failed to disable calendar {}: {}",
                            plugin.plugin_id,
                            disable_error,
                        )
                else:
                    logger.error(
                        f"[CALENDAR SERVICE] HTTP {e.response.status_code} error fetching from "
                        f"{plugin.plugin_id}: {e}",
                        exc_info=True,
                    )
                # Use cached events if available, even if partial
                if cached_events:
                    logger.info(
                        f"[CALENDAR SERVICE] Using {len(cached_events)} partial cached events "
                        f"for {plugin.plugin_id} after fetch error"
                    )
                    events.extend(cached_events)
            except Exception as e:
                logger.error(
                    f"[CALENDAR SERVICE] Error fetching events from calendar plugin "
                    f"{plugin.plugin_id}: {e}",
                    exc_info=True,
                )
                # Use cached events if available, even if partial
                if cached_events:
                    logger.info(
                        f"[CALENDAR SERVICE] Using {len(cached_events)} partial cached events "
                        f"for {plugin.plugin_id} after fetch error"
                    )
                    events.extend(cached_events)

        logger.info(
            f"[CALENDAR SERVICE] Returning {len(events)} total events for range "
            f"({start_date.date()} to {end_date.date()})"
        )
        return events

        return events

    async def get_sources(self) -> list[dict]:
        """
        Get all calendar sources (plugins) from database.
        Includes both enabled and disabled plugins.

        Returns:
            List of calendar source dictionaries
        """
        from sqlalchemy import select

        from app.database import AsyncSessionLocal
        from app.models.db_models import PluginDB

        sources = []

        # Query database for all calendar plugin instances
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(PluginDB).where(
                    PluginDB.type_id.in_(
                        ["google", "ical", "proton"]  # Calendar plugin type IDs
                    )
                )
            )
            db_plugins = result.scalars().all()

            for db_plugin in db_plugins:
                config = db_plugin.config or {}

                # Try to get plugin instance if it exists (only enabled plugins have instances)
                plugin = plugin_manager.get_plugin(db_plugin.id)
                if plugin and isinstance(plugin, CalendarPlugin):
                    # Use live plugin data
                    plugin_config = plugin.get_config()
                    sources.append(
                        {
                            "id": plugin.plugin_id,
                            "type": self._get_plugin_type_name(plugin),
                            "name": plugin.name,
                            "enabled": db_plugin.enabled,  # Use database enabled status
                            "running": plugin.is_running(),  # Runtime state
                            # Get plugin-specific config via protocol method (get_config)
                            "ical_url": plugin_config.get("ical_url") or config.get("ical_url"),
                            "api_key": plugin_config.get("api_key") or config.get("api_key"),
                            "color": plugin_config.get("color") or config.get("color"),
                            "show_time": plugin_config.get(
                                "show_time", config.get("show_time", True)
                            ),
                        }
                    )
                else:
                    # Plugin instance doesn't exist (disabled), use database data
                    type_id = db_plugin.type_id
                    sources.append(
                        {
                            "id": db_plugin.id,
                            "type": type_id,
                            "name": db_plugin.name,
                            "enabled": db_plugin.enabled,  # Use database enabled status
                            "running": False,  # No instance = not running
                            "ical_url": config.get("ical_url"),
                            "api_key": config.get("api_key"),
                            "color": config.get("color"),
                            "show_time": config.get("show_time", True),
                        }
                    )

        return sources

    def _get_plugin_type_name(self, plugin: CalendarPlugin) -> str:
        """Get plugin type name for backward compatibility."""
        # Check the class name
        class_name = plugin.__class__.__name__
        if "Google" in class_name:
            return "google"
        elif "ICal" in class_name:
            # Check if it's a Proton calendar by looking at the plugin_id or name
            plugin_id = getattr(plugin, "plugin_id", "")
            plugin_name = getattr(plugin, "name", "").lower()
            if "proton" in plugin_id.lower() or "proton" in plugin_name:
                return "proton"
            return "ical"

        # Default to ical for unknown types
        return "ical"

    def get_refresh_interval_minutes(self) -> int:
        """Get the refresh interval in minutes."""
        return self._default_refresh_interval_minutes

    def set_refresh_interval_minutes(self, minutes: int) -> None:
        """Set the refresh interval in minutes."""
        self._default_refresh_interval_minutes = minutes
        logger.info(f"Calendar refresh interval set to {minutes} minutes")
