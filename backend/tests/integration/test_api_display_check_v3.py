"""Calibration v3 contract: read step, no limit step, brightnessFloor (calvin-idts)."""

import pytest
from fastapi.testclient import TestClient

from tests.integration.test_api_display_check import (
    BASE,
    KIOSK,
    _config,
    _report,
    _start,
    _step,
)

OVERRIDES = f"/api/kiosks/{KIOSK}/overrides"


@pytest.fixture
def kiosk(test_client: TestClient) -> str:
    """Register the kiosk the way the agent does: with a config poll."""
    assert test_client.get(f"/api/kiosks/{KIOSK}/config").status_code == 200
    return KIOSK


@pytest.mark.integration
def test_the_limit_step_is_gone(test_client: TestClient, kiosk):
    assert _start(test_client, "limit").status_code == 422
    _start(test_client, "detect")
    assert _step(test_client, "limit").status_code == 422


@pytest.mark.integration
def test_read_is_offered_any_number_of_times_after_detect(test_client: TestClient, kiosk):
    run = _start(test_client, "detect").json()
    for _ in range(3):
        stepped = _step(test_client, "read")
        assert stepped.status_code == 200, stepped.text
        assert _config(test_client)["displayCheck"]["step"] == "read"
        assert _config(test_client)["displayCheck"]["id"] == run["id"]
        _step(test_client, "detect")


@pytest.mark.integration
def test_a_read_result_keeps_the_level_and_the_last_write(test_client: TestClient, kiosk):
    run = _start(test_client, "detect").json()
    _step(test_client, "read")
    _report(test_client, run["id"], "done", level=61, lastWrite=5, detail="read 61")
    result = test_client.get(BASE).json()["run"]["steps"]["read"]
    assert result["status"] == "done"
    assert result["level"] == 61
    assert result["lastWrite"] == 5


@pytest.mark.integration
def test_a_read_without_a_last_write_stores_null(test_client: TestClient, kiosk):
    run = _start(test_client, "detect").json()
    _step(test_client, "read")
    _report(test_client, run["id"], "done", level=61)
    assert test_client.get(BASE).json()["run"]["steps"]["read"]["lastWrite"] is None


@pytest.mark.integration
def test_a_failed_read_is_recorded_with_its_detail(test_client: TestClient, kiosk):
    run = _start(test_client, "detect").json()
    _step(test_client, "read")
    _report(test_client, run["id"], "error", detail="the display did not answer")
    result = test_client.get(BASE).json()["run"]["steps"]["read"]
    assert result["status"] == "error"
    assert result["detail"] == "the display did not answer"


@pytest.mark.integration
def test_a_read_fault_is_power_trouble(test_client: TestClient, kiosk):
    run = _start(test_client, "detect").json()
    _step(test_client, "read")
    fault = {"step": "read", "level": 12, "kind": "touch controller reset", "lastGood": 12}
    _report(test_client, run["id"], "error", reason="power_trouble", fault=fault)
    listed = test_client.get("/api/kiosks").json()["kiosks"]
    trouble = next(k for k in listed if k["id"] == KIOSK)["displayCheck"]["powerTrouble"]
    assert trouble["step"] == "read"
    assert trouble["kind"] == "touch controller reset"


@pytest.mark.integration
def test_a_limit_step_report_no_longer_saves_a_limit(test_client: TestClient, kiosk):
    run = _start(test_client, "detect").json()
    _report(test_client, run["id"], "done", limit=30)
    assert test_client.post(f"{BASE}/save-limit").status_code == 409


@pytest.mark.integration
def test_the_floor_is_a_per_screen_key(test_client: TestClient, kiosk):
    ok = test_client.put(OVERRIDES, json={"overrides": {"brightnessFloor": 3}})
    assert ok.status_code == 200, ok.text
    assert _config(test_client)["brightnessFloor"] == 3
    for bad in (-1, 101, 2.5, "3", True):
        resp = test_client.put(OVERRIDES, json={"overrides": {"brightnessFloor": bad}})
        assert resp.status_code in (400, 422), f"{bad!r} accepted"


