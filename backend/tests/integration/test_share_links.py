"""Share links end to end: admin CRUD, guest token scope, revoke, expiry, share target.

A stub app mounts the real share router, auth router, route policy and
Host/Origin middleware, plus a real Local photos plugin on a temp image dir. No
host-acting route exists on this app.
"""

import asyncio
import json
import logging
import re
from io import BytesIO

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from app.config import settings
from app.plugins.image.local import LocalImagePlugin
from app.plugins.manager import plugin_manager
from app.security.admin_auth import get_admin_store
from app.security.install import install_security
from app.security.route_policy import (
    ADMIN_READS,
    GUEST_ROUTES,
    HOST_ROUTES,
    PUBLIC_WRITES,
    enforce_route_policy,
)
from tests.test_utils import create_test_image

PASSWORD = "test-admin-password"
GPS_IFD = 0x8825


@pytest.fixture
def image_dir(tmp_path, monkeypatch):
    path = tmp_path / "images"
    path.mkdir()
    monkeypatch.setenv("IMAGE_DIR", str(path))
    return path


@pytest.fixture
def app(tmp_path, image_dir, monkeypatch):
    monkeypatch.setattr(settings, "admin_auth_path", tmp_path / "admin-auth.json")
    get_admin_store().set_password(PASSWORD)
    from app.api.routes import share
    from app.security.admin_auth import api_key_limiter, login_limiter

    for limiter in (login_limiter, api_key_limiter, share.guest_token_limiter):
        limiter._failures.clear()
        limiter._lockouts.clear()
    share.guest_upload_limiter.reset()

    plugin = LocalImagePlugin("local-images", "Local Images", enabled=True)
    existing = plugin_manager.get_plugin("local-images")
    if existing is not None:
        asyncio.run(plugin_manager.unregister("local-images"))
    asyncio.run(plugin_manager.register(plugin))

    test_app = FastAPI(dependencies=[Depends(enforce_route_policy)])
    test_app.include_router(share.router, prefix="/api")
    test_app.include_router(share.share_target_router)
    install_security(test_app)
    yield test_app
    asyncio.run(plugin_manager.unregister("local-images"))
    if existing is not None:
        asyncio.run(plugin_manager.register(existing))


@pytest.fixture
def admin(app):
    client = TestClient(app)
    assert client.post("/api/auth/login", json={"password": PASSWORD}).status_code == 200
    return client


@pytest.fixture
def guest(app):
    return TestClient(app)


def _make_link(admin, name="Grandma", folder="Guests", **extra):
    response = admin.post("/api/share/links", json={"name": name, "folder": folder, **extra})
    assert response.status_code == 201, response.text
    link = response.json()["link"]
    token = re.match(r"^/share/([^/]+)/$", link["path"]).group(1)
    return link, token


def _photo(fmt="JPEG", gps=False, size=(64, 48)) -> bytes:
    img = Image.new("RGB", size, (200, 10, 10))
    buffer = BytesIO()
    if gps:
        exif = Image.Exif()
        exif.get_ifd(GPS_IFD)[2] = (59.0, 20.0, 0.0)
        img.save(buffer, fmt, exif=exif)
    else:
        img.save(buffer, fmt)
    return buffer.getvalue()


def _upload(client, token, *files, field="photos"):
    payload = [(field, (name, data, "image/jpeg")) for name, data in files]
    return client.post(f"/api/guest/{token}/uploads", files=payload)


# -- policy tables ---------------------------------------------------------


def test_guest_routes_are_only_in_the_guest_table():
    paths = {path for _, path in GUEST_ROUTES}
    assert not GUEST_ROUTES & PUBLIC_WRITES
    assert not GUEST_ROUTES & HOST_ROUTES
    assert not paths & ADMIN_READS
    assert all("{token}" in path for path in paths)


def test_guest_table_matches_the_routers(app):
    from fastapi.routing import APIRoute

    guest_routes = {
        (method, route.path_format)
        for route in app.routes
        if isinstance(route, APIRoute) and "{token}" in route.path_format
        for method in route.methods
    }
    assert guest_routes == set(GUEST_ROUTES)


# -- admin -----------------------------------------------------------------


def test_admin_routes_need_admin(guest):
    assert guest.get("/api/share/links").status_code == 401
    assert guest.get("/api/share/folders").status_code == 401
    assert guest.post("/api/share/links", json={"name": "x", "folder": "y"}).status_code == 401
    assert guest.patch("/api/share/links/abc", json={"name": "x"}).status_code == 401
    assert guest.delete("/api/share/links/abc").status_code == 401


