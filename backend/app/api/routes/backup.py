"""Backup and restore endpoints (calvin-8gx)."""

from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

from app.services.backup import store
from app.services.backup.exporter import ExportOptions, backup_filename, export_backup
from app.services.backup.format import BackupError
from app.services.backup.restorer import (
    BackupBusyError,
    LoadedBackup,
    apply_restore,
    plan_restore,
    read_backup,
)

router = APIRouter()


class BackupSchedule(BaseModel):
    enabled: bool = False
    interval_hours: int = Field(24, ge=1, le=24 * 30)
    retention: int = Field(7, ge=1, le=365)


def _load(data: bytes) -> LoadedBackup:
    try:
        return read_backup(data)
    except BackupError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


async def _preview(data: bytes, mode: str) -> dict[str, Any]:
    with _load(data) as loaded:
        try:
            return await plan_restore(loaded, mode)
        except BackupError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc


async def _restore(data: bytes, mode: str, restore_signing_key: bool) -> dict[str, Any]:
    with _load(data) as loaded:
        try:
            return await apply_restore(loaded, mode, restore_signing_key=restore_signing_key)
        except BackupError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except BackupBusyError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/backup/export")
async def export(
    include_packages: bool = Query(True),
    include_secrets: bool = Query(True),
    include_signing_key: bool = Query(False),
):
    """Download a backup of this install as a zip."""
    data = await export_backup(
        ExportOptions(
            include_packages=include_packages,
            include_secrets=include_secrets,
            include_signing_key=include_signing_key,
        )
    )
    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{backup_filename()}"'},
    )


@router.post("/backup/preview")
async def preview(file: UploadFile = File(...), mode: str = Form("replace")):
    """Validate an uploaded backup and describe what restoring it would do."""
    return await _preview(await file.read(), mode)


@router.post("/backup/restore")
async def restore(
    file: UploadFile = File(...),
    mode: str = Form("replace"),
    restore_signing_key: bool = Form(False),
):
    """Restore an uploaded backup."""
    return await _restore(await file.read(), mode, restore_signing_key)


@router.get("/backup/files")
async def list_files():
    """Backups stored in the backup dir (automatic, pre-restore, manual)."""
    return {"directory": str(store.backup_dir()), "files": store.list_backups()}


@router.post("/backup/files")
async def create_file():
    """Write a backup to the backup dir now."""
    try:
        path = await store.write_backup(kind="manual")
    except BackupBusyError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"name": path.name}


def _stored(name: str):
    try:
        return store.resolve(name)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Backup not found") from exc


@router.get("/backup/files/{name}")
async def download_file(name: str):
    path = _stored(name)
    return FileResponse(path, media_type="application/zip", filename=path.name)


@router.post("/backup/files/{name}/restore")
async def restore_file(
    name: str,
    mode: str = Form("replace"),
    dry_run: bool = Form(False),
    restore_signing_key: bool = Form(False),
):
    """Preview (dry_run) or restore a backup stored in the backup dir."""
    data = _stored(name).read_bytes()
    if dry_run:
        return await _preview(data, mode)
    return await _restore(data, mode, restore_signing_key)


@router.get("/backup/schedule", response_model=BackupSchedule)
async def get_schedule():
    return await store.get_schedule()


@router.put("/backup/schedule", response_model=BackupSchedule)
async def put_schedule(schedule: BackupSchedule):
    return await store.set_schedule(schedule.enabled, schedule.interval_hours, schedule.retention)
