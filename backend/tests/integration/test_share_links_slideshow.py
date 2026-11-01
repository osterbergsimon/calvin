"""Share links and the slideshow (calvin-mwqo).

Guest photos must show up in the same list the dashboard rotates through, stay
there when the link is revoked without "remove photos", and an existing flat
library must look exactly the same as before share links existed, even with an
unrelated subfolder under the photos dir.
"""

import asyncio
import re
from datetime import UTC, datetime
from io import BytesIO

import pytest
from PIL import Image

from app.models.db_models import PluginDB
from tests.test_utils import create_test_image_file


def _run(coro):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


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

    _run(ensure_instance())


def _photo() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (64, 48), (10, 120, 200)).save(buffer, "JPEG")
    return buffer.getvalue()


def _make_link(client, name="Grandma", folder="Guests"):
    response = client.post("/api/share/links", json={"name": name, "folder": folder})
    assert response.status_code == 201, response.text
    link = response.json()["link"]
    return link, re.match(r"^/share/([^/]+)/$", link["path"]).group(1)


def _slideshow_ids(client) -> list[str]:
    response = client.get("/api/images/list")
    assert response.status_code == 200, response.text
    return [image["id"] for image in response.json()["images"]]


@pytest.mark.integration
def test_guest_upload_is_in_the_slideshow_and_stays_after_revoke(test_client, temp_image_dir):
    _enable_local_photos(test_client)
    link, token = _make_link(test_client)

    response = test_client.post(
        f"/api/guest/{token}/uploads",
        files=[("photos", ("party.jpg", _photo(), "image/jpeg"))],
    )
    assert response.status_code == 200, response.text
    (uploaded,) = response.json()["uploaded"]

    assert uploaded["imageId"] in _slideshow_ids(test_client)

    # Revoke without "remove photos": the link dies, the photo stays on show.
    assert test_client.delete(f"/api/share/links/{link['id']}").status_code == 204
    assert test_client.get(f"/api/guest/{token}").status_code == 404
    assert (temp_image_dir / "Guests" / "party.jpg").is_file()
    assert uploaded["imageId"] in _slideshow_ids(test_client)


@pytest.mark.integration
def test_flat_library_with_an_unrelated_subfolder_is_unchanged(test_client, temp_image_dir):
    _enable_local_photos(test_client)
    for name in ("a.jpg", "b.jpg", "c.jpg"):
        create_test_image_file(temp_image_dir / name)
    before = sorted(_slideshow_ids(test_client))
    assert len(before) == 3

    # An owner's own archive folder, and a share link using a different folder.
    (temp_image_dir / "Archive").mkdir()
    create_test_image_file(temp_image_dir / "Archive" / "private.jpg")
    _make_link(test_client)
    from app.services import plugin_image_service

    plugin_image_service.invalidate_cache()

    after = sorted(_slideshow_ids(test_client))
    assert after == before
    for image_id in after:
        assert test_client.get(f"/api/images/{image_id}/thumbnail").status_code == 200
    # The archive is never offered as a share folder either.
    assert "Archive" not in test_client.get("/api/share/folders").json()["folders"]
