"""Scheduler service for periodic calendar updates."""

from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from loguru import logger

from app.services import plugin_calendar_service
from app.services.config_service import config_service


class CalendarScheduler:
    """Scheduler for periodic calendar updates."""

    def __init__(self):
        """Initialize scheduler."""
        self.scheduler = AsyncIOScheduler()
        self.default_refresh_interval_minutes = 15  # Default: refresh every 15 minutes

    @staticmethod
    def _coerce_interval_minutes(minutes: int | float | None) -> int:
        """Clamp a configured interval to at least one minute.

        A stored 0 used to become one refresh per second, and a negative value
        was accepted as-is. Anything unusable falls back to the 15 minute default.
        """
        try:
            value = int(minutes)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return 15
        return max(1, value)

    async def start(self):
        """Start the scheduler."""
        if not self.scheduler.running:
            self.scheduler.start()

            # Load refresh interval from config (try both camelCase and snake_case)
            refresh_interval_minutes = await config_service.get_value(
                "calendar_refresh_interval", self.default_refresh_interval_minutes
            )
            # Fallback to camelCase if not found
            if refresh_interval_minutes == self.default_refresh_interval_minutes:
                refresh_interval_minutes = await config_service.get_value(
                    "calendarRefreshInterval", self.default_refresh_interval_minutes
                )
            refresh_interval_minutes = self._coerce_interval_minutes(refresh_interval_minutes)

            # The initial preload makes network calls with long timeouts, so it
            # runs as a startup warm-up task (see app.main) instead of blocking
            # the scheduler — and /api/health — during boot.

            # Schedule calendar refresh
            self.scheduler.add_job(
                self.refresh_calendars,
                trigger=IntervalTrigger(minutes=refresh_interval_minutes),
                id="refresh_calendars",
                replace_existing=True,
            )

            logger.info(
                f"Calendar scheduler started - refreshing every {refresh_interval_minutes} minutes"
            )

    def stop(self):
        """Stop the scheduler."""
        if self.scheduler.running:
            self.scheduler.shutdown()

    async def refresh_calendars(self):
        """Refresh calendar events for all sources."""
        try:
            # Build the new cache first and swap it in afterwards: clearing it
            # up front left the dashboard with an empty calendar for the whole
            # reload (audit R4).
            await plugin_calendar_service.reload_cache(months_to_preload=1)
            logger.info(f"Calendar cache refreshed at {datetime.now()}")
        except Exception:
            logger.exception("Error refreshing calendar cache")

    async def set_refresh_interval(self, minutes: int):
        """Set the refresh interval in minutes."""
        minutes = self._coerce_interval_minutes(minutes)
        self.default_refresh_interval_minutes = minutes
        await config_service.set_value("calendar_refresh_interval", minutes)

        if self.scheduler.running:
            # Reschedule in place. remove_job() raises when the job is missing,
            # which made a config update during startup fail (audit R4).
            trigger = IntervalTrigger(minutes=minutes)
            if self.scheduler.get_job("refresh_calendars") is not None:
                self.scheduler.reschedule_job("refresh_calendars", trigger=trigger)
            else:
                self.scheduler.add_job(
                    self.refresh_calendars,
                    trigger=trigger,
                    id="refresh_calendars",
                    replace_existing=True,
                )
            logger.info(f"Calendar refresh interval updated to {minutes} minutes")


# Global scheduler instance
calendar_scheduler = CalendarScheduler()
