"""Disk-cached, width-bucketed variants of display images (calvin-ax77).

Kiosks must never download or decode a full-size original just to paint a
region. The slideshow asks ``GET /api/images/{id}?w=<width>``; the requested
width is rounded up to one of :data:`VARIANT_WIDTHS`, the source is fitted into
that box with PIL (never upscaled), and the result is cached on disk.

The cache is content-addressed by image id plus a source fingerprint (a local
file's mtime+size, or the plugin's version/ETag metadata), so editing or
replacing a photo never reuses the old variant. It is bounded by total bytes and
evicts the least recently used file by access time. Writes are atomic.
"""

import asyncio
import hashlib
import os
import time
from io import BytesIO
from pathlib import Path
from typing import Any

from loguru import logger
from PIL import Image, ImageOps

from app.config import settings

VARIANT_WIDTHS: tuple[int, ...] = (640, 960, 1280, 1920, 2560)
MAX_VARIANT_WIDTH = VARIANT_WIDTHS[-1]
JPEG_QUALITY = 82
_MB = 1024 * 1024


def bucket_width(width: int) -> int:
    """Round ``width`` up to an allowed bucket (clamped at the largest).

    Raises ``ValueError`` for a non-positive width: the caller turns that into a
    400 instead of letting arbitrary sizes create unbounded variants.
    """
    if width <= 0:
        raise ValueError("width must be positive")
    for bucket in VARIANT_WIDTHS:
        if width <= bucket:
            return bucket
    return MAX_VARIANT_WIDTH


def source_fingerprint(image: dict[str, Any]) -> str:
    """A change detector for the original behind an image id.

    Local files use mtime+size; remote/plugin images use whatever their metadata
    exposes (version/ETag/updated/size/URL). Any change yields a new cache key.
    """
    path = image.get("path")
    if path:
        try:
            stat = Path(str(path)).stat()
        except (OSError, ValueError):
            pass
        else:
            return f"file:{stat.st_mtime_ns}:{stat.st_size}"

    parts = [
        image.get("version"),
        image.get("etag"),
        image.get("updated"),
        image.get("modified"),
        image.get("size"),
        image.get("url") or image.get("raw_url"),
    ]
    raw = "\x1f".join(str(part) for part in parts if part not in (None, ""))
    if not raw:
        raw = repr(image.get("id", ""))
    return "meta:" + hashlib.sha256(raw.encode()).hexdigest()[:32]


def _encode_variant(data: bytes, width: int) -> tuple[bytes, str]:
    """Fit an original into ``width`` x ``width`` and encode the display file.

    EXIF orientation is applied first; JPEGs are progressive and carry no EXIF.
    Images with alpha stay PNG rather than being flattened onto a guessed color.
    """
    with Image.open(BytesIO(data)) as opened:
        image = ImageOps.exif_transpose(opened)
        has_alpha = image.mode in ("RGBA", "LA") or (
            image.mode == "P" and "transparency" in image.info
        )
        if image.width > width or image.height > width:
            image.thumbnail((width, width), Image.Resampling.LANCZOS)

        output = BytesIO()
        if has_alpha:
            image.convert("RGBA").save(output, "PNG", optimize=True)
            return output.getvalue(), "png"

        if image.mode != "RGB":
            image = image.convert("RGB")
        image.save(output, "JPEG", quality=JPEG_QUALITY, progressive=True, optimize=True)
        return output.getvalue(), "jpg"


