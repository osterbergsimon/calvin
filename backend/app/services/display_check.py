"""Display-check runs: one stored run per kiosk (calvin-29ws).

An admin asks for a run (``start``); the display agent finds it as
``displayCheck`` on its config poll, works through it and reports back with
``record_report``. A run is one *session*, like the agent's: it stays active
across steps (the admin moves it on with ``change_step``), each step's ``done``
report is a result stored under ``steps``, and only a stop, a failure or the
expiry ends it. The latest run per kiosk is kept in ``kiosks.display_check``
(replaced by the next start). Expiry is computed on read, so nothing needs a
timer: a run not finished 10 minutes after it was requested reads ``timeout``
and is no longer offered to the agent.
"""

import asyncio
import functools
import uuid
import weakref
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta
from typing import Annotated, Any, Literal, TypeGuard

from loguru import logger
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, StrictBool

from app.models.db_models import KioskDB
from app.utils.db_retry import retry_on_db_locked
from app.utils.utc import as_utc, utcnow

# The agent times a run out after about 10 minutes (deploy/kiosk-agent).
RUN_TTL = timedelta(minutes=10)

Step = Literal["detect", "write", "conversion", "read"]
ReportStatus = Literal["running", "done", "stopped", "timeout", "error", "interrupted", "asleep"]
# What ends a run. ``done`` is a step result while the run is active; it ends the
# run only after an admin stop (the agent's final report) or past the expiry.
ENDING_STATUSES = frozenset({"stopped", "timeout", "error", "interrupted", "asleep"})
TERMINAL_STATUSES = ENDING_STATUSES | {"done"}
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


class StoppingError(Exception):
    """A stop is already on its way, so the step cannot change."""


class NoActiveRunError(Exception):
    """There is no active run to stop."""


class NoLimitError(Exception):
    """The latest run has no fault to derive a limit from."""


class StartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    step: Step
    value: int | None = Field(None, ge=0, le=100)
    brightness: int | None = Field(None, ge=0, le=100)


class StepRequest(BaseModel):
    """Move the active run to another step (and target value)."""

    model_config = ConfigDict(extra="forbid")

    step: Step
    value: int | None = Field(None, ge=0, le=100)
    # The level the owner typed from the panel's own buttons (a ``read`` step).
    panelLevel: int | None = Field(None, ge=0, le=100)


class MenuAtStartRequest(BaseModel):
    """The Brightness the screen's own menu showed before the check changed anything."""

    model_config = ConfigDict(extra="forbid")

    menu: float = Field(ge=0, le=100)


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


class Preflight(BaseModel):
    """The 10 s power watch before the first write (calibration v2)."""

    model_config = ConfigDict(extra="ignore")

    status: Literal["clean", "fault"]
    faults: Annotated[list[str], BeforeValidator(_newest(20))] = Field(default_factory=list)


class StartLevel(BaseModel):
    """The brightness the screen was at when the run started."""

    model_config = ConfigDict(extra="ignore")

    level: int | None = Field(None, ge=0, le=100)
    known: bool = False
    source: Literal["read", "last_set"] | None = None


class FaultIncident(BaseModel):
    """One power-trouble incident; faults seen while settling join ``alsoAt``."""

    model_config = ConfigDict(extra="ignore")

    step: Annotated[str | None, BeforeValidator(_clip(32))] = None
    level: int | None = Field(None, ge=0, le=100)
    kind: Annotated[str | None, BeforeValidator(_clip(64))] = None
    at: Annotated[str | None, BeforeValidator(_clip(64))] = None
    lastGood: int | None = Field(None, ge=0, le=100)
    # A read-step fault happens at the owner's own button level, not Calvin's.
    panelLevel: int | None = Field(None, ge=0, le=100)
    alsoAt: Annotated[list[int], BeforeValidator(_newest(50))] = Field(default_factory=list)


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
    # Calibration v3 (calvin-idts): a ``read`` step reports the DDC level it read
    # in ``level`` and the level the agent last wrote this run (or null) here.
    lastWrite: int | None = Field(None, ge=0, le=100)
    # The job's ``seq`` the agent was running, echoed so the UI can match a
    # result to its request (an older agent omits it).
    seq: int | None = Field(None, ge=0)
    log: Annotated[list[LogEntry] | None, BeforeValidator(_newest(_MAX_LOG_ENTRIES))] = None
    startedAt: Annotated[str | None, BeforeValidator(_clip(64))] = None
    finishedAt: Annotated[str | None, BeforeValidator(_clip(64))] = None
    detail: Annotated[str | None, BeforeValidator(_clip(_MAX_TEXT))] = None
    info: dict[str, Any] | None = None
    # Calibration v2 (calvin-c805); all optional, an older agent omits them.
    reason: Annotated[str | None, BeforeValidator(_clip(64))] = None
    preflight: Preflight | None = None
    start: StartLevel | None = None
    fault: FaultIncident | None = None


