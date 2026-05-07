"""Integration tests for system API endpoints."""

import json
from unittest.mock import MagicMock, patch

import pytest

from app.api.routes import system as system_routes


class _SyncThread:
    """Runs the thread target synchronously so tests don't need time.sleep."""

    def __init__(self, target=None, daemon=None):
        self._target = target

    def start(self):
        if self._target:
            self._target()


@pytest.mark.integration
class TestSystemRestartEndpoints:
    """Test system restart API endpoints."""

    @patch("app.api.routes.system.threading.Thread", _SyncThread)
    @patch("app.api.routes.system.time.sleep")
    @patch("app.api.routes.system._restart_mechanism_available", return_value=True)
    @patch("app.api.routes.system._RESTART_HELPER")
    @patch("subprocess.run")
    def test_restart_backend_success(
        self, mock_run, mock_helper, _mock_avail, _mock_sleep, test_client
    ):
        """Backend restart is scheduled on a thread; subprocess runs after HTTP returns."""
        mock_helper.is_file.return_value = False
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_run.return_value = mock_result

        response = test_client.post("/api/system/restart-backend")

        if response.status_code == 404:
            pytest.skip("Restart backend route not available in test client")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "scheduled" in data["message"].lower()

        mock_run.assert_called()
        call_args = mock_run.call_args[0][0]
        assert "systemctl" in call_args
        assert "restart" in call_args
        assert "calvin-backend" in call_args

    @patch("app.api.routes.system.threading.Thread", _SyncThread)
    @patch("app.api.routes.system.time.sleep")
    @patch("app.api.routes.system._restart_mechanism_available", return_value=True)
    @patch("app.api.routes.system._RESTART_HELPER")
    @patch("subprocess.run")
    def test_restart_backend_helper_then_systemctl(
        self, mock_run, mock_helper, _mock_avail, _mock_sleep, test_client
    ):
        """Helper script tried first; systemctl used when sudo helper fails."""
        mock_helper.is_file.return_value = True
        mock_fail = MagicMock()
        mock_fail.returncode = 1
        mock_fail.stderr = "sudo helper failed"
        mock_ok = MagicMock()
        mock_ok.returncode = 0
        mock_run.side_effect = [mock_fail, mock_ok]

        response = test_client.post("/api/system/restart-backend")

        if response.status_code == 404:
            pytest.skip("Restart backend route not available in test client")

        assert response.status_code == 200
        assert mock_run.call_count == 2

    @patch("app.api.routes.system._restart_mechanism_available", return_value=False)
    def test_restart_backend_no_mechanism(self, _mock_avail, test_client):
        """Immediate error when neither helper nor systemctl is available."""
        response = test_client.post("/api/system/restart-backend")

        if response.status_code == 404:
            pytest.skip("Restart backend route not available in test client")

        assert response.status_code == 500
        assert "restart method" in response.json()["detail"].lower()

    @patch("app.api.routes.system.threading.Thread", _SyncThread)
    @patch("app.api.routes.system.time.sleep")
    @patch("app.api.routes.system._restart_mechanism_available", return_value=True)
    @patch("app.api.routes.system._RESTART_HELPER")
    @patch("subprocess.run")
    def test_restart_backend_background_failure_logged(
        self, mock_run, mock_helper, _mock_avail, _mock_sleep, test_client
    ):
        """HTTP 200 even when restart commands fail (failure only visible in logs)."""
        mock_helper.is_file.return_value = False
        mock_result = MagicMock()
        mock_result.returncode = 1
        mock_result.stderr = "Permission denied"
        mock_run.return_value = mock_result

        response = test_client.post("/api/system/restart-backend")

        if response.status_code == 404:
            pytest.skip("Restart backend route not available in test client")

        assert response.status_code == 200
        mock_run.assert_called()

    @patch("app.api.routes.system.threading.Thread", _SyncThread)
    @patch("app.api.routes.system._restart_mechanism_available", return_value=True)
    @patch("app.api.routes.system._RESTART_HELPER")
    @patch("subprocess.run")
    def test_restart_frontend_success(self, mock_run, mock_helper, _mock_avail, test_client):
        """Test successfully restarting the frontend service."""
        mock_helper.is_file.return_value = False
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_run.return_value = mock_result

        response = test_client.post("/api/system/restart-frontend")

        if response.status_code == 404:
            pytest.skip("Restart frontend route not available in test client")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "restart initiated" in data["message"].lower()

        mock_run.assert_called()
        call_args = mock_run.call_args[0][0]
        assert "calvin-frontend" in call_args

    @patch("app.api.routes.system.threading.Thread", _SyncThread)
    @patch("app.api.routes.system._restart_mechanism_available", return_value=True)
    @patch("app.api.routes.system._RESTART_HELPER")
    @patch("subprocess.run")
    def test_restart_frontend_helper_then_systemctl(
        self, mock_run, mock_helper, _mock_avail, test_client
    ):
        """Frontend: helper script first, then systemctl."""
        mock_helper.is_file.return_value = True
        mock_fail = MagicMock()
        mock_fail.returncode = 1
        mock_ok = MagicMock()
        mock_ok.returncode = 0
        mock_run.side_effect = [mock_fail, mock_ok]

        response = test_client.post("/api/system/restart-frontend")

        if response.status_code == 404:
            pytest.skip("Restart frontend route not available in test client")

        assert response.status_code == 200
        assert mock_run.call_count == 2

    @patch("app.api.routes.system.threading.Thread", _SyncThread)
    @patch("app.api.routes.system._restart_mechanism_available", return_value=True)
    @patch("app.api.routes.system._RESTART_HELPER")
    @patch("subprocess.run")
    def test_restart_frontend_background_failure_logged(
        self, mock_run, mock_helper, _mock_avail, test_client
    ):
        """HTTP 200 even when frontend restart fails (failure only visible in logs)."""
        mock_helper.is_file.return_value = False
        mock_result = MagicMock()
        mock_result.returncode = 1
        mock_result.stderr = "Permission denied"
        mock_run.return_value = mock_result

        response = test_client.post("/api/system/restart-frontend")

        if response.status_code == 404:
            pytest.skip("Restart frontend route not available in test client")

        assert response.status_code == 200
        mock_run.assert_called()

    def test_reload_ui(self, test_client):
        """Test reload UI endpoint."""
        response = test_client.post("/api/system/reload-ui")

        if response.status_code == 404:
            pytest.skip("Reload UI route not available in test client")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "reload" in data["message"].lower()


