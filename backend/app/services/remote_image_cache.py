"""Disk-based cache for remote image bytes.

Central service used by the image route to avoid 302 redirecting the frontend
directly to external APIs (which hits rate limits and breaks offline use).
On 429 or network errors, stale cache is served rather than failing.

The cache is bounded: a total-size cap evicts the least recently used images
(by access time, which a hit refreshes), and a single response larger than the
per-item limit is refused while streaming instead of being read into memory.
"""

import hashlib
import os
import time
from pathlib import Path

import httpx
from loguru import logger

from app.config import settings
from app.utils.redact import redact_url

_DEFAULT_TTL_DAYS = 7
_STALE_SERVE_STATUS_CODES = {429, 500, 502, 503, 504}


_MB = 1024 * 1024


class ImageTooLargeError(Exception):
    """The remote image exceeds the per-item size limit."""


class RemoteImageCache:
    def __init__(
        self,
        cache_dir: Path | None = None,
        ttl_days: int = _DEFAULT_TTL_DAYS,
        max_bytes: int | None = None,
        max_item_bytes: int | None = None,
    ):
        self.cache_dir = cache_dir or settings.image_cache_dir
        self.ttl_days = ttl_days
        self.max_bytes = max_bytes or settings.image_cache_max_mb * _MB
        self.max_item_bytes = max_item_bytes or settings.image_cache_max_item_mb * _MB
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        # Running total of cached bytes; None until the first write scans the dir.
        self._total_bytes: int | None = None

    def _cache_path(self, url: str) -> Path:
        url_hash = hashlib.sha256(url.encode()).hexdigest()
        path_part = url.split("?")[0]
        ext = path_part.rsplit(".", 1)[-1].lower() if "." in path_part else "bin"
        if ext not in {"jpg", "jpeg", "png", "gif", "webp", "bmp", "avif"}:
            ext = "bin"
        return self.cache_dir / url_hash[:2] / f"{url_hash}.{ext}"

    def _is_fresh(self, path: Path) -> bool:
        return (time.time() - path.stat().st_mtime) < self.ttl_days * 86400

    def _read(self, path: Path) -> bytes:
        """Read a cached file and mark it recently used (atime; mtime stays the fetch time)."""
        data = path.read_bytes()
        try:
            os.utime(path, (time.time(), path.stat().st_mtime))
        except OSError:
            pass
        return data

    def _cached_files(self) -> list[tuple[Path, os.stat_result]]:
        files = []
        for path in self.cache_dir.glob("*/*"):
            if path.is_file() and not path.name.endswith(".part"):
                try:
                    files.append((path, path.stat()))
                except OSError:
                    continue
        return files

    def _store(self, path: Path, data: bytes) -> None:
        """Write atomically, then evict least recently used files past the size cap."""
        previous = path.stat().st_size if path.exists() else 0
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(path.name + ".part")
        tmp.write_bytes(data)
        tmp.replace(path)

        if self._total_bytes is None:
            self._total_bytes = sum(st.st_size for _, st in self._cached_files())
        else:
            self._total_bytes += len(data) - previous
        if self._total_bytes > self.max_bytes:
            self._evict(keep=path)

    def _evict(self, keep: Path) -> None:
        files = self._cached_files()
        total = sum(st.st_size for _, st in files)
        evicted = 0
        for victim, st in sorted(files, key=lambda f: f[1].st_atime):
            if total <= self.max_bytes:
                break
            if victim == keep:
                continue
            try:
                victim.unlink()
            except OSError:
                continue
            total -= st.st_size
            evicted += 1
        self._total_bytes = total
        if evicted:
            logger.info(
                "Remote image cache over {} MB: evicted {} least recently used images",
                self.max_bytes // _MB,
                evicted,
            )

    async def _download(self, client: httpx.AsyncClient, url: str) -> bytes:
        """Stream the response, refusing it once it exceeds the per-item limit."""
        async with client.stream("GET", url) as response:
            response.raise_for_status()
            declared = response.headers.get("content-length")
            if declared and declared.isdigit() and int(declared) > self.max_item_bytes:
                raise ImageTooLargeError(int(declared))
            chunks = bytearray()
            async for chunk in response.aiter_bytes():
                chunks.extend(chunk)
                if len(chunks) > self.max_item_bytes:
                    raise ImageTooLargeError(len(chunks))
            return bytes(chunks)

    def get_cached(self, url: str) -> bytes | None:
        """Return cached bytes if they exist (fresh or stale). None if no cache."""
        path = self._cache_path(url)
        return self._read(path) if path.exists() else None

    async def get_or_fetch(self, url: str) -> bytes | None:
        """Return fresh cached bytes, or download → cache → return.

        On rate-limit (429) or transient server errors, returns stale cache if
        available rather than propagating the error.
        """
        path = self._cache_path(url)

        if path.exists() and self._is_fresh(path):
            logger.debug("Remote image cache hit: {}", redact_url(url))
            return self._read(path)

        try:
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                data = await self._download(client, url)

            self._store(path, data)
            logger.debug("Remote image cached ({} bytes): {}", len(data), redact_url(url))
            return data

        except ImageTooLargeError as e:
            logger.warning(
                "Remote image larger than {} MB ({} bytes), not cached: {}",
                self.max_item_bytes // _MB,
                e.args[0],
                redact_url(url),
            )
            return self._read(path) if path.exists() else None

        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            if status in _STALE_SERVE_STATUS_CODES and path.exists():
                logger.warning(
                    "HTTP {} fetching remote image — serving stale cache: {}",
                    status,
                    redact_url(url),
                )
                return self._read(path)
            logger.error("HTTP {} fetching remote image: {}", status, redact_url(url))
            return None

        except httpx.HTTPError as e:
            if path.exists():
                logger.warning(
                    "Network error fetching remote image — serving stale cache: {}",
                    redact_url(url),
                )
                return self._read(path)
            # httpx messages can embed the full URL, so log only the error type.
            logger.error(
                "Network error fetching remote image {}: {}", redact_url(url), type(e).__name__
            )
            return None


remote_image_cache = RemoteImageCache()