EMPTY_FINDINGS: dict[str, Any] = {
    "checkedAt": None,
    "ddc": None,
    "writes": None,
    "model": None,
    "connector": None,
    "vcpVersion": None,
    "limit": None,
    "powerTrouble": None,
}

CALIBRATION_STEPS = frozenset({"detect", "write", "conversion", "read"})
# The level the agent dims an unknown start to (CHECK_FLOOR in the agent).
CHECK_FLOOR = 5


def findings_view(stored: dict | None) -> dict[str, Any]:
    """The persisted findings with every field present (null = not checked yet)."""
    return {**EMPTY_FINDINGS, **{k: v for k, v in (stored or {}).items() if k in EMPTY_FINDINGS}}


def _apply_findings(
    stored: dict | None,
    *,
    step: str,
    status: str,
    info: dict | None,
    finished_at: str,
) -> dict[str, Any] | None:
    """Fold a finished step into the findings; None when it says nothing new."""
    findings = findings_view(stored)
    changed = False
    if step == "detect":
        if status == "done":
            info = info or {}
            findings["ddc"] = True
            findings["model"] = info.get("model")
            findings["connector"] = info.get("connector")
            findings["vcpVersion"] = info.get("vcp_version")
            changed = True
        elif status == "error":
            findings["ddc"] = False
            changed = True
    elif step == "read":
        if status == "done":
            findings["ddc"] = True  # a read-back came from the panel itself
            changed = True
    elif step == "write":
        if status in ("done", "error"):
            findings["writes"] = status == "done"
            changed = True
    if not changed:
        return None
    findings["checkedAt"] = finished_at
    return findings


_UNCHANGED: Any = object()


def _power_trouble(run: dict, report: AgentReport, status: str, now: str) -> Any:
    """The new ``findings.powerTrouble`` after a report, or ``_UNCHANGED``."""
    preflight = report.preflight
    if preflight is not None and preflight.status == "fault":
        return {
            "at": report.finishedAt or now,
            "step": "preflight",
            "level": None,
            "kind": classify_fault(preflight.faults[0] if preflight.faults else None),
        }
    fault = report.fault
    if fault is not None and fault.step in CALIBRATION_STEPS:
        return {
            "at": fault.at or report.finishedAt or now,
            "step": fault.step,
            "level": fault.level,
            # Only the level typed for THIS fault, never the previous reading's.
            "panelLevel": fault.panelLevel,
            "kind": fault.kind or "under-voltage",
        }
    clean = (run.get("preflight") or {}).get("status") == "clean"
    faulted = isinstance(run.get("fault"), dict) and run["fault"].get("step") in CALIBRATION_STEPS
    if clean and not faulted and run.get("step") == "write" and status == "done":
        return None
    return _UNCHANGED


# One lock per kiosk (and per event loop, as an asyncio.Lock belongs to the loop
# it is first contended in). Every read-modify-write of a kiosk's run or
# findings holds it, so a stop or step change racing a report is never lost.
_locks: "weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, dict[str, asyncio.Lock]]" = (
    weakref.WeakKeyDictionary()
)


