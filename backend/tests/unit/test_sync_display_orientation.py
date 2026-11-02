"""Unit tests for the Mode-A guard on the startup orientation sync (calvin-dd9.6)."""

from unittest.mock import AsyncMock, patch

import pytest

from app.config import settings
from app.main import _sync_display_orientation


@pytest.fixture(autouse=True)
def _host_control_on():
    """The Mode-A tests exercise the real sync path; host control is explicitly on."""
    with patch.object(settings, "host_control", True):
        yield


@pytest.mark.asyncio
@pytest.mark.unit
async def test_skips_when_no_local_display():
    """No local X display (Mode B) => return early, never touch the orientation service."""
    with (
        patch("app.utils.platform.has_x11", return_value=False),
        patch(
            "app.services.display_orientation_service.display_orientation_service.sync_with_config",
            new=AsyncMock(),
        ) as sync,
    ):
        await _sync_display_orientation()
    sync.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.unit
async def test_runs_sync_when_local_display_present():
    """A local X display (Mode A) => proceed to the existing sync path."""
    with (
        patch("app.utils.platform.has_x11", return_value=True),
        patch(
            "app.services.config_service.config_service.get_value",
            new=AsyncMock(return_value=True),
        ),
        patch(
            "app.services.display_orientation_service.display_orientation_service.sync_with_config",
            new=AsyncMock(return_value={"success": True, "message": "ok"}),
        ) as sync,
    ):
        await _sync_display_orientation()
    sync.assert_called_once()


@pytest.mark.asyncio
@pytest.mark.unit
async def test_skips_entirely_when_host_control_disabled():
    """A dev backend must not run xrandr against the developer's desktop at startup."""
    with (
        patch.object(settings, "host_control", False),
        patch("app.utils.platform.has_x11", return_value=True) as has_x11,
        patch(
            "app.services.config_service.config_service.get_value",
            new=AsyncMock(return_value=True),
        ),
        patch(
            "app.services.display_orientation_service.display_orientation_service.sync_with_config",
            new=AsyncMock(),
        ) as sync,
    ):
        await _sync_display_orientation()

    has_x11.assert_not_called()
    sync.assert_not_called()
