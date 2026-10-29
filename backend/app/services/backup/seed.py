"""Restore on first start from CALVIN_RESTORE_FROM or a drop-in file."""

import hashlib
import os
from pathlib import Path

from loguru import logger

from .restorer import apply_restore, read_backup
from .store import backup_dir

SEED_MARKER_KEY = "backup_seed_applied_sha256"
DROP_IN_NAMES = ("restore-on-start.zip", "restore-on-start.json")


def _seed_file() -> Path | None:
    configured = os.environ.get("CALVIN_RESTORE_FROM", "").strip()
    if configured:
        return Path(configured)
    for name in DROP_IN_NAMES:
        path = backup_dir() / name
        if path.is_file():
            return path
    return None


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in ("1", "true", "yes", "on")


async def restore_on_start() -> str:
    """Restore the seed file once per content. Returns what happened.

    "none" (no seed file), "already-applied", "restored" or "failed". Never
    raises: a broken seed must not stop Calvin from starting.
    """
    from app.services.config_service import config_service

    path = _seed_file()
    if path is None:
        return "none"
    try:
        data = path.read_bytes()
    except OSError as exc:
        logger.error(f"Restore on start: cannot read {path}: {exc}")
        return "failed"
    digest = hashlib.sha256(data).hexdigest()
    if await config_service.get_value(SEED_MARKER_KEY) == digest:
        logger.info(f"Restore on start: {path.name} was already applied, skipping")
        return "already-applied"

    mode = os.environ.get("CALVIN_RESTORE_MODE", "replace").strip() or "replace"
    try:
        with read_backup(data) as loaded:
            result = await apply_restore(
                loaded,
                mode=mode,
                restore_signing_key=_truthy(os.environ.get("CALVIN_RESTORE_SIGNING_KEY")),
            )
    except Exception:
        logger.exception(f"Restore on start from {path} failed; starting with the current setup")
        return "failed"
    await config_service.set_value(SEED_MARKER_KEY, digest)
    for warning in result["warnings"]:
        logger.warning(f"Restore on start: {warning}")
    for error in result["errors"]:
        logger.error(f"Restore on start: {error}")
    logger.info(f"Restore on start: applied {path} ({mode})")
    return "restored"
