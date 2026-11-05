"""Display check runs: admin start/stop, agent reports, config job (calvin-29ws)."""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

KIOSK = "kitchen-3f9a2c"
BASE = f"/api/kiosks/{KIOSK}/display-check"


@pytest.fixture
def kiosk(test_client: TestClient) -> str:
    """Register the kiosk the way the agent does: with a config poll."""
    assert test_client.get(f"/api/kiosks/{KIOSK}/config").status_code == 200
    return KIOSK


def _start(client: TestClient, step: str = "detect", **extra):
    return client.post(f"{BASE}/start", json={"step": step, **extra})


def _report(client: TestClient, run_id: str, status: str = "running", **extra):
    payload = {"id": run_id, "step": "detect", "status": status, **extra}
    return client.post(BASE, json=payload)


def _config(client: TestClient) -> dict:
    return client.get(f"/api/kiosks/{KIOSK}/config").json()


@pytest.mark.integration
@pytest.mark.no_admin_login
def test_start_and_stop_need_admin(test_client: TestClient, kiosk):
    assert _start(test_client).status_code == 401
    assert test_client.post(f"{BASE}/stop").status_code == 401
    assert test_client.post(f"{BASE}/save-limit").status_code == 401


@pytest.mark.integration
def test_start_unknown_kiosk_is_404(test_client: TestClient):
    resp = test_client.post("/api/kiosks/nobody-here/display-check/start", json={"step": "detect"})
    assert resp.status_code == 404


@pytest.mark.integration
def test_start_validates_the_request(test_client: TestClient, kiosk):
    assert _start(test_client, "explode").status_code == 422
    assert _start(test_client, "conversion", value=101).status_code == 422
    assert _start(test_client, "detect", surprise=1).status_code == 422
    assert test_client.get(BASE).json() == {"run": None}


@pytest.mark.integration
def test_start_offers_the_job_on_the_config_poll(test_client: TestClient, kiosk):
    before = test_client.get(f"/api/kiosks/{KIOSK}/config")
    assert "displayCheck" not in before.json()

    run = _start(test_client, "conversion", value=19, brightness=15).json()
    assert run["status"] == "requested"
    assert run["active"] is True
    assert run["action"] == "start"

    after = test_client.get(f"/api/kiosks/{KIOSK}/config")
    job = after.json()["displayCheck"]
    assert job == {
        "id": run["id"],
        "step": "conversion",
        "action": "start",
        "value": 19,
        "brightness": 15,
    }
    assert after.json()["display_check"] == job
    # The ETag covers the job (calvin-fufd): the old tag must not give a 304.
    again = test_client.get(
        f"/api/kiosks/{KIOSK}/config", headers={"If-None-Match": before.headers["ETag"]}
    )
    assert again.status_code == 200
    assert after.headers["ETag"] != before.headers["ETag"]


@pytest.mark.integration
def test_only_one_active_run_per_kiosk(test_client: TestClient, kiosk):
    first = _start(test_client).json()
    second = _start(test_client, "write")
    assert second.status_code == 409
    detail = second.json()["detail"]
    assert detail["code"] == "display_check_active"
    assert detail["run"]["id"] == first["id"]


@pytest.mark.integration
def test_agent_reports_update_the_run_and_a_terminal_status_ends_it(test_client: TestClient, kiosk):
    run = _start(test_client).json()
    log = [{"at": "2026-11-05T10:00:00+00:00", "level": 19, "note": "found NOMAD TOUCH"}]

    running = _report(
        test_client, run["id"], level=19, log=log, startedAt="2026-11-05T10:00:00+00:00"
    )
    assert running.status_code == 200
    assert running.json() == {"accepted": True}
    seen = test_client.get(BASE).json()["run"]
    assert seen["status"] == "running"
    assert seen["active"] is True
    assert seen["level"] == 19
    assert seen["log"] == log
    assert seen["startedAt"] == "2026-11-05T10:00:00+00:00"
    assert seen["finishedAt"] is None  # the agent sends finishedAt on every report
    assert seen["updatedAt"]
    assert "displayCheck" in _config(test_client)

    done = _report(
        test_client,
        run["id"],
        "done",
        level=19,
        info={"bus": 2, "model": "NOMAD TOUCH"},
        detail="NOMAD TOUCH",
        finishedAt="2026-11-05T10:00:05+00:00",
    )
    assert done.status_code == 200
    seen = test_client.get(BASE).json()["run"]
    assert seen["status"] == "done"
    assert seen["active"] is False
    assert seen["info"] == {"bus": 2, "model": "NOMAD TOUCH"}
    assert seen["detail"] == "NOMAD TOUCH"
    assert seen["finishedAt"] == "2026-11-05T10:00:05+00:00"
    assert "displayCheck" not in _config(test_client)
    assert "display_check" not in _config(test_client)
    assert _start(test_client, "write").status_code == 200  # the next step can start


