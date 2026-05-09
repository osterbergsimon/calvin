"""Typed plugin definition models.

These models define the normalized contract returned by plugin discovery hooks.
Plugins may still return raw dicts for backward compatibility; the loader
normalizes them into these models before the rest of the app consumes them.
"""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.plugins.base import PluginType

CURRENT_PLUGIN_PROTOCOL_VERSION = 1
SUPPORTED_PLUGIN_PROTOCOL_VERSIONS = {CURRENT_PLUGIN_PROTOCOL_VERSION}
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

    type: str | None = None

    model_config = ConfigDict(extra="allow")


class StatusbarSchema(BaseModel):
    """Statusbar metadata for service plugins."""

    model_config = ConfigDict(extra="allow")


class CapabilitySet(BaseModel):
    """Declared plugin capabilities."""

    can_test_connection: bool = False
    can_scan_options: bool = False
    can_manual_fetch: bool = False
    can_upload: bool = False
    can_delete: bool = False


class PluginDefinition(BaseModel):
    """Normalized plugin definition consumed by the app."""

    protocol_version: int = CURRENT_PLUGIN_PROTOCOL_VERSION
    type_id: str
    plugin_type: PluginType
    name: str
    description: str | None = None
    version: str = "1.0.0"
    supports_multiple_instances: bool = True
    instance_label: str | None = None
    common_config_schema: dict[str, Any] = Field(default_factory=dict)
    instance_config_schema: dict[str, Any] = Field(default_factory=dict)
    ui_actions: list[dict[str, Any]] = Field(default_factory=list)
    ui_sections: list[dict[str, Any]] = Field(default_factory=list)
    display_schema: dict[str, Any] | None = None
    statusbar_schema: dict[str, Any] | None = None
    capabilities: CapabilitySet = Field(default_factory=CapabilitySet)
    plugin_class: type[Any] | None = None

    model_config = ConfigDict(arbitrary_types_allowed=True, extra="allow")

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

    @classmethod
    def from_raw(cls, raw: "PluginDefinition | dict[str, Any]") -> "PluginDefinition":
        """Normalize a raw plugin definition into the typed model."""
        if isinstance(raw, cls):
            return raw.ensure_supported()
        if isinstance(raw, dict):
            return cls.model_validate(raw).ensure_supported()
        raise TypeError(f"Unsupported plugin definition type: {type(raw)!r}")

    def ensure_supported(self) -> "PluginDefinition":
        """Validate that this plugin definition targets a supported protocol version."""
        if self.protocol_version not in SUPPORTED_PLUGIN_PROTOCOL_VERSIONS:
            supported = ", ".join(
                str(version) for version in sorted(SUPPORTED_PLUGIN_PROTOCOL_VERSIONS)
            )
            raise ValueError(
                f"Unsupported plugin protocol version: {self.protocol_version}. "
                f"Supported versions: {supported}"
            )
        return self

    def get(self, key: str, default: Any = None) -> Any:
        """Mapping-style compatibility for legacy callers."""
        return getattr(self, key, default)

    def __getitem__(self, key: str) -> Any:
        """Mapping-style compatibility for legacy callers."""
        return getattr(self, key)
