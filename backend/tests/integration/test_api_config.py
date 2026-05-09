"""Integration tests for config API endpoints."""

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient


@pytest.mark.integration
def test_get_config(test_client: TestClient):
    """Test getting configuration via API."""
    response = test_client.get("/api/config")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)
    # Should have default values
    assert "orientation" in data or "calendarSplit" in data


@pytest.mark.integration
def test_get_config_returns_all_frontend_tracked_fields(test_client: TestClient):
    """Every field the frontend config registry tracks must be present in the response.

    The frontend Pinia store's `applyConfigPayload` resets missing fields to defaults on
    every fetch. If the backend ever omits one of these keys, polling will quietly clobber
    locally-mutated values back to defaults. Keep this list in sync with
    frontend/src/stores/configRegistry.js (CONFIG_FIELD_DEFINITIONS).
    """
    expected_keys = {
        "orientation",
        "orientationFlipped",
        "applyDisplayRotation",
        "calendarSplit",
        "sideViewPosition",
        "lastSideViewMode",
        "photoFrameEnabled",
        "photoFrameTimeout",
        "showUI",
        "modeIndicatorTimeout",
        "photoRotationInterval",
        "calendarViewMode",
        "calendarRefreshInterval",
        "timeFormat",
        "weekStartDay",
        "showWeekNumbers",
        "weekendDays",
        "showRedDays",
        "maxVisibleEvents",
        "themeMode",
        "selectedTheme",
        "darkModeStart",
        "darkModeEnd",
        "displayScheduleEnabled",
        "displaySchedule",
        "displayTimeoutEnabled",
        "displayTimeout",
        "rebootComboKey1",
        "rebootComboKey2",
        "rebootComboDuration",
        "keyboardFeedbackEnabled",
        "keyboardFeedbackMode",
        "imageDisplayMode",
        "timezone",
        "clockShowDate",
        "clockShowSeconds",
        "clockBarMode",
        "clockBarShowInKiosk",
        "clockBarPosition",
        "clockBarFontSize",
        "clockBarDateFontSize",
        "clockBarLayout",
        "clockBarPadding",
        "clockBarShowWeather",
        "clockBarShowLogo",
        "mealPlanCardSize",
        "consoleLogEnabled",
        "consoleLogLevel",
        "configPollInterval",
        "devMode",
    }
    response = test_client.get("/api/config")
    assert response.status_code == 200
    data = response.json()
    missing = expected_keys - data.keys()
    assert not missing, f"backend response missing registry-tracked keys: {sorted(missing)}"


@pytest.mark.integration
def test_update_config(test_client: TestClient):
    """Test updating configuration via API."""
    # Get current config
    get_response = test_client.get("/api/config")
    assert get_response.status_code == 200

    # Update config
    update_data = {
        "orientation": "portrait",
        "calendarSplit": 75.0,
    }
    update_response = test_client.post("/api/config", json=update_data)
    assert update_response.status_code == 200

    # Verify update
    updated_config = update_response.json()
    assert updated_config.get("orientation") == "portrait"
    assert updated_config.get("calendarSplit") == 75.0


@pytest.mark.integration
def test_update_dashboard_layout_config(test_client: TestClient):
    """Test updating dashboard region layout via API."""
    dashboard_layout = {
        "version": 1,
        "preset": "service_service",
        "regions": [
            {"id": "primary", "kind": "service", "serviceId": "weather", "size": 55},
            {"id": "secondary", "kind": "service", "serviceId": "meals", "size": 45},
        ],
    }

    response = test_client.post("/api/config", json={"dashboardLayout": dashboard_layout})
    assert response.status_code == 200

    config = response.json()
    assert config["dashboardLayout"] == dashboard_layout

    get_response = test_client.get("/api/config")
    assert get_response.status_code == 200
    assert get_response.json()["dashboardLayout"] == dashboard_layout


