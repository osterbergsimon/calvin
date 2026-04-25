"""Tests for typed plugin definition models."""

import pytest

from app.plugins.base import PluginType
from app.plugins.definitions import PluginDefinition


@pytest.mark.unit
class TestPluginDefinition:
    """Test PluginDefinition compatibility behavior."""

    def test_from_raw_dict_sets_defaults(self):
        definition = PluginDefinition.from_raw(
            {
                "type_id": "test_plugin",
                "plugin_type": PluginType.SERVICE,
                "name": "Test Plugin",
            }
        )

        assert definition.protocol_version == 1
        assert definition.type_id == "test_plugin"
        assert definition.plugin_type == PluginType.SERVICE
        assert definition.supports_multiple_instances is True
        assert definition.common_config_schema == {}
        assert definition.instance_config_schema == {}

    def test_mapping_style_compatibility(self):
        definition = PluginDefinition(
            type_id="test_plugin",
            plugin_type=PluginType.IMAGE,
            name="Test Plugin",
        )

        assert definition["type_id"] == "test_plugin"
        assert definition.get("name") == "Test Plugin"
        assert definition.get("missing", "fallback") == "fallback"

    def test_from_raw_rejects_unsupported_protocol_version(self):
        with pytest.raises(ValueError, match="Unsupported plugin protocol version"):
            PluginDefinition.from_raw(
                {
                    "protocol_version": 2,
                    "type_id": "future_plugin",
                    "plugin_type": PluginType.SERVICE,
                    "name": "Future Plugin",
                }
            )

    def test_from_raw_strips_app_managed_config_fields(self):
        definition = PluginDefinition.from_raw(
            {
                "type_id": "test_plugin",
                "plugin_type": PluginType.SERVICE,
                "name": "Test Plugin",
                "common_config_schema": {
                    "display_order": {"type": "integer"},
                    "enabled": {"type": "boolean"},
                    "name": {"type": "string"},
                    "api_key": {"type": "password"},
                },
                "instance_config_schema": {
                    "display_order": {"type": "integer"},
                    "enabled": {"type": "boolean"},
                    "plugin_id": {"type": "string"},
                    "location": {"type": "string"},
                },
            }
        )

        assert definition.common_config_schema == {"api_key": {"type": "password"}}
        assert definition.instance_config_schema == {"location": {"type": "string"}}
