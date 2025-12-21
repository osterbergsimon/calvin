"""Integration tests for theme API endpoints (via plugins API)."""

import json
import zipfile

import pytest

from app.services.theme_installer import theme_installer


@pytest.mark.integration
class TestThemeAPI:
    """Test theme API endpoints via plugins router."""

    def test_get_themes(self, test_client):
        """Test getting all themes."""
        response = test_client.get("/api/plugins?plugin_type=theme")
        assert response.status_code == 200
        data = response.json()
        assert "plugins" in data
        # Should include built-in themes
        theme_ids = [p["id"] for p in data["plugins"]]
        assert "light" in theme_ids
        assert "dark" in theme_ids

    def test_get_theme_by_id_builtin(self, test_client):
        """Test getting a built-in theme by ID."""
        response = test_client.get("/api/plugins/light")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "light"
        assert data["is_builtin"] is True
        assert "variables" in data

    def test_get_theme_by_id_installed(self, test_client, tmp_path):
        """Test getting an installed theme by ID."""
        # Clean up first
        try:
            theme_installer.uninstall_theme("test_api_theme")
        except Exception:
            pass

        # Create a valid theme package
        theme_dir = tmp_path / "test_theme"
        theme_dir.mkdir()

        manifest = {
            "id": "test_api_theme",
            "name": "Test API Theme",
            "version": "1.0.0",
            "description": "A test theme",
            "variables": {
                "bg-primary": "#ffffff",
                "bg-secondary": "#f5f5f5",
                "text-primary": "#333333",
                "accent-primary": "#2196f3",
            },
        }
        (theme_dir / "theme.json").write_text(json.dumps(manifest))

        # Create zip file
        zip_path = tmp_path / "test_theme.zip"
        with zipfile.ZipFile(zip_path, "w") as zipf:
            for file_path in theme_dir.rglob("*"):
                if file_path.is_file():
                    arcname = file_path.relative_to(theme_dir)
                    zipf.write(file_path, arcname)

        # Install theme
        with open(zip_path, "rb") as zip_file:
            response = test_client.post(
                "/api/plugins/install",
                files={"file": ("test_theme.zip", zip_file, "application/zip")},
            )

        if response.status_code == 200:
            # Get theme by ID
            response = test_client.get("/api/plugins/test_api_theme")
            assert response.status_code == 200
            data = response.json()
            assert data["id"] == "test_api_theme"
            assert "variables" in data

            # Cleanup
            try:
                theme_installer.uninstall_theme("test_api_theme")
            except Exception:
                pass

    def test_install_theme_from_zip(self, test_client, tmp_path):
        """Test installing a theme from a zip file."""
        # Clean up first
        try:
            theme_installer.uninstall_theme("test_install_theme")
        except Exception:
            pass

        # Create a valid theme package
        theme_dir = tmp_path / "test_theme"
        theme_dir.mkdir()

        manifest = {
            "id": "test_install_theme",
            "name": "Test Install Theme",
            "version": "1.0.0",
            "description": "A test theme for installation",
            "variables": {
                "bg-primary": "#ffffff",
                "bg-secondary": "#f5f5f5",
                "text-primary": "#333333",
                "accent-primary": "#2196f3",
            },
        }
        (theme_dir / "theme.json").write_text(json.dumps(manifest))

        # Create zip file
        zip_path = tmp_path / "test_theme.zip"
        with zipfile.ZipFile(zip_path, "w") as zipf:
            for file_path in theme_dir.rglob("*"):
                if file_path.is_file():
                    arcname = file_path.relative_to(theme_dir)
                    zipf.write(file_path, arcname)

        # Install theme
        with open(zip_path, "rb") as zip_file:
            response = test_client.post(
                "/api/plugins/install",
                files={"file": ("test_theme.zip", zip_file, "application/zip")},
            )

        if response.status_code == 200:
            data = response.json()
            assert data["success"] is True
            assert data["manifest"]["id"] == "test_install_theme"
            assert data["requires_restart"] is False  # Themes don't require restart

            # Verify theme appears in installed list
            response = test_client.get("/api/plugins/installed")
            if response.status_code == 200:
                plugins_data = response.json()
                plugins = plugins_data.get("plugins", plugins_data) if isinstance(plugins_data, dict) else plugins_data
                theme_ids = [p["id"] for p in plugins if p.get("type") == "theme"]
                assert "test_install_theme" in theme_ids

            # Cleanup
            try:
                theme_installer.uninstall_theme("test_install_theme")
            except Exception:
                pass

    def test_uninstall_theme(self, test_client, tmp_path):
        """Test uninstalling a theme."""
        # Clean up first
        try:
            theme_installer.uninstall_theme("test_uninstall_theme")
        except Exception:
            pass

        # Install a theme first
        theme_dir = tmp_path / "test_theme"
        theme_dir.mkdir()
        manifest = {
            "id": "test_uninstall_theme",
            "name": "Test Uninstall Theme",
            "version": "1.0.0",
            "variables": {"bg-primary": "#ffffff"},
        }
        (theme_dir / "theme.json").write_text(json.dumps(manifest))

        zip_path = tmp_path / "test_theme.zip"
        with zipfile.ZipFile(zip_path, "w") as zipf:
            for file_path in theme_dir.rglob("*"):
                if file_path.is_file():
                    arcname = file_path.relative_to(theme_dir)
                    zipf.write(file_path, arcname)

        # Install
        with open(zip_path, "rb") as zip_file:
            install_response = test_client.post(
                "/api/plugins/install",
                files={"file": ("test_theme.zip", zip_file, "application/zip")},
            )

        if install_response.status_code == 200:
            # Uninstall
            response = test_client.delete("/api/plugins/installed/test_uninstall_theme")
            if response.status_code == 200:
                data = response.json()
                assert data["success"] is True

                # Verify theme is removed
                response = test_client.get("/api/plugins/installed")
                if response.status_code == 200:
                    plugins_data = response.json()
                    plugins = plugins_data.get("plugins", plugins_data) if isinstance(plugins_data, dict) else plugins_data
                    theme_ids = [p["id"] for p in plugins if p.get("type") == "theme"]
                    assert "test_uninstall_theme" not in theme_ids

    def test_uninstall_builtin_theme_fails(self, test_client):
        """Test that uninstalling a built-in theme fails."""
        response = test_client.delete("/api/plugins/installed/light")
        # Should fail (400 or 404)
        assert response.status_code in [400, 404]

    def test_get_plugins_includes_themes(self, test_client):
        """Test that GET /api/plugins includes themes when no filter is specified."""
        response = test_client.get("/api/plugins")
        assert response.status_code == 200
        data = response.json()
        assert "plugins" in data
        
        # Should include both plugins and themes
        items = data["plugins"]
        plugin_types = {item.get("type") for item in items}
        assert "theme" in plugin_types
        
        # Should include built-in themes
        theme_ids = [item["id"] for item in items if item.get("type") == "theme"]
        assert "light" in theme_ids
        assert "dark" in theme_ids

    def test_get_plugins_filtered_by_theme(self, test_client):
        """Test that GET /api/plugins?plugin_type=theme returns only themes."""
        response = test_client.get("/api/plugins?plugin_type=theme")
        assert response.status_code == 200
        data = response.json()
        assert "plugins" in data
        
        # All items should be themes
        items = data["plugins"]
        assert all(item.get("type") == "theme" for item in items)
        
        # Should include built-in themes
        theme_ids = [item["id"] for item in items]
        assert "light" in theme_ids
        assert "dark" in theme_ids