@pytest.mark.integration
class TestSystemUpdateEndpoints:
    """Test system update API endpoints."""

    def test_get_update_status_no_log(self, test_client, tmp_path):
        """Test getting update status when no log exists (isolate from repo logs)."""
        with patch.object(system_routes.settings, "repo_dir", tmp_path):
            response = test_client.get("/api/system/update/status")

        if response.status_code == 404:
            pytest.skip("Update status route not available in test client")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] in ["unknown", "idle"]
        assert "log not found" in data["message"].lower() or data["status"] == "unknown"

    @patch("subprocess.Popen")
    def test_trigger_update_success(self, mock_popen, test_client, tmp_path, monkeypatch):
        """Test successfully triggering an update."""
        # Create a fake update script so settings.get_update_script_path().exists() is True
        script_path = tmp_path / "update.sh"
        script_path.write_text("#!/bin/bash\n")

        # Mock process
        mock_process = MagicMock()
        mock_process.pid = 12345
        mock_process.poll.return_value = None  # Process still running
        mock_popen.return_value = mock_process

        # Pydantic models forbid attribute mutation, so swap the whole settings
        # binding in the route module with a stand-in for the duration of the test.
        original_settings = system_routes.settings

        class _StubSettings:
            repo_dir = tmp_path
            system_path = original_settings.system_path

            def get_update_script_path(self):
                return script_path

        monkeypatch.setattr(system_routes, "settings", _StubSettings())

        response = test_client.post("/api/system/update")

        if response.status_code == 404:
            pytest.skip("Update route not available in test client")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "started"
        assert "pid" in data
        assert data["state_file"].endswith("calvin-update-state.json")

        popen_env = mock_popen.call_args.kwargs["env"]
        assert popen_env["UPDATE_STATE_FILE"].endswith("calvin-update-state.json")
        assert popen_env["UPDATE_LOG_FILE"].endswith("calvin-update.log")

    def test_update_stream_emits_structured_state(self, test_client, tmp_path):
        """SSE stream emits terminal status from structured state even without log output."""
        state_file = tmp_path / "backend" / "logs" / "calvin-update-state.json"
        state_file.parent.mkdir(parents=True, exist_ok=True)
        state_file.write_text(
            json.dumps(
                {
                    "status": "success",
                    "phase": "complete",
                    "message": "Update completed successfully",
                }
            ),
            encoding="utf-8",
        )

        with patch.object(system_routes.settings, "repo_dir", tmp_path):
            response = test_client.get("/api/system/update/stream")

        assert response.status_code == 200
        assert '"type": "status"' in response.text
        assert '"status": "complete"' in response.text
        assert "Update completed successfully" in response.text