def test_create_list_and_reshow(admin):
    link, token = _make_link(admin)
    assert link["name"] == "Grandma" and link["folder"] == "Guests"
    listed = admin.get("/api/share/links").json()["links"]
    assert [item["id"] for item in listed] == [link["id"]]
    # The URL can be shown again at any time.
    assert listed[0]["path"] == f"/share/{token}/"
    assert "hash" not in listed[0]


def test_create_validates(admin):
    bad = [
        {"name": "", "folder": "Guests"},
        {"name": "x" * 41, "folder": "Guests"},
        {"name": "ok", "folder": "../etc"},
        {"name": "ok", "folder": "thumbnails"},
        {"name": "ok", "folder": "Guests", "expires_in_days": 0},
        {"name": "ok", "folder": "Guests", "expires_in_days": 400},
    ]
    for body in bad:
        assert admin.post("/api/share/links", json=body).status_code in (400, 422), body
    _make_link(admin)
    assert admin.post("/api/share/links", json={"name": "grandma", "folder": "x"}).status_code == (
        409
    )


def test_folders_lists_share_folders_only(admin, image_dir):
    (image_dir / "Archive").mkdir()
    _make_link(admin, folder="Party")
    assert (image_dir / "Party").is_dir()
    assert admin.get("/api/share/folders").json() == {"folders": ["Party"]}


def test_rename(admin, guest):
    link, token = _make_link(admin)
    response = admin.patch(f"/api/share/links/{link['id']}", json={"name": "Nana"})
    assert response.status_code == 200
    assert response.json()["link"]["name"] == "Nana"
    assert guest.get(f"/api/guest/{token}").json()["name"] == "Nana"
    assert admin.patch("/api/share/links/missing", json={"name": "x"}).status_code == 404


# -- guest scope -----------------------------------------------------------


def test_guest_info_sets_a_device_cookie(admin, guest):
    _, token = _make_link(admin)
    response = guest.get(f"/api/guest/{token}")
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Grandma"
    assert "folder" not in body
    assert "calvin_guest" in response.cookies


@pytest.mark.parametrize("token", ["nope", "0123456789abcdef.AAAA", "x" * 60])
def test_bad_token_is_404_everywhere(guest, token):
    assert guest.get(f"/api/guest/{token}").status_code == 404
    assert guest.get(f"/api/guest/{token}/uploads").status_code == 404
    assert _upload(guest, token, ("a.jpg", _photo())).status_code == 404
    assert guest.get(f"/api/guest/{token}/manifest.webmanifest").status_code == 404


def test_token_grants_nothing_outside_guest_routes(admin, guest):
    _, token = _make_link(admin)
    for headers in ({"Authorization": f"Bearer {token}"}, {"Cookie": f"calvin_admin={token}"}):
        assert guest.get("/api/share/links", headers=headers).status_code == 401
        response = guest.post(
            "/api/share/links", json={"name": "x", "folder": "y"}, headers=headers
        )
        assert response.status_code == 401


def test_guest_upload_lands_in_the_links_folder_without_gps(admin, guest, image_dir):
    _, token = _make_link(admin)
    response = _upload(guest, token, ("IMG_1.jpg", _photo(gps=True)))
    assert response.status_code == 200, response.text
    (uploaded,) = response.json()["uploaded"]
    stored = image_dir / "Guests" / "IMG_1.jpg"
    assert stored.is_file()
    assert not Image.open(stored).getexif().get_ifd(GPS_IFD)
    mine = guest.get(f"/api/guest/{token}/uploads").json()["uploads"]
    assert [u["imageId"] for u in mine] == [uploaded["imageId"]]
    thumb = guest.get(f"/api/guest/{token}/uploads/{uploaded['imageId']}/thumbnail")
    assert thumb.status_code == 200
    assert thumb.headers["content-type"] == "image/jpeg"
    listed = admin.get("/api/share/links").json()["links"][0]
    assert listed["uploadCount"] == 1
    assert listed["lastUsedAt"] is not None


def test_many_files_in_one_request_and_partial_failure(admin, guest, image_dir):
    _, token = _make_link(admin)
    response = _upload(
        guest,
        token,
        ("a.jpg", _photo()),
        ("b.png", _photo("PNG")),
        ("evil.jpg", b"not a photo"),
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["uploaded"]) == 2
    assert [f["filename"] for f in body["failed"]] == ["evil.jpg"]
    photos = sorted(p.name for p in (image_dir / "Guests").iterdir() if p.suffix)
    assert photos == ["a.jpg", "b.png"]


def test_only_bad_files_is_400(admin, guest):
    _, token = _make_link(admin)
    assert _upload(guest, token, ("x.svg", b"<svg/>")).status_code == 400


