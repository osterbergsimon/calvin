"""Kiosk registry endpoints (per-device settings model — calvin-dd9.2)."""

from fastapi import APIRouter

from app.services import kiosk_registry

router = APIRouter()


@router.get("/kiosks")
async def get_kiosks():
    """List known kiosks (id, hostname, last-seen, lastAppliedVersion)."""
    return {"kiosks": await kiosk_registry.list_kiosks()}
