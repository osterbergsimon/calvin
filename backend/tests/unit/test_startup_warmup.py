"""Startup warm-up tests (audit R8).

The image scan and the calendar preload hit the network with 10-30 s timeouts.
They must run as background tasks after startup, not inside the lifespan, or
/api/health stays down while they wait.
"""

import asyncio

import pytest

import app.main as main
from app.services import plugin_calendar_service


@pytest.mark.unit
@pytest.mark.asyncio
async def test_warmups_run_as_background_tasks(monkeypatch):
    started: list[str] = []
    release = asyncio.Event()

    async def slow_image_scan():
        started.append("images")
        await release.wait()

    async def slow_calendar_preload(months_to_preload: int = 1):
        started.append("calendar")
        await release.wait()

    monkeypatch.setattr(main, "_initialize_image_service", slow_image_scan)
    monkeypatch.setattr(plugin_calendar_service, "preload_months", slow_calendar_preload)

    tasks = main._start_warmup_tasks()

    try:
        await asyncio.sleep(0)  # let both tasks reach their first await

        assert len(tasks) == 2
        assert set(started) == {"images", "calendar"}
        # Scheduling returned immediately: neither warm-up has finished.
        assert not any(task.done() for task in tasks)
        # The running tasks are referenced so they can't be garbage-collected.
        assert set(tasks) <= main._startup_tasks
    finally:
        release.set()
        await asyncio.gather(*tasks)

    # Finished tasks are released from the tracking set.
    assert not set(tasks) & main._startup_tasks


@pytest.mark.unit
@pytest.mark.asyncio
async def test_warmup_failure_is_logged_not_raised(monkeypatch):
    async def broken_scan():
        raise RuntimeError("network unreachable")

    async def broken_preload(months_to_preload: int = 1):
        raise RuntimeError("calendar unreachable")

    logged: list[str] = []

    class FakeLogger:
        def opt(self, **_kwargs):
            return self

        def error(self, message, *args):
            logged.append(message)

    monkeypatch.setattr(main, "_initialize_image_service", broken_scan)
    monkeypatch.setattr(plugin_calendar_service, "preload_months", broken_preload)
    monkeypatch.setattr(main, "logger", FakeLogger())

    tasks = main._start_warmup_tasks()
    await asyncio.gather(*tasks, return_exceptions=True)
    await asyncio.sleep(0)  # done callbacks run on the next loop iteration

    assert len(logged) == 2


@pytest.mark.unit
@pytest.mark.asyncio
async def test_lifespan_schedules_the_warmups(monkeypatch):
    """The lifespan schedules the warm-ups instead of awaiting the image scan."""
    from unittest.mock import AsyncMock

    async def noop(*_args, **_kwargs):
        return None

    for step in (
        "_initialize_database",
        "_initialize_plugins",
        "_restore_on_start",
        "_initialize_keyboard_mappings",
        "_initialize_default_config",
        "_start_schedulers",
        "_sync_display_orientation",
        "_shutdown_services",
    ):
        monkeypatch.setattr(main, step, noop)
    monkeypatch.setattr(main, "_ensure_kiosk_signing_key", lambda: None)
    monkeypatch.setattr("app.database.connect_db", noop)
    monkeypatch.setattr("app.database.disconnect_db", noop)
    monkeypatch.setattr("app.utils.legacy_data.migrate_legacy_data", lambda _settings: None)

    image_scan = AsyncMock()
    monkeypatch.setattr(main, "_initialize_image_service", image_scan)
    scheduled: list[bool] = []
    monkeypatch.setattr(main, "_start_warmup_tasks", lambda: scheduled.append(True) or [])

    async with main.lifespan(main.app):
        pass

    assert scheduled == [True]
    image_scan.assert_not_awaited()
