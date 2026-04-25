"""Scheduler service for periodic calendar updates."""

import logging
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.services import plugin_calendar_service
from app.services.config_service import config_service

logger = logging.getLogger(__name__)


class CalendarScheduler:
    """Scheduler for periodic calendar updates."""

    def __init__(self):
        """Initialize scheduler."""
        self.scheduler = AsyncIOScheduler()
        self.default_refresh_interval_minutes = 15  # Default: refresh every 15 minutes

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

            # Preload months (current, prev, next) on startup
            try:
                await plugin_calendar_service.preload_months(months_to_preload=1)
            except Exception as e:
                logger.warning(f"Failed to preload calendar months on startup: {e}")

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
            await plugin_calendar_service.clear_cache()
            await plugin_calendar_service.preload_months(months_to_preload=1)
            logger.info(f"Calendar cache refreshed at {datetime.now()}")
        except Exception as e:
            logger.error(f"Error refreshing calendar cache: {e}", exc_info=True)

    async def set_refresh_interval(self, minutes: int):
        """Set the refresh interval in minutes."""
        self.default_refresh_interval_minutes = minutes
        await config_service.set_value("calendar_refresh_interval", minutes)

        if self.scheduler.running:
            # Reschedule with new interval
            self.scheduler.remove_job("refresh_calendars")
            self.scheduler.add_job(
                self.refresh_calendars,
                trigger=IntervalTrigger(minutes=minutes),
                id="refresh_calendars",
                replace_existing=True,
            )
            logger.info(f"Calendar refresh interval updated to {minutes} minutes")


# Global scheduler instance
calendar_scheduler = CalendarScheduler()
