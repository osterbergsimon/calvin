"""Calendar service using plugin architecture."""

from datetime import UTC, datetime, timedelta

import httpx
from loguru import logger

from app.models.calendar import CalendarEvent
from app.plugins.base import PluginType
from app.plugins.protocols import CalendarPlugin

# Loguru automatically includes module/function info in logs


def _normalize_datetime_for_comparison(dt: datetime) -> datetime:
    """Normalize datetime to UTC for consistent comparison."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


class PluginCalendarService:
    """Calendar service using plugin architecture."""

    def __init__(self):
        """Initialize calendar service."""
        self._cache: dict = {}
        self._cache_ttl = timedelta(minutes=5)
        self._default_refresh_interval_minutes = 15  # Default refresh interval in minutes

    async def clear_cache(
        self,
        month: int | None = None,
        year: int | None = None,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
    ) -> None:
        """
        Clear the event cache.

        Args:
            month: Optional month (1-12) to clear specific month cache
            year: Optional year to clear specific month cache (required if month is provided)
            start_date: Optional start date for range-based clearing
            end_date: Optional end date for range-based clearing
        """
        if start_date is not None and end_date is not None:
            # Clear cache entries that overlap with the requested date range
            start_date_only = _normalize_datetime_for_comparison(start_date).date()
            end_date_only = _normalize_datetime_for_comparison(end_date).date()

            keys_to_remove = []
            for key in self._cache.keys():
                parts = key.split(":")
                if len(parts) == 3:
                    try:
                        cached_start_date = datetime.fromisoformat(parts[1]).date()
                        cached_end_date = datetime.fromisoformat(parts[2]).date()
                        # Check if date ranges overlap
                        if (
                            cached_start_date <= end_date_only
                            and cached_end_date >= start_date_only
                        ):
                            keys_to_remove.append(key)
                    except (ValueError, IndexError):
                        continue

            for key in keys_to_remove:
                del self._cache[key]

            logger.debug(
                "Cleared {} cache entries overlapping range {} to {}",
                len(keys_to_remove),
                start_date_only,
                end_date_only,
            )
        elif month is not None and year is not None:
            # Clear cache for specific month (legacy support)
            keys_to_remove = []
            for key in self._cache.keys():
                parts = key.split(":")
                if len(parts) >= 3:
                    try:
                        start_date_str = parts[1]
                        start_date_obj = datetime.fromisoformat(start_date_str).date()
                        # Check if start date falls within the specified month/year
                        if start_date_obj.year == year and start_date_obj.month == month:
                            keys_to_remove.append(key)
                    except (ValueError, IndexError):
                        continue

            for key in keys_to_remove:
                del self._cache[key]

            logger.debug(
                "Cleared cache for {}-{:02d} ({} entries)",
                year,
                month,
                len(keys_to_remove),
            )
        else:
            # Clear all cache
            cache_size = len(self._cache)
            self._cache.clear()
            logger.debug("Cleared entire calendar cache ({} entries)", cache_size)

    async def preload_months(self, months_to_preload: int = 1) -> None:
        """
        Preload events for current month and adjacent months.

        Args:
            months_to_preload: Number of months before/after current month to preload
        """
        now = datetime.now(UTC)
        current_year = now.year
        current_month = now.month

        for offset in range(-months_to_preload, months_to_preload + 1):
            year = current_year
            month = current_month + offset

            # Handle year rollover
            while month < 1:
                month += 12
                year -= 1
            while month > 12:
                month -= 12
                year += 1

            try:
                # Calculate month boundaries
                start_date = datetime(year, month, 1, tzinfo=UTC)
                if month == 12:
                    end_date = datetime(year + 1, 1, 1, tzinfo=UTC) - timedelta(days=1)
                else:
                    end_date = datetime(year, month + 1, 1, tzinfo=UTC) - timedelta(days=1)
                end_date = end_date.replace(hour=23, minute=59, second=59, microsecond=999999)

                await self.get_events(start_date, end_date)
                logger.debug("Preloaded events for {}-{:02d}", year, month)
            except Exception as e:
                logger.warning("Failed to preload events for {}-{:02d}: {}", year, month, e)

    async def get_events(
        self,
        start_date: datetime,
        end_date: datetime,
        source_ids: list[str] | None = None,
        refresh: bool = False,
    ) -> list[CalendarEvent]:
        """
        Get calendar events for a date range from all enabled calendar plugins.

        Simplified caching: Use date-only keys (YYYY-MM-DD) and check for overlaps.
        If cached range covers requested range, use cache. Otherwise fetch.

        Args:
            start_date: Start date for events (timezone-aware or naive)
            end_date: End date for events (timezone-aware or naive)
            source_ids: Optional list of source IDs to filter by
            refresh: If True, skip cache lookup and force fresh fetch

        Returns:
            List of calendar events (all timezone-aware)
        """
        # Normalize dates to UTC
        start_date = _normalize_datetime_for_comparison(start_date)
        end_date = _normalize_datetime_for_comparison(end_date)

        # Use date-only for cache keys (YYYY-MM-DD) - simpler and sufficient
        start_date_only = start_date.date()
        end_date_only = end_date.date()

        logger.debug(
            "get_events: range={} to {}, source_ids={}, cache_size={}, refresh={}",
            start_date_only,
            end_date_only,
            source_ids,
            len(self._cache),
            refresh,
        )

        events: list[CalendarEvent] = []

        # Get all enabled calendar plugins
        from app.plugins.manager import plugin_manager

        plugins = plugin_manager.get_plugins(PluginType.CALENDAR, enabled_only=True)
        logger.debug("Found {} enabled calendar plugins", len(plugins))

        # Filter by source IDs if specified
        if source_ids:
            plugins = [p for p in plugins if p.plugin_id in source_ids]

        # Process each plugin
        for plugin in plugins:
            if not isinstance(plugin, CalendarPlugin):
                continue

            # Skip cache lookup if refresh is requested
            cached_data = None
            cache_age_seconds = None

            if not refresh:
                # Check for cached entry using date-only keys
                # Format: "{plugin_id}:YYYY-MM-DD:YYYY-MM-DD"

                # First, check for exact match (fastest)
                exact_cache_key = f"{plugin.plugin_id}:{start_date_only}:{end_date_only}"
                if exact_cache_key in self._cache:
                    data = self._cache[exact_cache_key]
                    # Ensure both datetimes are timezone-aware for comparison
                    now = datetime.now(UTC)
                    if now.tzinfo is None:
                        now = now.replace(tzinfo=UTC)
                    cached_ts = data["timestamp"]
                    if cached_ts.tzinfo is None:
                        cached_ts = cached_ts.replace(tzinfo=UTC)
                    cache_age = now - cached_ts
                    if cache_age < self._cache_ttl:
                        cache_age_seconds = cache_age.total_seconds()
                        logger.info(
                            "✅ Cache EXACT HIT for {}: {} events (range: {} to {}, age: {:.0f}s)",
                            plugin.plugin_id,
                            len(data["events"]),
                            start_date_only,
                            end_date_only,
                            cache_age_seconds,
                        )
                        cached_data = data

                # If no exact match, check for overlapping date ranges
                if not cached_data:
                    best_overlap_days = 0

                    for key, data in list(self._cache.items()):
                        if not key.startswith(f"{plugin.plugin_id}:"):
                            continue

                        # Clean up expired entries
                        # Ensure both datetimes are timezone-aware for comparison
                        now = datetime.now(UTC)
                        if now.tzinfo is None:
                            now = now.replace(tzinfo=UTC)
                        cached_ts = data["timestamp"]
                        if cached_ts.tzinfo is None:
                            cached_ts = cached_ts.replace(tzinfo=UTC)
                        cache_age = now - cached_ts
                        if cache_age >= self._cache_ttl:
                            logger.debug(
                                "Removing expired cache entry: {} (age: {:.0f}s)",
                                key[:100],
                                cache_age.total_seconds(),
                            )
                            del self._cache[key]
                            continue

                        # Parse simple date-only format: "{plugin_id}:YYYY-MM-DD:YYYY-MM-DD"
                        try:
                            parts = key.split(":")
                            if len(parts) != 3:
                                # Skip old format keys (they'll eventually expire)
                                continue

                            cached_start_date = datetime.fromisoformat(parts[1]).date()
                            cached_end_date = datetime.fromisoformat(parts[2]).date()

                            # Check if date ranges overlap (simple date comparison on full days)
                            # Overlap exists if: cached_start <= requested_end
                            # AND cached_end >= requested_start
                            if (
                                cached_start_date <= end_date_only
                                and cached_end_date >= start_date_only
                            ):
                                # Calculate overlap in days
                                overlap_start = max(cached_start_date, start_date_only)
                                overlap_end = min(cached_end_date, end_date_only)
                                overlap_days = (overlap_end - overlap_start).days + 1
                                requested_days = (end_date_only - start_date_only).days + 1
                                overlap_ratio = (
                                    overlap_days / requested_days if requested_days > 0 else 0
                                )

                                # Use if overlap covers at least 50% of requested range
                                if overlap_ratio >= 0.5 and overlap_days > best_overlap_days:
                                    best_overlap_days = overlap_days
                                    cached_data = data
                                    logger.info(
                                        "✅ Cache OVERLAP HIT for {}: cached={} to {}, "
                                        "requested={} to {}, overlap={:.1%} ({} days)",
                                        plugin.plugin_id,
                                        cached_start_date,
                                        cached_end_date,
                                        start_date_only,
                                        end_date_only,
                                        overlap_ratio,
                                        overlap_days,
                                    )
                        except (ValueError, IndexError) as e:
                            # Invalid key format (probably old format) - skip
                            logger.debug("Skipping invalid cache key {}: {}", key[:100], e)
                            continue

            if cached_data:
                # Filter events to requested date range (in case of partial overlap)
                cached_events = [
                    e
                    for e in cached_data["events"]
                    if _normalize_datetime_for_comparison(e.start).date() <= end_date_only
                    and _normalize_datetime_for_comparison(e.end).date() >= start_date_only
                ]
                logger.debug(
                    "Using {} cached events for {} (filtered from {} total)",
                    len(cached_events),
                    plugin.plugin_id,
                    len(cached_data["events"]),
                )
                events.extend(cached_events)
                continue

            # Cache MISS - fetch from plugin
            logger.info(
                "❌ Cache MISS for {}: Fetching events for {} to {}",
                plugin.plugin_id,
                start_date_only,
                end_date_only,
            )

            try:
                plugin_events = await plugin.fetch_events(start_date, end_date)
                logger.info("✅ Fetched {} events from {}", len(plugin_events), plugin.plugin_id)

                # Cache using date-only key format
                cache_key = f"{plugin.plugin_id}:{start_date_only}:{end_date_only}"
                # Ensure timestamp is always timezone-aware (UTC)
                now = datetime.now(UTC)
                if now.tzinfo is None:
                    now = now.replace(tzinfo=UTC)
                self._cache[cache_key] = {
                    "events": plugin_events,
                    "timestamp": now,
                }
                logger.debug(
                    "💾 Cached {} events for {} (date range: {} to {})",
                    len(plugin_events),
                    plugin.plugin_id,
                    start_date_only,
                    end_date_only,
                )

                events.extend(plugin_events)
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    logger.error(
                        "404 error from {}: {}. Disabling calendar.",
                        plugin.plugin_id,
                        e,
                    )
                    try:
                        plugin.disable()
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
                                logger.info("Disabled {} in database due to 404", plugin.plugin_id)
                    except Exception:
                        logger.exception("Failed to disable {}", plugin.plugin_id)
                else:
                    logger.exception(
                        "HTTP {} error from {}", e.response.status_code, plugin.plugin_id
                    )
            except Exception:
                logger.exception("Error fetching from {}", plugin.plugin_id)

        logger.debug("Returning {} total events", len(events))
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
                from app.plugins.manager import plugin_manager

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
        logger.debug("Calendar refresh interval set to {} minutes", minutes)
