"""Helpers for building image plugins with less boilerplate."""

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
