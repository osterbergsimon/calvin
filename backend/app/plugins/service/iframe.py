"""Iframe service plugin for displaying web services."""

import hashlib
from typing import Any

from app.plugins.hooks import hookimpl
from app.plugins.protocols import ServicePlugin
from app.plugins.sdk.service import (
    ServiceConfigField,
    build_service_manager_config,
    build_service_plugin_metadata,
    create_service_plugin_instance,
)
from app.plugins.utils.config import extract_config_value, to_str
from app.plugins.utils.instance_manager import handle_plugin_config_update_generic

SERVICE_FIELDS = (
    ServiceConfigField("url", default="", converter=to_str),
    ServiceConfigField("fullscreen", default=False),
)


class IframeServicePlugin(ServicePlugin):
    """Iframe service plugin for displaying web services in iframes."""

    @classmethod
    def get_plugin_metadata(cls) -> dict[str, Any]:
        """Get plugin metadata for registration."""
        return build_service_plugin_metadata(
            type_id="iframe",
            name="Iframe Service",
            description="Web service displayed in iframe",
            plugin_class=cls,
            common_config_schema={
                "display_order": {
                    "type": "integer",
                    "description": "Display order for service instances",
                    "default": 0,
                    "ui": {
                        "component": "number",
                        "help_text": (
                            "Order for display/switching (lower numbers appear first). "
                            "This applies to all instances of this plugin type."
                        ),
                        "validation": {
                            "min": 0,
                        },
                    },
                },
            },
            instance_config_schema={
                "url": {
                    "type": "string",
                    "description": "Website URL",
                    "default": "",
                    "ui": {
                        "component": "input",
                        "placeholder": "https://example.com",
                        "validation": {
                            "required": True,
                            "type": "url",
                        },
                    },
                },
                "fullscreen": {
                    "type": "boolean",
                    "description": "Prefer fullscreen mode",
                    "default": False,
                    "ui": {
                        "component": "checkbox",
                        "help_text": "Open this service in fullscreen by default",
                    },
                },
            },
            display_schema={
                "type": "iframe",
                "api_endpoint": None,  # Iframe services don't use API endpoints
                "method": None,
                "data_schema": None,
                "render_template": "iframe",
                "component": "iframe/IframeViewer.vue",  # Plugin-provided frontend component
            },
            supports_multiple_instances=True,
        )

    def __init__(
        self, plugin_id: str, name: str, url: str, enabled: bool = True, fullscreen: bool = False
    ):
        """
        Initialize iframe service plugin.

        Args:
            plugin_id: Unique identifier for the plugin
            name: Human-readable name
            url: URL to display in iframe
            enabled: Whether the plugin is enabled
            fullscreen: Whether to display in fullscreen mode
        """
        super().__init__(plugin_id, name, enabled)
        self.url = url
        self.fullscreen = fullscreen

    async def initialize(self) -> None:
        """Initialize the plugin."""
        # Validate URL
        if not self.url or not (self.url.startswith("http://") or self.url.startswith("https://")):
            raise ValueError(f"Invalid URL: {self.url}")

    async def cleanup(self) -> None:
        """Cleanup plugin resources."""
        # Nothing to cleanup for iframe
        pass

    async def get_content(self) -> dict[str, Any]:
        """
        Get service content for display.

        Returns:
            Dictionary with content information
        """
        return {
            "type": "iframe",
            "url": self.url,
            "fullscreen": self.fullscreen,
            "config": {
                "allowFullscreen": True,
                "sandbox": "allow-same-origin allow-scripts allow-forms allow-popups",
            },
        }

    async def validate_config(self, config: dict[str, Any]) -> bool:
        """
        Validate plugin configuration.

        Args:
            config: Configuration dictionary with 'url' key

        Returns:
            True if configuration is valid
        """
        if "url" not in config:
            return False

        url = extract_config_value(config, "url", converter=to_str)
        if not url or not url.strip():
            return False

        return url.startswith("http://") or url.startswith("https://")

    async def configure(self, config: dict[str, Any]) -> None:
        """
        Configure the plugin with new settings.

        Args:
            config: Configuration dictionary
        """
        await super().configure(config)

        url = extract_config_value(config, "url", converter=to_str)
        fullscreen = extract_config_value(config, "fullscreen", default=False)

        if url:
            self.url = url
        if fullscreen is not None:
            self.fullscreen = bool(fullscreen)


# Register this plugin with pluggy
@hookimpl
def register_plugin_types() -> list[dict[str, Any]]:
    """Register IframeServicePlugin type."""
    return [IframeServicePlugin.get_plugin_metadata()]


@hookimpl
def create_plugin_instance(
    plugin_id: str,
    type_id: str,
    name: str,
    config: dict[str, Any],
) -> IframeServicePlugin | None:
    """Create an IframeServicePlugin instance."""
    return create_service_plugin_instance(
        IframeServicePlugin,
        expected_type_id="iframe",
        plugin_id=plugin_id,
        type_id=type_id,
        name=name,
        config=config,
        fields=SERVICE_FIELDS,
    )


@hookimpl
async def handle_plugin_config_update(
    type_id: str,
    config: dict[str, Any],
    enabled: bool | None,
    db_type: Any,
    session: Any,
) -> dict[str, Any] | None:
    """Handle Iframe service plugin configuration update and instance management."""
    if type_id != "iframe":
        return None

    def validate_config(c: dict[str, Any]) -> bool:
        """Validate config has required url."""
        if "url" not in c:
            return False

        url = extract_config_value(c, "url", converter=to_str)
        if not url or not url.strip():
            return False

        return url.startswith("http://") or url.startswith("https://")

    def generate_instance_id(c: dict[str, Any], t: str) -> str:
        """Generate instance ID from url."""
        url = extract_config_value(c, "url", converter=to_str)
        if url:
            # Generate hash from URL (same instance for same URL)
            url_hash = hashlib.md5(url.encode()).hexdigest()[:8]
            return f"{t}-{url_hash}"
        # Fallback ID if URL not available
        return f"{t}-instance"

    manager_config = build_service_manager_config(
        type_id="iframe",
        fields=SERVICE_FIELDS,
        single_instance=False,
        validate_config=validate_config,
        generate_instance_id=generate_instance_id,
        default_instance_name="Iframe Service",
    )

    return await handle_plugin_config_update_generic(
        type_id, config, enabled, db_type, session, manager_config
    )
