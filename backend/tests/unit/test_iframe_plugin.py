"""Tests for Iframe Service plugin.

Run from backend directory:
    pytest tests/unit/test_iframe_plugin.py -v
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.plugins.base import PluginType
from app.plugins.service.iframe import (
    IframeServicePlugin,
    create_plugin_instance,
    handle_plugin_config_update,
)


@pytest.fixture
def iframe_plugin():
    """Create an IframeServicePlugin instance."""
    plugin = IframeServicePlugin(
        plugin_id="iframe-instance",
        name="Iframe Service",
        url="https://example.com",
        enabled=True,
        fullscreen=False,
    )
    return plugin


class TestIframeServicePlugin:
    """Tests for IframeServicePlugin class."""

    def test_get_plugin_metadata(self):
        """Test plugin metadata."""
        metadata = IframeServicePlugin.get_plugin_metadata()
        assert metadata["type_id"] == "iframe"
        assert metadata["plugin_type"] == PluginType.SERVICE
        assert metadata["name"] == "Iframe Service"
        assert metadata["supports_multiple_instances"] is True
        assert "common_config_schema" in metadata
        assert "instance_config_schema" in metadata
        assert "url" in metadata["instance_config_schema"]
        assert "fullscreen" in metadata["instance_config_schema"]

    def test_create_plugin_instance(self):
        """Test service SDK-backed plugin factory."""
        plugin = create_plugin_instance(
            plugin_id="iframe-instance",
            type_id="iframe",
            name="Iframe Service",
            config={
                "url": {"value": "https://example.com"},
                "fullscreen": {"value": True},
                "enabled": True,
            },
        )

        assert isinstance(plugin, IframeServicePlugin)
        assert plugin.plugin_id == "iframe-instance"
        assert plugin.url == "https://example.com"
        assert plugin.fullscreen is True
        assert plugin.enabled is True

    def test_create_plugin_instance_wrong_type(self):
        """Test service SDK-backed plugin factory ignores other types."""
        assert (
            create_plugin_instance(
                plugin_id="iframe-instance",
                type_id="other",
                name="Iframe Service",
                config={"url": "https://example.com"},
            )
            is None
        )

    def test_init(self, iframe_plugin):
        """Test plugin initialization."""
        assert iframe_plugin.plugin_id == "iframe-instance"
        assert iframe_plugin.name == "Iframe Service"
        assert iframe_plugin.url == "https://example.com"
        assert iframe_plugin.fullscreen is False
        assert iframe_plugin.enabled is True

    def test_init_with_fullscreen(self):
        """Test plugin initialization with fullscreen enabled."""
        plugin = IframeServicePlugin(
            plugin_id="test",
            name="Test",
            url="https://example.com",
            fullscreen=True,
        )
        assert plugin.fullscreen is True

    @pytest.mark.asyncio
    async def test_initialize_valid_url(self, iframe_plugin):
        """Test plugin initialization with valid URL."""
        await iframe_plugin.initialize()
        # Should not raise any errors

    @pytest.mark.asyncio
    async def test_initialize_invalid_url(self):
        """Test plugin initialization with invalid URL."""
        plugin = IframeServicePlugin(
            plugin_id="test",
            name="Test",
            url="invalid-url",
            enabled=True,
        )
        with pytest.raises(ValueError, match="Invalid URL"):
            await plugin.initialize()

    @pytest.mark.asyncio
    async def test_initialize_empty_url(self):
        """Test plugin initialization with empty URL."""
        plugin = IframeServicePlugin(
            plugin_id="test",
            name="Test",
            url="",
            enabled=True,
        )
        with pytest.raises(ValueError, match="Invalid URL"):
            await plugin.initialize()

    @pytest.mark.asyncio
    async def test_cleanup(self, iframe_plugin):
        """Test plugin cleanup."""
        await iframe_plugin.cleanup()
        # Should not raise any errors

    @pytest.mark.asyncio
    async def test_configure(self, iframe_plugin):
        """Test plugin configuration update."""
        new_url = "https://example.com/new"
        await iframe_plugin.configure(
            {
                "url": new_url,
                "fullscreen": True,
            }
        )
        assert iframe_plugin.url == new_url
        assert iframe_plugin.fullscreen is True

    @pytest.mark.asyncio
    async def test_configure_partial(self, iframe_plugin):
        """Test plugin configuration update with partial config."""
        original_url = iframe_plugin.url
        await iframe_plugin.configure(
            {
                "fullscreen": True,
            }
        )
        assert iframe_plugin.url == original_url  # Should remain unchanged
        assert iframe_plugin.fullscreen is True

    @pytest.mark.asyncio
    async def test_get_content(self, iframe_plugin):
        """Test getting service content."""
        content = await iframe_plugin.get_content()
        assert content["type"] == "iframe"
        assert content["url"] == "https://example.com"
        assert content["fullscreen"] is False
        assert "config" in content
        assert content["config"]["allowFullscreen"] is True

    @pytest.mark.asyncio
    async def test_get_content_fullscreen(self):
        """Test getting service content with fullscreen enabled."""
        plugin = IframeServicePlugin(
            plugin_id="test",
            name="Test",
            url="https://example.com",
            fullscreen=True,
        )
        content = await plugin.get_content()
        assert content["fullscreen"] is True

    @pytest.mark.asyncio
    async def test_validate_config_valid_http_url(self, iframe_plugin):
        """Test config validation with valid HTTP URL."""
        assert (
            await iframe_plugin.validate_config(
                {
                    "url": "http://example.com",
                }
            )
            is True
        )

    @pytest.mark.asyncio
    async def test_validate_config_valid_https_url(self, iframe_plugin):
        """Test config validation with valid HTTPS URL."""
        assert (
            await iframe_plugin.validate_config(
                {
                    "url": "https://example.com",
                }
            )
            is True
        )

    @pytest.mark.asyncio
    async def test_validate_config_missing_url(self, iframe_plugin):
        """Test config validation with missing url."""
        assert await iframe_plugin.validate_config({}) is False

    @pytest.mark.asyncio
    async def test_validate_config_empty_url(self, iframe_plugin):
        """Test config validation with empty url."""
        assert (
            await iframe_plugin.validate_config(
                {
                    "url": "",
                }
            )
            is False
        )

    @pytest.mark.asyncio
    async def test_validate_config_invalid_url(self, iframe_plugin):
        """Test config validation with invalid URL."""
        assert (
            await iframe_plugin.validate_config(
                {
                    "url": "not-a-url",
                }
            )
            is False
        )


class TestIframeServicePluginHooks:
    """Tests for Iframe Service plugin hooks."""

    @pytest.mark.asyncio
    async def test_handle_plugin_config_update(self, test_db):
        """Test Iframe Service plugin handle_plugin_config_update hook."""
        # Mock plugin_loader
        with patch("app.plugins.registry.manager.plugin_loader") as mock_loader:
            mock_plugin = MagicMock()
            mock_plugin.plugin_id = "iframe-1234"
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
            mock_loader.get_plugin_types.return_value = [
                {"type_id": "iframe", "plugin_type": "service", "name": "Iframe Service"}
            ]

            # Mock instance_manager.register
            with patch("app.plugins.registry.manager.instance_manager") as mock_instance_mgr:
                mock_instance_mgr.register = AsyncMock()

                from app.models.db_models import PluginTypeDB

                # Create plugin type in database (or get existing)
                db_type = await PluginTypeDB.objects.get_or_none(type_id="iframe")
                if not db_type:
                    db_type = await PluginTypeDB.objects.create(
                        type_id="iframe",
                        plugin_type="service",
                        name="Iframe Service",
                        enabled=True,
                    )
                else:
                    db_type.enabled = True
                    await db_type.update()

                # Test creating a new instance
                result = await handle_plugin_config_update(
                    type_id="iframe",
                    config={
                        "url": "https://example.com",
                        "fullscreen": False,
                    },
                    enabled=True,
                    db_type=db_type,
                    session=None,  # Session parameter ignored with Ormar
                )

                assert result is not None
                assert result.get("instance_created") is True
                assert "instance_id" in result
                assert result["instance_id"].startswith("iframe-")

                # Verify plugin was registered
                mock_instance_mgr.register.assert_called_once()

                # Verify database entry was created
                from app.models.db_models import PluginDB

                db_plugins = await PluginDB.objects.filter(type_id="iframe").all()
                assert len(db_plugins) > 0
                db_plugin = db_plugins[0]
                assert db_plugin.type_id == "iframe"
                assert db_plugin.config.get("url") == "https://example.com"
                assert db_plugin.config.get("fullscreen") is False

    @pytest.mark.asyncio
    async def test_handle_plugin_config_update_invalid_url(self, test_db):
        """Test Iframe Service plugin handle_plugin_config_update with invalid URL."""
        # Create plugin type in database (use get_or_create to avoid UNIQUE constraint)
        import ormar

        from app.models.db_models import PluginTypeDB

        try:
            db_type = await PluginTypeDB.objects.get(type_id="iframe")
        except ormar.NoMatch:
            db_type = await PluginTypeDB.objects.create(
                type_id="iframe",
                plugin_type="service",
                name="Iframe Service",
                enabled=True,
            )

        # Mock plugin_loader to avoid registration issues
        with patch("app.plugins.registry.manager.plugin_loader") as mock_loader:
            mock_loader.get_plugin_types.return_value = [
                {"type_id": "iframe", "plugin_type": "service", "name": "Iframe Service"}
            ]

            # Test with invalid URL - should fail validation
            result = await handle_plugin_config_update(
                type_id="iframe",
                config={
                    "url": "not-a-url",
                },
                enabled=True,
                db_type=db_type,
                session=None,  # Session parameter ignored with Ormar
            )

            # Should return None or indicate validation failure
            assert result is None or result.get("instance_created") is False
