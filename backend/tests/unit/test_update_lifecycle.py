"""The update's vocabulary, kept in step with scripts/update-calvin.sh."""

import re
from pathlib import Path

import pytest

from app.services import update_lifecycle as lc

SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "update-calvin.sh"


@pytest.fixture(scope="module")
def script() -> str:
    return SCRIPT.read_text(encoding="utf-8")


def test_every_phase_the_script_writes_is_known(script):
    phases = set(re.findall(r'UPDATE_PHASE="([a-z_]+)"', script))
    assert len(phases) > 4
    assert phases <= set(lc.UPDATE_PHASES), phases - set(lc.UPDATE_PHASES)


def test_every_status_the_script_writes_maps_to_an_api_status(script):
    statuses = set(re.findall(r'write_update_state "([a-z]+)"', script))
    assert statuses == set(lc.SCRIPT_STATUSES)
    for status in statuses:
        assert lc.api_status(status) in (lc.API_RUNNING, lc.API_DONE, lc.API_FAILED)


@pytest.mark.parametrize(
    ("raw", "api"),
    [
        ("running", "running"),
        ("success", "idle"),
        ("SUCCESS", "idle"),
        ("complete", "idle"),
        ("completed", "idle"),
        ("error", "error"),
        ("failed", "error"),
        ("", "unknown"),
        (None, "unknown"),
        ("weird", "unknown"),
    ],
)
def test_api_status(raw, api):
    assert lc.api_status(raw) == api


def test_the_stream_says_complete_for_idle_and_stops_when_settled():
    assert lc.stream_status("idle") == "complete"
    assert lc.stream_status("running") == "running"
    assert lc.stream_status("error") == "error"
    assert lc.is_settled("complete")
    assert lc.is_settled("error")
    assert not lc.is_settled("running")
    assert not lc.is_settled("unknown")
