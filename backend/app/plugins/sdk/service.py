"""Helpers for building service plugins with less boilerplate."""

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any

from app.plugins.base import PluginType
from app.plugins.definitions import (
    CURRENT_PLUGIN_PROTOCOL_VERSION,
    validate_plugin_config_schema_keys,
)
from app.plugins.utils.config import extract_config_value
from app.plugins.utils.instance_manager import InstanceManagerConfig


@dataclass(frozen=True)
class ServiceConfigField:
    """Declarative config field definition for service plugins."""

    key: str
    default: Any = None
    converter: Callable[[Any], Any] | None = None
    transform: Callable[[Any], Any] | None = None
    arg_name: str | None = None

    @property
    def target_name(self) -> str:
        """Constructor kwarg name for this field."""
        return self.arg_name or self.key

    def extract(self, config: dict[str, Any]) -> Any:
        """Extract and normalize this field from config."""
        value = extract_config_value(
            config,
            self.key,
            default=self.default,
            converter=self.converter,
        )
        if self.transform is not None:
            return self.transform(value)
        return value


def build_service_plugin_metadata(
    *,
    type_id: str,
    name: str,
    description: str,
    plugin_class: type[Any],
    version: str = "1.0.0",
    protocol_version: int = CURRENT_PLUGIN_PROTOCOL_VERSION,
    supports_multiple_instances: bool = True,
    instance_label: str | None = None,
    common_config_schema: dict[str, Any] | None = None,
    instance_config_schema: dict[str, Any] | None = None,
    display_schema: dict[str, Any] | None = None,
    statusbar_schema: dict[str, Any] | None = None,
    ui_actions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Build standard metadata for a service plugin."""
    validate_plugin_config_schema_keys(
        plugin_type_id=type_id,
        schema_name="common_config_schema",
        schema=common_config_schema,
    )
    validate_plugin_config_schema_keys(
        plugin_type_id=type_id,
        schema_name="instance_config_schema",
        schema=instance_config_schema,
    )
    metadata = {
        "protocol_version": protocol_version,
        "type_id": type_id,
        "plugin_type": PluginType.SERVICE,
        "name": name,
        "description": description,
        "version": version,
        "supports_multiple_instances": supports_multiple_instances,
        "common_config_schema": common_config_schema or {},
        "instance_config_schema": instance_config_schema or {},
        "plugin_class": plugin_class,
    }
    if instance_label is not None:
        metadata["instance_label"] = instance_label
    if display_schema is not None:
        metadata["display_schema"] = display_schema
    if statusbar_schema is not None:
        metadata["statusbar_schema"] = statusbar_schema
    if ui_actions is not None:
        metadata["ui_actions"] = ui_actions
    return metadata


def extract_service_config(
    config: dict[str, Any],
    fields: Iterable[ServiceConfigField],
    *,
    use_arg_names: bool = True,
) -> dict[str, Any]:
    """Extract a typed config mapping from raw plugin config."""
    extracted: dict[str, Any] = {}
    for field in fields:
        key = field.target_name if use_arg_names else field.key
        extracted[key] = field.extract(config)
    return extracted


def create_service_plugin_instance(
    plugin_class: type[Any],
    *,
    expected_type_id: str,
    plugin_id: str,
    type_id: str,
    name: str,
    config: dict[str, Any],
    fields: Iterable[ServiceConfigField] = (),
    extra_kwargs: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
    enabled_default: bool = False,
) -> Any | None:
    """Create a service plugin instance from normalized config fields."""
    if type_id != expected_type_id:
        return None

    kwargs = extract_service_config(config, fields)
    if extra_kwargs is not None:
        kwargs.update(extra_kwargs(config))

    return plugin_class(
        plugin_id=plugin_id,
        name=name,
        enabled=config.get("enabled", enabled_default),
        **kwargs,
    )


def build_service_manager_config(
    *,
    type_id: str,
    fields: Iterable[ServiceConfigField] = (),
    single_instance: bool = False,
    instance_id: str | None = None,
    validate_config: Callable[[dict[str, Any]], bool] | None = None,
    generate_instance_id: Callable[[dict[str, Any], str], str] | None = None,
    extra_normalize: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
    prepare_instance_config: Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]]
    | None = None,
    on_instance_created: Callable[[Any, dict[str, Any]], None] | None = None,
    on_instance_updated: Callable[[Any, dict[str, Any]], None] | None = None,
    default_instance_name: str | None = None,
) -> InstanceManagerConfig:
    """Build InstanceManagerConfig with shared service config normalization."""

    def normalize_config(config: dict[str, Any]) -> dict[str, Any]:
        normalized = extract_service_config(config, fields, use_arg_names=False)
        if extra_normalize is not None:
            normalized.update(extra_normalize(config))
        return normalized

    return InstanceManagerConfig(
        type_id=type_id,
        single_instance=single_instance,
        instance_id=instance_id,
        validate_config=validate_config,
        generate_instance_id=generate_instance_id,
        normalize_config=normalize_config,
        prepare_instance_config=prepare_instance_config,
        on_instance_created=on_instance_created,
        on_instance_updated=on_instance_updated,
        default_instance_name=default_instance_name,
    )
