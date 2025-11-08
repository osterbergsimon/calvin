"""Tests for config service."""

import pytest

from app.services.config_service import ConfigService


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_value_nonexistent(test_db):
    """Test getting a non-existent config value."""
    service = ConfigService()
    value = await service.get_value("nonexistent_key", default="default_value")
    assert value == "default_value"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_set_and_get_value(test_db):
    """Test setting and getting a config value."""
    service = ConfigService()

    # Set a value
    await service.set_value("test_key", "test_value")

    # Get the value
    value = await service.get_value("test_key")
    assert value == "test_value"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_set_and_get_value_with_type(test_db):
    """Test setting and getting a config value with explicit type."""
    service = ConfigService()

    # Set an integer value
    await service.set_value("test_int", 42, value_type="int")

    # Get the value
    value = await service.get_value("test_int")
    assert value == 42
    assert isinstance(value, int)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_config(test_db):
    """Test getting all config values."""
    service = ConfigService()

    # Set multiple values
    await service.set_value("key1", "value1")
    await service.set_value("key2", 123, value_type="int")
    await service.set_value("key3", True, value_type="bool")

    # Get all config
    config = await service.get_config()

    assert "key1" in config
    assert config["key1"] == "value1"
    assert "key2" in config
    assert config["key2"] == 123
    assert "key3" in config
    assert config["key3"] is True


@pytest.mark.asyncio
@pytest.mark.unit
async def test_update_config(test_db):
    """Test updating config values."""
    service = ConfigService()

    # Set initial value
    await service.set_value("test_key", "initial_value")

    # Update config
    await service.update_config({"test_key": "updated_value", "new_key": "new_value"})

    # Verify updates
    assert await service.get_value("test_key") == "updated_value"
    assert await service.get_value("new_key") == "new_value"
