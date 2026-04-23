"""Disk-based cache for remote image bytes.

Central service used by the image route to avoid 302 redirecting the frontend
directly to external APIs (which hits rate limits and breaks offline use).
On 429 or network errors, stale cache is served rather than failing.
"""

import hashlib
import time
from pathlib import Path

import httpx
from loguru import logger

_CACHE_DIR = Path("data/image_cache")
_DEFAULT_TTL_DAYS = 7
_STALE_SERVE_STATUS_CODES = {429, 500, 502, 503, 504}


class RemoteImageCache:
    def __init__(self, cache_dir: Path = _CACHE_DIR, ttl_days: int = _DEFAULT_TTL_DAYS):
        self.cache_dir = cache_dir
        self.ttl_days = ttl_days
        cache_dir.mkdir(parents=True, exist_ok=True)

    def _cache_path(self, url: str) -> Path:
        url_hash = hashlib.sha256(url.encode()).hexdigest()
        path_part = url.split("?")[0]
        ext = path_part.rsplit(".", 1)[-1].lower() if "." in path_part else "bin"
        if ext not in {"jpg", "jpeg", "png", "gif", "webp", "bmp", "avif"}:
            ext = "bin"
        return self.cache_dir / url_hash[:2] / f"{url_hash}.{ext}"

    def _is_fresh(self, path: Path) -> bool:
        return (time.time() - path.stat().st_mtime) < self.ttl_days * 86400

    def get_cached(self, url: str) -> bytes | None:
        """Return cached bytes if they exist (fresh or stale). None if no cache."""
        path = self._cache_path(url)
        return path.read_bytes() if path.exists() else None

    async def get_or_fetch(self, url: str) -> bytes | None:
        """Return fresh cached bytes, or download → cache → return.

        On rate-limit (429) or transient server errors, returns stale cache if
        available rather than propagating the error.
        """
        path = self._cache_path(url)

        if path.exists() and self._is_fresh(path):
            logger.debug("Remote image cache hit: {}", url)
            return path.read_bytes()

        try:
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                response = await client.get(url)
                response.raise_for_status()
                data = response.content

            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            logger.debug("Remote image cached ({} bytes): {}", len(data), url)
            return data

        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            if status in _STALE_SERVE_STATUS_CODES and path.exists():
                logger.warning(
                    "HTTP {} fetching remote image — serving stale cache: {}", status, url
                )
                return path.read_bytes()
            logger.error("HTTP {} fetching remote image: {}", status, url)
            return None

        except httpx.HTTPError as e:
            if path.exists():
                logger.warning("Network error fetching remote image — serving stale cache: {}", url)
                return path.read_bytes()
            logger.error("Network error fetching remote image {}: {}", url, e)
            return None


remote_image_cache = RemoteImageCache()
