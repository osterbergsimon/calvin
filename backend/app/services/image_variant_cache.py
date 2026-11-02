"""Disk-cached, width-bucketed variants of display images (calvin-ax77).

Kiosks must never download or decode a full-size original just to paint a
region. The slideshow asks ``GET /api/images/{id}?w=<width>``; the requested
width is rounded up to one of :data:`VARIANT_WIDTHS`, the source is fitted into
that box with PIL (never upscaled), and the result is cached on disk.

A variant is addressed by image id plus a **metadata-only** source fingerprint
(a local file's mtime_ns+size, or the plugin's version/ETag metadata), so the
route can answer a cache hit or a 304 without reading the original. The cache is
bounded by total bytes and evicts the least recently used file by access time.
Writes are atomic.
"""

import asyncio
import hashlib
import os
import shutil
import time
import weakref
from io import BytesIO
from pathlib import Path
from typing import Any

from loguru import logger
from PIL import Image, ImageOps

from app.config import settings

VARIANT_WIDTHS: tuple[int, ...] = (640, 960, 1280, 1920, 2560)
MAX_VARIANT_WIDTH = VARIANT_WIDTHS[-1]
JPEG_QUALITY = 82
# Above this many pixels a non-JPEG is refused instead of decoded whole; JPEGs
# are first reduced with draft() so they never allocate the full raster.
MAX_VARIANT_PIXELS = 60_000_000
RENDER_CONCURRENCY = 2
_MB = 1024 * 1024


class VariantTooLargeError(Exception):
    """The source is too large to decode safely into a display variant."""


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