def _kiosk_lock(kiosk_id: str) -> asyncio.Lock:
    per_loop = _locks.setdefault(asyncio.get_running_loop(), {})
    return per_loop.setdefault(kiosk_id, asyncio.Lock())


def _serialised[T](fn: Callable[..., Awaitable[T]]) -> Callable[..., Awaitable[T]]:
    """Run ``fn(kiosk_id, ...)`` under the kiosk's lock."""

    @functools.wraps(fn)
    async def wrapper(kiosk_id: str, *args: Any, **kwargs: Any) -> T:
        async with _kiosk_lock(kiosk_id):
            return await fn(kiosk_id, *args, **kwargs)

    return wrapper


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
    view.setdefault("steps", {})
    for key in ("reason", "preflight", "start", "fault", "menuAtStart", "panelLevel"):
        view.setdefault(key, None)
    view.setdefault("seq", 0)
    view["ceiling"] = None
    view["expiresAt"] = _iso(_expires_at(run))
    return view


view_of = _view  # the run as the UI sees it, for callers outside this module


def job_for_config(run: dict | None, settings: dict | None = None) -> dict | None:
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
        # Bumped by every step request, so a repeated step is a new job.
        "seq": view["seq"],
        "panelLevel": view["panelLevel"],
        # Set only by a Stop that says this calibration's Save landed: the
        # agent's end-of-run restore trusts nothing else.
        "saved": bool(view.get("saved")),
        # What this job's value may reach (calibration never brightens).
        "ceiling": ceiling_for(view, settings),
    }


# -- the calibration ceiling (calvin-c805) -------------------------------------
def _is_int(value: Any) -> TypeGuard[int]:
    return isinstance(value, int) and not isinstance(value, bool)


def convert_menu_to_ddc(points: Any, menu: float) -> int | None:
    """Invert the least-squares line through the saved readings (None: fewer than 2)."""
    pts = [
        (float(p["ddc"]), float(p["menu"]))
        for p in (points or [])
        if isinstance(p, dict)
        and isinstance(p.get("ddc"), int | float)
        and isinstance(p.get("menu"), int | float)
    ]
    if len(pts) < 2:
        return None
    n = len(pts)
    mean_x = sum(x for x, _ in pts) / n
    mean_y = sum(y for _, y in pts) / n
    var = sum((x - mean_x) ** 2 for x, _ in pts)
    if var == 0:
        return None
    slope = sum((x - mean_x) * (y - mean_y) for x, y in pts) / var
    if slope <= 0:
        return None
    ddc = mean_x + (menu - mean_y) / slope
    return max(0, min(100, int(ddc)))


def _settings(settings: dict | None) -> tuple[int | None, int, Any]:
    settings = settings or {}
    limit = settings.get("limit")
    step = settings.get("step")
    return (
        limit if _is_int(limit) else None,
        min(max(step, 1), 5) if _is_int(step) else 2,
        settings.get("conversion"),
    )


def fault_limit(run: dict | None, step: int) -> int | None:
    """``min(lastGood, level) - step`` of a calibration fault, never below 0.

    The margin is applied here, once, when the limit is stored; the limit is
    then the ceiling as it stands.
    """
    fault = (run or {}).get("fault")
    if not isinstance(fault, dict) or fault.get("step") not in CALIBRATION_STEPS:
        return None
    levels = [v for v in (fault.get("lastGood"), fault.get("level")) if _is_int(v)]
    if not levels:
        return None
    return max(0, min(levels) - step)


def ceiling_for(run: dict, settings: dict | None) -> int | None:
    """``min(base, limit, faultLimit)``; None until the run has a start."""
    start = run.get("start")
    if not isinstance(start, dict):
        return None
    saved, step, points = _settings(settings)
    level = start.get("level")
    base = level if _is_int(level) else CHECK_FLOOR
    menu = run.get("menuAtStart")
    if isinstance(menu, int | float) and not isinstance(menu, bool):
        converted = convert_menu_to_ddc(points, float(menu))
        if converted is not None:
            base = converted
    caps = [base]
    if saved is not None:
        caps.append(max(0, saved))
    fault_cap = fault_limit(run, step)
    if fault_cap is not None:
        caps.append(fault_cap)
    return min(caps)


