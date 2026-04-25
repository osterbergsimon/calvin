"""Typed plugin definition models.

These models define the normalized contract returned by plugin discovery hooks.
Plugins may still return raw dicts for backward compatibility; the loader
normalizes them into these models before the rest of the app consumes them.
"""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.plugins.base import PluginType

CURRENT_PLUGIN_PROTOCOL_VERSION = 1
SUPPORTED_PLUGIN_PROTOCOL_VERSIONS = {CURRENT_PLUGIN_PROTOCOL_VERSION}


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
