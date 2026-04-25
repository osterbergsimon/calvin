"""Helpers for building image plugins with less boilerplate."""

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any

import httpx
from loguru import logger

from app.plugins.base import PluginType
from app.plugins.definitions import (
    CURRENT_PLUGIN_PROTOCOL_VERSION,
    validate_plugin_config_schema_keys,
)
from app.plugins.protocols import ImagePlugin
from app.plugins.utils.config import extract_config_value
from app.plugins.utils.instance_manager import InstanceManagerConfig


async def fetch_image_data(
    image_url: str | None,
    *,
    plugin_name: str,
    headers: dict[str, str] | None = None,
    follow_redirects: bool = False,
    timeout: float = 30.0,
) -> bytes | None:
    """Fetch image bytes from a URL and log failures consistently."""
    if not image_url:
        return None

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=follow_redirects) as client:
        try:
            response = await client.get(image_url, headers=headers)
            response.raise_for_status()
            return response.content
        except httpx.HTTPError as exc:
            logger.warning(f"[{plugin_name}] Error fetching image data: {exc}")
            return None


@dataclass(frozen=True)
class ImageConfigField:
    """Declarative config field definition for image plugins."""

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


def build_image_plugin_metadata(
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
) -> dict[str, Any]:
    """Build standard metadata for an image plugin."""
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
        "plugin_type": PluginType.IMAGE,
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
    return metadata


def extract_image_config(
    config: dict[str, Any],
    fields: Iterable[ImageConfigField],
    *,
    use_arg_names: bool = True,
) -> dict[str, Any]:
    """Extract a typed config mapping from raw image plugin config."""
    extracted: dict[str, Any] = {}
    for field in fields:
        key = field.target_name if use_arg_names else field.key
        extracted[key] = field.extract(config)
    return extracted


def create_image_plugin_instance(
    plugin_class: type[Any],
    *,
    expected_type_id: str,
    plugin_id: str,
    type_id: str,
    name: str,
    config: dict[str, Any],
    fields: Iterable[ImageConfigField] = (),
    extra_kwargs: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
    enabled_default: bool = False,
) -> Any | None:
    """Create an image plugin instance from normalized config fields."""
    if type_id != expected_type_id:
        return None

    kwargs = extract_image_config(config, fields)
    if extra_kwargs is not None:
        kwargs.update(extra_kwargs(config))

    return plugin_class(
        plugin_id=plugin_id,
        name=name,
        enabled=config.get("enabled", enabled_default),
        **kwargs,
    )


def build_image_manager_config(
    *,
    type_id: str,
    fields: Iterable[ImageConfigField] = (),
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
    """Build InstanceManagerConfig with shared image config normalization."""

    def normalize_config(config: dict[str, Any]) -> dict[str, Any]:
        normalized = extract_image_config(config, fields, use_arg_names=False)
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


class SelfHostedGalleryImagePlugin(ImagePlugin):
    """Base class for image plugins backed by a self-hosted gallery API."""

    sdk_plugin_name = "Gallery"
    api_base_path = "/api"
    auth_header_name = "Authorization"
    auth_header_prefix = ""

    def __init__(
        self,
        plugin_id: str,
        name: str,
        *,
        url: str = "",
        api_key: str = "",
        enabled: bool = True,
    ) -> None:
        super().__init__(plugin_id, name, enabled)
        self.base_url = url.rstrip("/")
        self.api_key = api_key
        self._images: list[dict[str, object]] = []
        self._last_scan = None

    @classmethod
    def build_auth_headers(cls, api_key: str) -> dict[str, str]:
        """Build standard API auth headers for a gallery request."""
        return {
            cls.auth_header_name: f"{cls.auth_header_prefix}{api_key}",
            "Accept": "application/json",
        }

    def auth_headers(self) -> dict[str, str]:
        """Build standard API auth headers for this gallery instance."""
        return self.build_auth_headers(self.api_key)

    def api_url(self, path: str) -> str:
        """Build a full API URL from a relative path."""
        return f"{self.base_url}{self.api_base_path}/{path.lstrip('/')}"

    async def fetch_protected_image_data(self, url: str | None) -> bytes | None:
        """Fetch protected image bytes using gallery auth headers."""
        return await fetch_image_data(
            url,
            plugin_name=self.sdk_plugin_name,
            headers=self.auth_headers(),
            follow_redirects=True,
        )
