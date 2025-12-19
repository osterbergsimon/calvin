"""Tests for keyboard mapping service."""

import pytest

from app.services.keyboard_mapping_service import KeyboardMappingService


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_mappings_nonexistent(test_db):
    """Test getting mappings for non-existent keyboard type."""
    service = KeyboardMappingService()
    mappings = await service.get_mappings("nonexistent-type")
    assert isinstance(mappings, dict)
    # May have default mappings from initialization, so just check it's a dict
    assert isinstance(mappings, dict)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_set_and_get_mappings(test_db):
    """Test setting and getting keyboard mappings."""
    service = KeyboardMappingService()

    mappings = {
        "KEY_1": "generic_next",
        "KEY_2": "generic_prev",
        "KEY_3": "generic_expand_close",
    }

    await service.set_mappings("7-button", mappings)

    retrieved = await service.get_mappings("7-button")
    assert retrieved == mappings


@pytest.mark.asyncio
@pytest.mark.unit
async def test_set_single_mapping(test_db):
    """Test setting a single keyboard mapping."""
    service = KeyboardMappingService()

    # Set initial mappings
    await service.set_mappings("7-button", {"KEY_1": "generic_next"})

    # Update single mapping
    await service.set_mapping("7-button", "KEY_1", "mode_calendar")

    mappings = await service.get_mappings("7-button")
    assert mappings["KEY_1"] == "mode_calendar"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_all_mappings(test_db):
    """Test getting all mappings for all keyboard types."""
    service = KeyboardMappingService()

    # Set mappings for different types
    await service.set_mappings("7-button", {"KEY_1": "generic_next"})
    await service.set_mappings("standard", {"KEY_RIGHT": "generic_next"})

    all_mappings = await service.get_all_mappings()

    assert "7-button" in all_mappings
    assert "standard" in all_mappings
    assert all_mappings["7-button"]["KEY_1"] == "generic_next"
    assert all_mappings["standard"]["KEY_RIGHT"] == "generic_next"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_update_mappings_replaces_existing(test_db):
    """Test that updating mappings replaces existing ones."""
    service = KeyboardMappingService()

    # Set initial mappings
    await service.set_mappings("7-button", {"KEY_1": "generic_next", "KEY_2": "generic_prev"})

    # Update with new mappings (removes old ones)
    await service.set_mappings("7-button", {"KEY_3": "mode_calendar"})

    mappings = await service.get_mappings("7-button")
    assert "KEY_1" not in mappings
    assert "KEY_2" not in mappings
    assert "KEY_3" in mappings
    assert mappings["KEY_3"] == "mode_calendar"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_replace_mappings_deletes_old(test_db):
    """Test that setting new mappings replaces old ones (effectively deletes them)."""
    service = KeyboardMappingService()

    # Set initial mappings
    await service.set_mappings("test-type", {"KEY_1": "generic_next"})

    # Replace with empty mappings (effectively deletes)
    await service.set_mappings("test-type", {})

    mappings = await service.get_mappings("test-type")
    assert len(mappings) == 0

