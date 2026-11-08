"""Removing a screen, and only real agents registering (calvin-7aqu)."""

import pytest
from fastapi.testclient import TestClient


def _ids(client: TestClient) -> list[str]:
    return [k["id"] for k in client.get("/api/kiosks").json()["kiosks"]]


@pytest.mark.integration
def test_delete_removes_kiosk_and_its_state(test_client: TestClient):
    test_client.put("/api/kiosks/gone-1/overrides", json={"overrides": {"displayName": "Old"}})
    resp = test_client.delete("/api/kiosks/gone-1")
    assert resp.status_code == 200
    assert resp.json() == {"id": "gone-1", "removed": True}
    assert "gone-1" not in _ids(test_client)
    assert test_client.get("/api/kiosks/gone-1/overrides").status_code == 404
    assert test_client.get("/api/kiosks/gone-1/display-check").status_code == 404


@pytest.mark.integration
def test_delete_unknown_kiosk_is_404(test_client: TestClient):
    assert test_client.delete("/api/kiosks/never-existed").status_code == 404


@pytest.mark.integration
def test_delete_bad_id_is_400(test_client: TestClient):
    assert test_client.delete("/api/kiosks/bad id!").status_code == 400


@pytest.mark.integration
def test_delete_refused_while_display_check_active(test_client: TestClient):
    test_client.put("/api/kiosks/busy-1/overrides", json={"overrides": {}})
    started = test_client.post("/api/kiosks/busy-1/display-check/start", json={"step": "detect"})
    assert started.status_code == 200
    resp = test_client.delete("/api/kiosks/busy-1")
    assert resp.status_code == 409
    assert "busy-1" in _ids(test_client)
    test_client.post("/api/kiosks/busy-1/display-check/stop")


@pytest.mark.integration
def test_removed_kiosk_reregisters_on_real_poll(test_client: TestClient):
    test_client.get("/api/kiosks/back-1/config?khost=pi-back&kagent=1.0.0")
    assert test_client.delete("/api/kiosks/back-1").status_code == 200
    test_client.get("/api/kiosks/back-1/config?khost=pi-back&kagent=1.0.0")
    assert "back-1" in _ids(test_client)


@pytest.mark.integration
def test_bare_config_fetch_does_not_register(test_client: TestClient):
    resp = test_client.get("/api/kiosks/calvin/config")
    assert resp.status_code == 200  # still serves the household config
    assert "calvin" not in _ids(test_client)


@pytest.mark.integration
def test_browser_kiosk_first_fetch_registers(test_client: TestClient):
    """The kiosk browser always sends ?khost=; a new real kiosk still appears."""
    test_client.get("/api/kiosks/fresh-1/config?khost=pi-fresh")
    assert "fresh-1" in _ids(test_client)


@pytest.mark.integration
def test_agent_poll_registers_and_known_kiosk_keeps_updating(test_client: TestClient):
    test_client.get("/api/kiosks/agent-1/config?kagent=1.2.3")
    assert "agent-1" in _ids(test_client)
    test_client.get("/api/kiosks/agent-1/config?kagent=1.2.4&kstat=ok")
    kiosk = next(k for k in test_client.get("/api/kiosks").json()["kiosks"] if k["id"] == "agent-1")
    assert kiosk["agentVersion"] == "1.2.4"


def _last_seen(client: TestClient, kiosk_id: str) -> str:
    rows = client.get("/api/kiosks").json()["kiosks"]
    return next(k["lastSeen"] for k in rows if k["id"] == kiosk_id)


@pytest.mark.integration
def test_settings_reads_never_change_last_seen(test_client: TestClient, monkeypatch):
    """Settings lists screens and reads each one's config for its version; that
    must not make a dead screen look online (calvin-7aqu)."""
    from datetime import UTC, datetime, timedelta

    from app.models.db_models import KioskDB

    test_client.put("/api/kiosks/dead-1/overrides", json={"overrides": {}})

    import asyncio

    old = datetime.now(UTC) - timedelta(days=30)

    async def age():
        row = await KioskDB.objects.get(id="dead-1")
        row.last_seen = old
        await row.update(_columns=["last_seen"])

    test_client.portal.call(age) if hasattr(test_client, "portal") else asyncio.run(age())
    before = _last_seen(test_client, "dead-1")

    assert test_client.get("/api/kiosks/dead-1/config").status_code == 200
    test_client.get("/api/kiosks")
    assert _last_seen(test_client, "dead-1") == before

    # A real poll does bump it.
    test_client.get("/api/kiosks/dead-1/config?khost=pi-dead")
    assert _last_seen(test_client, "dead-1") != before


@pytest.mark.integration
def test_bare_fetch_does_not_change_last_seen(test_client: TestClient):
    test_client.put("/api/kiosks/known-1/overrides", json={"overrides": {}})
    before = _last_seen(test_client, "known-1")
    assert test_client.get("/api/kiosks/known-1/config").status_code == 200
    assert _last_seen(test_client, "known-1") == before


@pytest.mark.asyncio
async def test_remove_kiosk_waits_for_the_kiosk_lock(test_db):
    """remove_kiosk takes the display-check lock, so it cannot race a run start."""
    import asyncio

    from app.services import display_check, kiosk_registry

    await kiosk_registry.record_kiosk("lock-1", hostname="pi")
    async with display_check._kiosk_lock("lock-1"):
        task = asyncio.create_task(kiosk_registry.remove_kiosk("lock-1"))
        await asyncio.sleep(0.05)
        assert not task.done()
    assert await task is True
