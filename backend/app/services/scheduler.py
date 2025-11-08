"""Scheduler service for periodic calendar updates."""

from datetime import datetime, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.services.calendar_service import calendar_service


class CalendarScheduler:
    """Scheduler for periodic calendar updates."""

    def __init__(self):
        """Initialize scheduler."""
        self.scheduler = AsyncIOScheduler()
        self.refresh_interval = timedelta(minutes=15)  # Refresh every 15 minutes

    def start(self):
        """Start the scheduler."""
        if not self.scheduler.running:
            self.scheduler.start()
            # Schedule calendar refresh
            self.scheduler.add_job(
                self.refresh_calendars,
                trigger=IntervalTrigger(minutes=15),
                id="refresh_calendars",
                replace_existing=True,
            )

    def stop(self):
        """Stop the scheduler."""
        if self.scheduler.running:
            self.scheduler.shutdown()

    async def refresh_calendars(self):
        """Refresh calendar events for all sources."""
        # Clear cache to force refresh
        calendar_service._cache.clear()
        print(f"Calendar cache cleared at {datetime.now()}")

    def set_refresh_interval(self, minutes: int):
        """Set the refresh interval in minutes."""
        self.refresh_interval = timedelta(minutes=minutes)
        if self.scheduler.running:
            # Reschedule with new interval
            self.scheduler.remove_job("refresh_calendars")
            self.scheduler.add_job(
                self.refresh_calendars,
                trigger=IntervalTrigger(minutes=minutes),
                id="refresh_calendars",
                replace_existing=True,
            )


# Global scheduler instance
calendar_scheduler = CalendarScheduler()
