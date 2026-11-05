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


def _step(client: TestClient, step: str, **extra):
    return client.post(f"{BASE}/step", json={"step": step, **extra})


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
    assert test_client.get(BASE).json()["run"] is None


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
def test_a_step_done_report_is_a_result_not_the_end_of_the_run(test_client: TestClient, kiosk):
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
    assert seen["status"] == "running"  # the session goes on
    assert seen["active"] is True
    assert seen["finishedAt"] is None
    assert seen["steps"]["detect"] == {
        "status": "done",
        "value": None,
        "level": 19,
        "limit": None,
        "detail": "NOMAD TOUCH",
        "info": {"bus": 2, "model": "NOMAD TOUCH"},
        "finishedAt": "2026-11-05T10:00:05+00:00",
    }
    assert _config(test_client)["displayCheck"]["id"] == run["id"]
    assert _start(test_client, "write").status_code == 409  # still one run per kiosk


@pytest.mark.integration
def test_stop_then_done_ends_the_run_and_clears_the_job(test_client: TestClient, kiosk):
    run = _start(test_client, "conversion", value=19).json()
    _report(test_client, run["id"], level=19)
    _report(test_client, run["id"], "done", level=19)
    test_client.post(f"{BASE}/stop")
    assert _config(test_client)["displayCheck"]["action"] == "stop"
    # The agent's _finish reports done once the job says stop (or is gone).
    assert _report(test_client, run["id"], "done", level=15).status_code == 200
    seen = test_client.get(BASE).json()["run"]
    assert seen["status"] == "done"
    assert seen["active"] is False
    assert seen["finishedAt"]
    assert "displayCheck" not in _config(test_client)
    assert _start(test_client, "write").status_code == 200


@pytest.mark.integration
def test_conversion_stays_offered_at_its_value_until_stopped(test_client: TestClient, kiosk):
    run = _start(test_client, "conversion", value=19).json()
    for _ in range(3):
        _report(test_client, run["id"], level=19)
        _report(test_client, run["id"], "done", level=19, detail="set to 19")
        job = _config(test_client)["displayCheck"]
        assert (job["id"], job["step"], job["value"], job["action"]) == (
            run["id"],
            "conversion",
            19,
            "start",
        )


@pytest.mark.integration
def test_step_change_re_offers_the_job_with_the_new_step_and_value(test_client: TestClient, kiosk):
    run = _start(test_client, "detect", brightness=15).json()
    _report(test_client, run["id"], "done", info={"model": "NOMAD TOUCH"})

    changed = _step(test_client, "conversion", value=9)
    assert changed.status_code == 200, changed.text
    assert changed.json()["id"] == run["id"]
    assert (changed.json()["step"], changed.json()["value"]) == ("conversion", 9)
    assert _config(test_client)["displayCheck"] == {
        "id": run["id"],
        "step": "conversion",
        "action": "start",
        "value": 9,
        "brightness": 15,
    }
    # A step with no value drops the old one.
    assert _step(test_client, "write").json()["value"] is None
    assert _config(test_client)["displayCheck"]["value"] is None
    # The results of earlier steps stay in the run.
    assert test_client.get(BASE).json()["run"]["steps"]["detect"]["status"] == "done"


@pytest.mark.integration
def test_step_results_are_stored_per_step_for_the_step_that_was_offered(
    test_client: TestClient, kiosk
):
    run = _start(test_client, "detect").json()
    # The agent's reports carry the step of its FIRST job; the backend files each
    # result under the step it is currently offering.
    _report(test_client, run["id"], "done", step="detect", info={"model": "M"})
    _step(test_client, "limit")
    _report(test_client, run["id"], "done", step="detect", level=19, limit=26)
    steps = test_client.get(BASE).json()["run"]["steps"]
    assert steps["detect"]["info"] == {"model": "M"}
    assert steps["limit"]["limit"] == 26
    assert _findings(test_client)["limit"] == 26
    assert _findings(test_client)["model"] == "M"


