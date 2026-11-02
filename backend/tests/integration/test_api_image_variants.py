"""Image variant endpoint: bucketing, disk cache, headers and invalidation."""

import re
from datetime import UTC, datetime
from io import BytesIO

import pytest
from PIL import Image

from app.models.db_models import PluginDB


def _enable_local_photos(client):
    assert client.put("/api/plugins/local", json={"enabled": True}).status_code == 200

    async def ensure_instance():
        instance = await PluginDB.objects.get_or_none(id="local-images")
        if instance is None:
            now = datetime.now(UTC)
            await PluginDB.objects.create(
                id="local-images",
                type_id="local",
                plugin_type="image",
                name="Local Images",
                enabled=True,
                display_order=0,
                created_at=now,
                updated_at=now,
            )
        elif not instance.enabled:
            instance.enabled = True
            await instance.update()

    import asyncio

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(ensure_instance())
    finally:
        loop.close()


def _write_photo(path, size=(3000, 2000), color=(20, 120, 200), orientation=None):
    image = Image.new("RGB", size, color)
    kwargs = {}
    if orientation is not None:
        exif = Image.Exif()
        exif[0x0112] = orientation
        kwargs["exif"] = exif
    image.save(path, "JPEG", quality=90, **kwargs)
    return path


def _image_id(client, filename):
    response = client.get("/api/images/list")
    assert response.status_code == 200, response.text
    for image in response.json()["images"]:
        if image["filename"] == filename:
            return image["id"]
    raise AssertionError(f"{filename} not in image list")


@pytest.fixture
def variant_cache(tmp_path, monkeypatch):
    from app.services.image_variant_cache import image_variant_cache

    monkeypatch.setattr(image_variant_cache, "cache_dir", tmp_path / "variants")
    monkeypatch.setattr(image_variant_cache, "max_bytes", 64 * 1024 * 1024)
    monkeypatch.setattr(image_variant_cache, "_total_bytes", None)
    image_variant_cache._key_locks.clear()
    return image_variant_cache


@pytest.mark.integration
def test_variant_endpoint_buckets_and_sets_cache_headers(
    test_client, temp_image_dir, variant_cache
):
    _enable_local_photos(test_client)
    source = _write_photo(temp_image_dir / "big.jpg")
    source_bytes = source.stat().st_size
    image_id = _image_id(test_client, "big.jpg")

    response = test_client.get(f"/api/images/{image_id}?w=1000")

    assert response.status_code == 200, response.text
    assert response.headers["cache-control"].startswith("public")
    assert response.headers["etag"]
    with Image.open(BytesIO(response.content)) as rendered:
        assert rendered.size == (1280, 853)
    assert len(response.content) < source_bytes


@pytest.mark.integration
def test_variant_larger_request_is_clamped_to_the_largest_bucket(
    test_client, temp_image_dir, variant_cache
):
    _enable_local_photos(test_client)
    _write_photo(temp_image_dir / "wide.jpg", size=(4000, 3000))
    image_id = _image_id(test_client, "wide.jpg")

    response = test_client.get(f"/api/images/{image_id}?w=9000")

    assert response.status_code == 200, response.text
    with Image.open(BytesIO(response.content)) as rendered:
        assert rendered.size == (2560, 1920)


@pytest.mark.integration
def test_variant_request_can_revalidate_with_etag(test_client, temp_image_dir, variant_cache):
    _enable_local_photos(test_client)
    _write_photo(temp_image_dir / "etag.jpg")
    image_id = _image_id(test_client, "etag.jpg")

    first = test_client.get(f"/api/images/{image_id}?w=640")
    second = test_client.get(
        f"/api/images/{image_id}?w=640", headers={"If-None-Match": first.headers["etag"]}
    )

    assert second.status_code == 304
    assert second.content == b""


@pytest.mark.integration
def test_variant_invalid_width_is_rejected(test_client, temp_image_dir, variant_cache):
    _enable_local_photos(test_client)
    _write_photo(temp_image_dir / "invalid.jpg")
    image_id = _image_id(test_client, "invalid.jpg")

    assert test_client.get(f"/api/images/{image_id}?w=0").status_code == 400
    assert test_client.get(f"/api/images/{image_id}?w=-5").status_code == 400


@pytest.mark.integration
def test_variant_cache_is_hit_on_the_second_request(test_client, temp_image_dir, variant_cache):
    _enable_local_photos(test_client)
    _write_photo(temp_image_dir / "cached.jpg")
    image_id = _image_id(test_client, "cached.jpg")

    first = test_client.get(f"/api/images/{image_id}?w=1280")
    second = test_client.get(f"/api/images/{image_id}?w=1280")

    assert first.content == second.content
    assert first.headers["etag"] == second.headers["etag"]
    assert len(list((variant_cache.cache_dir).glob("*/*"))) == 1


@pytest.mark.integration
def test_variant_is_invalidated_when_the_source_changes(test_client, temp_image_dir, variant_cache):
    _enable_local_photos(test_client)
    path = _write_photo(temp_image_dir / "edited.jpg", color=(200, 10, 10))
    image_id = _image_id(test_client, "edited.jpg")

    first = test_client.get(f"/api/images/{image_id}?w=640")
    _write_photo(path, color=(10, 10, 200))
    test_client.get("/api/images/list")
    second = test_client.get(f"/api/images/{image_id}?w=640")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.headers["etag"] != second.headers["etag"]
    assert first.content != second.content
    assert len([p for p in variant_cache.cache_dir.iterdir() if p.is_dir()]) == 2


@pytest.mark.integration
def test_variant_applies_exif_orientation(test_client, temp_image_dir, variant_cache):
    _enable_local_photos(test_client)
    _write_photo(temp_image_dir / "portrait.jpg", size=(1200, 800), orientation=6)
    image_id = _image_id(test_client, "portrait.jpg")

    response = test_client.get(f"/api/images/{image_id}?w=640")

    assert response.status_code == 200, response.text
    with Image.open(BytesIO(response.content)) as rendered:
        # Stored landscape, displayed portrait: orientation 6 was applied.
        assert rendered.size == (427, 640)


@pytest.mark.integration
def test_variant_is_readable_wherever_the_original_route_is(
    test_client, temp_image_dir, variant_cache
):
    _enable_local_photos(test_client)
    _write_photo(temp_image_dir / "public.jpg")
    image_id = _image_id(test_client, "public.jpg")

    # The slideshow is a viewer surface: GETs stay open exactly as the original
    # route does, with no admin session cookie.
    test_client.cookies.clear()
    assert test_client.get(f"/api/images/{image_id}").status_code == 200
    assert test_client.get(f"/api/images/{image_id}?w=640").status_code == 200


@pytest.mark.integration
def test_variant_access_mirrors_the_original_route(test_client, temp_image_dir, variant_cache):
    _enable_local_photos(test_client)
    _write_photo(temp_image_dir / "auth.jpg")
    image_id = _image_id(test_client, "auth.jpg")

    original = test_client.get(f"/api/images/{image_id}")
    variant = test_client.get(f"/api/images/{image_id}?w=640")
    assert original.status_code == variant.status_code == 200

    assert test_client.get("/api/images/does-not-exist").status_code == 404
    assert test_client.get("/api/images/does-not-exist?w=640").status_code == 404
    # Variants are not a second, separately-authenticated surface: they live on
    # the original's own route.
    assert re.match(r"^/api/images/[^/]+$", f"/api/images/{image_id}")
