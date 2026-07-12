"""Unit tests for the Mode-A guard on the startup orientation sync (calvin-dd9.6)."""

from unittest.mock import AsyncMock, patch

import pytest

from app.main import _sync_display_orientation


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
