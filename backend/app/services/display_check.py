"""Display-check runs: one stored run per kiosk (calvin-29ws).

An admin asks for a run (``start``); the display agent finds it as
``displayCheck`` on its config poll, works through it and reports back with
``record_report``. The latest run per kiosk is kept in ``kiosks.display_check``
(replaced by the next start). Expiry is computed on read, so nothing needs a
timer: a run not finished 10 minutes after it was requested reads ``timeout``
and is no longer offered to the agent.
"""

import uuid
from datetime import datetime, timedelta
from typing import Annotated, Any, Literal

from loguru import logger
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, StrictBool

from app.models.db_models import KioskDB
from app.utils.db_retry import retry_on_db_locked
from app.utils.utc import as_utc, utcnow

# The agent times a run out after about 10 minutes (deploy/kiosk-agent).
RUN_TTL = timedelta(minutes=10)

Step = Literal["detect", "write", "conversion", "limit"]
ReportStatus = Literal["running", "done", "stopped", "timeout", "error", "interrupted", "asleep"]
TERMINAL_STATUSES = frozenset({"done", "stopped", "timeout", "error", "interrupted", "asleep"})
_MAX_LOG_ENTRIES = 500
_MAX_TEXT = 500


class RunActiveError(Exception):
    """A run is already active for the kiosk."""

    def __init__(self, run: dict):
        super().__init__("display check already active")
        self.run = run


class UnknownKioskError(Exception):
    """The kiosk is not registered."""


class UnknownRunError(Exception):
    """A report named a run other than the stored one."""


class RunEndedError(Exception):
    """A non-terminal report arrived for a run that has already ended."""


class NoActiveRunError(Exception):
    """There is no active run to stop."""


class NoLimitError(Exception):
    """The latest run did not find a limit."""


class StartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    step: Step
    value: int | None = Field(None, ge=0, le=100)
    brightness: int | None = Field(None, ge=0, le=100)


class VerdictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    writes: StrictBool


def _clip(limit: int):
    def clip(value: Any) -> Any:
        return value[:limit] if isinstance(value, str) else value

    return clip


def _newest(limit: int):
    def newest(value: Any) -> Any:
        return value[-limit:] if isinstance(value, list) else value

    return newest


class LogEntry(BaseModel):
    # The agent resends its whole log on every report, so one oversized note or
    # a field a newer agent adds must never reject the report: clip, ignore.
    model_config = ConfigDict(extra="ignore")

    at: Annotated[str | None, BeforeValidator(_clip(64))] = None
    level: int | None = Field(None, ge=0, le=100)
    note: Annotated[str, BeforeValidator(_clip(_MAX_TEXT))] = ""


class AgentReport(BaseModel):
    """The agent's POST body (deploy/kiosk-agent, ``post_display_check``).

    Tolerant on purpose: unknown fields are ignored and long text is clipped,
    because a rejected report leaves the run stuck ``running`` until it expires.
    """

    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1, max_length=128)
    step: Annotated[str | None, BeforeValidator(_clip(32))] = None
    status: ReportStatus
    level: int | None = Field(None, ge=0, le=100)
    limit: int | None = Field(None, ge=0, le=100)
    log: Annotated[list[LogEntry] | None, BeforeValidator(_newest(_MAX_LOG_ENTRIES))] = None
    startedAt: Annotated[str | None, BeforeValidator(_clip(64))] = None
    finishedAt: Annotated[str | None, BeforeValidator(_clip(64))] = None
    detail: Annotated[str | None, BeforeValidator(_clip(_MAX_TEXT))] = None
    info: dict[str, Any] | None = None


EMPTY_FINDINGS: dict[str, Any] = {
    "checkedAt": None,
    "ddc": None,
    "writes": None,
    "model": None,
    "connector": None,
    "vcpVersion": None,
    "limit": None,
}


def findings_view(stored: dict | None) -> dict[str, Any]:
    """The persisted findings with every field present (null = not checked yet)."""
    return {**EMPTY_FINDINGS, **{k: v for k, v in (stored or {}).items() if k in EMPTY_FINDINGS}}


def _apply_findings(stored: dict | None, run: dict) -> dict[str, Any] | None:
    """Fold a finished run into the findings; None when it says nothing new."""
    step, status = run["step"], run["status"]
    findings = findings_view(stored)
    changed = False
    if step == "detect":
        if status == "done":
            info = run.get("info") or {}
            findings["ddc"] = True
            findings["model"] = info.get("model")
            findings["connector"] = info.get("connector")
            findings["vcpVersion"] = info.get("vcp_version")
            changed = True
        elif status == "error":
            findings["ddc"] = False
            changed = True
    elif step == "write":
        if status in ("done", "error"):
            findings["writes"] = status == "done"
            changed = True
    elif step == "limit" and status == "done" and isinstance(run.get("limit"), int):
        findings["limit"] = run["limit"]
        changed = True
    if not changed:
        return None
    findings["checkedAt"] = run["finishedAt"]
    return findings


def _iso(dt: datetime) -> str:
    return as_utc(dt).isoformat()


def _expires_at(run: dict) -> datetime:
    return as_utc(datetime.fromisoformat(run["requestedAt"])) + RUN_TTL


def _view(run: dict | None) -> dict | None:
    """The run as the UI and the config poll see it, with expiry applied."""
    if not run:
        return None
    view = dict(run)
    expired = utcnow() >= _expires_at(run)
    if expired and view["status"] in ("requested", "running"):
        view["status"] = "timeout"
    view["active"] = view["status"] in ("requested", "running")
    view["expiresAt"] = _iso(_expires_at(run))
    return view


