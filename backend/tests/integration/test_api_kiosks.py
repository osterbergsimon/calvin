"""Integration tests for the kiosk registry."""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient


@pytest.mark.integration
def test_kiosks_table_exists_and_lists_empty(test_client: TestClient):
    """The kiosks registry starts empty and is queryable (table created by migration)."""
    response = test_client.get("/api/kiosks")
    assert response.status_code == 200
    assert response.json() == {"kiosks": []}


@pytest.mark.integration
def test_effective_config_merges_overrides_and_records(test_client: TestClient):
    test_client.put(
        "/api/kiosks/hallway-3f9a2c/overrides",
        json={"overrides": {"orientation": "portrait"}},
    )
    resp = test_client.get("/api/kiosks/hallway-3f9a2c/config?khost=pi-hallway")
    assert resp.status_code == 200
    body = resp.json()
    assert body["orientation"] == "portrait"  # override applied
    assert "timeFormat" in body  # global defaults present
    assert "deviceConfigVersion" in body
    assert resp.headers.get("ETag") == body["deviceConfigVersion"]

    kiosks = test_client.get("/api/kiosks").json()["kiosks"]
    assert any(k["id"] == "hallway-3f9a2c" and k["hostname"] == "pi-hallway" for k in kiosks)


@pytest.mark.integration
def test_effective_config_unknown_kiosk_is_global(test_client: TestClient):
    resp = test_client.get("/api/kiosks/brand-new-abc123/config")
    assert resp.status_code == 200
    assert resp.json()["orientation"] == "landscape"  # defaulted global


@pytest.mark.integration
def test_effective_config_if_none_match_304(test_client: TestClient):
    first = test_client.get("/api/kiosks/etagtest-1/config")
    etag = first.headers["ETag"]
    again = test_client.get("/api/kiosks/etagtest-1/config", headers={"If-None-Match": etag})
    assert again.status_code == 304
    assert again.content == b""


@pytest.mark.integration
def test_effective_config_bad_id_400(test_client: TestClient):
    assert test_client.get("/api/kiosks/bad id!/config").status_code == 400


@pytest.mark.integration
def test_effective_config_best_effort_recording(test_client: TestClient):
    # A recording failure must not break config delivery.
    with patch(
        "app.api.routes.kiosks.kiosk_registry.record_kiosk",
        side_effect=RuntimeError("db down"),
    ):
        resp = test_client.get("/api/kiosks/besteffort-1/config")
    assert resp.status_code == 200
    assert "orientation" in resp.json()


@pytest.mark.integration
def test_overrides_put_then_get_roundtrip(test_client: TestClient):
    put = test_client.put(
        "/api/kiosks/kitchen-1/overrides",
        json={"overrides": {"orientation": "portrait", "timeFormat": "12h"}},
    )
    assert put.status_code == 200
    got = test_client.get("/api/kiosks/kitchen-1/overrides").json()
    assert got == {"id": "kitchen-1", "overrides": {"orientation": "portrait", "timeFormat": "12h"}}


@pytest.mark.integration
def test_overrides_put_replaces_and_clears(test_client: TestClient):
    test_client.put("/api/kiosks/k2/overrides", json={"overrides": {"orientation": "portrait"}})
    test_client.put("/api/kiosks/k2/overrides", json={"overrides": {"themeMode": "dark"}})
    assert test_client.get("/api/kiosks/k2/overrides").json()["overrides"] == {"themeMode": "dark"}
    test_client.put("/api/kiosks/k2/overrides", json={"overrides": {}})
    assert test_client.get("/api/kiosks/k2/overrides").json()["overrides"] == {}


@pytest.mark.integration
def test_overrides_get_unknown_404(test_client: TestClient):
    assert test_client.get("/api/kiosks/ghost-1/overrides").status_code == 404


@pytest.mark.integration
def test_overrides_put_bad_id_400(test_client: TestClient):
    assert (
        test_client.put("/api/kiosks/bad id/overrides", json={"overrides": {}}).status_code == 400
    )


@pytest.mark.integration
def test_overrides_put_oversized_rejected(test_client: TestClient):
    big = {"x": "a" * 70000}
    assert test_client.put("/api/kiosks/k3/overrides", json={"overrides": big}).status_code == 400


@pytest.mark.integration
def test_overrides_put_type_invalid_known_key_400(test_client: TestClient):
    """A type-invalid value for a typed ConfigUpdate field must return 400, not 500."""
    resp = test_client.put(
        "/api/kiosks/k4/overrides",
        json={"overrides": {"weekendDays": "nope"}},
    )
    assert resp.status_code == 400


@pytest.mark.integration
def test_overrides_get_bad_id_400(test_client: TestClient):
    """GET /overrides with a shape-invalid kiosk id must return 400."""
    assert test_client.get("/api/kiosks/bad id/overrides").status_code == 400
