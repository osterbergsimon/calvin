"""Configuration service for managing application settings."""

import json
from typing import Any

from app.models.db_models import ConfigDB
from app.utils.db_retry import retry_on_db_locked


async def _execute_upsert(key: str, value: str | None, value_type: str) -> None:
    """Write one config row with a single atomic upsert statement.

    The old read-then-create pair raced: two concurrent writes of a new key
    both saw "no row" and one lost with a UNIQUE violation (audit R11).
    """
    await ConfigDB.ormar_config.database.execute(
        "INSERT INTO config (key, value, value_type) "
        "VALUES (:key, :value, :value_type) "
        "ON CONFLICT(key) DO UPDATE SET "
        "value = excluded.value, value_type = excluded.value_type",
        {"key": key, "value": value, "value_type": value_type},
    )


@retry_on_db_locked(max_retries=5, initial_delay=0.1, max_delay=1.0)
async def _upsert_config_row(key: str, value: str | None, value_type: str) -> None:
    """Upsert one config row, retrying while SQLite holds a write lock."""
    await _execute_upsert(key, value, value_type)


@retry_on_db_locked(max_retries=5, initial_delay=0.1, max_delay=1.0)
async def _delete_config_row(key: str) -> None:
    """Delete one config row, retrying while SQLite holds a write lock."""
    await ConfigDB.objects.delete(key=key)


class ConfigService:
    """Service for managing application configuration."""

    def __init__(self):
        """Initialize config service."""
        self._cache: dict[str, Any] = {}

    async def get_config(self) -> dict[str, Any]:
        """
        Get all configuration values.

        Returns:
            Dictionary of configuration key-value pairs
        """
        config_items = await ConfigDB.objects.all()

        config = {}
        for item in config_items:
            config[item.key] = self._parse_value(item.value, item.value_type)

        return config

    async def get_value(self, key: str, default: Any = None) -> Any:
        """
        Get a configuration value by key.

        Args:
            key: Configuration key
            default: Default value if key not found

        Returns:
            Configuration value or default
        """
        try:
            item = await ConfigDB.objects.get_or_none(key=key)

            if item:
                return self._parse_value(item.value, item.value_type)
            return default
        except Exception:
            # If table doesn't exist or any other error, return default
            # This is useful for tests where the config table might not be created
            return default

    async def set_value(self, key: str, value: Any, value_type: str | None = None) -> None:
        """
        Set a configuration value.

        Args:
            key: Configuration key
            value: Configuration value
            value_type: Optional value type (auto-detected if not provided)
        """
        if value_type is None:
            value_type = self._detect_type(value)

        serialized_value = self._serialize_value(value, value_type)

        await _upsert_config_row(key, serialized_value, value_type)

        # Update cache
        self._cache[key] = value

    async def delete_value(self, key: str) -> None:
        """Remove a configuration value so its built-in default applies again."""
        await _delete_config_row(key)
        self._cache.pop(key, None)

    async def update_config(self, config: dict[str, Any]) -> None:
        """
        Update multiple configuration values.

        Args:
            config: Dictionary of key-value pairs to update
        """
        for key, value in config.items():
            await self.set_value(key, value)

    def _detect_type(self, value: Any) -> str:
        """Detect the type of a value."""
        if isinstance(value, bool):
            return "bool"
        elif isinstance(value, int):
            return "int"
        elif isinstance(value, float):
            return "float"
        elif isinstance(value, dict | list):
            return "json"
        else:
            return "string"

    def _serialize_value(self, value: Any, value_type: str) -> str:
        """Serialize a value to string for storage."""
        if value_type == "json":
            return json.dumps(value)
        else:
            return str(value)

    def _parse_value(self, value: str, value_type: str) -> Any:
        """Parse a stored value based on its type."""
        if value is None:
            return None

        if value_type == "bool":
            return value.lower() in ("true", "1", "yes", "on")
        elif value_type == "int":
            return int(value)
        elif value_type == "float":
            return float(value)
        elif value_type == "json":
            return json.loads(value)
        else:
            return value


# Global config service instance
config_service = ConfigService()
