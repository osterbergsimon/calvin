"""Display variants: width buckets, EXIF handling, disk cache and LRU bound."""

import os
import time
from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image

from app.services import image_variant_cache as variant_module
from app.services.image_variant_cache import (
    VARIANT_WIDTHS,
    ImageVariantCache,
    bucket_width,
    source_fingerprint,
)


def _image_bytes(
    size=(200, 100),
    color=(200, 10, 10),
    *,
    fmt="JPEG",
    mode="RGB",
    exif_orientation=None,
    alpha=False,
) -> bytes:
    if alpha:
        mode = "RGBA"
        color = (*color, 128)
    image = Image.new(mode, size, color)
    buffer = BytesIO()
    kwargs = {}
    if exif_orientation is not None:
        exif = Image.Exif()
        exif[0x0112] = exif_orientation
        kwargs["exif"] = exif
    image.save(buffer, fmt, **kwargs)
    return buffer.getvalue()


def _open(data: bytes) -> Image.Image:
    return Image.open(BytesIO(data))


def test_bucket_width_rounds_up_and_clamps():
    assert bucket_width(1000) == 1280
    assert bucket_width(3000) == 2560
    assert bucket_width(1) == 640
    assert bucket_width(640) == 640
    assert bucket_width(641) == 960
    assert bucket_width(2560) == 2560
    assert VARIANT_WIDTHS == (640, 960, 1280, 1920, 2560)


@pytest.mark.parametrize("width", [0, -1])
def test_bucket_width_rejects_non_positive(width):
    with pytest.raises(ValueError):
        bucket_width(width)


@pytest.mark.asyncio
async def test_exif_orientation_is_applied(tmp_path):
    cache = ImageVariantCache(cache_dir=tmp_path, max_bytes=10_000_000)
    source = _image_bytes((100, 50), exif_orientation=6)

    data, ext, _etag = await cache.get_or_create("img", "fp", 640, source)

    assert ext == "jpg"
    with _open(data) as rendered:
        assert rendered.size == (50, 100)
        # Orientation was applied, not copied into the variant.
        assert dict(rendered.getexif()) == {}


@pytest.mark.asyncio
async def test_never_upscales(tmp_path):
    cache = ImageVariantCache(cache_dir=tmp_path, max_bytes=10_000_000)

    data, _ext, _etag = await cache.get_or_create("img", "fp", 1280, _image_bytes((200, 100)))

    with _open(data) as rendered:
        assert rendered.size == (200, 100)


@pytest.mark.asyncio
async def test_large_photo_is_fitted_into_the_bucket(tmp_path):
    cache = ImageVariantCache(cache_dir=tmp_path, max_bytes=10_000_000)
    source = _image_bytes((4000, 3000))

    data, _ext, _etag = await cache.get_or_create("img", "fp", 1280, source)

    with _open(data) as rendered:
        assert rendered.size == (1280, 960)
    assert len(data) < len(source)


@pytest.mark.asyncio
async def test_second_request_is_a_cache_hit(tmp_path, monkeypatch):
    cache = ImageVariantCache(cache_dir=tmp_path, max_bytes=10_000_000)
    calls = 0
    real_encode = variant_module._encode_variant

    def counting_encode(data, width):
        nonlocal calls
        calls += 1
        return real_encode(data, width)

    monkeypatch.setattr(variant_module, "_encode_variant", counting_encode)

    first, _ext, etag = await cache.get_or_create("img", "fp", 1000, _image_bytes((4000, 3000)))
    second, _ext2, etag2 = await cache.get_or_create("img", "fp", 1000, _image_bytes((4000, 3000)))

    assert calls == 1
    assert second == first
    assert etag2 == etag


@pytest.mark.asyncio
async def test_source_change_gets_a_fresh_variant(tmp_path):
    cache = ImageVariantCache(cache_dir=tmp_path / "variants", max_bytes=10_000_000)
    cache_dir = tmp_path / "variants"

    red, _ext, etag_red = await cache.get_or_create(
        "img", "mtime-1:size-10", 640, _image_bytes((800, 600), (220, 10, 10))
    )
    blue, _ext, etag_blue = await cache.get_or_create(
        "img", "mtime-2:size-10", 640, _image_bytes((800, 600), (10, 10, 220))
    )

    assert etag_red != etag_blue
    assert red != blue
    # One source directory per fingerprint, so the edited photo cannot reuse
    # the old file.
    assert len([p for p in cache_dir.iterdir() if p.is_dir()]) == 2


@pytest.mark.asyncio
async def test_lru_eviction_drops_the_least_recently_used(tmp_path):
    cache = ImageVariantCache(cache_dir=tmp_path / "variants", max_bytes=10_000_000)

    for index in range(4):
        source = _image_bytes((640, 480), (index * 20, 10, 10))
        await cache.get_or_create(f"img-{index}", "fp", 640, source)

    files = [p for p in (tmp_path / "variants").glob("*/*")]
    assert len(files) == 4
    oldest = min(files, key=lambda p: p.stat().st_atime)
    # Make the oldest the LRU entry, then shrink the cap so the next write
    # pushes the cache over it.
    os.utime(oldest, (time.time() - 500, oldest.stat().st_mtime - 500))
    cache.max_bytes = sum(p.stat().st_size for p in files)
    await cache.get_or_create("img-new", "fp", 640, _image_bytes((640, 480), (1, 2, 3)))

    assert not oldest.exists()
    assert sum(p.stat().st_size for p in (tmp_path / "variants").glob("*/*")) <= cache.max_bytes


@pytest.mark.asyncio
async def test_png_with_alpha_stays_png(tmp_path):
    cache = ImageVariantCache(cache_dir=tmp_path, max_bytes=10_000_000)

    data, ext, _etag = await cache.get_or_create(
        "img", "fp", 640, _image_bytes((300, 300), fmt="PNG", alpha=True)
    )

    assert ext == "png"
    with _open(data) as rendered:
        assert rendered.format == "PNG"
        assert "A" in rendered.mode


def test_source_fingerprint_uses_the_file_mtime_and_size(tmp_path):
    path = tmp_path / "photo.jpg"
    path.write_bytes(_image_bytes())
    image = {"id": "abc", "path": str(path)}

    first = source_fingerprint(image)
    os.utime(path, (time.time() + 5, time.time() + 5))
    second = source_fingerprint(image)

    assert first != second
    assert str(path.stat().st_size) in first


def test_source_fingerprint_falls_back_to_plugin_metadata():
    image = {"id": "abc", "url": "https://example.com/a.jpg", "size": 42, "version": "v2"}

    assert source_fingerprint(image) == source_fingerprint(dict(image))
    assert source_fingerprint(image) != source_fingerprint({**image, "version": "v3"})


@pytest.mark.asyncio
async def test_no_part_file_is_left_behind(tmp_path):
    cache = ImageVariantCache(cache_dir=tmp_path, max_bytes=10_000_000)

    await cache.get_or_create("img", "fp", 640, _image_bytes())

    assert list(Path(tmp_path).glob("**/*.part")) == []