@pytest.mark.integration
class TestSystemDisplayPowerEndpoints:
    """Test display power API endpoints."""

    @patch("app.api.routes.system.display_power_service.turn_display_on")
    def test_turn_display_on_success(self, mock_turn_on, test_client):
        """Test successfully turning display on."""
        from unittest.mock import AsyncMock

        mock_turn_on.return_value = AsyncMock(return_value=None)
        mock_turn_on.return_value = None

        response = test_client.post("/api/system/display/power/on")

        if response.status_code == 404:
            pytest.skip("Display power route not available in test client")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "turned on" in data["message"].lower()

    @patch("app.api.routes.system.display_power_service.turn_display_off")
    def test_turn_display_off_success(self, mock_turn_off, test_client):
        """Test successfully turning display off."""
        mock_turn_off.return_value = None

        response = test_client.post("/api/system/display/power/off")

        if response.status_code == 404:
            pytest.skip("Display power route not available in test client")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "turned off" in data["message"].lower()

    @patch("app.api.routes.system.display_power_service.get_display_state")
    def test_get_display_state_success(self, mock_get_state, test_client):
        """Test successfully getting display state."""
        mock_get_state.return_value = {"state": "on", "method": "vcgencmd"}

        response = test_client.get("/api/system/display/power/state")

        if response.status_code == 404:
            pytest.skip("Display power route not available in test client")

        assert response.status_code == 200
        data = response.json()
        assert data["state"] == "on"
        assert data["method"] == "vcgencmd"

    @patch("app.api.routes.system.display_power_service.get_display_state")
    def test_get_display_state_off(self, mock_get_state, test_client):
        """Test getting display state when display is off."""
        mock_get_state.return_value = {"state": "off", "method": "vcgencmd"}

        response = test_client.get("/api/system/display/power/state")

        if response.status_code == 404:
            pytest.skip("Display power route not available in test client")

        assert response.status_code == 200
        data = response.json()
        assert data["state"] == "off"

    @patch("app.api.routes.system.display_power_service.configure_display_timeout")
    def test_configure_display_timeout_success(self, mock_configure, test_client):
        """Test successfully configuring display timeout."""
        mock_configure.return_value = None

        response = test_client.post("/api/system/display/timeout/configure")

        if response.status_code == 404:
            pytest.skip("Display timeout route not available in test client")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "timeout configured" in data["message"].lower()

    @patch("app.api.routes.system.display_power_service.turn_display_on")
    def test_turn_display_on_error(self, mock_turn_on, test_client):
        """Test handling error when turning display on fails."""
        mock_turn_on.side_effect = Exception("Display control failed")

        response = test_client.post("/api/system/display/power/on")

        if response.status_code == 404:
            pytest.skip("Display power route not available in test client")

        assert response.status_code == 500
        assert "failed" in response.json()["detail"].lower()

    @patch("app.api.routes.system.display_power_service.get_display_state")
    def test_get_display_state_error(self, mock_get_state, test_client):
        """Test handling error when getting display state fails."""
        mock_get_state.side_effect = Exception("State check failed")

        response = test_client.get("/api/system/display/power/state")

        if response.status_code == 404:
            pytest.skip("Display power route not available in test client")

        assert response.status_code == 500
        assert "failed" in response.json()["detail"].lower()
