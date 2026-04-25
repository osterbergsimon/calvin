"""Helpers for building image plugins with less boilerplate."""

import httpx
from loguru import logger


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
