"""Serving the built frontend: pre-compressed assets, cache headers, SPA fallback."""

import gzip
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.services.frontend_static import (
    IMMUTABLE_CACHE_CONTROL,
    NO_CACHE_CONTROL,
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
    assert response.content == BROTLI
    assert int(response.headers["content-length"]) == len(BROTLI)


@pytest.mark.unit
def test_gzip_is_served_when_only_gzip_is_accepted(client: TestClient):
    response = client.get(ASSET_PATH, headers={"Accept-Encoding": "gzip"})

    assert response.status_code == 200
    assert response.headers["content-encoding"] == "gzip"
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
