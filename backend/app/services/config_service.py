"""Configuration service for managing application settings."""

from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.db_models import ConfigDB
from app.database import AsyncSessionLocal
import json


class ConfigService:
    """Service for managing application configuration."""

    def __init__(self):
        """Initialize config service."""
        self._cache: Dict[str, Any] = {}

    async def get_config(self) -> Dict[str, Any]:
        """
        Get all configuration values.

        Returns:
            Dictionary of configuration key-value pairs
        """
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(ConfigDB))
            config_items = result.scalars().all()
            
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
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(ConfigDB).where(ConfigDB.key == key)
            )
            item = result.scalar_one_or_none()
            
            if item:
                return self._parse_value(item.value, item.value_type)
            return default

    async def set_value(self, key: str, value: Any, value_type: Optional[str] = None) -> None:
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
        
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(ConfigDB).where(ConfigDB.key == key)
            )
            item = result.scalar_one_or_none()
            
            if item:
                item.value = serialized_value
                item.value_type = value_type
            else:
                item = ConfigDB(key=key, value=serialized_value, value_type=value_type)
                session.add(item)
            
            await session.commit()
            
            # Update cache
            self._cache[key] = value

    async def update_config(self, config: Dict[str, Any]) -> None:
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
        elif isinstance(value, (dict, list)):
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

