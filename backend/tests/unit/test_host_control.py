"""The host-control guard that keeps a dev backend off the owner's machine (calvin-hhok)."""

from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.config import settings
from app.utils.host_control import host_control_enabled, require_host_control


@pytest.mark.unit
def test_disabled_raises_structured_409():
    with patch.object(settings, "host_control", False):
        with pytest.raises(HTTPException) as exc_info:
            require_host_control("Rebooting")

    assert exc_info.value.status_code == 409
    detail = exc_info.value.detail
    assert detail["code"] == "host_control_disabled"
    assert detail["message"].startswith("Rebooting is disabled on this deployment.")
    assert "CALVIN_HOST_CONTROL=1" in detail["message"]


@pytest.mark.unit
def test_container_deployment_explains_host_control_is_unavailable():
    """In Docker, CALVIN_HOST_CONTROL=1 can never work: don't suggest it (calvin-x66z)."""
    with (
        patch.object(settings, "host_control", False),
        patch.object(settings, "deployment", "docker"),
    ):
        with pytest.raises(HTTPException) as exc_info:
            require_host_control("Rebooting")

    detail = exc_info.value.detail
    assert detail["code"] == "host_control_disabled"
    assert detail["message"].startswith("Rebooting is not available in a container deployment.")
    assert "container" in detail["message"]
    assert "CALVIN_HOST_CONTROL=1" not in detail["message"]


@pytest.mark.unit
def test_native_deployment_keeps_the_env_hint():
    with (
        patch.object(settings, "host_control", False),
        patch.object(settings, "deployment", "native"),
    ):
        with pytest.raises(HTTPException) as exc_info:
            require_host_control("Rebooting")

    assert "CALVIN_HOST_CONTROL=1" in exc_info.value.detail["message"]


@pytest.mark.unit
def test_enabled_is_a_noop():
    with patch.object(settings, "host_control", True):
        assert host_control_enabled() is True
        assert require_host_control("Rebooting") is None


@pytest.mark.unit
def test_disabled_reports_false():
    with patch.object(settings, "host_control", False):
        assert host_control_enabled() is False
