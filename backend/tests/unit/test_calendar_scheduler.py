"""Tests for the calendar refresh scheduler (audit R4).

Covers the interval bounds, rescheduling an existing job instead of
removing and re-adding it, and the cache swap that keeps readers on the
old data until the new preload is complete.
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services import plugin_calendar_service
from app.services.plugin_calendar_service import PluginCalendarService
from app.services.scheduler import CalendarScheduler


@pytest.fixture
def scheduler():
    """A CalendarScheduler with a mocked APScheduler instance."""
    sched = CalendarScheduler()
    sched.scheduler = MagicMock()
    sched.scheduler.running = True
    return sched


@pytest.mark.unit
class TestRefreshIntervalBounds:
    """The configured interval must never become one refresh per second."""

    @pytest.mark.parametrize("value", [0, -5])
    @pytest.mark.asyncio
    async def test_api_rejects_interval_below_one_minute(self, test_client, value):
        response = test_client.post("/api/config", json={"calendarRefreshInterval": value})
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_start_clamps_a_stored_zero_interval(self, monkeypatch, scheduler):
        """A 0 already in the DB (or written by an older version) starts at 1 minute."""
        scheduler.scheduler.running = False
        scheduler.scheduler.start.side_effect = lambda: setattr(
            scheduler.scheduler, "running", True
        )
        config_service = MagicMock()
        config_service.get_value = AsyncMock(return_value=0)
        monkeypatch.setattr("app.services.scheduler.config_service", config_service)

        await scheduler.start()

        trigger = scheduler.scheduler.add_job.call_args.kwargs["trigger"]
        assert trigger.interval.total_seconds() == 60

    @pytest.mark.asyncio
    async def test_set_refresh_interval_clamps_to_one(self, monkeypatch, scheduler):
        config_service = MagicMock()
        config_service.set_value = AsyncMock()
        monkeypatch.setattr("app.services.scheduler.config_service", config_service)

        await scheduler.set_refresh_interval(0)

        trigger = scheduler.scheduler.reschedule_job.call_args.kwargs["trigger"]
        assert trigger.interval.total_seconds() == 60


@pytest.mark.unit
class TestReschedule:
    """Changing the interval reschedules the existing job."""

    @pytest.mark.asyncio
    async def test_set_refresh_interval_reschedules_without_remove(self, monkeypatch, scheduler):
        config_service = MagicMock()
        config_service.set_value = AsyncMock()
        monkeypatch.setattr("app.services.scheduler.config_service", config_service)
        scheduler.scheduler.get_job.return_value = MagicMock()

        await scheduler.set_refresh_interval(30)

        scheduler.scheduler.remove_job.assert_not_called()
        scheduler.scheduler.add_job.assert_not_called()
        scheduler.scheduler.reschedule_job.assert_called_once()
        assert scheduler.scheduler.reschedule_job.call_args.args[0] == "refresh_calendars"

    @pytest.mark.asyncio
    async def test_set_refresh_interval_adds_missing_job(self, monkeypatch, scheduler):
        """A never-started job (or removed one) is added rather than raising."""
        config_service = MagicMock()
        config_service.set_value = AsyncMock()
        monkeypatch.setattr("app.services.scheduler.config_service", config_service)
        scheduler.scheduler.get_job.return_value = None

        await scheduler.set_refresh_interval(30)

        scheduler.scheduler.reschedule_job.assert_not_called()
        scheduler.scheduler.add_job.assert_called_once()
        assert scheduler.scheduler.add_job.call_args.kwargs["id"] == "refresh_calendars"


@pytest.mark.unit
class TestRefreshKeepsCache:
    """A refresh builds the new cache first and swaps it in afterwards."""

    @pytest.mark.asyncio
    async def test_refresh_calendars_uses_reload_not_clear(self, monkeypatch, scheduler):
        cleared = AsyncMock()
        reloaded = AsyncMock()
        monkeypatch.setattr(plugin_calendar_service, "clear_cache", cleared)
        monkeypatch.setattr(plugin_calendar_service, "reload_cache", reloaded)

        await scheduler.refresh_calendars()

        cleared.assert_not_called()
        reloaded.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_reload_cache_keeps_old_entries_visible_until_swap(self):
        service = PluginCalendarService()
        old_cache = {
            "old:2024-01-01:2024-01-31": {
                "events": [],
                "timestamp": datetime.now(UTC),
            }
        }
        service._cache = old_cache
        seen: dict = {}

        async def fake_get_events(start_date, end_date, source_ids=None, refresh=False, cache=None):
            assert cache is not None
            assert cache is not service._cache
            seen["live_cache_during_fetch"] = service._cache
            cache[f"p:{start_date.date()}:{end_date.date()}"] = {
                "events": [],
                "timestamp": datetime.now(UTC),
            }
            return []

        service.get_events = fake_get_events  # type: ignore[method-assign]

        await service.reload_cache(months_to_preload=0)

        # Readers kept the old cache for the whole build, then the new one replaced it.
        assert seen["live_cache_during_fetch"] is old_cache
        assert service._cache is not old_cache
        assert "old:2024-01-01:2024-01-31" not in service._cache
        assert len(service._cache) == 1
