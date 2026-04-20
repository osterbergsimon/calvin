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