@pytest.mark.integration
def test_step_needs_admin_an_active_run_and_a_sane_request(test_client: TestClient, kiosk):
    assert _step(test_client, "write").status_code == 404  # nothing active
    run = _start(test_client, "detect").json()
    assert _step(test_client, "explode").status_code == 422
    assert _step(test_client, "write", value=101).status_code == 422
    assert test_client.post(f"{BASE}/step", json={"step": "write", "x": 1}).status_code == 422
    test_client.post(f"{BASE}/stop")
    stopping = _step(test_client, "write")
    assert stopping.status_code == 409  # a stop is already on its way
    assert stopping.json()["detail"]["code"] == "display_check_stopping"
    _report(test_client, run["id"], "stopped")
    assert _step(test_client, "write").status_code == 404  # ended


@pytest.mark.integration
@pytest.mark.no_admin_login
def test_step_change_needs_admin(test_client: TestClient, kiosk):
    assert _step(test_client, "write").status_code == 401


@pytest.mark.integration
def test_step_change_respects_the_limit_cap(test_client: TestClient, kiosk):
    _set_overrides(test_client, {"brightnessLimit": 26})
    _start(test_client, "detect")
    refused = _step(test_client, "conversion", value=23)
    assert refused.status_code == 422
    assert refused.json()["detail"]["max"] == 22
    assert _step(test_client, "conversion", value=22).status_code == 200


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
    assert _report(test_client, run["id"], surprise=1).status_code == 200  # ignored
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
def test_save_limit_needs_a_limit_step_result_with_a_limit(test_client: TestClient, kiosk):
    run = _start(test_client, "limit").json()
    assert test_client.post(f"{BASE}/save-limit").status_code == 409  # no result yet
    _report(test_client, run["id"], "done", level=100, detail="reached 100 with no fault")
    refused = test_client.post(f"{BASE}/save-limit")
    assert refused.status_code == 409
    assert refused.json()["detail"]["code"] == "no_limit"

    _step(test_client, "detect")
    _report(test_client, run["id"], "done", limit=30)
    assert test_client.post(f"{BASE}/save-limit").status_code == 409  # not a limit step


EMPTY_FINDINGS = {
    "checkedAt": None,
    "ddc": None,
    "writes": None,
    "model": None,
    "connector": None,
    "vcpVersion": None,
    "limit": None,
}


def _findings(client: TestClient) -> dict:
    listed = client.get("/api/kiosks").json()["kiosks"]
    return next(k for k in listed if k["id"] == KIOSK)["displayCheck"]


@pytest.mark.integration
def test_findings_start_empty(test_client: TestClient, kiosk):
    assert _findings(test_client) == EMPTY_FINDINGS
    assert test_client.get(BASE).json()["findings"] == EMPTY_FINDINGS


@pytest.mark.integration
def test_findings_survive_later_steps(test_client: TestClient, kiosk):
    detect = _start(test_client, "detect").json()
    _report(
        test_client,
        detect["id"],
        "done",
        info={
            "bus": 2,
            "model": "NOMAD TOUCH",
            "connector": "card0-HDMI-A-1",
            "vcp_version": "2.1",
        },
    )
    found = _findings(test_client)
    assert found["ddc"] is True
    assert found["model"] == "NOMAD TOUCH"
    assert found["connector"] == "card0-HDMI-A-1"
    assert found["vcpVersion"] == "2.1"
    assert found["writes"] is None
    assert found["checkedAt"]

    _step(test_client, "write")
    _report(test_client, detect["id"], "done", level=19)
    assert _findings(test_client)["writes"] is True

    _step(test_client, "limit")
    _report(test_client, detect["id"], "done", limit=26)
    found = _findings(test_client)
    assert found["limit"] == 26
    # The current step is now the limit step, but the earlier verdicts stay.
    assert (found["ddc"], found["writes"], found["model"]) == (True, True, "NOMAD TOUCH")
    assert test_client.get(BASE).json()["findings"] == found


@pytest.mark.integration
def test_failed_runs_record_a_negative_verdict(test_client: TestClient, kiosk):
    detect = _start(test_client, "detect").json()
    _report(test_client, detect["id"], "error", detail="no display answered DDC/CI")
    assert _findings(test_client)["ddc"] is False

    write = _start(test_client, "write").json()
    _report(test_client, write["id"], "error")
    assert _findings(test_client)["writes"] is False


@pytest.mark.integration
def test_unfinished_runs_do_not_touch_findings(test_client: TestClient, kiosk):
    run = _start(test_client, "write").json()
    _report(test_client, run["id"], "running")
    for status in ("asleep", "stopped", "interrupted", "timeout"):
        _report(test_client, run["id"], status)
        run = _start(test_client, "write").json()
    assert _findings(test_client) == EMPTY_FINDINGS


