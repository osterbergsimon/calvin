"""Tests for theme installer service."""

import json
import zipfile

import pytest

from app.services.theme_installer import ThemeInstaller


@pytest.fixture
def temp_themes_dir(tmp_path):
    """Create a temporary themes directory."""
    themes_dir = tmp_path / "themes"
    themes_dir.mkdir()
    return themes_dir


@pytest.fixture
def theme_installer(temp_themes_dir, monkeypatch):
    """Create a ThemeInstaller instance with temporary directories."""
    installer = ThemeInstaller()
    # Override themes directory with temp path
    installer.themes_dir = temp_themes_dir
    return installer


@pytest.fixture
def valid_theme_manifest():
    """Return a valid theme manifest."""
    return {
        "id": "test_theme",
        "name": "Test Theme",
        "description": "A test theme",
        "version": "1.0.0",
        "variables": {
            "bg-primary": "#ffffff",
            "bg-secondary": "#f5f5f5",
            "text-primary": "#333333",
            "accent-primary": "#2196f3",
        },
    }


@pytest.fixture
def valid_theme_directory(tmp_path, valid_theme_manifest):
    """Create a valid theme directory structure."""
    theme_dir = tmp_path / "test_theme"
    theme_dir.mkdir()
    manifest_path = theme_dir / "theme.json"
    manifest_path.write_text(json.dumps(valid_theme_manifest))
    return theme_dir


