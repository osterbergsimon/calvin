"""Serving the built frontend: pre-compressed assets, cache headers, SPA fallback."""

import gzip
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.services.frontend_static import (
    IMMUTABLE_CACHE_CONTROL,
    NO_CACHE_CONTROL,
    _serve_static_file,
    cache_control_for,
    register_frontend_static_routes,
    select_encoding,
)

ASSET_NAME = "index-AbCd1234.js"
ASSET_PATH = f"/assets/{ASSET_NAME}"
RAW = b"console.log('calvin');\n" * 40
BROTLI = b"pretend-this-is-brotli"
GZIP = gzip.compress(RAW)


@pytest.fixture
def dist(tmp_path: Path) -> Path:
    """A miniature frontend/dist with one hashed asset and its siblings."""
    dist = tmp_path / "dist"
    assets = dist / "assets"
    assets.mkdir(parents=True)

    (dist / "index.html").write_text("<!doctype html><div id=app></div>", encoding="utf-8")
    (dist / "sw.js").write_text("self.addEventListener('install', () => {});", encoding="utf-8")
    (dist / "favicon.svg").write_text("<svg></svg>", encoding="utf-8")
    (dist / "site.webmanifest").write_text('{"name": "Calvin"}', encoding="utf-8")

    (assets / ASSET_NAME).write_bytes(RAW)
    (assets / f"{ASSET_NAME}.br").write_bytes(BROTLI)
    (assets / f"{ASSET_NAME}.gz").write_bytes(GZIP)
    return dist


@pytest.fixture
def client(dist: Path):
    app = FastAPI()
    register_frontend_static_routes(app, dist)
    with TestClient(app) as test_client:
        yield test_client


@pytest.mark.unit
def test_brotli_is_served_when_accepted(client: TestClient):
    response = client.get(ASSET_PATH, headers={"Accept-Encoding": "br"})

    assert response.status_code == 200
    assert response.headers["content-encoding"] == "br"
    assert response.headers["content-type"].startswith("text/javascript")
    assert response.content == BROTLI
    assert int(response.headers["content-length"]) == len(BROTLI)


@pytest.mark.unit
def test_gzip_is_served_when_only_gzip_is_accepted(client: TestClient):
    response = client.get(ASSET_PATH, headers={"Accept-Encoding": "gzip"})

    assert response.status_code == 200
    assert response.headers["content-encoding"] == "gzip"
    assert response.headers["content-type"].startswith("text/javascript")
    # httpx decodes gzip transparently; content-length is the transferred size.
    assert response.content == RAW
    assert int(response.headers["content-length"]) == len(GZIP)


@pytest.mark.unit
def test_brotli_wins_when_both_encodings_are_accepted(client: TestClient):
    response = client.get(ASSET_PATH, headers={"Accept-Encoding": "gzip, br"})

    assert response.headers["content-encoding"] == "br"
    assert response.content == BROTLI


@pytest.mark.unit
@pytest.mark.parametrize("accept_encoding", ["identity", ""])
def test_raw_file_is_served_without_an_acceptable_encoding(
    client: TestClient, accept_encoding: str
):
    response = client.get(ASSET_PATH, headers={"Accept-Encoding": accept_encoding})

    assert response.status_code == 200
    assert "content-encoding" not in response.headers
    assert response.content == RAW
    assert int(response.headers["content-length"]) == len(RAW)


@pytest.mark.unit
def test_falls_back_to_gzip_when_brotli_sibling_is_missing(client: TestClient, dist: Path):
    (dist / "assets" / f"{ASSET_NAME}.br").unlink()

    response = client.get(ASSET_PATH, headers={"Accept-Encoding": "br, gzip"})

    assert response.headers["content-encoding"] == "gzip"
    assert response.content == RAW


