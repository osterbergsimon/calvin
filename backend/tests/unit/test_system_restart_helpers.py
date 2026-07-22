"""Unit tests for system route restart helpers (no HTTP)."""

from unittest.mock import MagicMock, patch

import pytest

from app.api.routes import system as system_routes


class _FakeHelperPath:
    """Minimal stand-in for pathlib.Path used in sudo argv (str + is_file)."""

    def __init__(self, path: str) -> None:
        self._path = path

    def is_file(self) -> bool:
        return True

    def __str__(self) -> str:
        return self._path


@pytest.mark.unit
def test_restart_mechanism_available_helper_file():
    with patch("app.api.routes.system._RESTART_HELPER") as mock_helper:
        mock_helper.is_file.return_value = True
        with patch("app.api.routes.system.shutil.which", return_value=None):
            assert system_routes._restart_mechanism_available() is True


@pytest.mark.unit
def test_restart_mechanism_available_systemctl_only():
    with patch("app.api.routes.system._RESTART_HELPER") as mock_helper:
        mock_helper.is_file.return_value = False
        with patch(
            "app.api.routes.system.shutil.which",
            return_value="/bin/systemctl",
        ):
            assert system_routes._restart_mechanism_available() is True


@pytest.mark.unit
def test_restart_mechanism_unavailable():
    with patch("app.api.routes.system._RESTART_HELPER") as mock_helper:
        mock_helper.is_file.return_value = False
        with patch("app.api.routes.system.shutil.which", return_value=None):
            assert system_routes._restart_mechanism_available() is False


@pytest.mark.unit
def test_attempt_restart_uses_helper_when_succeeds():
    mock_result = MagicMock()
    mock_result.returncode = 0
    helper = _FakeHelperPath("/usr/local/bin/restart-calvin-services.sh")
    with patch("app.api.routes.system._RESTART_HELPER", helper):
        with patch(
            "app.api.routes.system.subprocess.run",
            return_value=mock_result,
        ) as mock_run:
            assert system_routes._attempt_restart_calvin_service("backend") is True
    mock_run.assert_called_once()
    cmd = mock_run.call_args[0][0]
    assert cmd[0] == "sudo"
    assert cmd[1] == str(helper)
    assert cmd[2] == "backend"


@pytest.mark.unit
def test_attempt_restart_falls_back_to_systemctl():
    mock_fail = MagicMock()
    mock_fail.returncode = 1
    mock_ok = MagicMock()
    mock_ok.returncode = 0
    helper = _FakeHelperPath("/usr/local/bin/restart-calvin-services.sh")
    with patch("app.api.routes.system._RESTART_HELPER", helper):
        with patch(
            "app.api.routes.system.subprocess.run",
            side_effect=[mock_fail, mock_ok],
        ) as mock_run:
            assert system_routes._attempt_restart_calvin_service("frontend") is True
    assert mock_run.call_count == 2
    assert mock_run.call_args_list[1][0][0] == [
        "systemctl",
        "restart",
        "calvin-frontend",
    ]


@pytest.mark.unit
def test_restart_backend_container_path(test_client):
    """In a container with no restart mechanism, respond 200 and schedule self-signal."""
    with (
        patch("app.api.routes.system._restart_mechanism_available", return_value=False),
        patch("app.api.routes.system._in_container", return_value=True),
        patch("app.api.routes.system.threading.Thread") as mock_thread,
    ):
        response = test_client.post("/api/system/restart-backend")
    assert response.status_code == 200
    assert "restart" in response.json()["message"].lower()
    mock_thread.assert_called_once()
    assert mock_thread.call_args.kwargs.get("daemon") is True
    mock_thread.return_value.start.assert_called_once()


@pytest.mark.unit
def test_restart_backend_native_without_mechanism_still_fails(test_client):
    with (
        patch("app.api.routes.system._restart_mechanism_available", return_value=False),
        patch("app.api.routes.system._in_container", return_value=False),
    ):
        response = test_client.post("/api/system/restart-backend")
    assert response.status_code == 500
