"""Tests for Local Image plugin.

Run from backend directory:
    pytest tests/unit/test_local_plugin.py -v
"""

import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.plugins.base import PluginType
from app.plugins.image.local import LocalImagePlugin
from app.plugins.loader import PluginLoader


@pytest.fixture
def temp_image_dir():
    """Create a temporary directory for images."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        yield Path(tmp_dir)


@pytest.fixture
def local_plugin(temp_image_dir, monkeypatch):
    """Create a LocalImagePlugin instance pointed at a temp dir via IMAGE_DIR."""
    monkeypatch.setenv("IMAGE_DIR", str(temp_image_dir))
    return LocalImagePlugin(
        plugin_id="local-images",
        name="Local Images",
        enabled=True,
    )


class TestLocalImagePlugin:
    """Tests for LocalImagePlugin class."""

    def test_metadata(self):
        """Test declarative plugin metadata."""
        metadata = LocalImagePlugin.metadata
        assert metadata.type_id == "local"
        assert metadata.name == "Local Images"
        assert metadata.supports_multiple_instances is False
        assert metadata.fixed_instance_id == "local-images"
        assert {section["type"] for section in metadata.ui_sections} == {
            "upload",
            "manage_images",
        }

    def test_registers_as_image_plugin(self):
        """The loader derives the image family from the class."""
        import app.plugins.image.local as local_module

        loader = PluginLoader()
        assert "local" in loader.register_module(local_module)
        (definition,) = loader.get_plugin_types()
        assert definition.plugin_type == PluginType.IMAGE
        assert definition.plugin_class is LocalImagePlugin

    def test_init(self, local_plugin, temp_image_dir):
        """Test plugin initialization."""
        assert local_plugin.plugin_id == "local-images"
        assert local_plugin.name == "Local Images"
        assert local_plugin.image_dir == temp_image_dir.resolve()
        assert local_plugin.thumbnail_dir == temp_image_dir.resolve() / "thumbnails"
        assert local_plugin.enabled is True
        assert local_plugin.image_dir.exists()
        assert local_plugin.thumbnail_dir.exists()

    async def test_initialize(self, local_plugin):
        """Test plugin initialization."""
        await local_plugin.initialize()
        # Should not raise any errors
        assert local_plugin._images is not None

    async def test_cleanup(self, local_plugin):
        """Test plugin cleanup."""
        await local_plugin.cleanup()
        # Should not raise any errors

    async def test_configure(self, local_plugin):
        """Test plugin configuration."""
        # Configure with empty config (no config needed for local plugin)
        await local_plugin.configure({})
        # Should not raise any errors

    async def test_configure_with_image_dir_env_var(self, local_plugin, monkeypatch):
        """Test configuring with IMAGE_DIR environment variable change."""
        with tempfile.TemporaryDirectory() as new_dir:
            monkeypatch.setenv("IMAGE_DIR", new_dir)
            new_image_dir = Path(new_dir).resolve()

            await local_plugin.configure({})

            # Should update image_dir if IMAGE_DIR changed
            assert local_plugin.image_dir == new_image_dir

    async def test_configure_image_dir_config_key_does_not_override_setting(
        self, local_plugin, temp_image_dir
    ):
        """IMAGE_DIR (the setting) wins over an image_dir stored in the instance config."""
        await local_plugin.configure({"image_dir": str(temp_image_dir / "custom")})
        assert local_plugin.image_dir == temp_image_dir.resolve()

    async def test_scan_images_empty(self, local_plugin):
        """Test scanning images from empty directory."""
        await local_plugin.scan_images()
        images = await local_plugin.get_images()
        assert len(images) == 0

    async def test_get_images(self, local_plugin):
        """Test getting images."""
        images = await local_plugin.get_images()
        assert isinstance(images, list)

    async def test_get_image_not_found(self, local_plugin):
        """Test getting non-existent image."""
        image = await local_plugin.get_image("nonexistent")
        assert image is None


class TestLocalConfigUpdate:
    """Tests for the host-side config-update flow for the local type."""

    async def test_apply_plugin_config_update(self, test_db, monkeypatch):
        """Test apply_plugin_config_update uses the fixed single-instance id."""
        import app.plugins.image.local as local_module
        import app.plugins.loader as loader_module
        from app.plugins.utils.instance_manager import apply_plugin_config_update

        fresh_loader = PluginLoader()
        fresh_loader.register_module(local_module)
        monkeypatch.setattr(loader_module, "plugin_loader", fresh_loader)

        from app.models.db_models import PluginTypeDB

        # Mock plugin_loader used by the registration layer
        with patch("app.plugins.registry.manager.plugin_loader") as mock_loader:
            mock_plugin = MagicMock()
            mock_plugin.plugin_id = "local-images"
            mock_plugin.enabled = False
            mock_plugin.configure = AsyncMock()
            mock_plugin.enable = MagicMock()
            mock_plugin.disable = MagicMock()
            mock_plugin.is_running = MagicMock(return_value=False)
            mock_plugin.initialize = AsyncMock()
            mock_plugin.start = MagicMock()
            mock_plugin.stop = MagicMock()
            mock_plugin.cleanup = AsyncMock()
            mock_loader.create_plugin_instance.return_value = mock_plugin

            # Mock instance_manager.register
            with patch("app.plugins.registry.manager.instance_manager") as mock_instance_mgr:
                mock_instance_mgr.register = AsyncMock()

                # Create plugin type in database (or get existing)
                db_type = await PluginTypeDB.objects.get_or_none(type_id="local")
                if not db_type:
                    db_type = await PluginTypeDB.objects.create(
                        type_id="local",
                        plugin_type="image",
                        name="Local Images",
                        enabled=True,
                    )
                else:
                    db_type.enabled = True
                    await db_type.update()

                # Test creating a new instance
                result = await apply_plugin_config_update(
                    type_id="local",
                    config={},  # Empty config - uses the default directory
                    enabled=True,
                    db_type=db_type,
                )

                assert result is not None
                assert result.get("instance_created") is True
                assert result.get("instance_id") == "local-images"

                # Verify plugin was registered
                mock_instance_mgr.register.assert_called_once()

                # Verify database entry was created
                from app.models.db_models import PluginDB

                db_plugin = await PluginDB.objects.get_or_none(id="local-images")
                assert db_plugin is not None
                assert db_plugin.type_id == "local"
                assert db_plugin.config == {}  # Empty config


class TestImageDirSetting:
    """The IMAGE_DIR / data-dir setting decides where images live."""

    async def test_legacy_relative_image_dir_in_config_is_ignored(
        self, local_plugin, temp_image_dir
    ):
        # Older installs stored this cwd-relative path in the instance config.
        await local_plugin.configure(
            {"image_dir": "./data/images", "thumbnail_dir": "./data/images/thumbnails"}
        )
        assert local_plugin.image_dir == temp_image_dir.resolve()
        assert local_plugin.thumbnail_dir == temp_image_dir.resolve() / "thumbnails"

    async def test_defaults_to_settings_image_dir(self, monkeypatch, tmp_path):
        from app.config import settings

        monkeypatch.delenv("IMAGE_DIR", raising=False)
        monkeypatch.setattr(settings, "image_dir", tmp_path / "pics")
        plugin = LocalImagePlugin(plugin_id="local-images", name="Local Images")
        await plugin.configure({})
        assert plugin.image_dir == tmp_path / "pics"
        assert (tmp_path / "pics" / "thumbnails").is_dir()


class TestUploadFilenameSafety:
    """Upload filenames are untrusted (audit S3, calvin-ua2)."""

    @pytest.fixture
    def temp_image_dir(self, tmp_path):
        # A fresh parent per test, so "nothing escaped to the parent" can't
        # be confused by files other runs left in the shared temp dir.
        image_dir = tmp_path / "images"
        image_dir.mkdir()
        return image_dir

    @pytest.mark.parametrize(
        "filename",
        ["../escaped.png", "../../escaped.png", "sub/../../escaped.png", "..\\escaped.png"],
    )
    async def test_upload_traversal_name_stays_in_image_dir(
        self, local_plugin, temp_image_dir, filename
    ):
        await local_plugin.upload_image(b"\x89PNG data", filename)

        assert not (temp_image_dir.parent / "escaped.png").exists()
        written = [p for p in temp_image_dir.iterdir() if p.is_file()]
        assert len(written) == 1
        assert written[0].parent == temp_image_dir
        assert written[0].suffix == ".png"

    async def test_upload_absolute_path_stays_in_image_dir(
        self, local_plugin, temp_image_dir, tmp_path
    ):
        target = tmp_path / "abs_escaped.png"

        await local_plugin.upload_image(b"\x89PNG data", str(target))

        assert not target.exists()
        assert [p.name for p in temp_image_dir.iterdir() if p.is_file()] == ["abs_escaped.png"]

    @pytest.mark.parametrize("filename", ["..", ".", "", "/", ".png"])
    async def test_upload_degenerate_name_gets_generated_name(
        self, local_plugin, temp_image_dir, filename
    ):
        await local_plugin.upload_image(b"\x89PNG data", filename)

        written = [p for p in temp_image_dir.iterdir() if p.is_file()]
        assert len(written) == 1
        assert written[0].parent == temp_image_dir
        assert not written[0].name.startswith(".")

    async def test_upload_does_not_overwrite_existing_image(self, local_plugin, temp_image_dir):
        existing = temp_image_dir / "photo.png"
        existing.write_bytes(b"original")

        await local_plugin.upload_image(b"\x89PNG new", "photo.png")

        assert existing.read_bytes() == b"original"
        assert len([p for p in temp_image_dir.iterdir() if p.is_file()]) == 2

    @pytest.mark.parametrize(
        ("filename", "suffix"), [(".hidden.png", ".png"), (".x.webp", ".webp"), ("..", ".jpg")]
    )
    async def test_generated_name_keeps_image_extension(
        self, local_plugin, temp_image_dir, filename, suffix
    ):
        await local_plugin.upload_image(b"\x89PNG data", filename)

        (written,) = [p for p in temp_image_dir.iterdir() if p.is_file()]
        assert written.suffix == suffix


class TestFolders:
    """Share links upload into one subfolder of Local photos (calvin-mwqo)."""

    @pytest.fixture
    def temp_image_dir(self, tmp_path):
        image_dir = tmp_path / "images"
        image_dir.mkdir()
        return image_dir

    async def test_upload_into_folder_creates_it_and_is_listed(self, local_plugin, temp_image_dir):
        from tests.test_utils import create_test_image

        image = await local_plugin.upload_image(create_test_image(), "a.jpg", folder="Guests")

        assert image is not None
        assert (temp_image_dir / "Guests" / "a.jpg").is_file()
        assert image["folder"] == "Guests"
        assert image["id"] in {img["id"] for img in await local_plugin.get_images()}

    async def test_scan_includes_share_folders_only(self, local_plugin, temp_image_dir):
        from tests.test_utils import create_test_image_file

        create_test_image_file(temp_image_dir / "root.jpg")
        local_plugin.mark_share_folder("Party")
        create_test_image_file(temp_image_dir / "Party" / "p.jpg")
        # An owner's own subfolder is not part of the library, as before.
        (temp_image_dir / "Archive").mkdir()
        create_test_image_file(temp_image_dir / "Archive" / "old.jpg")
        (temp_image_dir / ".trash").mkdir()
        (temp_image_dir / ".trash" / ".calvin-share").touch()
        create_test_image_file(temp_image_dir / ".trash" / "gone.jpg")

        images = await local_plugin.scan_images()

        names = sorted(img["filename"] for img in images)
        assert names == ["p.jpg", "root.jpg"]
        root = next(img for img in images if img["filename"] == "root.jpg")
        assert root["folder"] == ""
        # Thumbnails (written to thumbnails/) never show up as photos.
        assert all("thumbnails" not in img["path"] for img in images)

    async def test_list_folders_lists_share_folders(self, local_plugin, temp_image_dir):
        local_plugin.mark_share_folder("Party")
        local_plugin.mark_share_folder("Guests")
        (temp_image_dir / "Archive").mkdir()
        (temp_image_dir / ".hidden").mkdir()

        assert local_plugin.list_folders() == ["Guests", "Party"]

    async def test_mark_share_folder_refuses_bad_names(self, local_plugin, temp_image_dir):
        with pytest.raises(ValueError):
            local_plugin.mark_share_folder("../x")
        assert not (temp_image_dir.parent / "x").exists()

    @pytest.mark.parametrize("folder", ["../x", "a/b", ".hidden", "thumbnails", ""])
    async def test_bad_folder_is_refused(self, local_plugin, temp_image_dir, folder):
        result = await local_plugin.upload_image(b"\x89PNG data", "a.png", folder=folder)

        assert result is None
        assert not (temp_image_dir.parent / "x").exists()
        assert [p.name for p in temp_image_dir.rglob("*.png")] == []