@pytest.mark.unit
def test_raw_when_only_brotli_is_accepted_and_sibling_is_missing(client: TestClient, dist: Path):
    (dist / "assets" / f"{ASSET_NAME}.br").unlink()

    response = client.get(ASSET_PATH, headers={"Accept-Encoding": "br"})

    assert "content-encoding" not in response.headers
    assert response.content == RAW


@pytest.mark.unit
def test_every_static_response_varies_on_accept_encoding(client: TestClient):
    for path in (ASSET_PATH, "/", "/sw.js", "/favicon.svg"):
        response = client.get(path, headers={"Accept-Encoding": "identity"})
        assert "accept-encoding" in response.headers.get("vary", "").lower(), path


@pytest.mark.unit
def test_hashed_asset_is_cached_immutably(client: TestClient):
    response = client.get(ASSET_PATH, headers={"Accept-Encoding": "identity"})

    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"


@pytest.mark.unit
def test_index_and_service_worker_are_never_cached(client: TestClient):
    for path in ("/", "/settings/plugins", "/sw.js"):
        response = client.get(path, headers={"Accept-Encoding": "identity"})
        assert response.status_code == 200, path
        assert response.headers["cache-control"] == "no-cache", path


@pytest.mark.unit
def test_non_hashed_public_files_are_not_cached_immutably(client: TestClient):
    for path in ("/favicon.svg", "/site.webmanifest"):
        response = client.get(path, headers={"Accept-Encoding": "identity"})
        assert response.status_code == 200, path
        assert response.headers["cache-control"] == "no-cache", path


@pytest.mark.unit
def test_spa_fallback_still_serves_index_for_client_routes(client: TestClient):
    response = client.get("/settings/plugins", headers={"Accept-Encoding": "identity"})

    assert response.status_code == 200
    assert "<div id=app>" in response.text


@pytest.mark.unit
def test_missing_asset_is_a_404_not_the_spa(client: TestClient):
    response = client.get("/assets/does-not-exist.js")

    assert response.status_code == 404


@pytest.mark.unit
def test_api_paths_are_not_swallowed_by_the_spa_fallback(client: TestClient):
    response = client.get("/api/missing")

    assert response.status_code == 404


@pytest.mark.unit
def test_select_encoding_respects_quality_and_availability():
    assert select_encoding(None, {"br", "gzip"}) is None
    assert select_encoding("gzip, br", {"br", "gzip"}) == "br"
    assert select_encoding("br;q=0, gzip", {"br", "gzip"}) == "gzip"
    assert select_encoding("br", {"gzip"}) is None


@pytest.mark.unit
def test_cache_control_only_treats_hashed_assets_as_immutable():
    assert cache_control_for("assets/js/index-AbCd1234.js") == IMMUTABLE_CACHE_CONTROL
    assert cache_control_for("assets/js/index.js") == NO_CACHE_CONTROL
    assert cache_control_for("index.html") == NO_CACHE_CONTROL


@pytest.mark.unit
def test_long_human_readable_name_is_not_cached_immutably(client: TestClient, dist: Path):
    (dist / "assets" / "my-long-name.js").write_text("console.log('x');", encoding="utf-8")

    response = client.get("/assets/my-long-name.js", headers={"Accept-Encoding": "identity"})

    assert response.status_code == 200
    assert response.headers["cache-control"] == NO_CACHE_CONTROL


@pytest.mark.unit
@pytest.mark.parametrize(
    "relative_path",
    [
        "assets/../../etc/passwd",
        "/etc/passwd",
        "assets\\..\\..\\etc\\passwd",
        "assets/\x00.js",
        "assets/%2e%2e/secret.txt",
        "assets/%2fetc%2fpasswd",
    ],
)
def test_serve_static_file_rejects_unsafe_paths(dist: Path, relative_path: str):
    with pytest.raises(HTTPException) as exc_info:
        _serve_static_file(dist.resolve(), relative_path, None)  # type: ignore[arg-type]

    assert exc_info.value.status_code == 404