def test_guest_sees_and_removes_only_own_uploads(admin, app, image_dir):
    _, token = _make_link(admin, guests_see_all=False)
    phone_a, phone_b = TestClient(app), TestClient(app)
    phone_a.get(f"/api/guest/{token}")
    phone_b.get(f"/api/guest/{token}")
    (mine,) = _upload(phone_a, token, ("a.jpg", _photo())).json()["uploaded"]
    _upload(phone_b, token, ("b.jpg", _photo()))

    assert [u["imageId"] for u in phone_b.get(f"/api/guest/{token}/uploads").json()["uploads"]]
    assert phone_b.delete(f"/api/guest/{token}/uploads/{mine['imageId']}").status_code == 404
    image_id = mine["imageId"]
    assert phone_b.get(f"/api/guest/{token}/uploads/{image_id}/thumbnail").status_code == 404
    assert (image_dir / "Guests" / "a.jpg").exists()

    assert phone_a.delete(f"/api/guest/{token}/uploads/{image_id}").status_code == 204
    assert not (image_dir / "Guests" / "a.jpg").exists()
    assert (image_dir / "Guests" / "b.jpg").exists()


def test_guest_cannot_delete_photos_that_are_not_theirs(admin, guest, image_dir):
    from tests.test_utils import create_test_image_file

    create_test_image_file(image_dir / "family.jpg")
    _, token = _make_link(admin)
    guest.get(f"/api/guest/{token}")
    import hashlib

    other_id = hashlib.md5(str(image_dir / "family.jpg").encode()).hexdigest()  # noqa: S324
    assert guest.delete(f"/api/guest/{token}/uploads/{other_id}").status_code == 404
    assert guest.get(f"/api/guest/{token}/uploads/{other_id}/thumbnail").status_code == 404
    assert (image_dir / "family.jpg").exists()


def test_link_a_cannot_touch_link_b_uploads(admin, guest, image_dir):
    _, token_a = _make_link(admin, "A", "A")
    _, token_b = _make_link(admin, "B", "B")
    guest.get(f"/api/guest/{token_a}")
    (photo,) = _upload(guest, token_a, ("a.jpg", _photo())).json()["uploaded"]
    assert guest.delete(f"/api/guest/{token_b}/uploads/{photo['imageId']}").status_code == 404
    assert guest.get(f"/api/guest/{token_b}/uploads").json()["uploads"] == []


# -- revoke and expiry -----------------------------------------------------


def test_revoke_is_immediate_and_keeps_photos_by_default(admin, guest, image_dir):
    link, token = _make_link(admin)
    _upload(guest, token, ("a.jpg", _photo()))
    assert admin.delete(f"/api/share/links/{link['id']}").status_code == 204
    assert guest.get(f"/api/guest/{token}").status_code == 404
    assert _upload(guest, token, ("b.jpg", _photo())).status_code == 404
    assert (image_dir / "Guests" / "a.jpg").exists()
    assert admin.delete(f"/api/share/links/{link['id']}").status_code == 404


def test_revoke_can_remove_its_photos(admin, guest, image_dir):
    from tests.test_utils import create_test_image_file

    link, token = _make_link(admin)
    _upload(guest, token, ("a.jpg", _photo()))
    create_test_image_file(image_dir / "Guests" / "owners.jpg")
    response = admin.delete(f"/api/share/links/{link['id']}?remove_photos=true")
    assert response.status_code == 204
    assert not (image_dir / "Guests" / "a.jpg").exists()
    # Only the link's own uploads go; other photos in the folder stay.
    assert (image_dir / "Guests" / "owners.jpg").exists()


def test_expired_link_stops_working(admin, guest, monkeypatch):
    link, token = _make_link(admin, expires_in_days=1)
    assert link["expiresAt"] is not None
    assert guest.get(f"/api/guest/{token}").status_code == 200

    import app.security.share_links as share_links

    real_time = share_links.time.time
    monkeypatch.setattr(share_links.time, "time", lambda: real_time() + 2 * 86400)
    assert guest.get(f"/api/guest/{token}").status_code == 404
    assert admin.get("/api/share/links").json()["links"][0]["expired"] is True


# -- PWA manifest and Web Share Target ---------------------------------------


def test_manifest_declares_the_share_target(admin, guest):
    _, token = _make_link(admin)
    response = guest.get(f"/api/guest/{token}/manifest.webmanifest")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/manifest+json")
    manifest = response.json()
    assert manifest["start_url"] == f"/share/{token}/"
    assert manifest["scope"] == f"/share/{token}/"
    assert manifest["display"] == "standalone"
    target = manifest["share_target"]
    assert target["action"] == f"/share/{token}/receive"
    assert target["method"] == "POST"
    assert target["enctype"] == "multipart/form-data"
    (files,) = target["params"]["files"]
    assert files["name"] == "photos"
    assert "image/*" in files["accept"]