@pytest.mark.integration
def test_limit_run_without_a_limit_keeps_the_old_one(test_client: TestClient, kiosk):
    run = _start(test_client, "limit").json()
    _report(test_client, run["id"], "done", limit=26)
    _step(test_client, "conversion", value=10)
    _step(test_client, "limit")
    _report(test_client, run["id"], "done", detail="reached 100 with no fault")
    assert _findings(test_client)["limit"] == 26


@pytest.mark.integration
@pytest.mark.no_admin_login
def test_verdict_needs_admin(test_client: TestClient, kiosk):
    assert test_client.post(f"{BASE}/verdict", json={"writes": True}).status_code == 401


@pytest.mark.integration
def test_owner_verdict_sets_writes_and_checked_at(test_client: TestClient, kiosk):
    write = _start(test_client, "write").json()
    _report(test_client, write["id"], "done", level=19)
    assert _findings(test_client)["writes"] is True  # the agent's own verdict

    resp = test_client.post(f"{BASE}/verdict", json={"writes": False})
    assert resp.status_code == 200, resp.text
    found = _findings(test_client)
    assert found["writes"] is False  # the owner has the last word
    assert found["checkedAt"]
    assert resp.json() == found

    assert test_client.post(f"{BASE}/verdict", json={"writes": True}).json()["writes"] is True
    assert _findings(test_client)["writes"] is True


@pytest.mark.integration
def test_verdict_keeps_the_other_findings(test_client: TestClient, kiosk):
    detect = _start(test_client, "detect").json()
    _report(test_client, detect["id"], "done", info={"model": "NOMAD TOUCH"})
    test_client.post(f"{BASE}/verdict", json={"writes": True})
    found = _findings(test_client)
    assert (found["ddc"], found["model"], found["writes"]) == (True, "NOMAD TOUCH", True)


@pytest.mark.integration
def test_verdict_is_validated(test_client: TestClient, kiosk):
    assert test_client.post(f"{BASE}/verdict", json={}).status_code == 422
    assert test_client.post(f"{BASE}/verdict", json={"writes": "maybe"}).status_code == 422
    assert test_client.post(f"{BASE}/verdict", json={"writes": True, "x": 1}).status_code == 422
    assert (
        test_client.post(
            "/api/kiosks/nobody-here/display-check/verdict", json={"writes": True}
        ).status_code
        == 404
    )


@pytest.mark.integration
def test_a_finished_run_is_never_reactivated_by_a_late_running_report(
    test_client: TestClient, kiosk
):
    """The limit test browns out the Pi; the rebooted agent reports interrupted, then a
    stale config poll makes it send running again. That must not re-offer the job."""
    run = _start(test_client, "limit").json()
    _report(test_client, run["id"], level=24)
    assert _report(test_client, run["id"], "interrupted", level=0).status_code == 200

    late = _report(test_client, run["id"], "running", level=2)
    assert late.status_code == 409
    seen = test_client.get(BASE).json()["run"]
    assert seen["status"] == "interrupted"
    assert seen["active"] is False
    assert "displayCheck" not in _config(test_client)


@pytest.mark.integration
def test_a_repeated_terminal_report_is_accepted_and_keeps_the_first_status(
    test_client: TestClient, kiosk
):
    run = _start(test_client, "write").json()
    assert _report(test_client, run["id"], "stopped", level=19).status_code == 200
    assert _report(test_client, run["id"], "stopped", level=19, detail="again").status_code == 200
    assert _report(test_client, run["id"], "done").status_code == 200
    assert _report(test_client, run["id"], "interrupted").status_code == 200
    seen = test_client.get(BASE).json()["run"]
    assert seen["status"] == "stopped"
    assert seen["active"] is False
    assert _report(test_client, run["id"], "running").status_code == 409


@pytest.mark.integration
def test_an_expired_run_takes_a_terminal_report_but_not_a_running_one(
    test_client: TestClient, kiosk, monkeypatch
):
    from app.services import display_check

    run = _start(test_client, "limit").json()
    now = display_check.utcnow()
    monkeypatch.setattr(display_check, "utcnow", lambda: now + timedelta(minutes=11))
    assert _report(test_client, run["id"], "running").status_code == 409
    assert "displayCheck" not in _config(test_client)
    assert _report(test_client, run["id"], "interrupted").status_code == 200
    assert test_client.get(BASE).json()["run"]["status"] == "interrupted"


