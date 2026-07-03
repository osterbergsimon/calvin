"""Tests for keyboard mapping service."""

import pytest

from app.services.keyboard_mapping_service import KeyboardMappingService


@pytest.mark.asyncio
@pytest.mark.unit
async def test_set_and_get_mappings(test_db):
    service = KeyboardMappingService()
    await service.set_mappings({"KEY_1": "generic_prev", "KEY_2": "generic_next"})
    assert await service.get_mappings() == {"KEY_1": "generic_prev", "KEY_2": "generic_next"}


@pytest.mark.asyncio
@pytest.mark.unit
async def test_set_mappings_replaces_existing(test_db):
    service = KeyboardMappingService()
    await service.set_mappings({"KEY_1": "generic_prev"})
    await service.set_mappings({"KEY_3": "generic_next"})
    result = await service.get_mappings()
    assert result == {"KEY_3": "generic_next"}


@pytest.mark.asyncio
@pytest.mark.unit
async def test_set_single_mapping_upserts(test_db):
    service = KeyboardMappingService()
    await service.set_mappings({"KEY_1": "generic_prev"})
    await service.set_mapping("KEY_1", "generic_next")
    await service.set_mapping("KEY_9", "screen_next")
    result = await service.get_mappings()
    assert result == {"KEY_1": "generic_next", "KEY_9": "screen_next"}


@pytest.mark.asyncio
@pytest.mark.unit
async def test_remove_mapping(test_db):
    service = KeyboardMappingService()
    await service.set_mappings({"KEY_1": "generic_prev", "KEY_2": "generic_next"})
    await service.remove_mapping("KEY_1")
    assert await service.get_mappings() == {"KEY_2": "generic_next"}


@pytest.mark.asyncio
@pytest.mark.unit
async def test_remove_missing_mapping_is_noop(test_db):
    service = KeyboardMappingService()
    await service.set_mappings({"KEY_2": "generic_next"})
    await service.remove_mapping("KEY_1")  # not present
    assert await service.get_mappings() == {"KEY_2": "generic_next"}


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_available_actions(test_db):
    """Test getting list of available keyboard actions."""
    service = KeyboardMappingService()
    actions = await service.get_available_actions()

    assert isinstance(actions, list)
    assert len(actions) > 0

    # Verify some expected actions are present
    assert "mode_calendar" in actions
    assert "mode_photos" in actions
    assert "generic_next" in actions
    assert "generic_prev" in actions
    assert "none" in actions
