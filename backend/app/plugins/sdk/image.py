"""Shared helpers for image plugins."""

from typing import Any

import httpx
from loguru import logger

from app.plugins.protocols import ImagePlugin


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


class SelfHostedGalleryImagePlugin(ImagePlugin):
    """Base class for image plugins backed by a self-hosted gallery API.

    Reads `url` and `api_key` from the instance config (`self.config`),
    which subclasses declare in their `metadata.instance_config_schema`.
    """

    sdk_plugin_name = "Gallery"
    api_base_path = "/api"
    auth_header_name = "Authorization"
    auth_header_prefix = ""

    def __init__(self, plugin_id: str, name: str, enabled: bool = True) -> None:
        super().__init__(plugin_id, name, enabled)
        self._images: list[dict[str, object]] = []
        self._last_scan = None

    @property
    def base_url(self) -> str:
        """Configured gallery base URL (no trailing slash)."""
        return str(self.config.get("url") or "").rstrip("/")

    @property
    def api_key(self) -> str:
        """Configured gallery API key."""
        return str(self.config.get("api_key") or "")

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


__all__: list[str] = ["SelfHostedGalleryImagePlugin", "fetch_image_data"]


def __getattr__(name: str) -> Any:
    raise AttributeError(
        f"module {__name__!r} has no attribute {name!r} — the metadata/field builder "
        "helpers were removed in plugin contract 1.0; declare a PluginMetadata class "
        "attribute instead"
    )