def allowed_max(run: dict, settings: dict | None, value: int | None = None) -> int | None:
    """The highest ``conversion`` value this run may be asked for: the ceiling.

    Calibration v3 never brightens, so there is no exception above it.
    """
    return ceiling_for(run, settings)


def with_ceiling(view: dict | None, settings: dict | None) -> dict | None:
    """A run view with ``ceiling`` computed from the screen's current settings."""
    if view is not None:
        view["ceiling"] = ceiling_for(view, settings)
    return view


def classify_fault(text: str | None) -> str:
    low = (text or "").lower()
    if "over-current" in low or "overcurrent" in low:
        return "over-current"
    if "reset" in low:
        return "touch controller reset"
    return "under-voltage"


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


@_serialised
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
        "seq": 0,
        "status": "requested",
        "level": None,
        "limit": None,
        "log": [],
        "detail": None,
        "info": None,
        "steps": {},
        "requestedAt": _iso(utcnow()),
        "startedAt": None,
        "finishedAt": None,
        "updatedAt": None,
    }
    await _save(row, run)
    logger.info(f"Display check {run['id']} ({request.step}) requested for {kiosk_id!r}")
    return _view(run)  # type: ignore[return-value]


@_serialised
async def stop_run(kiosk_id: str, saved: bool = False) -> dict:
    row = await _row(kiosk_id)
    if row is None:
        raise UnknownKioskError(kiosk_id)
    current = _view(row.display_check)
    if not current or not current["active"]:
        raise NoActiveRunError(kiosk_id)
    run = dict(row.display_check)
    run["action"] = "stop"
    if saved:
        # The dialog says this calibration's Save landed: the agent restores the
        # everyday level on it. Nothing else sets it.
        run["saved"] = True
    await _save(row, run)
    logger.info(f"Display check {run['id']} stop requested for {kiosk_id!r}")
    return _view(run)  # type: ignore[return-value]


@_serialised
async def change_step(kiosk_id: str, request: StepRequest) -> dict:
    """Move the active run to a new step/value; the agent re-runs on the new signature."""
    row = await _row(kiosk_id)
    if row is None:
        raise UnknownKioskError(kiosk_id)
    current = _view(row.display_check)
    if not current or not current["active"]:
        raise NoActiveRunError(kiosk_id)
    if current["action"] == "stop":
        raise StoppingError(kiosk_id)
    run = dict(row.display_check)
    run["step"] = request.step
    run["value"] = request.value
    run["panelLevel"] = request.panelLevel
    run["seq"] = int(run.get("seq") or 0) + 1
    await _save(row, run)
    logger.info(f"Display check {run['id']} for {kiosk_id!r} moved to {request.step}")
    return _view(run)  # type: ignore[return-value]


def _merge_progress(run: dict, report: AgentReport) -> None:
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
    if report.reason is not None:
        run["reason"] = report.reason
    if report.preflight is not None:
        run["preflight"] = report.preflight.model_dump()
    if report.start is not None:
        run["start"] = report.start.model_dump()
    if report.fault is not None:
        run["fault"] = report.fault.model_dump()


