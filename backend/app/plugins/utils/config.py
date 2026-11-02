"""Configuration value extraction and normalization utilities.

These utilities help plugins extract and normalize configuration values,
handling schema objects (dicts with "value" or "default" keys) and type conversions.
"""

from collections.abc import Callable
from typing import Any, TypeVar

T = TypeVar("T")


def normalize_config_value(value: Any, default: Any = None) -> Any:
    """
    Normalize a config value, handling schema objects.

    Schema objects are dicts with "value" or "default" keys that represent
    configuration values from the UI. This function extracts the actual value.

    Args:
        value: The config value (may be a dict schema object or direct value)
        default: Default value to use if value is None or empty

    Returns:
        Normalized value (extracted from schema object if needed)

    Examples:
        >>> normalize_config_value("direct_value")
        'direct_value'
        >>> normalize_config_value({"value": "from_schema"})
        'from_schema'
        >>> normalize_config_value({"default": "default_value"})
        'default_value'
        >>> normalize_config_value(None, "fallback")
        'fallback'
        >>> normalize_config_value({"value": None, "default": "default"}, "fallback")
        'fallback'
    """
    # Handle None
    if value is None:
        return default

    # Handle schema objects (dicts with "value" or "default" keys)
    if isinstance(value, dict):
        # If "value" key exists (even if None), use it (None means use fallback, not schema default)
        # Otherwise, if "default" exists, use it
        # Otherwise, use the provided default fallback
        if "value" in value:
            # Value key exists - use it (even if None, which means use fallback)
            schema_value = value["value"]
            return schema_value if schema_value is not None else default
        # Value key doesn't exist - try schema default
        schema_default = value.get("default")
        if schema_default is not None:
            return schema_default
        return default

    # Direct value
    return value if value != "" else default


def extract_config_value(
    config: dict[str, Any],
    key: str,
    default: Any = None,
    type_hint: type[T] | None = None,
    converter: Callable[[Any], T] | None = None,
) -> T | Any:
    """
    Extract and normalize a config value from a config dictionary.

    This is a convenience function that combines dict.get() with normalize_config_value()
    and optional type conversion.

    Args:
        config: Configuration dictionary
        key: Key to extract from config
        default: Default value if key is missing or value is None/empty
        type_hint: Optional type hint for type checking (not enforced, just for documentation)
        converter: Optional function to convert the value (e.g., int, str, bool)

    Returns:
        Extracted and normalized value, optionally converted

    Examples:
        >>> config = {"count": "30", "enabled": {"value": "true"}}
        >>> extract_config_value(config, "count", default=10, converter=int)
        30
        >>> extract_config_value(config, "enabled", default=False, converter=lambda x: str(x).lower() in ("true", "1", "yes"))
        True
        >>> extract_config_value(config, "missing", default="default")
        'default'
    """
    value = config.get(key, default)
    normalized = normalize_config_value(value, default)

    # Apply converter if provided
    if converter is not None:
        try:
            return converter(normalized)
        except (ValueError, TypeError):
            return default

    return normalized


def normalize_config_dict(
    config: dict[str, Any],
    schema: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """
    Normalize an entire config dictionary, handling schema objects.

    Args:
        config: Configuration dictionary (may contain schema objects)
        schema: Optional schema definition with defaults for each key.
                Format: {"key": {"default": value, "type": type}}

    Returns:
        Normalized config dictionary with all schema objects resolved

    Examples:
        >>> config = {"count": {"value": "30"}, "enabled": {"default": True}}
        >>> normalize_config_dict(config)
        {'count': '30', 'enabled': True}
        >>> schema = {"count": {"default": 10, "type": int}}
        >>> normalize_config_dict(config, schema)
        {'count': 30, 'enabled': True}
    """
    normalized = {}

    # If schema provided, process all keys in schema
    if schema:
        for key, field_schema in schema.items():
            default = field_schema.get("default")
            field_type = field_schema.get("type")
            converter = field_schema.get("converter")

            if converter:
                normalized[key] = extract_config_value(
                    config, key, default=default, converter=converter
                )
            elif field_type:
                # Try to use type as converter
                try:
                    normalized[key] = extract_config_value(
                        config, key, default=default, converter=field_type
                    )
                except (ValueError, TypeError):
                    normalized[key] = extract_config_value(config, key, default=default)
            else:
                normalized[key] = extract_config_value(config, key, default=default)
    else:
        # No schema, just normalize all values
        for key, value in config.items():
            normalized[key] = normalize_config_value(value)

    return normalized


# Common type converters for convenience


def to_int(value: Any, default: int = 0) -> int:
    """Convert value to int, with fallback to default."""
    try:
        if value is None or value == "":
            return default
        return int(value)
    except (ValueError, TypeError):
        return default


def to_str(value: Any, default: str = "") -> str:
    """Convert value to str, with fallback to default."""
    if value is None:
        return default
    return str(value) if value != "" else default


def to_bool(value: Any, default: bool = False) -> bool:
    """Convert value to bool, handling string representations."""
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() in ("true", "1", "yes", "on")
    return bool(value) if value else default


def to_float(value: Any, default: float = 0.0) -> float:
    """Convert value to float, with fallback to default."""
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (ValueError, TypeError):
        return default


# Export converters
__all__ = [
    "normalize_config_value",
    "extract_config_value",
    "normalize_config_dict",
    "to_int",
    "to_str",
    "to_bool",
    "to_float",
]
