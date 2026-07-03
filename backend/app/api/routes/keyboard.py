"""Keyboard mapping endpoints (single unified keyboard)."""

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.keyboard_mapping_service import keyboard_mapping_service

router = APIRouter()


class KeyboardMappings(BaseModel):
    """Full key-code -> action map."""

    mappings: dict[str, str]


class SingleMapping(BaseModel):
    """Action for a single key."""

    action: str


@router.get("/keyboard/mappings")
async def get_keyboard_mappings():
    """Return the full flat mapping."""
    return {"mappings": await keyboard_mapping_service.get_mappings()}


@router.post("/keyboard/mappings")
async def replace_keyboard_mappings(payload: KeyboardMappings):
    """Replace the entire mapping."""
    await keyboard_mapping_service.set_mappings(payload.mappings)
    return {"message": "Keyboard mappings updated", "mappings": payload.mappings}


@router.put("/keyboard/mappings/{key_code}")
async def set_single_mapping(key_code: str, payload: SingleMapping):
    """Upsert a single binding."""
    await keyboard_mapping_service.set_mapping(key_code, payload.action)
    return {"message": "Mapping updated"}


@router.delete("/keyboard/mappings/{key_code}")
async def delete_single_mapping(key_code: str):
    """Remove a single binding."""
    await keyboard_mapping_service.remove_mapping(key_code)
    return {"message": "Mapping removed"}


@router.get("/keyboard/actions")
async def get_available_actions():
    """Get list of available keyboard actions."""
    actions = await keyboard_mapping_service.get_available_actions()
    return {"actions": actions}
