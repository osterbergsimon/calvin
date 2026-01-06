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
async def test_get_value_nonexistent_no_default(test_db):
    """Test getting a non-existent config value without default."""
    service = ConfigService()
    value = await service.get_value("nonexistent_key")
    assert value is None


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
async def test_type_detection(test_db):
    """Test automatic type detection."""
    service = ConfigService()

    # Test bool detection
    await service.set_value("bool_key", True)
    value = await service.get_value("bool_key")
    assert value is True
    assert isinstance(value, bool)

    # Test int detection
    await service.set_value("int_key", 42)
    value = await service.get_value("int_key")
    assert value == 42
    assert isinstance(value, int)

    # Test float detection
    await service.set_value("float_key", 3.14)
    value = await service.get_value("float_key")
    assert value == 3.14
    assert isinstance(value, float)

    # Test dict detection (json)
    await service.set_value("dict_key", {"key": "value"})
    value = await service.get_value("dict_key")
    assert value == {"key": "value"}
    assert isinstance(value, dict)

    # Test list detection (json)
    await service.set_value("list_key", [1, 2, 3])
    value = await service.get_value("list_key")
    assert value == [1, 2, 3]
    assert isinstance(value, list)

    # Test string detection
    await service.set_value("string_key", "test")
    value = await service.get_value("string_key")
    assert value == "test"
    assert isinstance(value, str)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_bool_parsing_variants(test_db):
    """Test parsing various boolean string representations."""
    service = ConfigService()

    # Test various true values
    for true_val in ["true", "True", "TRUE", "1", "yes", "on"]:
        await service.set_value(f"bool_{true_val}", true_val, value_type="bool")
        value = await service.get_value(f"bool_{true_val}")
        assert value is True, f"Failed for value: {true_val}"

    # Test various false values
    for false_val in ["false", "False", "FALSE", "0", "no", "off", ""]:
        await service.set_value(f"bool_{false_val}", false_val, value_type="bool")
        value = await service.get_value(f"bool_{false_val}")
        assert value is False, f"Failed for value: {false_val}"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_json_serialization(test_db):
    """Test JSON serialization and deserialization."""
    service = ConfigService()

    # Test complex nested structure
    complex_data = {
        "nested": {"key": "value", "number": 42},
        "list": [1, 2, {"item": "test"}],
        "boolean": True,
    }
    await service.set_value("complex_key", complex_data)
    value = await service.get_value("complex_key")
    assert value == complex_data
    assert isinstance(value, dict)
    assert isinstance(value["nested"], dict)
    assert isinstance(value["list"], list)


@pytest.mark.asyncio
@pytest.mark.unit
async def test_update_existing_value(test_db):
    """Test updating an existing config value."""
    service = ConfigService()

    # Set initial value
    await service.set_value("test_key", "initial_value")

    # Update the value
    await service.set_value("test_key", "updated_value")

    # Verify update
    value = await service.get_value("test_key")
    assert value == "updated_value"


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
async def test_get_config_structure(test_db):
    """Test getting config returns a dictionary."""
    service = ConfigService()
    config = await service.get_config()
    assert isinstance(config, dict)
    # Note: config may contain default values from other tests or initialization


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


@pytest.mark.asyncio
@pytest.mark.unit
async def test_update_config_multiple_types(test_db):
    """Test updating config with multiple value types."""
    service = ConfigService()

    # Update with various types
    await service.update_config(
        {
            "string_val": "test",
            "int_val": 42,
            "float_val": 3.14,
            "bool_val": True,
            "dict_val": {"key": "value"},
            "list_val": [1, 2, 3],
        }
    )

    # Verify all types are preserved
    assert await service.get_value("string_val") == "test"
    assert await service.get_value("int_val") == 42
    assert await service.get_value("float_val") == 3.14
    assert await service.get_value("bool_val") is True
    assert await service.get_value("dict_val") == {"key": "value"}
    assert await service.get_value("list_val") == [1, 2, 3]


@pytest.mark.asyncio
@pytest.mark.unit
async def test_cache_functionality(test_db):
    """Test that cache is updated when values are set."""
    service = ConfigService()

    # Set a value
    await service.set_value("cached_key", "cached_value")

    # Check that cache was updated
    assert "cached_key" in service._cache
    assert service._cache["cached_key"] == "cached_value"


@pytest.mark.asyncio
@pytest.mark.unit
async def test_error_handling_missing_table(test_db):
    """Test that get_value handles missing table gracefully."""
    service = ConfigService()

    # Should return default even if table doesn't exist
    # (This is tested implicitly by the test_db fixture, but we can verify behavior)
    value = await service.get_value("nonexistent", default="default")
    assert value == "default"
