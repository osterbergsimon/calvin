"""Deployment-aware system endpoints: native host vs Docker container."""

from unittest.mock import patch

import pytest

from app.api.routes import system as system_routes


@pytest.mark.unit
def test_in_container_follows_deployment_setting():
    with patch.object(system_routes.settings, "deployment", "docker"):
        assert system_routes._in_container() is True
    with patch.object(system_routes.settings, "deployment", "native"):
        assert system_routes._in_container() is False


@pytest.mark.integration
class TestEnvironmentEndpoint:
    def test_reports_docker_without_host_actions(self, test_client):
        with patch("app.api.routes.system._in_container", return_value=True):
            response = test_client.get("/api/system/environment")

        assert response.status_code == 200
        data = response.json()
        assert data["deployment"] == "docker"
        assert data["capabilities"] == {"update": False, "restart": False, "reboot": False}
        assert "docker compose pull" in data["update_instructions"]
        assert "Check for Updates" in data["update_instructions"]

    def test_reports_native_capabilities(self, test_client):
        with (
            patch("app.api.routes.system._in_container", return_value=False),
            patch("app.api.routes.system._restart_mechanism_available", return_value=True),
            patch("app.api.routes.system.settings") as mock_settings,
        ):
            mock_settings.get_update_script_path.return_value.exists.return_value = True
            response = test_client.get("/api/system/environment")

        assert response.status_code == 200
        data = response.json()
        assert data["deployment"] == "native"
        assert data["capabilities"] == {"update": True, "restart": True, "reboot": True}
        assert data["update_instructions"] is None


@pytest.mark.integration
@pytest.mark.parametrize(
    "path",
    [
        "/api/system/update",
        "/api/system/restart-backend",
        "/api/system/restart-frontend",
        "/api/system/reboot",
    ],
)
def test_host_actions_rejected_in_container(test_client, path):
    """In a container these would fail with 'Update script not found' / no systemctl,
    or reboot the wrong machine; answer with how to update instead."""
    with (
        patch("app.api.routes.system._in_container", return_value=True),
        patch("subprocess.run") as run,
        patch("subprocess.Popen") as popen,
    ):
        response = test_client.post(path)

    assert response.status_code == 409
    assert "docker compose pull" in response.json()["detail"]
    run.assert_not_called()
    popen.assert_not_called()
