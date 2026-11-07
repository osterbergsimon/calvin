"""Display-check writes are serialised per kiosk (calvin-29ws)."""

import asyncio

import pytest

from app.models.db_models import KioskDB
from app.services import display_check, kiosk_registry

KIOSK = "kitchen-3f9a2c"


async def _active_run(step: str = "conversion") -> dict:
    await kiosk_registry.record_kiosk(KIOSK, hostname="pi")
    return await display_check.start_run(KIOSK, display_check.StartRequest(step=step, value=10))


def _done(run_id: str) -> display_check.AgentReport:
    return display_check.AgentReport(id=run_id, status="done", level=10)


@pytest.fixture
def slow_reads(monkeypatch):
    """The first reader sleeps after reading, so a second writer reads and saves
    before the first one saves its stale copy (the lost-update interleaving)."""
    original = display_check._row
    calls = {"n": 0}

    async def slow(kiosk_id):
        calls["n"] += 1
        first = calls["n"] == 1
        row = await original(kiosk_id)
        if first:
            await asyncio.sleep(0.1)
        return row

    monkeypatch.setattr(display_check, "_row", slow)
    return calls


@pytest.mark.asyncio
@pytest.mark.unit
@pytest.mark.parametrize("stop_first", [True, False])
async def test_a_stop_racing_a_done_report_is_not_lost(test_db, slow_reads, stop_first):
    run = await _active_run()
    slow_reads["n"] = 0
    jobs = [display_check.stop_run(KIOSK), display_check.record_report(KIOSK, _done(run["id"]))]
    await asyncio.gather(*(jobs if stop_first else reversed(jobs)))

    stored = await display_check.get_run(KIOSK)
    assert stored["action"] == "stop"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_a_step_change_racing_a_report_is_not_lost(test_db, slow_reads):
    run = await _active_run()
    slow_reads["n"] = 0
    await asyncio.gather(
        display_check.change_step(KIOSK, display_check.StepRequest(step="write")),
        display_check.record_report(
            KIOSK, display_check.AgentReport(id=run["id"], status="running", level=3)
        ),
    )
    stored = await display_check.get_run(KIOSK)
    assert stored["step"] == "write"
    assert stored["level"] == 3  # the report was applied too


@pytest.mark.asyncio
@pytest.mark.unit
async def test_a_config_poll_heartbeat_does_not_overwrite_the_run(test_db, monkeypatch):
    """The kiosk's own 1.5 s config poll rewrites its row; it must leave the run alone."""
    run = await _active_run()
    original = KioskDB.update

    async def slow_full_update(self, **kwargs):
        if "_columns" not in kwargs:
            await asyncio.sleep(0.05)  # a whole-row write lands late, from a stale read
        return await original(self, **kwargs)

    monkeypatch.setattr(KioskDB, "update", slow_full_update)
    await asyncio.gather(
        kiosk_registry.record_kiosk(KIOSK, hostname="renamed-pi"),
        display_check.stop_run(KIOSK),
    )
    stored = await display_check.get_run(KIOSK)
    assert stored["id"] == run["id"]
    assert stored["action"] == "stop"
    assert (await KioskDB.objects.get(id=KIOSK)).hostname == "renamed-pi"
