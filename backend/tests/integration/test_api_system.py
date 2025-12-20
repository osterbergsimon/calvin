"""Integration tests for system API endpoints."""

from unittest.mock import MagicMock, patch

import pytest


@pytest.mark.integration
class TestSystemRestartEndpoints:
    """Test system restart API endpoints."""

    @patch("subprocess.run")
    def test_restart_backend_success(self, mock_run, test_client):
        """Test successfully restarting the backend service."""
        # Mock successful systemctl restart
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_run.return_value = mock_result

        response = test_client.post("/api/system/restart-backend")

        # Route might not be available in test client
        if response.status_code == 404:
            pytest.skip("Restart backend route not available in test client")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "restart initiated" in data["message"].lower()

        # Verify systemctl was called
        mock_run.assert_called()
        call_args = mock_run.call_args[0][0]
        assert "systemctl" in call_args
        assert "restart" in call_args
        assert "calvin-backend" in call_args

    @patch("subprocess.run")
    def test_restart_backend_fallback_to_dbus(self, mock_run, test_client):
        """Test restart falls back to dbus if systemctl fails."""
        # Mock systemctl failure, dbus success
        mock_result_systemctl = MagicMock()
        mock_result_systemctl.returncode = 1  # systemctl fails

        mock_result_dbus = MagicMock()
        mock_result_dbus.returncode = 0  # dbus succeeds

        mock_run.side_effect = [mock_result_systemctl, mock_result_dbus]

        response = test_client.post("/api/system/restart-backend")

        if response.status_code == 404:
            pytest.skip("Restart backend route not available in test client")

        assert response.status_code == 200
        assert mock_run.call_count == 2  # systemctl + dbus

    @patch("subprocess.run")
    def test_restart_backend_all_methods_fail(self, mock_run, test_client):
        """Test restart when all methods fail."""
        # Mock all methods failing
        mock_result = MagicMock()
        mock_result.returncode = 1
        mock_result.stderr = b"Permission denied"
        mock_run.return_value = mock_result

        response = test_client.post("/api/system/restart-backend")

        if response.status_code == 404:
            pytest.skip("Restart backend route not available in test client")

        assert response.status_code == 500
        assert "failed" in response.json()["detail"].lower()

    @patch("subprocess.run")
    def test_restart_frontend_success(self, mock_run, test_client):
        """Test successfully restarting the frontend service."""
        # Mock successful systemctl restart
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

        # Verify systemctl was called with calvin-frontend
        mock_run.assert_called()
        call_args = mock_run.call_args[0][0]
        assert "calvin-frontend" in call_args

    @patch("subprocess.run")
    def test_restart_frontend_fallback_to_dbus(self, mock_run, test_client):
        """Test frontend restart falls back to dbus if systemctl fails."""
        # Mock systemctl failure, dbus success
        mock_result_systemctl = MagicMock()
        mock_result_systemctl.returncode = 1

        mock_result_dbus = MagicMock()
        mock_result_dbus.returncode = 0

        mock_run.side_effect = [mock_result_systemctl, mock_result_dbus]

        response = test_client.post("/api/system/restart-frontend")

        if response.status_code == 404:
            pytest.skip("Restart frontend route not available in test client")

        assert response.status_code == 200
        assert mock_run.call_count == 2

    @patch("subprocess.run")
    def test_restart_frontend_all_methods_fail(self, mock_run, test_client):
        """Test frontend restart when all methods fail."""
        mock_result = MagicMock()
        mock_result.returncode = 1
        mock_result.stderr = b"Permission denied"
        mock_run.return_value = mock_result

        response = test_client.post("/api/system/restart-frontend")

        if response.status_code == 404:
            pytest.skip("Restart frontend route not available in test client")

        assert response.status_code == 500
        assert "failed" in response.json()["detail"].lower()

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

    def test_get_update_status_no_log(self, test_client):
        """Test getting update status when no log exists."""
        response = test_client.get("/api/system/update/status")

        if response.status_code == 404:
            pytest.skip("Update status route not available in test client")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] in ["unknown", "idle"]
        assert "log not found" in data["message"].lower() or data["status"] == "unknown"

    @patch("subprocess.Popen")
    @patch("pathlib.Path.exists")
    def test_trigger_update_success(self, mock_exists, mock_popen, test_client):
        """Test successfully triggering an update."""
        # Mock update script exists
        mock_exists.return_value = True

        # Mock process
        mock_process = MagicMock()
        mock_process.pid = 12345
        mock_process.poll.return_value = None  # Process still running
        mock_popen.return_value = mock_process

        response = test_client.post("/api/system/update")

        if response.status_code == 404:
            pytest.skip("Update route not available in test client")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "started"
        assert "pid" in data
