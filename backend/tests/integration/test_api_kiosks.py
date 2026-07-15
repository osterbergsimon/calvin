"""Integration tests for the kiosk registry."""

from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

# Root of the Calvin checkout — used to give bundle tests a real repo_dir.
_REPO_ROOT = Path(__file__).parent.parent.parent.parent


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
    # ETag now incorporates deviceConfigVersion + agentAvailableVersion + updateRequested flag
    assert body["deviceConfigVersion"] in resp.headers.get("ETag", "")

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


@pytest.mark.integration
def test_overrides_accepts_content_assignment(test_client: TestClient):
    put = test_client.put(
        "/api/kiosks/kroom-1/overrides",
        json={"overrides": {"availableScreens": ["screen-home"], "defaultScreenId": "screen-home"}},
    )
    assert put.status_code == 200
    eff = test_client.get("/api/kiosks/kroom-1/config").json()
    assert eff["availableScreens"] == ["screen-home"]
    assert eff["defaultScreenId"] == "screen-home"


@pytest.mark.integration
def test_overrides_rejects_bad_available_screens_type(test_client: TestClient):
    resp = test_client.put(
        "/api/kiosks/kroom-2/overrides",
        json={"overrides": {"availableScreens": "not-a-list"}},
    )
    assert resp.status_code == 400


@pytest.mark.integration
def test_agent_manifest_served(test_client: TestClient):
    from app.services import kiosk_bundle

    with patch.object(kiosk_bundle.settings, "repo_dir", _REPO_ROOT):
        r = test_client.get("/api/kiosks/agent/manifest")
    assert r.status_code == 200
    body = r.json()
    assert len(body["version"]) == 16
    assert body["min_python"] == "3.9"
    assert any(f["name"] == "calvin_display_agent.py" for f in body["files"])


@pytest.mark.integration
def test_agent_file_served_and_allowlisted(test_client: TestClient):
    from app.services import kiosk_bundle

    with patch.object(kiosk_bundle.settings, "repo_dir", _REPO_ROOT):
        r = test_client.get("/api/kiosks/agent/files/calvin-x.service")
        assert r.status_code == 200
        assert r.content  # non-empty
        assert test_client.get("/api/kiosks/agent/files/..%2F..%2Fetc%2Fpasswd").status_code == 404
        assert test_client.get("/api/kiosks/agent/files/nope.txt").status_code == 404


@pytest.mark.integration
def test_config_reports_available_version_and_flag(test_client: TestClient):
    from app.services import kiosk_bundle

    with patch.object(kiosk_bundle.settings, "repo_dir", _REPO_ROOT):
        # first contact registers the kiosk + records its running version
        test_client.get("/api/kiosks/k-upd/config?khost=pi&kagent=oldver&kstat=ok")
        assert test_client.post("/api/kiosks/k-upd/update").json()["requested"] is True
        body = test_client.get("/api/kiosks/k-upd/config").json()
    assert len(body["agentAvailableVersion"]) == 16
    assert body["agentUpdateRequested"] is True
    assert "_agentUpdateRequested" not in body  # internal key never leaks


@pytest.mark.integration
def test_post_update_unknown_kiosk_404(test_client: TestClient):
    assert test_client.post("/api/kiosks/never-seen/update").status_code == 404
