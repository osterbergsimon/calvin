"""Tests for the typed plugin metadata model.

Complementary to tests/unit/test_plugin_contract.py, which pins the core
contract semantics (extra="forbid", kind required/validated, dict shims gone).
This module covers the remaining model details: defaults, panel_variant
validation, renderer-specific pass-through keys, and the sub-schema models.
"""

import pytest
from pydantic import ValidationError

from app.plugins.base import PluginType
from app.plugins.definitions import (
    ActionDefinition,
    ConfigFieldDefinition,
    DisplaySchema,
    PluginMetadata,
    SectionDefinition,
    StatusbarSchema,
)


@pytest.mark.unit
class TestPluginMetadataDefaults:
    """Defaults for a minimal declaration."""

    def test_minimal_declaration_sets_defaults(self):
        metadata = PluginMetadata(type_id="test_plugin", name="Test Plugin")

        assert metadata.type_id == "test_plugin"
        assert metadata.version == "1.0.0"
        assert metadata.supports_multiple_instances is True
        assert metadata.common_config_schema == {}
        assert metadata.instance_config_schema == {}
        assert metadata.ui_actions == []
        assert metadata.ui_sections == []
        assert metadata.display_schema is None
        assert metadata.statusbar_schema is None
        assert metadata.fixed_instance_id is None
        assert metadata.instance_identity is None
        # Runtime fields are None until the loader fills them
        assert metadata.plugin_type is None
        assert metadata.plugin_class is None

    def test_plugin_type_accepts_enum(self):
        metadata = PluginMetadata(
            type_id="test_plugin", name="Test Plugin", plugin_type=PluginType.IMAGE
        )
        assert metadata.plugin_type == PluginType.IMAGE


@pytest.mark.unit
class TestBrowserOrigins:
    """browser_origins declares plugin-intrinsic CSP host-sources."""

    def test_defaults_to_empty_list(self):
        metadata = PluginMetadata(type_id="p", name="P")
        assert metadata.browser_origins == []

    def test_accepts_and_normalizes_valid_forms(self):
        metadata = PluginMetadata(
            type_id="p",
            name="P",
            browser_origins=["Grafana.LAB", "*.lab.example.com", "https://X:3000", "10.0.0.5:8080"],
        )
        assert metadata.browser_origins == [
            "grafana.lab",
            "*.lab.example.com",
            "https://x:3000",
            "10.0.0.5:8080",
        ]

    def test_dedupes_preserving_order(self):
        metadata = PluginMetadata(
            type_id="p", name="P", browser_origins=["a.lab", "b.lab", "a.lab"]
        )
        assert metadata.browser_origins == ["a.lab", "b.lab"]

    def test_rejects_cidr(self):
        with pytest.raises(ValidationError):
            PluginMetadata(type_id="p", name="P", browser_origins=["10.0.0.0/24"])

    def test_rejects_path(self):
        with pytest.raises(ValidationError):
            PluginMetadata(type_id="p", name="P", browser_origins=["grafana.lab/d/home"])

    def test_rejects_empty_entry(self):
        with pytest.raises(ValidationError):
            PluginMetadata(type_id="p", name="P", browser_origins=[""])


@pytest.mark.unit
class TestInstanceIdentityValidation:
    """instance_identity entries must reference real config keys (calvin-eaf)."""

    def test_valid_identity_keys_accepted(self):
        metadata = PluginMetadata(
            type_id="imap",
            name="IMAP",
            instance_config_schema={"host": {"type": "string"}, "port": {"type": "integer"}},
            instance_identity=["host", "port"],
        )
        assert metadata.instance_identity == ["host", "port"]

    def test_identity_key_from_common_schema_accepted(self):
        metadata = PluginMetadata(
            type_id="imap",
            name="IMAP",
            common_config_schema={"account": {"type": "string"}},
            instance_identity=["account"],
        )
        assert metadata.instance_identity == ["account"]

    def test_unknown_identity_key_rejected(self):
        with pytest.raises(
            ValidationError, match="instance_identity references unknown config key"
        ):
            PluginMetadata(
                type_id="imap",
                name="IMAP",
                instance_config_schema={"host": {"type": "string"}},
                instance_identity=["host", "typo_port"],
            )


class TestDisplaySchemaValidation:
    """display_schema / statusbar_schema shell-field validation."""

    def test_display_schema_allows_shell_fields_and_renderer_specific_keys(self):
        metadata = PluginMetadata(
            type_id="weather",
            name="Weather",
            display_schema={
                "kind": "weather-forecast",
                "title_path": "$.location",
                "title": "Weather",
                "panel_variant": "dense",
                "current_path": "$.current",
            },
        )

        assert metadata.display_schema["panel_variant"] == "dense"
        assert metadata.display_schema["current_path"] == "$.current"

    def test_display_schema_rejects_unknown_panel_variant(self):
        with pytest.raises(ValidationError, match="display_schema.panel_variant"):
            PluginMetadata(
                type_id="weather",
                name="Weather",
                display_schema={
                    "kind": "weather-forecast",
                    "panel_variant": "compact",
                },
            )

    def test_statusbar_schema_rejects_unknown_kind(self):
        with pytest.raises(ValidationError, match="statusbar_schema.kind must be one of"):
            PluginMetadata(
                type_id="weather",
                name="Weather",
                statusbar_schema={"kind": "no-such-renderer"},
            )

    def test_statusbar_schema_requires_kind(self):
        with pytest.raises(ValidationError, match="statusbar_schema.kind is required"):
            PluginMetadata(
                type_id="weather",
                name="Weather",
                statusbar_schema={"label": "Temp"},
            )

    def test_statusbar_schema_does_not_check_panel_variant(self):
        # panel_variant is a panel concept; statusbar schemas pass it through.
        metadata = PluginMetadata(
            type_id="weather",
            name="Weather",
            statusbar_schema={"kind": "status", "panel_variant": "compact"},
        )
        assert metadata.statusbar_schema["panel_variant"] == "compact"


@pytest.mark.unit
class TestSubSchemaModels:
    """The applied sub-schema models (not decorative)."""

    def test_config_field_definition_allows_extras(self):
        field = ConfigFieldDefinition(
            type="string",
            description="A URL",
            default="",
            ui={"component": "input"},
            placeholder="https://example.com",
        )
        assert field.type == "string"
        assert field.ui == {"component": "input"}

    def test_action_definition_requires_id_and_type(self):
        action = ActionDefinition(id="refresh", type="fetch", label="Refresh")
        assert action.id == "refresh"
        with pytest.raises(ValidationError):
            ActionDefinition(type="fetch")

    def test_section_definition_requires_type(self):
        section = SectionDefinition(id="upload", type="upload", label="Upload")
        assert section.type == "upload"
        with pytest.raises(ValidationError):
            SectionDefinition(id="upload")

    def test_display_and_statusbar_schema_models_require_kind(self):
        assert DisplaySchema(kind="iframe", url_path="$.url").kind == "iframe"
        assert StatusbarSchema(kind="status-tile").kind == "status-tile"
        with pytest.raises(ValidationError):
            DisplaySchema(url_path="$.url")
        with pytest.raises(ValidationError):
            StatusbarSchema(label="Temp")