@pytest.mark.integration
def test_the_agents_final_done_on_an_expired_run_reads_timeout(
    test_client: TestClient, kiosk, monkeypatch
):
    from app.services import display_check

    run = _start(test_client, "conversion", value=10).json()
    now = display_check.utcnow()
    monkeypatch.setattr(display_check, "utcnow", lambda: now + timedelta(minutes=11))
    assert _report(test_client, run["id"], "done").status_code == 200
    assert test_client.get(BASE).json()["run"]["status"] == "timeout"


def _set_overrides(client: TestClient, overrides: dict):
    resp = client.put(f"/api/kiosks/{KIOSK}/overrides", json={"overrides": overrides})
    assert resp.status_code == 200, resp.text


@pytest.mark.integration
def test_start_accepts_any_value_without_a_limit(test_client: TestClient, kiosk):
    assert _start(test_client, "conversion", value=100).status_code == 200


@pytest.mark.integration
def test_start_refuses_a_value_above_the_limit_minus_two_steps(test_client: TestClient, kiosk):
    _set_overrides(test_client, {"brightnessLimit": 26})
    refused = _start(test_client, "conversion", value=23)  # 26 - 2*2 = 22 is the top
    assert refused.status_code == 422
    assert refused.json()["detail"]["code"] == "value_above_limit"
    assert refused.json()["detail"]["max"] == 22
    assert test_client.get(BASE).json()["run"] is None  # nothing was started
    assert _start(test_client, "conversion", value=22).status_code == 200


@pytest.mark.integration
def test_value_limit_follows_the_screens_step(test_client: TestClient, kiosk):
    _set_overrides(test_client, {"brightnessLimit": 26, "brightnessStep": 5})
    assert _start(test_client, "conversion", value=17).status_code == 422  # max is 16
    assert _start(test_client, "conversion", value=16).status_code == 200


@pytest.mark.integration
def test_a_report_with_long_notes_and_unknown_fields_is_accepted(test_client: TestClient, kiosk):
    run = _start(test_client, "limit").json()
    log = [{"at": "2026-11-05T10:00:00+00:00", "level": 5, "note": "x" * 5000, "extra": 1}]
    resp = test_client.post(
        BASE,
        json={
            "id": run["id"],
            "status": "running",
            "log": log,
            "detail": "d" * 5000,
            "somethingNew": True,
        },
    )
    assert resp.status_code == 200, resp.text
    seen = test_client.get(BASE).json()["run"]
    assert len(seen["log"][0]["note"]) <= 500
    assert len(seen["detail"]) <= 500
    assert "extra" not in seen["log"][0]


@pytest.mark.integration
def test_a_huge_log_is_trimmed_to_the_newest_entries(test_client: TestClient, kiosk):
    run = _start(test_client, "limit").json()
    log = [{"level": i % 100, "note": f"n{i}"} for i in range(800)]
    resp = test_client.post(BASE, json={"id": run["id"], "status": "running", "log": log})
    assert resp.status_code == 200, resp.text
    seen = test_client.get(BASE).json()["run"]["log"]
    assert len(seen) == 500
    assert seen[-1]["note"] == "n799"


@pytest.mark.integration
def test_step_value_is_also_capped_by_the_limit_this_run_found(test_client: TestClient, kiosk):
    """A limit found by the limit step but not saved yet still caps the next target."""
    run = _start(test_client, "limit").json()
    _report(test_client, run["id"], "done", level=30, limit=30)
    refused = _step(test_client, "conversion", value=90)
    assert refused.status_code == 422
    assert refused.json()["detail"]["code"] == "value_above_limit"
    assert refused.json()["detail"]["max"] == 26  # 30 - 2 * 2
    assert _step(test_client, "conversion", value=26).status_code == 200


@pytest.mark.integration
def test_the_lower_of_the_saved_and_the_found_limit_wins(test_client: TestClient, kiosk):
    _set_overrides(test_client, {"brightnessLimit": 20})
    run = _start(test_client, "limit").json()
    _report(test_client, run["id"], "done", level=30, limit=30)
    assert _step(test_client, "conversion", value=17).status_code == 422  # 20 - 4 = 16
    assert _step(test_client, "conversion", value=16).status_code == 200
