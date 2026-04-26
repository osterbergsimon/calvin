"""Serve static assets bundled with installed plugins (tier-2 web components)."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.config import settings

router = APIRouter()


@router.get("/plugins/{plugin_id}/static/{asset_path:path}")
async def get_plugin_static_asset(plugin_id: str, asset_path: str) -> FileResponse:
    plugin_root = (settings.plugins_dir / plugin_id / "frontend").resolve()
    if not plugin_root.is_dir():
        raise HTTPException(status_code=404, detail="Plugin frontend assets not found")

    target = (plugin_root / asset_path).resolve()
    try:
        target.relative_to(plugin_root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid asset path") from exc

    if not target.is_file():
        raise HTTPException(status_code=404, detail="Asset not found")

    return FileResponse(target)