@_serialised
async def record_report(kiosk_id: str, report: AgentReport) -> None:
    """Fold an agent report into the stored run.

    The endpoint has no credential (the agent has none, accepted by the spec):
    the only guard is that ``report.id`` is the stored run's id. Once a run has
    ended (an ending status, or expired) it can never become active again, so a
    late ``running`` report from a rebooted agent, or one built from a stale
    config poll, is refused and the job is not offered a second time.

    While the run is active a ``done`` report is the result of the step the
    backend is currently offering (the agent files every report under its first
    job's step, so the report's own ``step`` is not trusted).
    """
    row = await _row(kiosk_id)
    if row is None:
        raise UnknownKioskError(kiosk_id)
    stored = row.display_check
    if not stored or stored.get("id") != report.id:
        raise UnknownRunError(report.id)
    status = report.status
    run = dict(stored)
    now = _iso(utcnow())

    if stored["status"] in TERMINAL_STATUSES:
        # Already ended: only a repeated ending report (the agent's _finish
        # sends one more) is accepted; the first status stays.
        if status == "running":
            raise RunEndedError(report.id)
        _merge_progress(run, report)
        await _save(row, run)
        return

    active = _view(stored)["active"]  # type: ignore[index]
    if not active:
        # Expired: the rebooted or timed-out agent may still finish safely.
        if status == "running":
            raise RunEndedError(report.id)
        _merge_progress(run, report)
        run["status"] = "timeout" if status == "done" else status
        run["finishedAt"] = report.finishedAt or now
        await _save(row, run)
        logger.info(f"Display check {report.id} for {kiosk_id!r} ended: {run['status']}")
        return

    current_seq = run.get("seq")
    if (
        status in ("running", "done", "error")
        and report.seq is not None
        and isinstance(current_seq, int)
        and report.seq < current_seq
    ):
        # A late report for an older request: keep its log lines, but it is not
        # the current step's result and moves neither the level nor findings.
        run["updatedAt"] = _iso(utcnow())
        run["status"] = "running"  # the agent is alive
        if report.log is not None:
            run["log"] = [entry.model_dump() for entry in report.log]
        await _save(row, run)
        return

    _merge_progress(run, report)
    findings = None
    ended = status in ENDING_STATUSES or (status == "done" and stored["action"] == "stop")
    if status in ("done", "error"):
        step = run["step"]
        finished_at = report.finishedAt or now
        steps = dict(run.get("steps") or {})
        steps[step] = {
            "status": status,
            "value": run.get("value"),
            "level": report.level if report.level is not None else run.get("level"),
            "limit": report.limit,
            "lastWrite": report.lastWrite,
            "seq": report.seq,
            "detail": report.detail,
            "info": report.info,
            "finishedAt": finished_at,
        }
        run["steps"] = steps
        findings = _apply_findings(
            row.display_check_findings,
            step=step,
            status=status,
            info=report.info,
            finished_at=finished_at,
        )
    trouble = _power_trouble(run, report, status, now)
    if trouble is not _UNCHANGED:
        findings = findings or findings_view(row.display_check_findings)
        findings["powerTrouble"] = trouble
        findings["checkedAt"] = report.finishedAt or now
    run["status"] = status if ended else "running"
    if ended:
        run["finishedAt"] = report.finishedAt or now
    await _save(row, run, findings)
    if ended:
        logger.info(f"Display check {report.id} for {kiosk_id!r} ended: {run['status']}")


async def fault_limit_for_save(kiosk_id: str, step: int) -> int:
    """The limit a calibration fault implies (``faultLimit``), else :class:`NoLimitError`."""
    row = await _row(kiosk_id)
    if row is None:
        raise UnknownKioskError(kiosk_id)
    limit = fault_limit(row.display_check, step)
    # A limit at or below the floor would leave a dark screen (an idle fault
    # with an unknown level, or trouble at the very bottom): never offered.
    if limit is None or limit <= CHECK_FLOOR:
        raise NoLimitError(kiosk_id)
    return limit


@_serialised
async def set_menu_at_start(kiosk_id: str, menu: float) -> dict:
    """Store the menu value the owner read before the check changed anything."""
    row = await _row(kiosk_id)
    if row is None:
        raise UnknownKioskError(kiosk_id)
    current = _view(row.display_check)
    if not current or not current["active"]:
        raise NoActiveRunError(kiosk_id)
    run = dict(row.display_check)
    run["menuAtStart"] = int(menu) if float(menu).is_integer() else menu
    await _save(row, run)
    logger.info(f"Display check {run['id']} for {kiosk_id!r}: menu at start {menu}")
    return _view(run)  # type: ignore[return-value]


async def get_findings(kiosk_id: str) -> dict[str, Any]:
    row = await _row(kiosk_id)
    return findings_view(row.display_check_findings if row else None)


@_serialised
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
