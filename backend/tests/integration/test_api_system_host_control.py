"""Host-acting routes must not touch the machine when Calvin does not own it (calvin-hhok).

With ``CALVIN_HOST_CONTROL`` off (the default on desktops, dev checkouts and in
containers) every host action answers 409 ``host_control_disabled`` and never runs
its command. With it on, the command still runs.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.config import settings

# Every route that reaches outside the process. Keep this list in sync with the
# guard calls in app/api/routes/system.py.
HOST_ACTING_PATHS = [
    "/api/system/update",
    "/api/system/restart-backend",
    "/api/system/restart-frontend",
    "/api/system/reboot",
    "/api/system/reload-ui",
    "/api/system/display/power/on",
    "/api/system/display/power/off",
    "/api/system/display/timeout/configure",
]

DISPLAY_PATHS = {
    "/api/system/display/power/on": "turn_display_on",
    "/api/system/display/power/off": "turn_display_off",
    "/api/system/display/timeout/configure": "configure_display_timeout",
}

COMMAND_PATHS = [
    "/api/system/restart-backend",
    "/api/system/restart-frontend",
    "/api/system/reboot",
]


class _SyncThread:
    """Runs the thread target synchronously so tests don't need time.sleep."""

    def __init__(self, target=None, daemon=None):
        self._target = target

    def start(self):
        if self._target:
            self._target()


def _ok_run(*_args, **_kwargs):
    return SimpleNamespace(returncode=0, stdout="", stderr=b"")


@pytest.mark.integration
@pytest.mark.parametrize("path", HOST_ACTING_PATHS)
def test_host_action_is_refused_when_disabled(test_client, path):
    with (
        patch.object(settings, "host_control", False),
        patch("subprocess.run", side_effect=_ok_run) as run,
        patch("subprocess.Popen") as popen,
        patch(
            "app.api.routes.system.display_power_service.turn_display_on", new=AsyncMock()
        ) as turn_on,
        patch(
            "app.api.routes.system.display_power_service.turn_display_off", new=AsyncMock()
        ) as turn_off,
        patch(
            "app.api.routes.system.display_power_service.configure_display_timeout",
            new=AsyncMock(),
        ) as configure,
    ):
        response = test_client.post(path)

    assert response.status_code == 409, response.text
    detail = response.json()["detail"]
    assert detail["code"] == "host_control_disabled"
    assert "is disabled on this deployment." in detail["message"]
    assert "CALVIN_HOST_CONTROL=1" in detail["message"]

    run.assert_not_called()
    popen.assert_not_called()
    turn_on.assert_not_called()
    turn_off.assert_not_called()
    configure.assert_not_called()


@pytest.mark.integration
def test_environment_reports_host_control_off(test_client):
    """The UI learns which host actions exist from /system/environment."""
    with (
        patch.object(settings, "host_control", False),
        patch("app.api.routes.system._in_container", return_value=False),
    ):
        data = test_client.get("/api/system/environment").json()

    assert data["host_control"] is False
    assert data["capabilities"] == {"update": False, "restart": False, "reboot": False}


@pytest.mark.integration
@pytest.mark.parametrize("path", COMMAND_PATHS)
def test_command_routes_run_when_enabled(test_client, path):
    from contextlib import ExitStack

    with ExitStack() as stack:
        stack.enter_context(patch.object(settings, "host_control", True))
        stack.enter_context(
            patch("app.api.routes.system._restart_mechanism_available", return_value=True)
        )
        helper = stack.enter_context(patch("app.api.routes.system._RESTART_HELPER"))
        run = stack.enter_context(patch("subprocess.run", side_effect=_ok_run))
        if "restart" in path:
            # The restart routes schedule a thread; run it inline. Scoped to
            # them only, because patching threading.Thread breaks asyncio's
            # executor that run_command uses for reboot.
            stack.enter_context(patch("app.api.routes.system.threading.Thread", _SyncThread))
            stack.enter_context(patch("app.api.routes.system.time.sleep"))
        helper.is_file.return_value = False

        response = test_client.post(path)

    assert response.status_code == 200, response.text
    run.assert_called()


@pytest.mark.integration
@pytest.mark.parametrize("path,method", list(DISPLAY_PATHS.items()))
def test_display_routes_call_service_when_enabled(test_client, path, method):
    with (
        patch.object(settings, "host_control", True),
        patch(f"app.api.routes.system.display_power_service.{method}", new=AsyncMock()) as call,
    ):
        response = test_client.post(path)

    assert response.status_code == 200, response.text
    call.assert_called_once()


@pytest.mark.integration
def test_reload_ui_answers_when_enabled(test_client):
    with patch.object(settings, "host_control", True):
        response = test_client.post("/api/system/reload-ui")

    assert response.status_code == 200
    assert response.json()["status"] == "success"


@pytest.mark.integration
def test_update_starts_when_enabled(test_client, tmp_path, monkeypatch):
    """The update route is gated too: with host control on it still launches the script."""
    from app.api.routes import system as system_routes

    script_path = tmp_path / "update.sh"
    script_path.write_text("#!/bin/bash\n")

    class _StubSettings:
        deployment = "native"
        host_control = True
        repo_dir = tmp_path
        system_path = settings.system_path

        def get_update_script_path(self):
            return script_path

    process = MagicMock()
    process.pid = 12345
    process.poll.return_value = None

    with (
        patch.object(settings, "host_control", True),
        monkeypatch.context() as mp,
    ):
        mp.setattr(system_routes, "settings", _StubSettings())
        with patch("subprocess.Popen", return_value=process) as popen:
            response = test_client.post("/api/system/update")

    assert response.status_code == 200, response.text
    popen.assert_called_once()
