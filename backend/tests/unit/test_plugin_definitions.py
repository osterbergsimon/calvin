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

    def test_display_schema_allows_shell_fields_and_renderer_specific_keys(self):
        definition = PluginDefinition.from_raw(
            {
                "type_id": "weather",
                "plugin_type": PluginType.SERVICE,
                "name": "Weather",
                "display_schema": {
                    "kind": "weather-forecast",
                    "title_path": "$.location",
                    "title": "Weather",
                    "panel_variant": "dense",
                    "current_path": "$.current",
                },
            }
        )

        assert definition.display_schema["panel_variant"] == "dense"
        assert definition.display_schema["current_path"] == "$.current"

    def test_display_schema_rejects_unknown_panel_variant(self):
        with pytest.raises(ValueError, match="display_schema.panel_variant"):
            PluginDefinition.from_raw(
                {
                    "type_id": "weather",
                    "plugin_type": PluginType.SERVICE,
                    "name": "Weather",
                    "display_schema": {
                        "kind": "weather-forecast",
                        "panel_variant": "compact",
                    },
                }
            )

    def test_display_schema_rejects_unknown_kind(self):
        with pytest.raises(ValueError, match="display_schema.kind must be one of"):
            PluginDefinition.from_raw(
                {
                    "type_id": "weather",
                    "plugin_type": PluginType.SERVICE,
                    "name": "Weather",
                    "display_schema": {
                        "kind": "wether-forcast",
                    },
                }
            )

    def test_display_schema_requires_kind(self):
        with pytest.raises(ValueError, match="display_schema.kind is required"):
            PluginDefinition.from_raw(
                {
                    "type_id": "weather",
                    "plugin_type": PluginType.SERVICE,
                    "name": "Weather",
                    "display_schema": {
                        "title": "Weather",
                    },
                }
            )

    def test_statusbar_schema_rejects_unknown_kind(self):
        with pytest.raises(ValueError, match="statusbar_schema.kind must be one of"):
            PluginDefinition.from_raw(
                {
                    "type_id": "weather",
                    "plugin_type": PluginType.SERVICE,
                    "name": "Weather",
                    "statusbar_schema": {"kind": "no-such-renderer"},
                }
            )

    def test_statusbar_schema_requires_kind(self):
        with pytest.raises(ValueError, match="statusbar_schema.kind is required"):
            PluginDefinition.from_raw(
                {
                    "type_id": "weather",
                    "plugin_type": PluginType.SERVICE,
                    "name": "Weather",
                    "statusbar_schema": {"label": "Temp"},
                }
            )

    def test_statusbar_schema_omitted_is_allowed(self):
        definition = PluginDefinition.from_raw(
            {
                "type_id": "no_status",
                "plugin_type": PluginType.SERVICE,
                "name": "No Status",
            }
        )
        assert definition.statusbar_schema is None

    def test_display_schema_omitted_is_allowed(self):
        definition = PluginDefinition.from_raw(
            {
                "type_id": "backend_only",
                "plugin_type": PluginType.SERVICE,
                "name": "Backend Only",
            }
        )
        assert definition.display_schema is None