def job_for_config(run: dict | None) -> dict | None:
    """The job as the agent reads it from the config poll, only while active."""
    view = _view(run)
    if view is None or not view["active"]:
        return None
    return {
        "id": view["id"],
        "step": view["step"],
        "action": view["action"],
        "value": view["value"],
        "brightness": view["brightness"],
    }


@retry_on_db_locked()
async def _row(kiosk_id: str) -> KioskDB | None:
    return await KioskDB.objects.get_or_none(id=kiosk_id)


async def get_run(kiosk_id: str) -> dict | None:
    """The stored run record (raw, no expiry applied), or None."""
    row = await _row(kiosk_id)
    return dict(row.display_check) if row and row.display_check else None


async def get_run_view(kiosk_id: str) -> dict | None:
    return _view(await get_run(kiosk_id))


@retry_on_db_locked()
async def _save(row: KioskDB, run: dict, findings: dict | None = None) -> None:
    row.display_check = run
    columns = ["display_check"]
    if findings is not None:
        row.display_check_findings = findings
        columns.append("display_check_findings")
    # Only these columns: a concurrent heartbeat must not be overwritten.
    await row.update(_columns=columns)


async def start_run(kiosk_id: str, request: StartRequest) -> dict:
    row = await _row(kiosk_id)
    if row is None:
        raise UnknownKioskError(kiosk_id)
    current = _view(row.display_check)
    if current and current["active"]:
        raise RunActiveError(current)
    run: dict[str, Any] = {
        "id": uuid.uuid4().hex,
        "step": request.step,
        "value": request.value,
        "brightness": request.brightness,
        "action": "start",
        "status": "requested",
        "level": None,
        "limit": None,
        "log": [],
        "detail": None,
        "info": None,
        "requestedAt": _iso(utcnow()),
        "startedAt": None,
        "finishedAt": None,
        "updatedAt": None,
    }
    await _save(row, run)
    logger.info(f"Display check {run['id']} ({request.step}) requested for {kiosk_id!r}")
    return _view(run)  # type: ignore[return-value]


async def stop_run(kiosk_id: str) -> dict:
    row = await _row(kiosk_id)
    if row is None:
        raise UnknownKioskError(kiosk_id)
    current = _view(row.display_check)
    if not current or not current["active"]:
        raise NoActiveRunError(kiosk_id)
    run = dict(row.display_check)
    run["action"] = "stop"
    await _save(row, run)
    logger.info(f"Display check {run['id']} stop requested for {kiosk_id!r}")
    return _view(run)  # type: ignore[return-value]


async def record_report(kiosk_id: str, report: AgentReport) -> None:
    """Fold an agent report into the stored run.

    The endpoint has no credential (the agent has none, accepted by the spec):
    the only guard is that ``report.id`` is the stored run's id. Once a run has
    ended (a terminal status, or expired) it can never become active again, so a
    late ``running`` report from a rebooted agent, or one built from a stale
    config poll, is refused and the job is not offered a second time.
    """
    row = await _row(kiosk_id)
    if row is None:
        raise UnknownKioskError(kiosk_id)
    stored = row.display_check
    if not stored or stored.get("id") != report.id:
        raise UnknownRunError(report.id)
    was_active = _view(stored)["active"]  # type: ignore[index]
    terminal = report.status in TERMINAL_STATUSES
    if not was_active and not terminal:
        raise RunEndedError(report.id)
    run = dict(stored)
    if was_active or stored["status"] not in TERMINAL_STATUSES:
        # First terminal status (or progress) wins; a repeated terminal report
        # only adds data.
        run["status"] = report.status
    run["updatedAt"] = _iso(utcnow())
    if report.level is not None:
        run["level"] = report.level
    if report.limit is not None:
        run["limit"] = report.limit
    if report.log is not None:
        run["log"] = [entry.model_dump() for entry in report.log]
    if report.startedAt:
        run["startedAt"] = report.startedAt
    if report.detail is not None:
        run["detail"] = report.detail
    if report.info is not None:
        run["info"] = report.info
    # The agent sends finishedAt on every report; it only means something once
    # the run has ended.
    if terminal and not run.get("finishedAt"):
        run["finishedAt"] = report.finishedAt or _iso(utcnow())
    first_end = terminal and stored["status"] not in TERMINAL_STATUSES
    findings = _apply_findings(row.display_check_findings, run) if first_end else None
    await _save(row, run, findings)
    if first_end:
        logger.info(f"Display check {report.id} for {kiosk_id!r} ended: {run['status']}")


async def found_limit(kiosk_id: str) -> int:
    """The limit the latest finished ``limit`` run found, else :class:`NoLimitError`."""
    row = await _row(kiosk_id)
    if row is None:
        raise UnknownKioskError(kiosk_id)
    run = _view(row.display_check)
    if (
        not run
        or run["step"] != "limit"
        or run["status"] != "done"
        or not isinstance(run.get("limit"), int)
    ):
        raise NoLimitError(kiosk_id)
    return int(run["limit"])


async def get_findings(kiosk_id: str) -> dict[str, Any]:
    row = await _row(kiosk_id)
    return findings_view(row.display_check_findings if row else None)


async def set_writes_verdict(kiosk_id: str, writes: bool) -> dict[str, Any]:
    """Record the owner's answer to "did the screen change?" (it wins over the agent's)."""
    row = await _row(kiosk_id)
    if row is None:
        raise UnknownKioskError(kiosk_id)
    findings = findings_view(row.display_check_findings)
    findings["writes"] = writes
    findings["checkedAt"] = _iso(utcnow())
    await _save_findings(row, findings)
    logger.info(f"Owner verdict for {kiosk_id!r}: brightness writes take effect = {writes}")
    return findings


@retry_on_db_locked()
async def _save_findings(row: KioskDB, findings: dict) -> None:
    row.display_check_findings = findings
    await row.update(_columns=["display_check_findings"])
