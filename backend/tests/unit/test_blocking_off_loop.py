"""Blocking subprocess work must not run on the event loop (audit R2).

pip installs (up to 120 s per package), vcgencmd/xset and git used to run inline
in ``async def`` routes and services, freezing every other request, kiosk poll and
SSE stream until they returned. These tests stall the blocking call and check that
the loop keeps ticking meanwhile.
"""

import asyncio
import threading
import time
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.services import plugin_installer as installer_module
from app.services.display_power_service import DisplayPowerService
from app.utils.platform import run_command

STALL = 0.3


async def _ticks_during(coro) -> tuple[object, int]:
    """Await ``coro`` while counting how often a concurrent task gets to run."""
    ticks = 0
    done = asyncio.Event()

    async def ticker():
        nonlocal ticks
        while not done.is_set():
            ticks += 1
            await asyncio.sleep(0.01)

    task = asyncio.create_task(ticker())
    try:
        result = await coro
    finally:
        done.set()
        await task
    return result, ticks


def _slow_run(threads: list[int]):
    def fake_run(*args, **kwargs):
        threads.append(threading.get_ident())
        time.sleep(STALL)
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    return fake_run


@pytest.mark.asyncio
async def test_run_command_runs_off_the_event_loop():
    threads: list[int] = []
    with patch("subprocess.run", side_effect=_slow_run(threads)):
        result, ticks = await _ticks_during(run_command(["true"], capture_output=True))

    assert result.returncode == 0
    assert threads and threads[0] != threading.get_ident()
    assert ticks >= 5, "event loop was blocked while the command ran"


@pytest.mark.asyncio
async def test_display_power_commands_do_not_block_the_loop():
    service = DisplayPowerService()
    threads: list[int] = []
    with (
        patch("app.services.display_power_service.is_raspberry_pi", return_value=True),
        patch("app.services.display_power_service.has_x11", return_value=False),
        patch("subprocess.run", side_effect=_slow_run(threads)),
    ):
        _, ticks = await _ticks_during(service.turn_display_on())

    assert threads, "vcgencmd was not invoked"
    assert all(t != threading.get_ident() for t in threads)
    assert ticks >= 5


@pytest.mark.asyncio
async def test_installer_ops_run_in_a_worker_thread():
    threads: list[int] = []

    def slow_install(plugin_id):
        threads.append(threading.get_ident())
        time.sleep(STALL)
        return {"id": plugin_id}

    result, ticks = await _ticks_during(installer_module.run_installer_op(slow_install, "x"))

    assert result == {"id": "x"}
    assert threads[0] != threading.get_ident()
    assert ticks >= 5


@pytest.mark.asyncio
async def test_installer_ops_are_serialised():
    """Two concurrent installs must not interleave their pip runs and directory moves."""
    active = 0
    overlap = False

    def op():
        nonlocal active, overlap
        active += 1
        if active > 1:
            overlap = True
        time.sleep(0.05)
        active -= 1

    await asyncio.gather(*(installer_module.run_installer_op(op) for _ in range(4)))
    assert not overlap


def test_install_route_runs_installer_off_the_loop(test_client, monkeypatch):
    """The upload-install route hands the installer to a worker thread."""
    from app.api.routes.plugins import management

    seen: list[str] = []

    def fake_install(path, plugin_id=None):
        seen.append(threading.current_thread().name)
        raise ValueError("stop here")

    monkeypatch.setattr(management.plugin_installer, "install_plugin", fake_install)
    response = test_client.post(
        "/api/plugins/install",
        files={"file": ("p.zip", b"not-a-zip", "application/zip")},
    )

    assert response.status_code >= 400
    assert seen and seen[0] != "MainThread"
    # The loop runs in TestClient's portal thread; a worker is neither.
    assert not seen[0].startswith("AnyIO")
