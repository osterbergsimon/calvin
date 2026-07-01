"""Typed plugin metadata — the single declarative contract for plugins.

A plugin is one `BasePlugin` subclass with a `metadata = PluginMetadata(...)`
class attribute. The loader discovers these classes, fills in the runtime
fields (`plugin_class`, `plugin_type`), and everything else — registration,
instantiation, config normalization, config-update handling — is derived from
this model. There are no registration hooks.
"""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.plugins.base import PluginType

# The one enforced contract version. Lives in plugin.json as `api_version`
# (int, required for installed plugins); the installer rejects anything that
# is missing, non-int, or newer than this.
CURRENT_PLUGIN_API_VERSION = 1

DISPLAY_PANEL_VARIANTS = {"default", "dense", "media", "iframe"}
SUPPORTED_DISPLAY_KINDS = {
    "status-tile",
    "status-list",
    "status-row",
    "card-grid",
    "item-list",
    "iframe",
    "image-with-caption",
    "metric-dashboard",
    "weather-forecast",
    "web-component",
}


def _validate_schema_kind(
    value: dict[str, Any] | None,
    *,
    field_name: str,
    check_panel_variant: bool,
) -> dict[str, Any] | None:
    """Validate that a schema dict has a supported kind and (optionally) panel_variant."""
    if value is None:
        return value
    kind = value.get("kind")
    if kind is None:
        raise ValueError(f"{field_name}.kind is required when {field_name} is provided")
    if kind not in SUPPORTED_DISPLAY_KINDS:
        allowed = ", ".join(sorted(SUPPORTED_DISPLAY_KINDS))
        raise ValueError(f"{field_name}.kind must be one of: {allowed} (got {kind!r})")
    if check_panel_variant:
        panel_variant = value.get("panel_variant")
        if panel_variant is not None and panel_variant not in DISPLAY_PANEL_VARIANTS:
            allowed = ", ".join(sorted(DISPLAY_PANEL_VARIANTS))
            raise ValueError(f"{field_name}.panel_variant must be one of: {allowed}")
    return value


class ConfigFieldDefinition(BaseModel):
    """Typed config field metadata with permissive extra support."""

    type: str | None = None
    description: str | None = None
    default: Any = None
    ui: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="allow")


class ActionDefinition(BaseModel):
    """Plugin action metadata."""

    id: str
    type: str
    label: str | None = None
    style: str | None = None

    model_config = ConfigDict(extra="allow")


class SectionDefinition(BaseModel):
    """Plugin UI section metadata."""

    id: str | None = None
    type: str
    label: str | None = None

    model_config = ConfigDict(extra="allow")


class DisplaySchema(BaseModel):
    """Display metadata for service plugins."""

    kind: str

    model_config = ConfigDict(extra="allow")


class StatusbarSchema(BaseModel):
    """Statusbar metadata for service plugins."""

    kind: str

    model_config = ConfigDict(extra="allow")


class PluginMetadata(BaseModel):
    """The declarative plugin contract.

    Authors set this as a class attribute on their `BasePlugin` subclass.
    `plugin_class` and `plugin_type` are runtime fields filled by the loader —
    plugins never declare them.
    """

    type_id: str
    name: str
    description: str | None = None
    version: str = "1.0.0"
    supports_multiple_instances: bool = True
    instance_label: str | None = None
    default_instance_name: str | None = None
    # Fixed instance id for single-instance plugins (default: "{type_id}-instance").
    fixed_instance_id: str | None = None
    # Config keys whose values identify an instance (same values -> same
    # instance id, e.g. ["url"]). None -> instance id derives from a hash of
    # the whole config.
    instance_identity: list[str] | None = None
    common_config_schema: dict[str, Any] = Field(default_factory=dict)
    instance_config_schema: dict[str, Any] = Field(default_factory=dict)
    ui_actions: list[dict[str, Any]] = Field(default_factory=list)
    ui_sections: list[dict[str, Any]] = Field(default_factory=list)
    display_schema: dict[str, Any] | None = None
    statusbar_schema: dict[str, Any] | None = None

    # Runtime fields, filled by the loader.
    plugin_type: PluginType | None = None
    plugin_class: type[Any] | None = None

    model_config = ConfigDict(arbitrary_types_allowed=True, extra="forbid")

    @field_validator("display_schema")
    @classmethod
    def validate_display_schema(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        """Validate known display schema shell fields while allowing renderer-specific keys."""
        return _validate_schema_kind(value, field_name="display_schema", check_panel_variant=True)

    @field_validator("statusbar_schema")
    @classmethod
    def validate_statusbar_schema(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        """Statusbar schemas dispatch through the same SchemaRenderer; same validation applies."""
        return _validate_schema_kind(
            value, field_name="statusbar_schema", check_panel_variant=False
        )