def test_share_target_post_uploads_and_redirects(admin, guest, image_dir):
    _, token = _make_link(admin)
    response = guest.post(
        f"/share/{token}/receive",
        files=[
            ("photos", ("IMG_9.jpg", _photo(), "image/jpeg")),
            ("photos", ("bad.jpg", b"nope", "image/jpeg")),
        ],
        # Android sends the share as a browser navigation: no Origin header.
        headers={"Sec-Fetch-Site": "none"},
        follow_redirects=False,
    )
    assert response.status_code == 303
    assert response.headers["location"].startswith(f"/share/{token}/?added=1&failed=1")
    assert (image_dir / "Guests" / "IMG_9.jpg").exists()


def test_share_target_with_revoked_link_redirects_to_the_page(admin, guest):
    link, token = _make_link(admin)
    admin.delete(f"/api/share/links/{link['id']}")
    response = guest.post(
        f"/share/{token}/receive",
        files=[("photos", ("a.jpg", _photo(), "image/jpeg"))],
        follow_redirects=False,
    )
    assert response.status_code == 303
    assert response.headers["location"] == f"/share/{token}/?error=invalid"


# -- abuse limits ------------------------------------------------------------


def test_token_guessing_is_rate_limited(guest):
    for _ in range(5):
        assert guest.get("/api/guest/nope.nope").status_code == 404
    assert guest.get("/api/guest/nope.nope").status_code == 429


def test_failed_guesses_never_block_a_valid_token(admin, guest):
    _, token = _make_link(admin)
    for _ in range(6):
        guest.get("/api/guest/nope.nope")
    assert guest.get("/api/guest/nope.nope").status_code == 429
    # Same IP, real link: still works, uploads included.
    assert guest.get(f"/api/guest/{token}").status_code == 200
    assert _upload(guest, token, ("a.jpg", _photo())).status_code == 200


def test_valid_requests_do_not_count_as_failures(admin, guest):
    _, token = _make_link(admin)
    for _ in range(10):
        assert guest.get(f"/api/guest/{token}").status_code == 200
    for _ in range(4):
        assert guest.get("/api/guest/nope.nope").status_code == 404


