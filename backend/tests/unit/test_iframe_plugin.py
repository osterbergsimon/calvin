"""Tests for Iframe Service plugin.

Run from backend directory:
    pytest tests/unit/test_iframe_plugin.py -v
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.plugins.base import PluginType
from app.plugins.loader import PluginLoader
from app.plugins.service.iframe import IframeServicePlugin


@pytest.fixture
async def iframe_plugin():
    """Create a configured IframeServicePlugin instance."""
    plugin = IframeServicePlugin(
        plugin_id="iframe-instance",
        name="Iframe Service",
        enabled=True,
    )
    await plugin.configure({"url": "https://example.com", "fullscreen": False})
    return plugin


class TestIframeServicePlugin:
    """Tests for IframeServicePlugin class."""

    def test_metadata(self):
        """Test declarative plugin metadata."""
        metadata = IframeServicePlugin.metadata
        assert metadata.type_id == "iframe"
        assert metadata.name == "Iframe Service"
        assert metadata.supports_multiple_instances is True
        assert metadata.instance_identity == ["url"]
        assert "url" in metadata.instance_config_schema
        assert "fullscreen" in metadata.instance_config_schema
        assert "display_order" in metadata.common_config_schema
        assert metadata.display_schema["kind"] == "iframe"

    def test_registers_as_service_plugin(self):
        """The loader derives the service family from the class."""
        import app.plugins.service.iframe as iframe_module

        loader = PluginLoader()
        assert "iframe" in loader.register_module(iframe_module)
        (definition,) = loader.get_plugin_types()
        assert definition.plugin_type == PluginType.SERVICE
        assert definition.plugin_class is IframeServicePlugin

    async def test_configure_populates_config(self, iframe_plugin):
        """Test configuration is normalized into self.config."""
        assert iframe_plugin.plugin_id == "iframe-instance"
        assert iframe_plugin.name == "Iframe Service"
        assert iframe_plugin.config["url"] == "https://example.com"
        assert iframe_plugin.config["fullscreen"] is False
        assert iframe_plugin.enabled is True

    async def test_configure_converts_fullscreen(self):
        """Schema-driven boolean conversion for fullscreen."""
        plugin = IframeServicePlugin(plugin_id="test", name="Test")
        await plugin.configure({"url": "https://example.com", "fullscreen": "true"})
        assert plugin.config["fullscreen"] is True

    async def test_initialize_valid_url(self, iframe_plugin):
        """Test plugin initialization with valid URL."""
        await iframe_plugin.initialize()
        # Should not raise any errors

    async def test_initialize_invalid_url(self):
        """Test plugin initialization with invalid URL."""
        plugin = IframeServicePlugin(plugin_id="test", name="Test")
        await plugin.configure({"url": "invalid-url"})
        with pytest.raises(ValueError, match="Invalid URL"):
            await plugin.initialize()

    async def test_initialize_empty_url(self):
        """Test plugin initialization with empty URL."""
        plugin = IframeServicePlugin(plugin_id="test", name="Test")
        await plugin.configure({"url": ""})
        with pytest.raises(ValueError, match="Invalid URL"):
            await plugin.initialize()

    async def test_cleanup(self, iframe_plugin):
        """Test plugin cleanup."""
        await iframe_plugin.cleanup()
        # Should not raise any errors

    async def test_configure_update(self, iframe_plugin):
        """Test plugin configuration update."""
        new_url = "https://example.com/new"
        await iframe_plugin.configure({"url": new_url, "fullscreen": True})
        assert iframe_plugin.config["url"] == new_url
        assert iframe_plugin.config["fullscreen"] is True

    async def test_configure_partial_applies_defaults(self):
        """Configure normalizes against the full schema, applying defaults."""
        plugin = IframeServicePlugin(plugin_id="test", name="Test")
        await plugin.configure({"fullscreen": True})
        assert plugin.config["url"] == ""  # schema default
        assert plugin.config["fullscreen"] is True

    async def test_fetch(self, iframe_plugin):
        """Test schema-driven iframe data payload."""
        content = await iframe_plugin.fetch()
        assert content == {"url": "https://example.com"}

    async def test_validate_config_valid_http_url(self):
        """Test config validation with valid HTTP URL."""
        assert await IframeServicePlugin.validate_config({"url": "http://example.com"}) is True

    async def test_validate_config_valid_https_url(self):
        """Test config validation with valid HTTPS URL."""
        assert await IframeServicePlugin.validate_config({"url": "https://example.com"}) is True

    async def test_validate_config_missing_url(self):
        """Test config validation with missing url."""
        assert await IframeServicePlugin.validate_config({}) is False

    async def test_validate_config_empty_url(self):
        """Test config validation with empty url."""
        assert await IframeServicePlugin.validate_config({"url": ""}) is False

    async def test_validate_config_invalid_url(self):
        """Test config validation with invalid URL."""
        assert await IframeServicePlugin.validate_config({"url": "not-a-url"}) is False

    def test_instance_identity_derives_stable_id(self):
        """Same URL -> same instance id."""
        id_a = IframeServicePlugin.instance_id_for({"url": "https://example.com"})
        id_b = IframeServicePlugin.instance_id_for({"url": "https://example.com"})
        id_c = IframeServicePlugin.instance_id_for({"url": "https://other.example.com"})
        assert id_a == id_b
        assert id_a != id_c
        assert id_a.startswith("iframe-")


class TestIframeConfigUpdate:
    """Tests for the host-side config-update flow for the iframe type."""

    async def test_apply_plugin_config_update(self, test_db, monkeypatch):
        """Test apply_plugin_config_update creates an iframe instance."""
        import app.plugins.loader as loader_module
        import app.plugins.service.iframe as iframe_module
        from app.plugins.utils.instance_manager import apply_plugin_config_update

        fresh_loader = PluginLoader()
        fresh_loader.register_module(iframe_module)
        monkeypatch.setattr(loader_module, "plugin_loader", fresh_loader)

        # Mock the registration layer (same pattern as before contract 1.0)
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

            with patch("app.plugins.registry.manager.instance_manager") as mock_instance_mgr:
                mock_instance_mgr.register = AsyncMock()

                from app.models.db_models import PluginTypeDB

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

                result = await apply_plugin_config_update(
                    type_id="iframe",
                    config={
                        "url": "https://example.com",
                        "fullscreen": False,
                    },
                    enabled=True,
                    db_type=db_type,
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

    async def test_apply_plugin_config_update_invalid_url(self, test_db, monkeypatch):
        """Test apply_plugin_config_update rejects an invalid URL."""
        import app.plugins.loader as loader_module
        import app.plugins.service.iframe as iframe_module
        from app.plugins.utils.instance_manager import apply_plugin_config_update

        fresh_loader = PluginLoader()
        fresh_loader.register_module(iframe_module)
        monkeypatch.setattr(loader_module, "plugin_loader", fresh_loader)

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

        result = await apply_plugin_config_update(
            type_id="iframe",
            config={"url": "not-a-url"},
            enabled=True,
            db_type=db_type,
        )

        # Validation failure short-circuits instance creation
        assert result is not None
        assert result.get("instance_created") is False

    async def test_apply_plugin_config_update_unknown_type(self, monkeypatch):
        """Unknown type ids return None."""
        import app.plugins.loader as loader_module
        from app.plugins.utils.instance_manager import apply_plugin_config_update

        monkeypatch.setattr(loader_module, "plugin_loader", PluginLoader())

        result = await apply_plugin_config_update(
            type_id="no-such-type",
            config={},
            enabled=True,
            db_type=None,
        )
        assert result is None