@pytest.mark.integration
def test_a_report_for_another_run_is_dropped(test_client: TestClient, kiosk):
    assert _report(test_client, "never-started").status_code == 409
    run = _start(test_client).json()
    assert _report(test_client, "an-old-run", "done").status_code == 409
    assert test_client.get(BASE).json()["run"]["id"] == run["id"]
    assert test_client.get(BASE).json()["run"]["status"] == "requested"


@pytest.mark.integration
def test_reports_are_validated(test_client: TestClient, kiosk):
    run = _start(test_client).json()
    assert _report(test_client, run["id"], "exploded").status_code == 422
    assert _report(test_client, run["id"], level=101).status_code == 422
    assert _report(test_client, run["id"], surprise=1).status_code == 422
    assert test_client.get("/api/kiosks/nobody-here/display-check").status_code == 404
    assert test_client.post("/api/kiosks/nobody-here/display-check", json={}).status_code == 422


@pytest.mark.integration
def test_stop_asks_the_agent_to_finish_and_the_report_ends_it(test_client: TestClient, kiosk):
    assert test_client.post(f"{BASE}/stop").status_code == 404  # nothing to stop

    run = _start(test_client, "limit", brightness=19).json()
    _report(test_client, run["id"], level=22)
    stopped = test_client.post(f"{BASE}/stop")
    assert stopped.status_code == 200
    assert stopped.json()["action"] == "stop"
    assert stopped.json()["active"] is True  # still active until the agent reports
    assert _config(test_client)["displayCheck"]["action"] == "stop"
    assert _config(test_client)["displayCheck"]["id"] == run["id"]

    assert _report(test_client, run["id"], "stopped", level=19).status_code == 200
    seen = test_client.get(BASE).json()["run"]
    assert seen["status"] == "stopped"
    assert seen["active"] is False
    assert "displayCheck" not in _config(test_client)


@pytest.mark.integration
def test_asleep_is_surfaced_and_not_retried(test_client: TestClient, kiosk):
    run = _start(test_client, "write").json()
    _report(test_client, run["id"], "asleep", level=0, detail="the panel is asleep")
    seen = test_client.get(BASE).json()["run"]
    assert seen["status"] == "asleep"
    assert seen["active"] is False
    assert seen["detail"] == "the panel is asleep"
    assert "displayCheck" not in _config(test_client)


@pytest.mark.integration
def test_a_run_expires_after_ten_minutes(test_client: TestClient, kiosk, monkeypatch):
    from app.services import display_check

    run = _start(test_client).json()
    real_now = display_check.utcnow()
    monkeypatch.setattr(
        display_check, "utcnow", lambda: real_now + timedelta(minutes=10, seconds=5)
    )

    seen = test_client.get(BASE).json()["run"]
    assert seen["status"] == "timeout"
    assert seen["active"] is False
    assert "displayCheck" not in _config(test_client)
    # A rebooted agent finishing safely after the expiry is still heard.
    assert _report(test_client, run["id"], "interrupted", level=0).status_code == 200
    assert test_client.get(BASE).json()["run"]["status"] == "interrupted"
    assert _start(test_client).status_code == 200


@pytest.mark.integration
def test_a_new_start_after_expiry_replaces_the_old_run(test_client: TestClient, kiosk, monkeypatch):
    from app.services import display_check

    old = _start(test_client).json()
    real_now = display_check.utcnow()
    monkeypatch.setattr(display_check, "utcnow", lambda: real_now + timedelta(minutes=11))
    new = _start(test_client, "write")
    assert new.status_code == 200
    assert new.json()["id"] != old["id"]
    assert _report(test_client, old["id"], "done").status_code == 409


@pytest.mark.integration
def test_a_found_limit_is_saved_only_by_the_admin(test_client: TestClient, kiosk):
    assert test_client.post(f"{BASE}/save-limit").status_code == 409  # no run

    run = _start(test_client, "limit", brightness=19).json()
    _report(test_client, run["id"], "done", level=19, limit=26, detail="limit found: 26")
    # Not saved automatically.
    overrides = test_client.get(f"/api/kiosks/{KIOSK}/overrides").json()["overrides"]
    assert "brightnessLimit" not in overrides

    saved = test_client.post(f"{BASE}/save-limit")
    assert saved.status_code == 200, saved.text
    assert saved.json()["brightnessLimit"] == 26
    assert saved.json()["overrides"]["brightnessLimit"] == 26
    assert _config(test_client)["brightnessLimit"] == 26
    assert _config(test_client)["brightness_limit"] == 26


@pytest.mark.integration
def test_save_limit_needs_a_finished_limit_run_with_a_limit(test_client: TestClient, kiosk):
    run = _start(test_client, "limit").json()
    assert test_client.post(f"{BASE}/save-limit").status_code == 409  # still running
    _report(test_client, run["id"], "done", level=100, detail="reached 100 with no fault")
    refused = test_client.post(f"{BASE}/save-limit")
    assert refused.status_code == 409
    assert refused.json()["detail"]["code"] == "no_limit"

    other = _start(test_client, "detect").json()
    _report(test_client, other["id"], "done", limit=30)
    assert test_client.post(f"{BASE}/save-limit").status_code == 409  # not a limit step