def source_fingerprint(image: dict[str, Any]) -> str | None:
    """A metadata-only change detector for the original behind an image id.

    Local files use mtime_ns+size; remote/plugin images use whatever their
    metadata exposes (version/ETag/updated/size/URL). ``None`` means the source
    cannot be fingerprinted without reading it; those images skip the cache
    rather than pretending an id is a stable fingerprint.
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
        return None
    return "meta:" + hashlib.sha256(raw.encode()).hexdigest()[:32]


def _encode_variant(data: bytes, width: int) -> tuple[bytes, str]:
    """Fit an original into ``width`` x ``width`` and encode the display file.

    The pixel budget and JPEG ``draft()`` run before the raster is loaded, so a
    huge photo cannot balloon memory. EXIF orientation is applied first; JPEGs
    are progressive, keep their ICC profile and carry no EXIF. Images with alpha
    stay PNG rather than being flattened onto a guessed color.
    """
    try:
        opened = Image.open(BytesIO(data))
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as e:
        raise VariantTooLargeError("image exceeds the decompression limit") from e

    with opened:
        if opened.format == "JPEG":
            try:
                opened.draft("RGB", (width, width))
            except (OSError, ValueError):
                pass
        if opened.width * opened.height > MAX_VARIANT_PIXELS:
            raise VariantTooLargeError("image is too large to make a display variant")

        image = ImageOps.exif_transpose(opened)
        icc_profile = image.info.get("icc_profile")
        has_alpha = image.mode in ("RGBA", "LA") or (
            image.mode == "P" and "transparency" in image.info
        )
        if image.width > width or image.height > width:
            image.thumbnail((width, width), Image.Resampling.LANCZOS)

        output = BytesIO()
        if has_alpha:
            kwargs: dict[str, Any] = {"optimize": True}
            if icc_profile:
                kwargs["icc_profile"] = icc_profile
            image.convert("RGBA").save(output, "PNG", **kwargs)
            return output.getvalue(), "png"

        if image.mode != "RGB":
            image = image.convert("RGB")
        kwargs = {"quality": JPEG_QUALITY, "progressive": True, "optimize": True}
        if icc_profile:
            kwargs["icc_profile"] = icc_profile
        image.save(output, "JPEG", **kwargs)
        return output.getvalue(), "jpg"


class ImageVariantCache:
    """Bounded on-disk cache of width-bucketed display variants."""

    def __init__(self, cache_dir: Path | None = None, max_bytes: int | None = None):
        self._cache_dir = Path(cache_dir) if cache_dir is not None else None
        self._max_bytes = max_bytes
        self._total_bytes: int | None = None
        self._lock = asyncio.Lock()
        # Weak maps keep neither finished keys nor their locks alive forever.
        self._key_locks: weakref.WeakValueDictionary[str, asyncio.Lock] = (
            weakref.WeakValueDictionary()
        )
        self._render_semaphores: weakref.WeakKeyDictionary = weakref.WeakKeyDictionary()

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

    def _image_prefix(self, image_id: str) -> str:
        return hashlib.sha256(image_id.encode()).hexdigest()[:16]

    def source_key(self, image_id: str, fingerprint: str) -> str:
        """Directory name: image id + source fingerprint, both hashed."""
        fingerprint_key = hashlib.sha256(fingerprint.encode()).hexdigest()[:16]
        return f"{self._image_prefix(image_id)}-{fingerprint_key}"

    def _cache_path(self, source_key: str, width: int, ext: str) -> Path:
        return self.cache_dir / source_key / f"{width}.{ext}"

    def _find(self, source_key: str, width: int) -> Path | None:
        for ext in ("jpg", "png"):
            path = self._cache_path(source_key, width, ext)
            if path.is_file():
                return path
        return None

    def etag(self, image_id: str, fingerprint: str, width: int) -> str:
        """Strong validator derived from metadata only, so a 304 costs no read."""
        digest = hashlib.sha256(
            f"{image_id}\x00{fingerprint}\x00{bucket_width(width)}".encode()
        ).hexdigest()[:32]
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
            try:
                victim.parent.rmdir()
            except OSError:
                pass
            total -= stat.st_size
            evicted += 1
        self._total_bytes = total
        if evicted:
            logger.info(
                "Image variant cache over {} MB: evicted {} least recently used variants",
                self.max_bytes // _MB,
                evicted,
            )

    def _write_atomic(self, path: Path, data: bytes) -> None:
        tmp = path.with_name(path.name + ".part")
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp.write_bytes(data)
            tmp.replace(path)
        except OSError:
            try:
                tmp.unlink(missing_ok=True)
            except OSError:
                pass
            raise

    def _write_and_trim(self, path: Path, data: bytes) -> None:
        self._write_atomic(path, data)
        if self._total_bytes is None:
            self._total_bytes = sum(stat.st_size for _, stat in self._files())
        else:
            self._total_bytes += len(data)
        if self._total_bytes > self.max_bytes:
            self._evict(path)

    async def _store(self, path: Path, data: bytes) -> bool:
        """Write atomically (temp file + rename), then trim the cache to its cap.

        A full or unwritable disk is not an error for the request: the caller
        still has the encoded bytes and serves them for this response.
        """
        async with self._lock:
            try:
                await asyncio.to_thread(self._write_and_trim, path, data)
            except OSError as e:
                logger.warning("Could not cache image variant {}: {}", path, e)
                return False
            return True

    def _key_lock(self, source_key: str) -> asyncio.Lock:
        lock = self._key_locks.get(source_key)
        if lock is None:
            lock = asyncio.Lock()
            self._key_locks[source_key] = lock
        return lock

    def _render_semaphore(self) -> asyncio.Semaphore:
        loop = asyncio.get_running_loop()
        semaphore = self._render_semaphores.get(loop)
        if semaphore is None:
            semaphore = asyncio.Semaphore(RENDER_CONCURRENCY)
            self._render_semaphores[loop] = semaphore
        return semaphore

    async def render(self, data: bytes, width: int) -> tuple[bytes, str]:
        """Encode a variant, limiting how many PIL decodes run at once."""
        bucket = bucket_width(width)
        async with self._render_semaphore():
            return await asyncio.to_thread(_encode_variant, data, bucket)

    async def read_cached(
        self, image_id: str, fingerprint: str, width: int
    ) -> tuple[bytes, str] | None:
        """Read an existing variant under its key lock; ``None`` means a miss."""
        bucket = bucket_width(width)
        source_key = self.source_key(image_id, fingerprint)
        lock = self._key_lock(source_key)
        async with lock:

            def read() -> tuple[bytes, str] | None:
                path = self._find(source_key, bucket)
                if path is None:
                    return None
                try:
                    return self._read(path), path.suffix.lstrip(".")
                except OSError:
                    # An eviction between the stat and the read is a miss, not
                    # a 500: the caller regenerates from the source.
                    return None

            return await asyncio.to_thread(read)

    async def get_or_create(
        self, image_id: str, fingerprint: str, width: int, data: bytes
    ) -> tuple[bytes, str, str]:
        """Return ``(bytes, extension, etag)`` for the bucketed variant."""
        bucket = bucket_width(width)
        source_key = self.source_key(image_id, fingerprint)
        etag = self.etag(image_id, fingerprint, bucket)
        lock = self._key_lock(source_key)
        async with lock:
            path = await asyncio.to_thread(self._find, source_key, bucket)
            if path is not None:
                try:
                    content = await asyncio.to_thread(self._read, path)
                    return content, path.suffix.lstrip("."), etag
                except OSError:
                    path = None

            encoded, ext = await self.render(data, bucket)
            path = self._cache_path(source_key, bucket, ext)
            stored = await self._store(path, encoded)
            if not stored:
                return encoded, ext, etag
            try:
                content = await asyncio.to_thread(self._read, path)
            except OSError:
                content = encoded
            return content, ext, etag

    async def delete_image_variants(self, image_id: str) -> int:
        """Drop every cached variant for an image (photo deleted or revoked)."""
        prefix = self._image_prefix(image_id)

        def remove() -> int:
            if not self.cache_dir.exists():
                return 0
            removed = 0
            for path in self.cache_dir.glob(f"{prefix}-*"):
                if path.is_dir():
                    shutil.rmtree(path, ignore_errors=True)
                    removed += 1
            return removed

        async with self._lock:
            removed = await asyncio.to_thread(remove)
            if removed:
                self._total_bytes = None
                logger.info("Deleted {} cached variant(s) for image {}", removed, image_id)
            return removed


image_variant_cache = ImageVariantCache()