@pytest.mark.integration
def test_the_floor_may_not_exceed_the_limit(test_client: TestClient, kiosk):
    refused = test_client.put(
        OVERRIDES, json={"overrides": {"brightnessFloor": 30, "brightnessLimit": 20}}
    )
    assert refused.status_code == 422
    equal = test_client.put(
        OVERRIDES, json={"overrides": {"brightnessFloor": 20, "brightnessLimit": 20}}
    )
    assert equal.status_code == 200


@pytest.mark.integration
def test_a_patch_is_checked_against_the_saved_limit(test_client: TestClient, kiosk):
    test_client.put(OVERRIDES, json={"overrides": {"brightnessLimit": 20}})
    assert (
        test_client.patch(OVERRIDES, json={"overrides": {"brightnessFloor": 21}}).status_code == 422
    )
    assert (
        test_client.patch(OVERRIDES, json={"overrides": {"brightnessFloor": 20}}).status_code == 200
    )
    # Lowering the limit under a saved floor is refused too.
    assert (
        test_client.patch(OVERRIDES, json={"overrides": {"brightnessLimit": 10}}).status_code == 422
    )


@pytest.mark.integration
def test_the_household_config_refuses_the_floor_like_the_other_brightness_keys(
    test_client: TestClient,
):
    resp = test_client.post("/api/config", json={"brightnessFloor": 3})
    assert resp.status_code == 422


@pytest.mark.integration
def test_the_floor_is_checked_against_the_effective_limit(
    test_client: TestClient,
    kiosk,
    monkeypatch,
):
    """A limit that only the household layer carries still bounds the floor."""
    from app.api.routes import kiosks as routes

    async def household():
        return {"brightness_limit": 20}

    monkeypatch.setattr(routes, "build_global_config", household)
    over = test_client.patch(OVERRIDES, json={"overrides": {"brightnessFloor": 21}})
    assert over.status_code == 422
    assert (
        test_client.put(OVERRIDES, json={"overrides": {"brightnessFloor": 21}}).status_code == 422
    )
    assert (
        test_client.patch(OVERRIDES, json={"overrides": {"brightnessFloor": 20}}).status_code == 200
    )


@pytest.mark.integration
def test_saving_a_fault_limit_clamps_a_floor_above_it(test_client: TestClient, kiosk):
    test_client.put(OVERRIDES, json={"overrides": {"brightnessFloor": 12, "brightnessLimit": 40}})
    run = _start(test_client, "write").json()
    fault = {"step": "write", "level": 12, "kind": "under-voltage", "lastGood": 14, "alsoAt": []}
    _report(test_client, run["id"], "error", reason="power_trouble", fault=fault)
    saved = test_client.post(f"{BASE}/save-limit")
    assert saved.status_code == 200, saved.text
    assert saved.json()["brightnessLimit"] == 10
    assert saved.json()["overrides"]["brightnessFloor"] == 10  # clamped down to the new limit


@pytest.mark.integration
def test_every_step_request_bumps_the_runs_seq(test_client: TestClient, kiosk):
    run = _start(test_client, "detect").json()
    assert run["seq"] == 0
    assert _config(test_client)["displayCheck"]["seq"] == 0
    for expected in (1, 2, 3):
        stepped = _step(test_client, "read").json()  # the very same step again
        assert stepped["seq"] == expected
        assert _config(test_client)["displayCheck"]["seq"] == expected
    assert test_client.get(BASE).json()["run"]["seq"] == 3


@pytest.mark.integration
def test_a_result_carries_the_seq_the_agent_echoed(test_client: TestClient, kiosk):
    run = _start(test_client, "detect").json()
    _step(test_client, "read")
    _report(test_client, run["id"], "done", level=61, seq=1)
    assert test_client.get(BASE).json()["run"]["steps"]["read"]["seq"] == 1
    _step(test_client, "read")
    _report(test_client, run["id"], "done", level=62, seq=2)
    result = test_client.get(BASE).json()["run"]["steps"]["read"]
    assert (result["level"], result["seq"]) == (62, 2)


@pytest.mark.integration
def test_a_report_without_seq_stores_null(test_client: TestClient, kiosk):
    run = _start(test_client, "detect").json()
    _report(test_client, run["id"], "done", level=19)
    assert test_client.get(BASE).json()["run"]["steps"]["detect"]["seq"] is None
