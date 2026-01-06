"""Tests for keyboard mapping service."""

import pytest

from app.services.keyboard_mapping_service import KeyboardMappingService


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_mappings_structure(test_db):
    """Test getting mappings returns a dictionary."""
    service = KeyboardMappingService()
    mappings = await service.get_mappings("7-button")
    assert isinstance(mappings, dict)
    # Note: mappings may contain default values from initialization


@pytest.mark.asyncio
@pytest.mark.unit
async def test_set_and_get_mappings(test_db):
    """Test setting and getting keyboard mappings."""
    service = KeyboardMappingService()

    # Set mappings
    test_mappings = {
        "KEY_1": "mode_calendar",
        "KEY_2": "mode_photos",
        "KEY_3": "generic_next",
    }
    await service.set_mappings("7-button", test_mappings)

    # Get mappings
    mappings = await service.get_mappings("7-button")
    assert mappings == test_mappings


@pytest.mark.asyncio
@pytest.mark.unit
async def test_set_mappings_replaces_existing(test_db):
    """Test that set_mappings replaces existing mappings."""
    service = KeyboardMappingService()

    # Set initial mappings
    initial_mappings = {"KEY_1": "mode_calendar", "KEY_2": "mode_photos"}
    await service.set_mappings("7-button", initial_mappings)

    # Replace with new mappings
    new_mappings = {"KEY_3": "generic_next", "KEY_4": "generic_prev"}
    await service.set_mappings("7-button", new_mappings)

    # Verify old mappings are gone and new ones are present
    mappings = await service.get_mappings("7-button")
    assert "KEY_1" not in mappings
    assert "KEY_2" not in mappings
    assert mappings == new_mappings


@pytest.mark.asyncio
@pytest.mark.unit
async def test_set_single_mapping(test_db):
    """Test setting a single keyboard mapping."""
    service = KeyboardMappingService()

    # Set a single mapping
    await service.set_mapping("7-button", "KEY_1", "mode_calendar")

    # Verify it was set
    mappings = await service.get_mappings("7-button")
    assert mappings["KEY_1"] == "mode_calendar"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_set_single_mapping_updates_existing(test_db):
    """Test that set_mapping updates existing mapping."""
    service = KeyboardMappingService()

    # Set initial mapping
    await service.set_mapping("7-button", "KEY_1", "mode_calendar")

    # Update the mapping
    await service.set_mapping("7-button", "KEY_1", "mode_photos")

    # Verify it was updated
    mappings = await service.get_mappings("7-button")
    assert mappings["KEY_1"] == "mode_photos"
    assert len(mappings) == 1


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_all_mappings(test_db):
    """Test getting all mappings for all keyboard types."""
    service = KeyboardMappingService()

    # Set mappings for different keyboard types
    await service.set_mappings("7-button", {"KEY_1": "mode_calendar"})
    await service.set_mappings("standard", {"KEY_RIGHT": "generic_next"})

    # Get all mappings
    all_mappings = await service.get_all_mappings()

    assert "7-button" in all_mappings
    assert "standard" in all_mappings
    assert all_mappings["7-button"]["KEY_1"] == "mode_calendar"
    assert all_mappings["standard"]["KEY_RIGHT"] == "generic_next"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_all_mappings_structure(test_db):
    """Test getting all mappings returns a dictionary."""
    service = KeyboardMappingService()
    all_mappings = await service.get_all_mappings()
    assert isinstance(all_mappings, dict)
    # Note: mappings may contain default values from initialization


@pytest.mark.asyncio
@pytest.mark.unit
async def test_cache_functionality(test_db):
    """Test that cache is used and updated correctly."""
    service = KeyboardMappingService()

    # Set mappings
    test_mappings = {"KEY_1": "mode_calendar"}
    await service.set_mappings("7-button", test_mappings)

    # Verify cache was updated
    assert "mappings_7-button" in service._cache
    assert service._cache["mappings_7-button"] == test_mappings

    # Get mappings again (should use cache)
    mappings = await service.get_mappings("7-button")
    assert mappings == test_mappings


@pytest.mark.asyncio
@pytest.mark.unit
async def test_cache_invalidation_on_update(test_db):
    """Test that cache is invalidated when mappings are updated."""
    service = KeyboardMappingService()

    # Set initial mappings
    await service.set_mappings("7-button", {"KEY_1": "mode_calendar"})

    # Verify cache
    assert service._cache["mappings_7-button"]["KEY_1"] == "mode_calendar"

    # Update mappings
    await service.set_mappings("7-button", {"KEY_2": "mode_photos"})

    # Verify cache was updated
    assert service._cache["mappings_7-button"]["KEY_2"] == "mode_photos"
    assert "KEY_1" not in service._cache["mappings_7-button"]


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


@pytest.mark.asyncio
@pytest.mark.unit
async def test_multiple_keyboard_types(test_db):
    """Test that different keyboard types maintain separate mappings."""
    service = KeyboardMappingService()

    # Set mappings for different types
    await service.set_mappings("7-button", {"KEY_1": "mode_calendar"})
    await service.set_mappings("standard", {"KEY_RIGHT": "generic_next"})

    # Verify they're separate
    seven_button = await service.get_mappings("7-button")
    standard = await service.get_mappings("standard")

    assert seven_button["KEY_1"] == "mode_calendar"
    assert standard["KEY_RIGHT"] == "generic_next"
    assert "KEY_1" not in standard
    assert "KEY_RIGHT" not in seven_button


@pytest.mark.asyncio
@pytest.mark.unit
async def test_set_mapping_cache_update(test_db):
    """Test that cache is updated when setting a single mapping."""
    service = KeyboardMappingService()

    # Set initial mapping
    await service.set_mapping("7-button", "KEY_1", "mode_calendar")

    # Verify cache was updated
    assert "mappings_7-button" in service._cache
    assert service._cache["mappings_7-button"]["KEY_1"] == "mode_calendar"

    # Update mapping
    await service.set_mapping("7-button", "KEY_1", "mode_photos")

    # Verify cache was updated
    assert service._cache["mappings_7-button"]["KEY_1"] == "mode_photos"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_set_mapping_new_keyboard_type(test_db):
    """Test setting mapping for a new keyboard type."""
    service = KeyboardMappingService()

    # Set mapping for a new type
    await service.set_mapping("custom-type", "KEY_X", "mode_settings")

    # Verify it was set
    mappings = await service.get_mappings("custom-type")
    assert mappings["KEY_X"] == "mode_settings"

    # Verify cache was created
    assert "mappings_custom-type" in service._cache