def test_behind_a_trusted_proxy_guesses_count_per_forwarded_ip(guest, monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxies", "*")
    stranger = {"X-Forwarded-For": "203.0.113.7"}
    for _ in range(6):
        guest.get("/api/guest/nope.nope", headers=stranger)
    assert guest.get("/api/guest/nope.nope", headers=stranger).status_code == 429
    # Another guest behind the same proxy is not locked out by the stranger.
    other = {"X-Forwarded-For": "198.51.100.9"}
    assert guest.get("/api/guest/nope.nope", headers=other).status_code == 404


def test_forwarded_for_is_ignored_without_a_trusted_proxy(guest):
    for index in range(6):
        guest.get("/api/guest/nope.nope", headers={"X-Forwarded-For": f"203.0.113.{index}"})
    response = guest.get("/api/guest/nope.nope", headers={"X-Forwarded-For": "198.51.100.9"})
    assert response.status_code == 429


def test_cross_site_share_target_post_is_refused(admin, guest, image_dir):
    _, token = _make_link(admin)
    response = guest.post(
        f"/share/{token}/receive",
        files=[("photos", ("a.jpg", _photo(), "image/jpeg"))],
        headers={"Origin": "https://evil.example", "Sec-Fetch-Site": "cross-site"},
        follow_redirects=False,
    )
    assert response.status_code == 403
    assert not (image_dir / "Guests" / "a.jpg").exists()


@pytest.mark.parametrize("site", ["same-origin", "none"])
def test_share_target_allows_same_origin_and_direct(admin, guest, image_dir, site):
    _, token = _make_link(admin)
    response = guest.post(
        f"/share/{token}/receive",
        files=[("photos", ("a.jpg", _photo(), "image/jpeg"))],
        headers={"Sec-Fetch-Site": site},
        follow_redirects=False,
    )
    assert response.status_code == 303
    assert response.headers["location"].endswith("?added=1&failed=0")


def test_location_quotes_the_token(guest):
    response = guest.post(
        "/share/a%20b%22c/receive",
        files=[("photos", ("a.jpg", _photo(), "image/jpeg"))],
        follow_redirects=False,
    )
    assert response.status_code == 303
    assert response.headers["location"] == "/share/a%20b%22c/?error=invalid"


def test_oversized_request_is_refused_before_upload(admin, guest, monkeypatch, image_dir):
    from app.security import guest_gate

    monkeypatch.setattr(guest_gate, "MAX_GUEST_API_REQUEST_BYTES", 1000)
    _, token = _make_link(admin)
    response = _upload(guest, token, ("a.jpg", _photo(size=(400, 400))))
    assert response.status_code == 413
    assert response.json()["detail"]["code"] == "too_large"
    assert not (image_dir / "Guests" / "a.jpg").exists()


def test_link_photo_quota(admin, guest, image_dir):
    _, token = _make_link(admin, max_photos=2)
    response = _upload(guest, token, ("a.jpg", _photo()), ("b.jpg", _photo()), ("c.jpg", _photo()))
    assert response.status_code == 200
    body = response.json()
    assert len(body["uploaded"]) == 2
    (failed,) = body["failed"]
    assert failed["filename"] == "c.jpg"
    assert "limit" in failed["message"]
    response = _upload(guest, token, ("d.jpg", _photo()))
    assert response.status_code == 400
    # Removing a photo frees its place.
    first = guest.get(f"/api/guest/{token}/uploads").json()["uploads"][0]
    guest.delete(f"/api/guest/{token}/uploads/{first['imageId']}")
    assert _upload(guest, token, ("e.jpg", _photo())).status_code == 200


def test_link_byte_quota(admin, guest, image_dir):
    from app.services.guest_image import prepare_guest_image

    photo = _photo()
    stored_size = len(prepare_guest_image(photo, "a.jpg")[0])
    _, token = _make_link(admin, max_mb=1)
    import app.security.share_links as share_links

    store = share_links.get_share_link_store()
    data = json.loads(store.path.read_text())
    # Room for one stored photo, not two.
    data["links"][0]["max_bytes"] = int(stored_size * 1.5)
    store.path.write_text(json.dumps(data))
    body = _upload(guest, token, ("a.jpg", photo), ("b.jpg", photo)).json()
    assert len(body["uploaded"]) == 1
    assert [f["filename"] for f in body["failed"]] == ["b.jpg"]


def test_link_quota_defaults_and_validation(admin):
    link, _ = _make_link(admin)
    assert link["maxPhotos"] == 500
    assert link["maxBytes"] == 2 * 1024**3
    for bad in ({"max_photos": 0}, {"max_photos": 100001}, {"max_mb": 0}):
        response = admin.post("/api/share/links", json={"name": "x", "folder": "y", **bad})
        assert response.status_code == 422, bad


def test_uploads_are_refused_when_disk_is_low(admin, guest, monkeypatch, image_dir):
    from app.api.routes import share

    _, token = _make_link(admin)
    monkeypatch.setattr(share, "MIN_FREE_BYTES", 10**18)
    response = _upload(guest, token, ("a.jpg", _photo()))
    assert response.status_code == 507
    assert response.json()["detail"]["code"] == "disk_full"
    assert not (image_dir / "Guests" / "a.jpg").exists()


def test_uploads_are_rate_limited(admin, guest, monkeypatch):
    from app.api.routes import share

    monkeypatch.setattr(share.guest_upload_limiter, "max_events", 2)
    _, token = _make_link(admin)
    assert _upload(guest, token, ("a.jpg", _photo())).status_code == 200
    assert _upload(guest, token, ("b.jpg", _photo())).status_code == 200
    response = _upload(guest, token, ("c.jpg", _photo()))
    assert response.status_code == 429
    assert "retry-after" in response.headers


def test_cross_site_guest_upload_is_refused(admin, guest):
    _, token = _make_link(admin)
    response = guest.post(
        f"/api/guest/{token}/uploads",
        files=[("photos", ("a.jpg", _photo(), "image/jpeg"))],
        headers={"Origin": "https://evil.example"},
    )
    assert response.status_code == 403


def test_local_photos_off_is_503(admin, guest):
    _, token = _make_link(admin)
    asyncio.run(plugin_manager.unregister("local-images"))
    assert _upload(guest, token, ("a.jpg", _photo())).status_code == 503


def test_tokens_are_redacted_from_access_logs(admin):
    _, token = _make_link(admin)
    from app.security.install import ShareTokenRedactor

    record = logging.LogRecord(
        "uvicorn.access",
        logging.INFO,
        __file__,
        1,
        '%s - "%s %s HTTP/%s" %d',
        ("1.2.3.4", "GET", f"/share/{token}/?added=1", "1.1", 200),
        None,
    )
    assert ShareTokenRedactor().filter(record) is True
    assert token not in record.getMessage()
    assert "/share/[redacted]/" in record.getMessage()


def test_large_photo_is_resized(admin, guest, image_dir):
    from app.services.guest_image import MAX_EDGE

    _, token = _make_link(admin)
    big = create_test_image("JPEG", width=MAX_EDGE + 500, height=100)
    assert _upload(guest, token, ("big.jpg", big)).status_code == 200
    assert max(Image.open(image_dir / "Guests" / "big.jpg").size) == MAX_EDGE


def test_guest_page_html_links_the_links_manifest():
    from app.api.routes.share import share_page_html

    index = (
        '<html><head><link rel="manifest" href="/site.webmanifest">'
        "<title>Calvin Dashboard</title></head><body></body></html>"
    )
    html = share_page_html(index, "abc.DEF_-1")
    assert 'href="/api/guest/abc.DEF_-1/manifest.webmanifest"' in html
    assert "/site.webmanifest" not in html
    assert "<title>Add photos</title>" in html
    assert 'name="apple-mobile-web-app-title"' in html
    # Anything that isn't token-shaped is never written into the page.
    assert share_page_html(index, '"><script>') == index


# -- security r2: quota atomicity and image id reuse -----------------------


def _big_photo() -> bytes:
    """A noise PNG over Starlette's 1 MB spool limit, so reading it yields."""
    import os as _os

    img = Image.frombytes("RGB", (800, 800), _os.urandom(800 * 800 * 3))
    buffer = BytesIO()
    img.save(buffer, "PNG")
    assert len(buffer.getvalue()) > 1024 * 1024
    return buffer.getvalue()


def test_concurrent_uploads_cannot_pass_the_photo_quota(admin, app, image_dir):
    """Six parallel requests against max_photos=3 store exactly three photos."""
    import httpx

    _, token = _make_link(admin, max_photos=3)
    photo = _big_photo()

    async def run():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:

            async def one(i):
                files = [("photos", (f"p{i}.png", photo, "image/png"))]
                return await client.post(f"/api/guest/{token}/uploads", files=files)

            return await asyncio.gather(*(one(i) for i in range(6)))

    responses = asyncio.run(run())
    stored = sorted(p.name for p in (image_dir / "Guests").iterdir() if p.suffix != "")
    assert len(stored) == 3, stored
    assert sum(len(r.json().get("uploaded", [])) for r in responses if r.status_code == 200) == 3
    from app.security.share_links import get_share_link_store

    (link,) = get_share_link_store().list()
    assert link["uploadCount"] == 3


def test_concurrent_uploads_cannot_pass_the_rate_limit(admin, app, image_dir, monkeypatch):
    import httpx

    from app.api.routes import share
    from app.services import plugin_image_service

    monkeypatch.setattr(share.guest_upload_limiter, "max_events", 2)
    real_upload = plugin_image_service.upload_to_local_folder

    async def slow_upload(*args, **kwargs):
        await asyncio.sleep(0.05)  # a slow SD card: the write yields
        return await real_upload(*args, **kwargs)

    monkeypatch.setattr(plugin_image_service, "upload_to_local_folder", slow_upload)
    _, token = _make_link(admin)
    photo = _big_photo()

    async def run():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:

            async def one(i):
                files = [("photos", (f"p{i}.png", photo, "image/png"))]
                return await client.post(f"/api/guest/{token}/uploads", files=files)

            await asyncio.gather(*(one(i) for i in range(5)))

    asyncio.run(run())
    assert len([p for p in (image_dir / "Guests").iterdir() if p.suffix != ""]) == 2


def _delete_in_manage_images(app, image_id):
    """The owner removes a photo in Manage images (the record stays with the link)."""
    plugin = plugin_manager.get_plugin("local-images")
    assert asyncio.run(plugin.delete_image(image_id))


def test_reused_image_id_cannot_be_deleted_by_the_earlier_guest(admin, app, image_dir):
    _, token = _make_link(admin, guests_see_all=False)
    phone_a, phone_b = TestClient(app), TestClient(app)
    phone_a.get(f"/api/guest/{token}")
    phone_b.get(f"/api/guest/{token}")
    (a,) = _upload(phone_a, token, ("x.jpg", _photo())).json()["uploaded"]
    _delete_in_manage_images(app, a["imageId"])
    (b,) = _upload(phone_b, token, ("x.jpg", _photo())).json()["uploaded"]
    assert b["imageId"] == a["imageId"]  # same path, same md5 id

    assert phone_a.get(f"/api/guest/{token}/uploads").json()["uploads"] == []
    assert phone_a.get(f"/api/guest/{token}/uploads/{a['imageId']}/thumbnail").status_code == 404
    assert phone_a.delete(f"/api/guest/{token}/uploads/{a['imageId']}").status_code == 404
    assert (image_dir / "Guests" / "x.jpg").exists()
    assert [u["imageId"] for u in phone_b.get(f"/api/guest/{token}/uploads").json()["uploads"]] == [
        b["imageId"]
    ]


def test_reused_image_id_across_links_survives_revoke_with_remove(admin, guest, image_dir):
    link_a, token_a = _make_link(admin, "A", "Guests")
    _, token_b = _make_link(admin, "B", "Guests")
    (a,) = _upload(guest, token_a, ("x.jpg", _photo())).json()["uploaded"]
    _delete_in_manage_images(None, a["imageId"])
    (b,) = _upload(guest, token_b, ("x.jpg", _photo())).json()["uploaded"]
    assert b["imageId"] == a["imageId"]

    response = admin.delete(f"/api/share/links/{link_a['id']}?remove_photos=true")
    assert response.status_code == 204
    assert (image_dir / "Guests" / "x.jpg").exists()


def test_revoke_with_remove_spares_a_file_that_replaced_the_upload(admin, guest, image_dir):
    """A file at the upload's path that the upload did not create is left alone."""
    import os
    import time

    from tests.test_utils import create_test_image_file

    link, token = _make_link(admin)
    _upload(guest, token, ("x.jpg", _photo()))
    path = image_dir / "Guests" / "x.jpg"
    path.unlink()
    create_test_image_file(path)  # the owner's own photo, same name
    later = time.time() + 5
    os.utime(path, (later, later))

    response = admin.delete(f"/api/share/links/{link['id']}?remove_photos=true")
    assert response.status_code == 204
    assert path.exists()


@pytest.mark.parametrize("see_all", [False, True])
def test_guest_cannot_delete_a_file_that_replaced_their_upload(admin, guest, image_dir, see_all):
    import os
    import time

    from tests.test_utils import create_test_image_file

    _, token = _make_link(admin, guests_see_all=see_all)
    guest.get(f"/api/guest/{token}")
    (a,) = _upload(guest, token, ("x.jpg", _photo())).json()["uploaded"]
    path = image_dir / "Guests" / "x.jpg"
    path.unlink()
    create_test_image_file(path)
    later = time.time() + 5
    os.utime(path, (later, later))

    assert guest.delete(f"/api/guest/{token}/uploads/{a['imageId']}").status_code == 404
    assert path.exists()


# -- device identity across the share target (calvin-p954) -----------------


def _share(client, token, name="shared.jpg", **headers):
    return client.post(
        f"/share/{token}/receive",
        files=[("photos", (name, _photo(), "image/jpeg"))],
        headers={"Sec-Fetch-Site": "none", **headers},
        follow_redirects=False,
    )


def _claim_of(location):
    from urllib.parse import parse_qs, urlsplit

    return parse_qs(urlsplit(location).query).get("claim", [None])[0]


def test_share_target_without_the_cookie_keeps_the_phones_photos(admin, app, image_dir):
    """Android's share sheet POST arrives without the SameSite=Lax cookie.

    It must not mint a new device id over the phone's cookie: that orphaned
    every photo the guest had added before (owner testing, calvin-p954).
    """
    _, token = _make_link(admin, guests_see_all=False)
    phone = TestClient(app)
    phone.get(f"/api/guest/{token}")
    device = phone.cookies["calvin_guest"]
    (before,) = _upload(phone, token, ("before.jpg", _photo())).json()["uploaded"]

    share_sheet = TestClient(app)  # same phone, but the cookie is not sent
    response = _share(share_sheet, token)
    assert response.status_code == 303
    assert "set-cookie" not in response.headers
    claim = _claim_of(response.headers["location"])
    assert claim

    # The redirected page (same site, cookie sent) claims the share for its device.
    claimed = phone.post(f"/api/guest/{token}/claim", json={"claim": claim})
    assert claimed.status_code == 200
    assert claimed.json() == {"claimed": 1}
    assert phone.cookies["calvin_guest"] == device
    mine = phone.get(f"/api/guest/{token}/uploads").json()["uploads"]
    assert len(mine) == 2
    assert before["imageId"] in {u["imageId"] for u in mine}

    # One time only: nobody else can take it afterwards.
    other = TestClient(app)
    other.get(f"/api/guest/{token}")
    again = other.post(f"/api/guest/{token}/claim", json={"claim": claim})
    assert again.json() == {"claimed": 0}
    assert other.get(f"/api/guest/{token}/uploads").json()["uploads"] == []


def test_share_target_with_the_cookie_counts_as_that_device(admin, app, image_dir):
    _, token = _make_link(admin, guests_see_all=False)
    phone = TestClient(app)
    phone.get(f"/api/guest/{token}")
    response = _share(phone, token)
    assert response.status_code == 303
    assert "set-cookie" not in response.headers
    assert _claim_of(response.headers["location"]) is None
    assert len(phone.get(f"/api/guest/{token}/uploads").json()["uploads"]) == 1


def test_claim_sets_a_cookie_for_a_new_device(admin, app, image_dir):
    _, token = _make_link(admin, guests_see_all=False)
    claim = _claim_of(_share(TestClient(app), token).headers["location"])
    fresh = TestClient(app)
    response = fresh.post(f"/api/guest/{token}/claim", json={"claim": claim})
    assert response.json() == {"claimed": 1}
    assert "calvin_guest" in response.cookies
    assert len(fresh.get(f"/api/guest/{token}/uploads").json()["uploads"]) == 1


def test_claim_is_scoped_to_its_link(admin, app, image_dir):
    _, token_a = _make_link(admin, "A", "A", guests_see_all=False)
    _, token_b = _make_link(admin, "B", "B", guests_see_all=False)
    claim = _claim_of(_share(TestClient(app), token_a).headers["location"])
    phone = TestClient(app)
    assert phone.post(f"/api/guest/{token_b}/claim", json={"claim": claim}).json() == {
        "claimed": 0
    }
    assert phone.post("/api/guest/nope/claim", json={"claim": claim}).status_code == 404
    assert phone.post(f"/api/guest/{token_a}/claim", json={"claim": "x"}).status_code == 422


# -- guests see all photos added with the link (calvin-p954) ---------------


def test_guests_see_all_is_on_by_default_and_editable(admin, guest):
    link, token = _make_link(admin)
    assert link["guestsSeeAll"] is True
    assert guest.get(f"/api/guest/{token}").json()["seeAll"] is True
    own, own_token = _make_link(admin, "Party", "Party", guests_see_all=False)
    assert own["guestsSeeAll"] is False
    assert guest.get(f"/api/guest/{own_token}").json()["seeAll"] is False

    response = admin.patch(f"/api/share/links/{link['id']}", json={"guests_see_all": False})
    assert response.status_code == 200
    assert response.json()["link"]["guestsSeeAll"] is False
    assert response.json()["link"]["name"] == "Grandma"
    listed = {item["id"]: item for item in admin.get("/api/share/links").json()["links"]}
    assert listed[link["id"]]["guestsSeeAll"] is False
    assert admin.patch(f"/api/share/links/{link['id']}", json={}).status_code == 422


def test_with_see_all_every_guest_sees_and_removes_the_links_photos(admin, app, image_dir):
    _, token = _make_link(admin)
    phone_a, phone_b = TestClient(app), TestClient(app)
    phone_a.get(f"/api/guest/{token}")
    phone_b.get(f"/api/guest/{token}")
    (a,) = _upload(phone_a, token, ("a.jpg", _photo())).json()["uploaded"]
    (b,) = _upload(phone_b, token, ("b.jpg", _photo())).json()["uploaded"]

    listed = phone_b.get(f"/api/guest/{token}/uploads").json()["uploads"]
    assert {u["imageId"] for u in listed} == {a["imageId"], b["imageId"]}
    assert phone_b.get(f"/api/guest/{token}/uploads/{a['imageId']}/thumbnail").status_code == 200
    assert phone_b.delete(f"/api/guest/{token}/uploads/{a['imageId']}").status_code == 204
    assert not (image_dir / "Guests" / "a.jpg").exists()
    assert [u["imageId"] for u in phone_a.get(f"/api/guest/{token}/uploads").json()["uploads"]] == [
        b["imageId"]
    ]


def test_see_all_stays_inside_its_own_link(admin, app, image_dir):
    from tests.test_utils import create_test_image_file

    create_test_image_file(image_dir / "family.jpg")
    _, token_a = _make_link(admin, "A", "Guests")
    _, token_b = _make_link(admin, "B", "Guests")
    phone = TestClient(app)
    (a,) = _upload(phone, token_a, ("a.jpg", _photo())).json()["uploaded"]
    _upload(phone, token_b, ("b.jpg", _photo()))

    # Same folder, other link: link B lists and removes only its own uploads.
    assert [u["imageId"] for u in phone.get(f"/api/guest/{token_b}/uploads").json()["uploads"]]
    assert a["imageId"] not in {
        u["imageId"] for u in phone.get(f"/api/guest/{token_b}/uploads").json()["uploads"]
    }
    assert phone.delete(f"/api/guest/{token_b}/uploads/{a['imageId']}").status_code == 404
    assert phone.get(f"/api/guest/{token_b}/uploads/{a['imageId']}/thumbnail").status_code == 404
    import hashlib

    other_id = hashlib.md5(str(image_dir / "family.jpg").encode()).hexdigest()  # noqa: S324
    assert phone.delete(f"/api/guest/{token_a}/uploads/{other_id}").status_code == 404
    assert (image_dir / "family.jpg").exists()
    assert (image_dir / "Guests" / "a.jpg").exists()