@pytest.mark.unit
@pytest.mark.parametrize(
    "url",
    [
        "/assets/%2e%2e/%2e%2e/etc/passwd",
        "/assets/..%2f..%2fetc%2fpasswd",
        "/assets/%2fetc%2fpasswd",
        "/assets/foo%5cbar.js",
    ],
)
def test_encoded_traversal_is_rejected_by_the_asset_route(client: TestClient, url: str):
    with patch("app.services.frontend_static.FileResponse") as file_response:
        response = client.get(url)

    assert response.status_code == 404
    file_response.assert_not_called()


@pytest.mark.unit
def test_symlink_inside_dist_pointing_outside_is_rejected(
    client: TestClient, dist: Path, tmp_path: Path
):
    secret = tmp_path / "secret.txt"
    secret.write_text("TOP SECRET", encoding="utf-8")
    link = dist / "assets" / "link-AbCd1234.js"
    try:
        link.symlink_to(secret)
    except (OSError, NotImplementedError):
        pytest.skip("symlinks are not available on this platform")

    with patch("app.services.frontend_static.FileResponse") as file_response:
        response = client.get("/assets/link-AbCd1234.js")

    assert response.status_code == 404
    assert "TOP SECRET" not in response.text
    file_response.assert_not_called()


@pytest.mark.unit
def test_compressed_sibling_symlink_outside_dist_is_rejected(
    client: TestClient, dist: Path, tmp_path: Path
):
    secret = tmp_path / "secret.br"
    secret.write_bytes(b"TOP SECRET")
    sibling = dist / "assets" / f"{ASSET_NAME}.br"
    sibling.unlink()
    try:
        sibling.symlink_to(secret)
    except (OSError, NotImplementedError):
        pytest.skip("symlinks are not available on this platform")

    with patch("app.services.frontend_static.FileResponse") as file_response:
        response = client.get(ASSET_PATH, headers={"Accept-Encoding": "br"})

    assert response.status_code == 404
    assert b"TOP SECRET" not in response.content
    file_response.assert_not_called()


@pytest.mark.unit
@pytest.mark.parametrize(
    "path",
    [
        f"{ASSET_PATH}.br",
        f"{ASSET_PATH}.gz",
        "/sw.js.br",
        "/favicon.svg.gz",
        "/site.webmanifest.br",
    ],
)
def test_compressed_siblings_are_never_served_directly(client: TestClient, path: str):
    with patch("app.services.frontend_static.FileResponse") as file_response:
        response = client.get(path)

    assert response.status_code == 404
    file_response.assert_not_called()


@pytest.mark.unit
def test_uppercase_encoding_tokens_and_q_values_are_honoured(client: TestClient):
    response = client.get(ASSET_PATH, headers={"Accept-Encoding": "BR;q=1, gzip;q=0"})

    assert response.headers["content-encoding"] == "br"
    assert response.content == BROTLI

    response = client.get(ASSET_PATH, headers={"Accept-Encoding": "GZIP"})
    assert response.headers["content-encoding"] == "gzip"
    assert response.content == RAW


@pytest.mark.unit
def test_wildcard_accept_encoding_uses_brotli(client: TestClient):
    response = client.get(ASSET_PATH, headers={"Accept-Encoding": "*"})

    assert response.headers["content-encoding"] == "br"
    assert response.content == BROTLI


@pytest.mark.unit
def test_head_request_returns_headers_without_a_body(client: TestClient):
    response = client.head(ASSET_PATH, headers={"Accept-Encoding": "br"})

    assert response.status_code == 200
    assert response.headers["content-encoding"] == "br"
    assert response.headers["content-type"].startswith("text/javascript")
    assert int(response.headers["content-length"]) == len(BROTLI)
    assert response.content == b""


@pytest.mark.unit
def test_share_page_is_served_from_index_with_no_store(client: TestClient):
    response = client.get("/share/abc123", headers={"Accept-Encoding": "identity"})

    assert response.status_code == 200
    assert "<div id=app>" in response.text
    assert response.headers["cache-control"] == "no-store"
