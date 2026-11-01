"""Database models for calendar sources and configuration."""

from datetime import datetime

import ormar

from app.database import database, metadata
from app.utils.utc import UTCDateTime, utcnow


class ConfigDB(ormar.Model):
    """Database model for application configuration."""

    ormar_config = ormar.OrmarConfig(
        database=database,
        metadata=metadata,
        tablename="config",
    )

    key: str = ormar.String(max_length=255, primary_key=True, index=True)
    value: str | None = ormar.Text(nullable=True)
    value_type: str = ormar.String(
        max_length=50, nullable=False, default="string"
    )  # string, int, float, bool, json


class KeyboardMappingDB(ormar.Model):
    """Database model for keyboard mappings."""

    ormar_config = ormar.OrmarConfig(
        database=database,
        metadata=metadata,
        tablename="keyboard_mappings",
    )

    id: int | None = ormar.Integer(primary_key=True, autoincrement=True)
    key_code: str = ormar.String(max_length=100, nullable=False)  # e.g., 'KEY_1', 'KEY_RIGHT'
    action: str = ormar.String(max_length=100, nullable=False)  # e.g., 'calendar_next_month'


class PluginTypeDB(ormar.Model):
    """Database model for plugin types."""

    ormar_config = ormar.OrmarConfig(
        database=database,
        metadata=metadata,
        tablename="plugin_types",
    )

    type_id: str = ormar.String(
        max_length=255, primary_key=True, index=True
    )  # e.g., 'google', 'local', 'iframe'
    plugin_type: str = ormar.String(max_length=50, nullable=False)  # 'calendar', 'image', 'service'
    name: str = ormar.String(max_length=255, nullable=False)  # Human-readable name
    description: str | None = ormar.Text(nullable=True)  # Plugin type description
    version: str | None = ormar.String(max_length=50, nullable=True)  # Plugin type version
    common_config_schema: dict | None = ormar.JSON(
        nullable=True
    )  # Common config schema (JSON) - Built-in JSON!
    enabled: bool = ormar.Boolean(default=True, nullable=False)  # Whether plugin type is enabled
    error_message: str | None = ormar.Text(nullable=True)  # Error message if plugin failed to load
    created_at: datetime = UTCDateTime(default=utcnow, nullable=False)
    updated_at: datetime = UTCDateTime(default=utcnow, nullable=False)

    async def update_with_timestamp(self, **kwargs):
        """
        Update the model and automatically set updated_at timestamp.

        Args:
            **kwargs: Fields to update

        Example:
            await plugin_type.update_with_timestamp(enabled=False)
        """
        self.updated_at = utcnow()
        for key, value in kwargs.items():
            setattr(self, key, value)
        await self.update()

    async def save_with_timestamp(self):
        """
        Save the model and automatically set updated_at timestamp.
        Useful when modifying fields directly before saving.

        Example:
            plugin_type.enabled = False
            await plugin_type.save_with_timestamp()
        """
        self.updated_at = utcnow()
        await self.update()


class PluginDB(ormar.Model):
    """Database model for plugin instances."""

    ormar_config = ormar.OrmarConfig(
        database=database,
        metadata=metadata,
        tablename="plugins",
    )

    id: str = ormar.String(max_length=255, primary_key=True, index=True)  # Plugin instance ID
    type_id: str = ormar.String(
        max_length=255, nullable=False, index=True
    )  # Plugin type ID (e.g., 'google', 'local')
    plugin_type: str = ormar.String(
        max_length=50, nullable=False, index=True
    )  # Plugin category ('calendar', 'image', 'service')
    name: str = ormar.String(max_length=255, nullable=False)  # Instance name
    version: str | None = ormar.String(max_length=50, nullable=True)  # Plugin version (optional)
    enabled: bool = ormar.Boolean(
        default=True, nullable=False
    )  # Whether plugin instance is enabled
    config: dict | None = ormar.JSON(
        nullable=True
    )  # Instance-specific config (JSON) - Built-in JSON!
    display_order: int = ormar.Integer(
        default=0, nullable=False
    )  # Display order for instances of the same plugin type
    created_at: datetime = UTCDateTime(default=utcnow, nullable=False)
    updated_at: datetime = UTCDateTime(default=utcnow, nullable=False)

    async def update_with_timestamp(self, **kwargs):
        """
        Update the model and automatically set updated_at timestamp.

        Args:
            **kwargs: Fields to update

        Example:
            await plugin.update_with_timestamp(enabled=False, display_order=5)
        """
        self.updated_at = utcnow()
        for key, value in kwargs.items():
            setattr(self, key, value)
        await self.update()

    async def save_with_timestamp(self):
        """
        Save the model and automatically set updated_at timestamp.
        Useful when modifying fields directly before saving.

        Example:
            plugin.enabled = False
            plugin.display_order = 5
            await plugin.save_with_timestamp()
        """
        self.updated_at = utcnow()
        await self.update()


class KioskDB(ormar.Model):
    """Database model for known kiosks (per-device registry)."""

    ormar_config = ormar.OrmarConfig(
        database=database,
        metadata=metadata,
        tablename="kiosks",
    )

    id: str = ormar.String(max_length=255, primary_key=True, index=True)  # CALVIN_KIOSK_ID
    hostname: str | None = ormar.String(max_length=255, nullable=True)  # reported by the kiosk
    last_seen: datetime = UTCDateTime(default=utcnow, nullable=False)
    last_applied_version: str | None = ormar.String(
        max_length=64, nullable=True
    )  # device-config version the display-agent last confirmed applied (used by dd9.3)
    overrides: dict | None = ormar.JSON(nullable=True)  # sparse per-kiosk config (used by dd9.3)
    agent_version: str | None = ormar.String(
        max_length=64, nullable=True
    )  # running display-agent bundle version, reported by the agent (calvin-lxw)
    agent_update_status: str | None = ormar.String(
        max_length=128, nullable=True
    )  # ok | updating | error | success (calvin-lxw)
    agent_update_message: str | None = ormar.String(
        max_length=255, nullable=True
    )  # updater's human-readable message for the last agent update (calvin-dvy3)
    viewport: dict | None = ormar.JSON(
        nullable=True
    )  # screen's reported CSS viewport {w, h}, used by the layout editor preview (CLV-36)
    display_stack: str | None = ormar.String(
        max_length=16, nullable=True
    )  # x11 | wayland | cog, reported by the display agent (calvin-2ibz)
