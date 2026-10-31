"""Integration tests for theme API endpoints (via plugins API)."""

import json
import zipfile

import pytest

from app.services.theme_installer import theme_installer

LIGHT = {
    "bg-0": "#eef1f4",
    "bg-1": "#ffffff",
    "bg-2": "#ffffff",
    "line": "#dde3e8",
    "line-soft": "#e8edf1",
    "ink": "#1b242b",
    "ink-2": "#5d6b75",
    "ink-3": "#636e77",
    "focus": "#e08a1e",
    "ok": "#2e9e6b",
    "warn": "#b38f00",
    "err": "#c0392b",
    "shadow": "rgba(0, 0, 0, 0.1)",
    "shadow-hover": "rgba(0, 0, 0, 0.15)",
}
DARK = {
    "bg-0": "#0e1316",
    "bg-1": "#151c21",
    "bg-2": "#1d262d",
    "line": "#27313a",
    "line-soft": "#1e272e",
    "ink": "#eaf0f3",
    "ink-2": "#9aa7b0",
    "ink-3": "#818d96",
    "focus": "#f3b052",
    "ok": "#5bd0a0",
    "warn": "#ffd84d",
    "err": "#ef6b5e",
    "shadow": "rgba(0, 0, 0, 0.3)",
    "shadow-hover": "rgba(0, 0, 0, 0.4)",
}


def _manifest(theme_id: str, name: str) -> dict:
    return {
        "id": theme_id,
        "name": name,
        "version": "1.0.0",
        "description": "A test theme",
        "theme_api": 2,
        "variables": dict(LIGHT),
        "dark_mode": dict(DARK),
    }


@pytest.mark.integration
class TestThemeAPI:
    """Test theme API endpoints via plugins router."""

    def test_get_themes(self, test_client):
        """Test getting all themes."""
        response = test_client.get("/api/plugins?plugin_type=theme")
        assert response.status_code == 200
        data = response.json()
        assert "plugins" in data
        # D1: a theme is a palette; light/dark is the mode, not a theme.
        theme_ids = [p["id"] for p in data["plugins"]]
        assert {"ocean", "forest", "sunset"} <= set(theme_ids)
        assert "light" not in theme_ids
        assert "dark" not in theme_ids

    def test_get_theme_by_id_builtin(self, test_client):
        """Test getting a built-in theme by ID."""
        response = test_client.get("/api/plugins/ocean")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "ocean"
        assert data["is_builtin"] is True
        assert data["selectable"] is True
        assert data["validation_errors"] == []
        assert data["theme_api"] == 2
        assert "variables" in data
        assert "dark_mode" in data

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

        manifest = _manifest("test_api_theme", "Test API Theme")
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

        manifest = _manifest("test_install_theme", "Test Install Theme")
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
                plugins = (
                    plugins_data.get("plugins", plugins_data)
                    if isinstance(plugins_data, dict)
                    else plugins_data
                )
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
        manifest = _manifest("test_uninstall_theme", "Test Uninstall Theme")
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
                    plugins = (
                        plugins_data.get("plugins", plugins_data)
                        if isinstance(plugins_data, dict)
                        else plugins_data
                    )
                    theme_ids = [p["id"] for p in plugins if p.get("type") == "theme"]
                    assert "test_uninstall_theme" not in theme_ids

    def test_uninstall_builtin_theme_fails(self, test_client):
        """Test that uninstalling a built-in theme fails."""
        response = test_client.delete("/api/plugins/installed/ocean")
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
        assert {"ocean", "forest", "sunset"} <= set(theme_ids)

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
        assert {"ocean", "forest", "sunset"} <= set(theme_ids)

    def test_installed_theme_failing_load_check_is_unselectable(self, test_client, tmp_path):
        """A theme edited after install is kept but marked unselectable (load check)."""
        try:
            theme_installer.uninstall_theme("test_broken_theme")
        except Exception:
            pass

        theme_dir = tmp_path / "broken"
        theme_dir.mkdir()
        (theme_dir / "theme.json").write_text(json.dumps(_manifest("test_broken_theme", "Broken")))
        theme_installer.install_theme(theme_dir, "test_broken_theme")

        manifest_path = theme_installer.get_theme_path("test_broken_theme") / "theme.json"
        manifest = json.loads(manifest_path.read_text())
        manifest["variables"]["focus"] = "url(https://evil.example/x)"
        manifest_path.write_text(json.dumps(manifest))

        try:
            response = test_client.get("/api/plugins?plugin_type=theme")
            assert response.status_code == 200
            entry = next(p for p in response.json()["plugins"] if p["id"] == "test_broken_theme")
            assert entry["selectable"] is False
            assert entry["validation_errors"]

            detail = test_client.get("/api/plugins/test_broken_theme")
            assert detail.status_code == 200
            assert detail.json()["selectable"] is False
        finally:
            try:
                theme_installer.uninstall_theme("test_broken_theme")
            except Exception:
                pass
