"""Tests for plugin utilities."""

from app.plugins.utils.config import (
    extract_config_value,
    normalize_config_value,
    to_bool,
    to_int,
    to_str,
)


class TestNormalizeConfigValue:
    """Tests for normalize_config_value."""

    def test_direct_value(self):
        """Test normalizing a direct value."""
        assert normalize_config_value("direct_value") == "direct_value"
        assert normalize_config_value(42) == 42
        assert normalize_config_value(True) is True

    def test_schema_object_with_value(self):
        """Test normalizing a schema object with 'value' key."""
        assert normalize_config_value({"value": "from_schema"}) == "from_schema"
        assert normalize_config_value({"value": 42}) == 42

    def test_schema_object_with_default(self):
        """Test normalizing a schema object with 'default' key."""
        assert normalize_config_value({"default": "default_value"}) == "default_value"

    def test_schema_object_value_takes_precedence(self):
        """Test that 'value' takes precedence over 'default'."""
        assert normalize_config_value({"value": "actual", "default": "fallback"}) == "actual"

    def test_none_returns_default(self):
        """Test that None returns the default."""
        assert normalize_config_value(None, "fallback") == "fallback"

    def test_empty_string_returns_default(self):
        """Test that empty string returns the default."""
        assert normalize_config_value("", "fallback") == "fallback"

    def test_schema_object_with_none_value(self):
        """Test schema object with None value uses default."""
        assert (
            normalize_config_value({"value": None, "default": "default"}, "fallback") == "fallback"
        )


class TestExtractConfigValue:
    """Tests for extract_config_value."""

    def test_extract_missing_key(self):
        """Test extracting a missing key returns default."""
        config = {}
        assert extract_config_value(config, "missing", default="default") == "default"

    def test_extract_existing_key(self):
        """Test extracting an existing key."""
        config = {"count": 30}
        assert extract_config_value(config, "count", default=10) == 30

    def test_extract_with_converter(self):
        """Test extracting with a type converter."""
        config = {"count": "30"}
        assert extract_config_value(config, "count", default=10, converter=int) == 30

    def test_extract_schema_object(self):
        """Test extracting a schema object."""
        config = {"enabled": {"value": "true"}}
        assert extract_config_value(config, "enabled", default="false") == "true"

    def test_extract_with_converter_and_schema_object(self):
        """Test extracting schema object with converter."""
        config = {"count": {"value": "30"}}
        assert extract_config_value(config, "count", default=10, converter=int) == 30

    def test_converter_error_returns_default(self):
        """Test that converter errors return default."""
        config = {"count": "not_a_number"}
        assert extract_config_value(config, "count", default=10, converter=int) == 10


class TestTypeConverters:
    """Tests for type converter functions."""

    def test_to_int(self):
        """Test to_int converter."""
        assert to_int("30") == 30
        assert to_int(30) == 30
        assert to_int(None, default=10) == 10
        assert to_int("", default=10) == 10
        assert to_int("invalid", default=10) == 10

    def test_to_str(self):
        """Test to_str converter."""
        assert to_str(30) == "30"
        assert to_str("hello") == "hello"
        assert to_str(None, default="default") == "default"
        assert to_str("", default="default") == "default"

    def test_to_bool(self):
        """Test to_bool converter."""
        assert to_bool("true") is True
        assert to_bool("True") is True
        assert to_bool("1") is True
        assert to_bool("yes") is True
        assert to_bool("false") is False
        assert to_bool("0") is False
        assert to_bool(True) is True
        assert to_bool(False) is False
        assert to_bool(None, default=True) is True
        assert to_bool("", default=False) is False
