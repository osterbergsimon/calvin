"""Unit tests for GET /api/system/environment deployment capabilities."""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.api.routes import system as system_routes


@pytest.mark.unit
def test_in_container_dockerenv(tmp_path):
    marker = tmp_path / ".dockerenv"
    marker.write_text("")
    with patch.object(system_routes, "_DOCKERENV_MARKER", marker):
        assert system_routes._in_container() is True


@pytest.mark.unit
def test_in_container_env_var(tmp_path, monkeypatch):
    missing = tmp_path / ".dockerenv"  # does not exist
    monkeypatch.setenv("CALVIN_CONTAINER", "1")
    with patch.object(system_routes, "_DOCKERENV_MARKER", missing):
        assert system_routes._in_container() is True


@pytest.mark.unit
def test_not_in_container(tmp_path, monkeypatch):
    missing = tmp_path / ".dockerenv"
    monkeypatch.delenv("CALVIN_CONTAINER", raising=False)
    with patch.object(system_routes, "_DOCKERENV_MARKER", missing):
        assert system_routes._in_container() is False


@pytest.mark.unit
def test_environment_docker_no_script_no_systemctl(test_client: TestClient, tmp_path):
    """Docker deployment: update unsupported, backend restart via container, no frontend restart."""
    missing_script = tmp_path / "update-calvin.sh"  # does not exist
    with (
        patch.object(system_routes, "_in_container", return_value=True),
        patch.object(system_routes, "_restart_mechanism_available", return_value=False),
        patch("app.config.Settings.get_update_script_path", return_value=missing_script),
    ):
        response = test_client.get("/api/system/environment")
    assert response.status_code == 200
    data = response.json()
    assert data["deployment"] == "docker"
    assert data["update_supported"] is False
    assert data["restart_backend_supported"] is True
    assert data["restart_frontend_supported"] is False
    assert isinstance(data["is_dev_mode"], bool)


@pytest.mark.unit
def test_environment_native_with_script_and_systemctl(test_client: TestClient, tmp_path):
    """Legacy native install: everything supported."""
    script = tmp_path / "update-calvin.sh"
    script.write_text("#!/bin/bash\n")
    with (
        patch.object(system_routes, "_in_container", return_value=False),
        patch.object(system_routes, "_restart_mechanism_available", return_value=True),
        patch("app.config.Settings.get_update_script_path", return_value=script),
    ):
        response = test_client.get("/api/system/environment")
    assert response.status_code == 200
    data = response.json()
    assert data["deployment"] == "native"
    assert data["update_supported"] is True
    assert data["restart_backend_supported"] is True
    assert data["restart_frontend_supported"] is True


@pytest.mark.unit
def test_environment_native_bare(test_client: TestClient, tmp_path):
    """Native without script or systemctl (plain dev checkout): nothing supported."""
    missing_script = tmp_path / "update-calvin.sh"
    with (
        patch.object(system_routes, "_in_container", return_value=False),
        patch.object(system_routes, "_restart_mechanism_available", return_value=False),
        patch("app.config.Settings.get_update_script_path", return_value=missing_script),
    ):
        response = test_client.get("/api/system/environment")
    data = response.json()
    assert data["restart_backend_supported"] is False
    assert data["restart_frontend_supported"] is False
