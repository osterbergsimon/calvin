"""Backup files in the backup dir: write, list, prune, and the scheduled job."""

import os
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from loguru import logger

from app.config import settings

from .exporter import ExportOptions, backup_filename, export_backup
from .restorer import BackupBusyError, restore_lock

KIND_PREFIX = {"manual": "calvin-backup", "auto": "auto", "pre-restore": "pre-restore"}
_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*\.(zip|json)$")

SCHEDULE_KEYS = {
    "enabled": ("backup_auto_enabled", False),
    "interval_hours": ("backup_auto_interval_hours", 24),
    "retention": ("backup_auto_retention", 7),
}


def backup_dir() -> Path:
    """BACKUP_DIR, else $CALVIN_DATA_DIR/backups, else <db dir>/../backups."""
    if settings.backup_dir:
        path = Path(settings.backup_dir)
    elif os.environ.get("CALVIN_DATA_DIR"):
        path = Path(os.environ["CALVIN_DATA_DIR"]) / "backups"
    else:
        path = settings.database_path.parent.parent / "backups"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _kind_of(name: str) -> str:
    for kind, prefix in KIND_PREFIX.items():
        if name.startswith(prefix + "-"):
            return kind
    return "other"


def list_backups() -> list[dict[str, Any]]:
    files = []
    for path in backup_dir().iterdir():
        if path.is_file() and _NAME_RE.match(path.name):
            stat = path.stat()
            files.append(
                {
                    "name": path.name,
                    "size": stat.st_size,
                    "modified": datetime.fromtimestamp(stat.st_mtime, UTC).isoformat(),
                    "kind": _kind_of(path.name),
                }
            )
    return sorted(files, key=lambda f: f["modified"], reverse=True)


def resolve(name: str) -> Path:
    """The stored backup called ``name``. Raises FileNotFoundError."""
    if not _NAME_RE.match(name):
        raise FileNotFoundError(name)
    path = backup_dir() / name
    if not path.is_file():
        raise FileNotFoundError(name)
    return path


def prune(kind: str, retention: int) -> list[str]:
    """Delete the oldest files of ``kind`` beyond ``retention``."""
    prefix = KIND_PREFIX[kind] + "-"
    files = sorted(
        (p for p in backup_dir().glob(prefix + "*.zip")),
        key=lambda p: (p.stat().st_mtime, p.name),
        reverse=True,
    )
    removed = []
    for path in files[max(retention, 1) :]:
        path.unlink(missing_ok=True)
        removed.append(path.name)
    return removed


async def write_backup_unlocked(
    kind: str = "manual", retention: int | None = None, options: ExportOptions | None = None
) -> Path:
    """Write a backup zip (0600) to the backup dir. Caller holds the lock if needed."""
    data = await export_backup(options)
    path = backup_dir() / backup_filename(KIND_PREFIX[kind])
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(data)
    if retention is not None:
        prune(kind, retention)
    logger.info(f"Wrote {kind} backup {path}")
    return path


async def write_backup(
    kind: str = "manual", retention: int | None = None, options: ExportOptions | None = None
) -> Path:
    if restore_lock.locked():
        raise BackupBusyError("A restore is running; try again when it has finished.")
    async with restore_lock:
        return await write_backup_unlocked(kind, retention, options)


async def get_schedule() -> dict[str, Any]:
    from app.services.config_service import config_service

    return {
        name: await config_service.get_value(key, default)
        for name, (key, default) in SCHEDULE_KEYS.items()
    }


async def set_schedule(enabled: bool, interval_hours: int, retention: int) -> dict[str, Any]:
    from app.services.config_service import config_service

    values = {"enabled": enabled, "interval_hours": interval_hours, "retention": retention}
    for name, value in values.items():
        await config_service.set_value(SCHEDULE_KEYS[name][0], value)
    await auto_backup_scheduler.reschedule()
    return values


class AutoBackupScheduler:
    """Writes auto-*.zip every interval_hours when automatic backups are on."""

    JOB_ID = "calvin-auto-backup"

    def __init__(self) -> None:
        self.scheduler: AsyncIOScheduler | None = None

    async def start(self) -> None:
        if self.scheduler is None:
            self.scheduler = AsyncIOScheduler()
            self.scheduler.start()
        await self.reschedule()

    async def reschedule(self) -> None:
        if self.scheduler is None:
            return
        if self.scheduler.get_job(self.JOB_ID):
            self.scheduler.remove_job(self.JOB_ID)
        schedule = await get_schedule()
        if not schedule["enabled"]:
            return
        self.scheduler.add_job(
            self._run,
            IntervalTrigger(hours=max(int(schedule["interval_hours"]), 1)),
            id=self.JOB_ID,
            replace_existing=True,
        )
        logger.info(f"Automatic backups every {schedule['interval_hours']}h")

    async def _run(self) -> None:
        schedule = await get_schedule()
        try:
            await write_backup(kind="auto", retention=int(schedule["retention"]))
        except Exception:
            logger.exception("Automatic backup failed")

    def stop(self) -> None:
        if self.scheduler is not None:
            self.scheduler.shutdown(wait=False)
            self.scheduler = None


auto_backup_scheduler = AutoBackupScheduler()
