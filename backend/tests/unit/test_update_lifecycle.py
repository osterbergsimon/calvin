"""The update's vocabulary, kept in step with scripts/update-calvin.sh."""

import re
from pathlib import Path

import pytest

from app.services import update_lifecycle as lc

SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "update-calvin.sh"

# The guards below grep literals out of the script. A value assigned through a
# variable would be invisible to them, so their own tests reject one instead of
# passing quietly.
PHASE_ASSIGNMENT = re.compile(r"^\s*UPDATE_PHASE=(\S+)", re.MULTILINE)
PHASE_LITERAL = re.compile(r'"[a-z_]+"')
STATUS_CALL = re.compile(r"write_update_state\s+(\S+)")
STATUS_LITERAL = re.compile(r'"[a-z]+"')


def _non_literals(values: list[str], literal: re.Pattern[str]) -> list[str]:
    return [value for value in values if not literal.fullmatch(value)]


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


def test_the_phase_guard_reads_every_assignment(script):
    """A phase set through a variable would slip past the literal grep."""
    assert _non_literals(PHASE_ASSIGNMENT.findall(script), PHASE_LITERAL) == []


def test_the_status_guard_reads_every_call(script):
    """A status passed as a variable would slip past the literal grep."""
    assert _non_literals(STATUS_CALL.findall(script), STATUS_LITERAL) == []


def test_the_guards_notice_a_variable():
    assert _non_literals(['"$phase"'], PHASE_LITERAL) == ['"$phase"']
    assert _non_literals(['"$status"'], STATUS_LITERAL) == ['"$status"']


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
