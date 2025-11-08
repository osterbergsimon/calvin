"""Keyboard mapping endpoints."""

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.keyboard_mapping_service import keyboard_mapping_service

router = APIRouter()


class KeyboardMappings(BaseModel):
    """Keyboard mappings model."""

    mappings: dict[str, dict[str, str]]  # { "7-button": { "KEY_1": "action" }, ... }


class KeyboardMappingUpdate(BaseModel):
    """Single keyboard mapping update model."""

    keyboard_type: str
    key_code: str
    action: str


@router.get("/keyboard/mappings")
async def get_keyboard_mappings(keyboard_type: str = None):
    """
    Get keyboard mappings.

    Args:
        keyboard_type: Optional keyboard type filter ('7-button' or 'standard')

    Returns:
        Dictionary of keyboard mappings
    """
    if keyboard_type:
        mappings = await keyboard_mapping_service.get_mappings(keyboard_type)
        return {"mappings": {keyboard_type: mappings}}
    else:
        all_mappings = await keyboard_mapping_service.get_all_mappings()
        return {"mappings": all_mappings}


@router.post("/keyboard/mappings")
async def update_keyboard_mappings(mappings: KeyboardMappings):
    """
    Update keyboard mappings.

    Args:
        mappings: Dictionary of keyboard type to key mappings
    """
    for keyboard_type, type_mappings in mappings.mappings.items():
        await keyboard_mapping_service.set_mappings(keyboard_type, type_mappings)

    return {"message": "Keyboard mappings updated", "mappings": mappings.mappings}


@router.put("/keyboard/mappings/{keyboard_type}/{key_code}")
async def update_single_mapping(
    keyboard_type: str,
    key_code: str,
    mapping_update: KeyboardMappingUpdate,
):
    """
    Update a single keyboard mapping.

    Args:
        keyboard_type: Keyboard type ('7-button' or 'standard')
        key_code: Key code (e.g., 'KEY_1')
        mapping_update: Mapping update data
    """
    await keyboard_mapping_service.set_mapping(
        keyboard_type,
        key_code,
        mapping_update.action,
    )

    return {"message": "Mapping updated"}


@router.get("/keyboard/actions")
async def get_available_actions():
    """
    Get list of available keyboard actions.

    Returns:
        List of available action names
    """
    actions = await keyboard_mapping_service.get_available_actions()
    return {"actions": actions}
