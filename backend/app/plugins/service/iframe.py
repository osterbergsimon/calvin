"""Iframe service plugin for displaying web services."""

from typing import Any

from app.plugins.definitions import PluginMetadata
from app.plugins.protocols import ServicePlugin
from app.plugins.sdk.schema import toggle_field, url_field


class IframeServicePlugin(ServicePlugin):
    """Iframe service plugin for displaying web services in iframes."""

    metadata = PluginMetadata(
        type_id="iframe",
        name="Iframe Service",
        description="Web service displayed in iframe",
        default_instance_name="Iframe Service",
        # Same URL -> same instance
        instance_identity=["url"],
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
            "url": url_field("Website URL", placeholder="https://example.com", required=True),
            "fullscreen": toggle_field(
                "Prefer fullscreen mode",
                help_text="Open this service in fullscreen by default",
            ),
        },
        display_schema={
            "kind": "iframe",
            "url_path": "$.url",
        },
    )

    async def initialize(self) -> None:
        """Validate the configured URL."""
        url = self.config.get("url", "")
        if not url or not url.startswith(("http://", "https://")):
            raise ValueError(f"Invalid URL: {url}")

    async def fetch(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> dict[str, Any]:
        """Return the data the iframe renderer schema binds to."""
        return {"url": self.config.get("url", "")}

    @classmethod
    async def validate_config(cls, config: dict[str, Any]) -> bool:
        """Require an http(s) URL."""
        url = cls.normalize_config(config).get("url") or ""
        return url.startswith(("http://", "https://"))