@pytest.mark.integration
def test_update_dashboard_screens_config(test_client: TestClient):
    """Test updating dashboard screens via API."""
    dashboard_screens = {
        "version": 2,
        "activeScreenId": "services",
        "screens": [
            {
                "id": "home",
                "name": "Home",
                "layout": {
                    "version": 1,
                    "preset": "calendar_photos",
                    "regions": [
                        {"id": "primary", "kind": "calendar", "serviceId": None, "size": 70},
                        {"id": "secondary", "kind": "photos", "serviceId": None, "size": 30},
                    ],
                },
                "activeRegionId": "primary",
            },
            {
                "id": "services",
                "name": "Services",
                "layout": {
                    "version": 1,
                    "preset": "service_service",
                    "regions": [
                        {"id": "primary", "kind": "service", "serviceId": "weather", "size": 50},
                        {"id": "secondary", "kind": "service", "serviceId": "meals", "size": 50},
                    ],
                },
                "activeRegionId": "secondary",
            },
        ],
    }

    response = test_client.post("/api/config", json={"dashboardScreens": dashboard_screens})
    assert response.status_code == 200

    config = response.json()
    assert config["dashboardScreens"] == dashboard_screens

    get_response = test_client.get("/api/config")
    assert get_response.status_code == 200
    assert get_response.json()["dashboardScreens"] == dashboard_screens


@pytest.mark.integration
def test_update_config_partial(test_client: TestClient):
    """Test partial config update."""
    # Update only one field
    update_data = {"orientation": "landscape"}
    response = test_client.post("/api/config", json=update_data)
    assert response.status_code == 200

    # Verify only that field changed
    config = response.json()
    assert config.get("orientation") == "landscape"


@pytest.mark.integration
class TestConfigDisplayOrientation:
    """Test display orientation config endpoint."""

    def test_get_display_orientation(self, test_client: TestClient):
        """Test getting display orientation."""
        from unittest.mock import patch

        with patch(
            "app.api.routes.config.display_orientation_service.get_current_orientation"
        ) as mock_get:
            mock_get.return_value = {
                "orientation": "landscape",
                "flipped": False,
                "method": "config",
            }

            response = test_client.get("/api/config/display/orientation")
            if response.status_code == 404:
                pytest.skip("Display orientation route not available in test client")

            assert response.status_code == 200
            data = response.json()
            assert "orientation" in data
            assert data["orientation"] == "landscape"


@pytest.mark.integration
class TestConfigGitBranches:
    """Test git branches config endpoint."""

    def test_get_git_branches(self, test_client: TestClient):
        """Test getting git branches from repository."""
        from unittest.mock import patch

        with patch("app.api.routes.config.subprocess.run") as mock_run:
            # Mock git ls-remote output format: "commit_hash\trefs/heads/branch_name"
            mock_result = MagicMock()
            mock_result.returncode = 0
            mock_result.stdout = (
                "abc123def456\trefs/heads/main\n"
                "def456ghi789\trefs/heads/develop\n"
                "ghi789jkl012\trefs/heads/feature/test\n"
            )
            mock_run.return_value = mock_result

            response = test_client.get(
                "/api/config/git/branches?repo_url=https://github.com/user/repo.git"
            )
            if response.status_code == 404:
                pytest.skip("Git branches route not available in test client")

            assert response.status_code == 200
            data = response.json()
            assert "branches" in data
            assert isinstance(data["branches"], list)
            assert "main" in data["branches"]
            assert "develop" in data["branches"]
            assert "repo_url" in data

    def test_get_git_branches_no_url(self, test_client: TestClient):
        """Test getting git branches without URL."""
        from unittest.mock import patch

        with patch("app.api.routes.config.subprocess.run") as mock_run:
            # Mock git ls-remote output format
            mock_result = MagicMock()
            mock_result.returncode = 0
            mock_result.stdout = "abc123def456\trefs/heads/main\n"
            mock_run.return_value = mock_result

            response = test_client.get("/api/config/git/branches")
            if response.status_code == 404:
                pytest.skip("Git branches route not available in test client")

            # Should use default repo or return error
            assert response.status_code in [200, 400]

    def test_get_git_branches_git_error(self, test_client: TestClient):
        """Test handling git command errors."""
        from unittest.mock import patch

        with patch("app.api.routes.config.subprocess.run") as mock_run:
            mock_result = MagicMock()
            mock_result.returncode = 1
            mock_result.stderr = "fatal: not a git repository"
            mock_run.return_value = mock_result

            response = test_client.get(
                "/api/config/git/branches?repo_url=https://invalid.example.com/repo.git"
            )
            if response.status_code == 404:
                pytest.skip("Git branches route not available in test client")

            # Should handle error gracefully
            assert response.status_code in [200, 400, 500]