class ImageVariantCache:
    """Bounded on-disk cache of width-bucketed display variants."""

    def __init__(self, cache_dir: Path | None = None, max_bytes: int | None = None):
        self._cache_dir = Path(cache_dir) if cache_dir is not None else None
        self._max_bytes = max_bytes
        self._total_bytes: int | None = None
        self._lock = asyncio.Lock()
        self._key_locks: dict[str, asyncio.Lock] = {}

    @property
    def cache_dir(self) -> Path:
        # Resolve lazily so a test (or a data-dir override) can point settings
        # at another directory after this singleton was imported.
        if self._cache_dir is not None:
            return self._cache_dir
        return settings.image_cache_dir / "variants"

    @cache_dir.setter
    def cache_dir(self, value: Path | str | None) -> None:
        self._cache_dir = Path(value) if value is not None else None

    @property
    def max_bytes(self) -> int:
        if self._max_bytes is not None:
            return self._max_bytes
        return settings.image_variant_cache_max_mb * _MB

    @max_bytes.setter
    def max_bytes(self, value: int | None) -> None:
        self._max_bytes = value

    def source_key(self, image_id: str, fingerprint: str) -> str:
        raw = f"{image_id}\x00{fingerprint}"
        return hashlib.sha256(raw.encode()).hexdigest()[:32]

    def _cache_path(self, source_key: str, width: int, ext: str) -> Path:
        return self.cache_dir / source_key / f"{width}.{ext}"

    def _find(self, source_key: str, width: int) -> Path | None:
        for ext in ("jpg", "png"):
            path = self._cache_path(source_key, width, ext)
            if path.is_file():
                return path
        return None

    def _etag(self, source_key: str, width: int, ext: str) -> str:
        # Content-derived: stable across restarts and repeated requests for the
        # same source fingerprint.
        digest = hashlib.sha256(f"{source_key}:{width}:{ext}".encode()).hexdigest()[:32]
        return f'"{digest}"'

    def _read(self, path: Path) -> bytes:
        data = path.read_bytes()
        try:
            stat = path.stat()
            os.utime(path, (time.time(), stat.st_mtime))
        except OSError:
            pass
        return data

    def _files(self) -> list[tuple[Path, os.stat_result]]:
        files: list[tuple[Path, os.stat_result]] = []
        if not self.cache_dir.exists():
            return files
        for path in self.cache_dir.glob("*/*"):
            if path.is_file() and not path.name.endswith(".part"):
                try:
                    files.append((path, path.stat()))
                except OSError:
                    continue
        return files

    def _evict(self, keep: Path) -> None:
        files = self._files()
        total = sum(stat.st_size for _, stat in files)
        evicted = 0
        for victim, stat in sorted(files, key=lambda item: item[1].st_atime):
            if total <= self.max_bytes:
                break
            if victim == keep:
                continue
            try:
                victim.unlink()
            except OSError:
                continue
            total -= stat.st_size
            evicted += 1
        self._total_bytes = total
        if evicted:
            logger.info(
                "Image variant cache over {} MB: evicted {} least recently used variants",
                self.max_bytes // _MB,
                evicted,
            )

    async def _store(self, path: Path, data: bytes) -> None:
        """Write atomically (temp file + rename), then trim the cache to its cap."""
        async with self._lock:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_name(path.name + ".part")

            def write() -> None:
                tmp.write_bytes(data)
                tmp.replace(path)

            await asyncio.to_thread(write)
            if self._total_bytes is None:
                self._total_bytes = sum(stat.st_size for _, stat in self._files())
            else:
                self._total_bytes += len(data)
            if self._total_bytes > self.max_bytes:
                await asyncio.to_thread(self._evict, path)

    async def get_or_create(
        self, image_id: str, fingerprint: str, width: int, data: bytes
    ) -> tuple[bytes, str, str]:
        """Return ``(bytes, extension, etag)`` for the bucketed variant.

        ``width`` is bucketed here too, so the service stays safe even when a
        caller forgets to validate the query parameter.
        """
        bucket = bucket_width(width)
        source_key = self.source_key(image_id, fingerprint)
        key_lock = self._key_locks.setdefault(source_key, asyncio.Lock())
        async with key_lock:
            path = self._find(source_key, bucket)
            if path is None:
                encoded, ext = await asyncio.to_thread(_encode_variant, data, bucket)
                path = self._cache_path(source_key, bucket, ext)
                await self._store(path, encoded)
            ext = path.suffix.lstrip(".")
            etag = self._etag(source_key, bucket, ext)
            content = await asyncio.to_thread(self._read, path)
            return content, ext, etag


image_variant_cache = ImageVariantCache()
