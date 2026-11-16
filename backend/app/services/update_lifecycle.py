"""Calvin's own update (System › Updates): the server's half of one state machine.

Three parts speak about the same update, and this module is where their words
meet:

* ``scripts/update-calvin.sh`` writes a state file: a **script status**
  (``running`` | ``success`` | ``error``) and a **phase** (``UPDATE_PHASES``).
* ``/api/system/update/status`` reports an **API status**: ``running``,
  ``idle`` (the last update finished, nothing is running), ``error`` or
  ``unknown``. A ``running`` state file that stopped changing reads as
  ``error`` (stalled).
* ``/api/system/update/stream`` reports the same, except that it says
  ``complete`` where the status endpoint says ``idle``: on the stream, "the
  update you are watching finished".

The browser's half (``frontend/src/utils/updateLifecycle.js``) adds what only
it can see: the stream dropping, Calvin restarting, watching too long. Tests on
both sides read the update script, so a new phase or status there fails CI
until it has a meaning here and words there.
"""

from __future__ import annotations

# What the update script writes (write_update_state "<status>" "<phase>" ...).
SCRIPT_STATUSES: tuple[str, ...] = ("running", "success", "error")

# The script's UPDATE_PHASE values, in roughly the order an update meets them.
UPDATE_PHASES: tuple[str, ...] = (
    "starting",
    "healthcheck",
    "pulling_code",
    "pulling_image",
    "refreshing_host",
    "restarting",
    "rollback",
    "complete",
)

API_RUNNING = "running"
API_DONE = "idle"
API_FAILED = "error"
API_UNKNOWN = "unknown"
API_STATUSES: tuple[str, ...] = (API_RUNNING, API_DONE, API_FAILED, API_UNKNOWN)

# The stream's word for API_DONE.
STREAM_DONE = "complete"

# Script statuses, and the older spellings a state file may still hold.
_TO_API = {
    "running": API_RUNNING,
    "success": API_DONE,
    "complete": API_DONE,
    "completed": API_DONE,
    "error": API_FAILED,
    "failed": API_FAILED,
}


def api_status(script_status: object) -> str:
    """The API status for a status read from the state file."""
    return _TO_API.get(str(script_status or "").lower(), API_UNKNOWN)


def stream_status(status: str) -> str:
    """The stream's word for an API status (``idle`` reads ``complete``)."""
    return STREAM_DONE if status == API_DONE else status


def is_settled(status: str) -> bool:
    """True once the stream can stop: the update finished or failed."""
    return status in (STREAM_DONE, API_DONE, API_FAILED)