class TestThemeInstaller:
    """Test ThemeInstaller class."""

    def test_get_theme_path(self, theme_installer):
        """Test getting theme path."""
        path = theme_installer.get_theme_path("test_theme")
        assert path.name == "test_theme"
        assert "themes" in str(path)

    def test_validate_theme_directory_valid(self, theme_installer, valid_theme_directory):
        """Test validating a valid theme directory."""
        manifest = theme_installer._validate_theme_directory(valid_theme_directory)
        assert manifest["id"] == "test_theme"
        assert manifest["name"] == "Test Theme"
        assert "variables" in manifest

    def test_validate_theme_directory_missing_json(self, theme_installer, tmp_path):
        """Test validating theme directory without theme.json."""
        theme_dir = tmp_path / "invalid_theme"
        theme_dir.mkdir()
        with pytest.raises(ValueError, match="theme.json not found"):
            theme_installer._validate_theme_directory(theme_dir)

    def test_validate_theme_directory_invalid_json(self, theme_installer, tmp_path):
        """Test validating theme directory with invalid JSON."""
        theme_dir = tmp_path / "invalid_theme"
        theme_dir.mkdir()
        (theme_dir / "theme.json").write_text("{ invalid json }")
        with pytest.raises(ValueError, match="Invalid JSON"):
            theme_installer._validate_theme_directory(theme_dir)

    def test_validate_theme_directory_missing_required_fields(self, theme_installer, tmp_path):
        """Test validating theme directory with missing required fields."""
        theme_dir = tmp_path / "invalid_theme"
        theme_dir.mkdir()
        invalid_manifest = {"id": "test"}  # Missing name, version, variables
        (theme_dir / "theme.json").write_text(json.dumps(invalid_manifest))
        with pytest.raises(ValueError, match="Missing required field"):
            theme_installer._validate_theme_directory(theme_dir)

    def test_validate_theme_package_zip_valid(
        self, theme_installer, valid_theme_directory, tmp_path
    ):
        """Test validating a valid theme zip package."""
        zip_path = tmp_path / "test_theme.zip"
        with zipfile.ZipFile(zip_path, "w") as zipf:
            for file_path in valid_theme_directory.rglob("*"):
                if file_path.is_file():
                    arcname = file_path.relative_to(valid_theme_directory)
                    zipf.write(file_path, arcname)

        manifest = theme_installer.validate_theme_package(zip_path)
        assert manifest["id"] == "test_theme"

    def test_validate_theme_package_zip_no_theme_json(self, theme_installer, tmp_path):
        """Test validating zip package without theme.json."""
        zip_path = tmp_path / "invalid.zip"
        with zipfile.ZipFile(zip_path, "w") as zipf:
            zipf.writestr("readme.txt", "Not a theme")

        with pytest.raises(ValueError, match="theme.json not found"):
            theme_installer.validate_theme_package(zip_path)

    def test_validate_theme_package_zip_multiple_themes(
        self, theme_installer, valid_theme_directory, tmp_path
    ):
        """Test validating zip package with multiple themes."""
        zip_path = tmp_path / "multiple.zip"
        with zipfile.ZipFile(zip_path, "w") as zipf:
            # Add first theme
            for file_path in valid_theme_directory.rglob("*"):
                if file_path.is_file():
                    arcname = file_path.relative_to(valid_theme_directory)
                    zipf.write(file_path, arcname)
            # Add second theme.json
            zipf.writestr(
                "theme2/theme.json",
                json.dumps(
                    {"id": "theme2", "name": "Theme 2", "version": "1.0.0", "variables": {}}
                ),
            )

        with pytest.raises(ValueError, match="Zip file contains.*themes"):
            theme_installer.validate_theme_package(zip_path)

    def test_install_theme_from_directory(self, theme_installer, valid_theme_directory):
        """Test installing a theme from a directory."""
        manifest = theme_installer.install_theme(valid_theme_directory, "test_theme")
        assert manifest["id"] == "test_theme"

        # Verify theme is installed
        theme_path = theme_installer.get_theme_path("test_theme")
        assert theme_path.exists()
        assert (theme_path / "theme.json").exists()

    def test_install_theme_from_zip(self, theme_installer, valid_theme_directory, tmp_path):
        """Test installing a theme from a zip file."""
        zip_path = tmp_path / "test_theme.zip"
        with zipfile.ZipFile(zip_path, "w") as zipf:
            for file_path in valid_theme_directory.rglob("*"):
                if file_path.is_file():
                    arcname = file_path.relative_to(valid_theme_directory)
                    zipf.write(file_path, arcname)

        manifest = theme_installer.install_theme(zip_path, "test_theme")
        assert manifest["id"] == "test_theme"

        # Verify theme is installed
        theme_path = theme_installer.get_theme_path("test_theme")
        assert theme_path.exists()
        assert (theme_path / "theme.json").exists()

    def test_install_theme_from_zip_rejects_path_traversal(
        self, theme_installer, valid_theme_manifest, tmp_path, temp_themes_dir
    ):
        """A zip member escaping the theme dir must be rejected, writing nothing (calvin-8cv)."""
        zip_path = tmp_path / "evil_theme.zip"
        with zipfile.ZipFile(zip_path, "w") as zipf:
            # theme.json under a subdir → triggers the subdirectory-extraction branch.
            zipf.writestr("evil_theme/theme.json", json.dumps(valid_theme_manifest))
            # Traversal member strips to '../escaped.txt' and would land in themes_dir.
            zipf.writestr("evil_theme/../escaped.txt", "pwned")

        with pytest.raises(ValueError, match="traversal|[Uu]nsafe"):
            theme_installer.install_theme(zip_path, "test_theme")

        assert not (temp_themes_dir / "escaped.txt").exists()
        assert not theme_installer.get_theme_path("test_theme").exists()

    def test_install_theme_already_installed(self, theme_installer, valid_theme_directory):
        """Test installing a theme that's already installed."""
        theme_installer.install_theme(valid_theme_directory, "test_theme")

        # Try to install again
        with pytest.raises(ValueError, match="already installed"):
            theme_installer.install_theme(valid_theme_directory, "test_theme")

    def test_uninstall_theme(self, theme_installer, valid_theme_directory):
        """Test uninstalling a theme."""
        theme_installer.install_theme(valid_theme_directory, "test_theme")
        theme_path = theme_installer.get_theme_path("test_theme")
        assert theme_path.exists()

        theme_installer.uninstall_theme("test_theme")
        assert not theme_path.exists()

    def test_uninstall_theme_not_installed(self, theme_installer):
        """Test uninstalling a theme that's not installed."""
        with pytest.raises(ValueError, match="not installed"):
            theme_installer.uninstall_theme("nonexistent_theme")

    def test_get_installed_themes_empty(self, theme_installer):
        """Test getting installed themes when none are installed."""
        themes = theme_installer.get_installed_themes()
        assert themes == []

    def test_get_installed_themes(self, theme_installer, valid_theme_directory):
        """Test getting installed themes."""
        theme_installer.install_theme(valid_theme_directory, "test_theme")

        themes = theme_installer.get_installed_themes()
        assert len(themes) == 1
        assert themes[0]["id"] == "test_theme"

    def test_get_theme_manifest(self, theme_installer, valid_theme_directory):
        """Test getting theme manifest."""
        theme_installer.install_theme(valid_theme_directory, "test_theme")

        manifest = theme_installer.get_theme_manifest("test_theme")
        assert manifest is not None
        assert manifest["id"] == "test_theme"

    def test_get_theme_manifest_not_installed(self, theme_installer):
        """Test getting manifest for non-installed theme."""
        manifest = theme_installer.get_theme_manifest("nonexistent_theme")
        assert manifest is None

    def test_enumerate_themes_from_repo_with_manifest(self, theme_installer, tmp_path):
        """Test enumerating themes from repo with plugins.json manifest."""
        repo_dir = tmp_path / "repo"
        repo_dir.mkdir()

        # Create plugins.json with themes
        plugins_json = {
            "plugins": [],
            "themes": [
                {
                    "id": "theme1",
                    "name": "Theme 1",
                    "path": "theme1",
                    "description": "Test theme 1",
                    "version": "1.0.0",
                }
            ],
        }
        (repo_dir / "plugins.json").write_text(json.dumps(plugins_json))

        # Create theme directory
        theme_dir = repo_dir / "theme1"
        theme_dir.mkdir()
        theme_manifest = {
            "id": "theme1",
            "name": "Theme 1",
            "version": "1.0.0",
            "variables": {"bg-primary": "#ffffff"},
        }
        (theme_dir / "theme.json").write_text(json.dumps(theme_manifest))

        result = theme_installer.enumerate_themes_from_repo(repo_dir)
        assert result["has_manifest"] is True
        assert len(result["themes"]) == 1
        assert result["themes"][0]["id"] == "theme1"

    def test_enumerate_themes_from_repo_auto_discovery(
        self, theme_installer, tmp_path, valid_theme_manifest
    ):
        """Test auto-discovery of themes in repo."""
        repo_dir = tmp_path / "repo"
        repo_dir.mkdir()

        # Create theme directory without plugins.json
        theme_dir = repo_dir / "test_theme"
        theme_dir.mkdir()
        (theme_dir / "theme.json").write_text(json.dumps(valid_theme_manifest))

        result = theme_installer.enumerate_themes_from_repo(repo_dir)
        assert result["has_manifest"] is False
        assert len(result["themes"]) == 1
        assert result["themes"][0]["id"] == "test_theme"

    def test_install_theme_from_repo(self, theme_installer, valid_theme_directory, tmp_path):
        """Test installing a theme from a repository."""
        repo_dir = tmp_path / "repo"
        repo_dir.mkdir()

        # Copy theme to repo
        theme_dir = repo_dir / "test_theme"
        theme_dir.mkdir()
        (theme_dir / "theme.json").write_text((valid_theme_directory / "theme.json").read_text())

        manifest = theme_installer.install_theme_from_repo(repo_dir, "test_theme")
        assert manifest["id"] == "test_theme"

        # Verify theme is installed
        theme_path = theme_installer.get_theme_path("test_theme")
        assert theme_path.exists()

    def test_install_theme_from_repo_path_traversal_prevention(self, theme_installer, tmp_path):
        """Test that path traversal is prevented."""
        repo_dir = tmp_path / "repo"
        repo_dir.mkdir()

        with pytest.raises(ValueError, match="path traversal"):
            theme_installer.install_theme_from_repo(repo_dir, "../malicious")

    @staticmethod
    def _repo_with_theme(tmp_path, name, version, bg):
        """Build a repo dir containing test_theme at a given version."""
        repo_dir = tmp_path / name
        theme_dir = repo_dir / "test_theme"
        theme_dir.mkdir(parents=True)
        (theme_dir / "theme.json").write_text(
            json.dumps(
                {
                    "id": "test_theme",
                    "name": "Test Theme",
                    "version": version,
                    "variables": {"bg-primary": bg},
                }
            )
        )
        return repo_dir

    def test_install_theme_from_repo_force_overwrites(
        self, theme_installer, valid_theme_directory, tmp_path
    ):
        """force=True upgrades an already-installed theme in place (calvin-3eu)."""
        theme_installer.install_theme(valid_theme_directory, "test_theme")  # v1.0.0

        repo_dir = self._repo_with_theme(tmp_path, "repo", "1.1.0", "#111111")
        manifest = theme_installer.install_theme_from_repo(repo_dir, "test_theme", force=True)

        assert manifest["version"] == "1.1.0"
        on_disk = json.loads(
            (theme_installer.get_theme_path("test_theme") / "theme.json").read_text()
        )
        assert on_disk["version"] == "1.1.0"
        assert on_disk["variables"]["bg-primary"] == "#111111"

    def test_install_theme_from_repo_without_force_errors_when_installed(
        self, theme_installer, valid_theme_directory, tmp_path
    ):
        """Without force, reinstalling over an existing theme still errors (calvin-3eu)."""
        theme_installer.install_theme(valid_theme_directory, "test_theme")
        repo_dir = self._repo_with_theme(tmp_path, "repo", "1.1.0", "#111111")

        with pytest.raises(ValueError, match="already installed"):
            theme_installer.install_theme_from_repo(repo_dir, "test_theme")

    def test_install_theme_from_repo_downgrade_guarded(self, theme_installer, tmp_path):
        """A downgrade is refused without force, but force overrides it (calvin-3eu)."""
        theme_installer.install_theme(
            self._repo_with_theme(tmp_path, "v2", "2.0.0", "#ffffff") / "test_theme", "test_theme"
        )

        repo_v1 = self._repo_with_theme(tmp_path, "repo", "1.0.0", "#000000")
        with pytest.raises(ValueError, match="older than"):
            theme_installer.install_theme_from_repo(repo_v1, "test_theme")

        # force overrides the downgrade guard.
        manifest = theme_installer.install_theme_from_repo(repo_v1, "test_theme", force=True)
        assert manifest["version"] == "1.0.0"

    def test_install_theme_with_force(self, theme_installer, valid_theme_directory):
        """Test installing a theme with force=True overwrites existing installation."""
        # Install theme first
        theme_installer.install_theme(valid_theme_directory, "test_theme")
        theme_path = theme_installer.get_theme_path("test_theme")
        assert theme_path.exists()

        # Create a modified theme manifest
        modified_manifest = {
            "id": "test_theme",
            "name": "Modified Test Theme",
            "version": "2.0.0",
            "variables": {"bg-primary": "#000000"},
        }
        modified_theme_dir = valid_theme_directory.parent / "modified_theme"
        modified_theme_dir.mkdir()
        (modified_theme_dir / "theme.json").write_text(json.dumps(modified_manifest))

        # Force install should overwrite
        manifest = theme_installer.install_theme(modified_theme_dir, "test_theme", force=True)
        assert manifest["name"] == "Modified Test Theme"
        assert manifest["version"] == "2.0.0"

        # Verify the theme was replaced
        installed_manifest = theme_installer.get_theme_manifest("test_theme")
        assert installed_manifest["name"] == "Modified Test Theme"

    def test_validate_theme_directory_invalid_variables(self, theme_installer, tmp_path):
        """Test validating theme directory with invalid variables structure."""
        theme_dir = tmp_path / "invalid_theme"
        theme_dir.mkdir()
        invalid_manifest = {
            "id": "test",
            "name": "Test",
            "version": "1.0.0",
            "variables": "not a dict",  # Invalid: should be dict
        }
        (theme_dir / "theme.json").write_text(json.dumps(invalid_manifest))
        with pytest.raises(ValueError, match="variables must be an object"):
            theme_installer._validate_theme_directory(theme_dir)

    def test_validate_theme_package_zip_invalid_variables(self, theme_installer, tmp_path):
        """Test validating zip package with invalid variables structure (bug fix)."""
        zip_path = tmp_path / "invalid.zip"
        invalid_manifest = {
            "id": "test",
            "name": "Test",
            "version": "1.0.0",
            "variables": "not a dict",  # Invalid: should be dict
        }
        with zipfile.ZipFile(zip_path, "w") as zipf:
            zipf.writestr("theme.json", json.dumps(invalid_manifest))

        # This should now fail (previously would have passed)
        with pytest.raises(ValueError, match="variables must be an object"):
            theme_installer.validate_theme_package(zip_path)

    def test_is_safe_path_valid(self, theme_installer, tmp_path):
        """Test _is_safe_path with valid paths."""
        base_path = tmp_path / "base"
        base_path.mkdir()

        assert theme_installer._is_safe_path("theme1", base_path) is True
        assert theme_installer._is_safe_path("subdir/theme", base_path) is True

    def test_is_safe_path_path_traversal(self, theme_installer, tmp_path):
        """Test _is_safe_path prevents path traversal."""
        base_path = tmp_path / "base"
        base_path.mkdir()

        assert theme_installer._is_safe_path("../malicious", base_path) is False
        assert theme_installer._is_safe_path("../../etc/passwd", base_path) is False
        assert theme_installer._is_safe_path("/absolute/path", base_path) is False

    def test_is_safe_path_with_dots_in_name(self, theme_installer, tmp_path):
        """Test _is_safe_path allows dots in valid filenames."""
        base_path = tmp_path / "base"
        base_path.mkdir()

        # Dots in filename should be OK
        assert theme_installer._is_safe_path("theme.v2", base_path) is True
        assert theme_installer._is_safe_path("my.theme", base_path) is True

    def test_install_theme_version_comparison_with_force(
        self, theme_installer, valid_theme_directory, tmp_path
    ):
        """Test that force=True bypasses version check."""
        # Install theme with version 1.0.0
        theme_installer.install_theme(valid_theme_directory, "test_theme")

        # Create older version
        older_manifest = {
            "id": "test_theme",
            "name": "Test Theme",
            "version": "0.5.0",  # Older version
            "variables": {},
        }
        older_theme_dir = tmp_path / "older_theme"
        older_theme_dir.mkdir()
        (older_theme_dir / "theme.json").write_text(json.dumps(older_manifest))

        # Force install should work even with older version
        manifest = theme_installer.install_theme(older_theme_dir, "test_theme", force=True)
        assert manifest["version"] == "0.5.0"

    def test_enumerate_themes_from_repo_path_traversal_in_manifest(self, theme_installer, tmp_path):
        """Test that path traversal in plugins.json manifest is prevented."""
        repo_dir = tmp_path / "repo"
        repo_dir.mkdir()

        # Create plugins.json with path traversal attempt
        plugins_json = {
            "plugins": [],
            "themes": [
                {
                    "id": "theme1",
                    "name": "Theme 1",
                    "path": "../../malicious",  # Path traversal attempt
                    "version": "1.0.0",
                }
            ],
        }
        (repo_dir / "plugins.json").write_text(json.dumps(plugins_json))
        result = theme_installer.enumerate_themes_from_repo(repo_dir)
        # Path traversal should be filtered out
        assert len(result["themes"]) == 0
