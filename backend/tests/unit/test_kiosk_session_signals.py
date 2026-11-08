"""What makes a sign-in a kiosk sign-in, and what ends a kiosk session (calvin-q4o8)."""

from unittest.mock import AsyncMock, patch

import pytest

from app.config import settings
from app.security import admin_auth
from app.security.admin_auth import SessionKind, get_admin_store
from app.services import kiosk_registry
from app.services.display_power_service import display_power_service


@pytest.fixture(autouse=True)
def _clean_locks():
    admin_auth._kiosk_locks.clear()
    admin_auth.set_kiosk_idle_seconds(None)
    yield
    admin_auth._kiosk_locks.clear()
    admin_auth.set_kiosk_idle_seconds(None)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_an_address_nobody_used_for_two_hours_is_forgotten(test_db, monkeypatch):
    monkeypatch.setattr(kiosk_registry, "_now", lambda: 1_000_000.0)
    await kiosk_registry.record_kiosk("hall-1", hostname="pi", peer_ip="192.168.1.43")
    assert await kiosk_registry.kiosk_for_peer("192.168.1.43", now=1_000_000.0) == "hall-1"
    just_in = 1_000_000.0 + kiosk_registry.PEER_IP_TTL_S
    assert await kiosk_registry.kiosk_for_peer("192.168.1.43", now=just_in) == "hall-1"
    assert await kiosk_registry.kiosk_for_peer("192.168.1.43", now=just_in + 1) is None


@pytest.mark.asyncio
@pytest.mark.unit
async def test_a_reused_address_names_the_kiosk_that_used_it_last(test_db, monkeypatch):
    clock = {"now": 1_000_000.0}
    monkeypatch.setattr(kiosk_registry, "_now", lambda: clock["now"])
    await kiosk_registry.record_kiosk("old-kiosk", hostname="a", peer_ip="192.168.1.50")
    clock["now"] += 3600  # the lease moved to another Pi an hour later
    await kiosk_registry.record_kiosk("new-kiosk", hostname="b", peer_ip="192.168.1.50")
    assert await kiosk_registry.kiosk_for_peer("192.168.1.50", now=clock["now"]) == "new-kiosk"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_a_live_kiosk_keeps_its_address_fresh(test_db, monkeypatch):
    clock = {"now": 1_000_000.0}
    monkeypatch.setattr(kiosk_registry, "_now", lambda: clock["now"])
    await kiosk_registry.record_kiosk("hall-1", hostname="pi", peer_ip="192.168.1.43")
    for _ in range(12):  # polls over 3 hours
        clock["now"] += 900
        await kiosk_registry.record_kiosk("hall-1", hostname="pi", peer_ip="192.168.1.43")
    assert await kiosk_registry.kiosk_for_peer("192.168.1.43", now=clock["now"]) == "hall-1"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_turning_the_display_off_ends_the_all_in_one_kiosks_sessions(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "admin_auth_path", tmp_path / "admin-auth.json")
    store = get_admin_store()
    store.set_password("correct horse")
    import time

    local = store.issue_cookie(SessionKind.KIOSK, None, now=int(time.time()) - 5)
    with (
        patch.object(settings, "host_control", True),
        patch("app.services.display_power_service.is_raspberry_pi", return_value=False),
        patch("app.services.display_power_service.has_x11", return_value=False),
        patch("app.services.display_power_service.run_command", new=AsyncMock()),
    ):
        assert store.verify_cookie(local) is True
        await display_power_service.turn_display_off()
    assert store.verify_cookie(local) is False


@pytest.mark.asyncio
@pytest.mark.unit
async def test_the_display_timeout_bounds_a_kiosk_session(monkeypatch):
    with (
        patch("app.services.display_power_service.has_x11", return_value=False),
        patch("app.services.display_power_service.run_command", new=AsyncMock()),
    ):
        await display_power_service._apply_display_timeout(True, 90)
        assert admin_auth.kiosk_idle_seconds() == 90
        await display_power_service._apply_display_timeout(False, 90)
        assert admin_auth.kiosk_idle_seconds() == 300
