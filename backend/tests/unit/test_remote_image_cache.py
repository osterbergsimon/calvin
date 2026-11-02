"""Remote image cache bounds (audit R3): LRU size cap and per-response size limit."""

import os
import time
from unittest.mock import patch

import httpx
import pytest

from app.services import remote_image_cache as cache_module
from app.services.remote_image_cache import RemoteImageCache


def _serve(handler):
    """Patch the module's AsyncClient so requests go to ``handler``."""
    real_client = httpx.AsyncClient

    def factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(*args, **kwargs)

    return patch.object(cache_module.httpx, "AsyncClient", side_effect=factory)


def _backdate_access(cache: RemoteImageCache, url: str, seconds_ago: float) -> None:
    path = cache._cache_path(url)
    st = path.stat()
    os.utime(path, (time.time() - seconds_ago, st.st_mtime))


@pytest.mark.asyncio
async def test_fetch_caches_bytes(tmp_path):
    cache = RemoteImageCache(cache_dir=tmp_path, max_bytes=10_000, max_item_bytes=1_000)
    with _serve(lambda req: httpx.Response(200, content=b"x" * 100)):
        assert await cache.get_or_fetch("https://example.com/a.jpg") == b"x" * 100
    assert cache.get_cached("https://example.com/a.jpg") == b"x" * 100


@pytest.mark.asyncio
async def test_total_size_cap_evicts_least_recently_used(tmp_path):
    cache = RemoteImageCache(cache_dir=tmp_path, max_bytes=250, max_item_bytes=1_000)
    with _serve(lambda req: httpx.Response(200, content=b"x" * 100)):
        await cache.get_or_fetch("https://example.com/old.jpg")
        await cache.get_or_fetch("https://example.com/used.jpg")
        _backdate_access(cache, "https://example.com/old.jpg", 300)
        _backdate_access(cache, "https://example.com/used.jpg", 200)
        # A hit marks "used" as recently used, so "old" is now the LRU entry.
        cache.get_cached("https://example.com/used.jpg")
        await cache.get_or_fetch("https://example.com/new.jpg")

    assert not cache._cache_path("https://example.com/old.jpg").exists()
    assert cache._cache_path("https://example.com/used.jpg").exists()
    assert cache._cache_path("https://example.com/new.jpg").exists()
    total = sum(p.stat().st_size for p in tmp_path.glob("*/*"))
    assert total <= 250


@pytest.mark.asyncio
async def test_cap_accounts_for_files_from_a_previous_run(tmp_path):
    seeded = RemoteImageCache(cache_dir=tmp_path, max_bytes=10_000, max_item_bytes=1_000)
    with _serve(lambda req: httpx.Response(200, content=b"x" * 100)):
        for i in range(3):
            await seeded.get_or_fetch(f"https://example.com/{i}.jpg")

    # A fresh instance (a restart) must count what is already on disk.
    cache = RemoteImageCache(cache_dir=tmp_path, max_bytes=250, max_item_bytes=1_000)
    with _serve(lambda req: httpx.Response(200, content=b"y" * 100)):
        await cache.get_or_fetch("https://example.com/new.jpg")

    total = sum(p.stat().st_size for p in tmp_path.glob("*/*"))
    assert total <= 250
    assert cache._cache_path("https://example.com/new.jpg").exists()


@pytest.mark.asyncio
async def test_oversized_response_is_refused(tmp_path):
    cache = RemoteImageCache(cache_dir=tmp_path, max_bytes=10_000, max_item_bytes=500)
    with _serve(lambda req: httpx.Response(200, content=b"x" * 600)):
        assert await cache.get_or_fetch("https://example.com/huge.jpg") is None
    assert not cache._cache_path("https://example.com/huge.jpg").exists()


@pytest.mark.asyncio
async def test_oversized_stream_without_content_length_is_refused(tmp_path):
    cache = RemoteImageCache(cache_dir=tmp_path, max_bytes=10_000, max_item_bytes=500)

    async def body():
        for _ in range(10):
            yield b"x" * 100

    with _serve(lambda req: httpx.Response(200, content=body())):
        assert await cache.get_or_fetch("https://example.com/stream.jpg") is None
    assert list(tmp_path.glob("*/*")) == []


@pytest.mark.asyncio
async def test_rate_limit_serves_stale_copy(tmp_path):
    cache = RemoteImageCache(cache_dir=tmp_path, ttl_days=0, max_bytes=10_000, max_item_bytes=500)
    with _serve(lambda req: httpx.Response(200, content=b"old")):
        await cache.get_or_fetch("https://example.com/a.jpg")
    with _serve(lambda req: httpx.Response(429)):
        assert await cache.get_or_fetch("https://example.com/a.jpg") == b"old"
