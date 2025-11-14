"""Database models for calendar sources and configuration."""

import json
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text
from sqlalchemy.types import VARCHAR, TypeDecorator

from app.database import Base


class JSONEncodedDict(TypeDecorator):
    """JSON-encoded dictionary type for SQLAlchemy."""

    impl = VARCHAR
    cache_ok = True

    def process_bind_param(self, value: Any, dialect) -> str | None:
        """Convert dict to JSON string for storage."""
        if value is not None:
            return json.dumps(value)
        return None

    def process_result_value(self, value: str | None, dialect) -> dict[str, Any] | None:
        """Convert JSON string to dict for retrieval."""
        if value is not None:
            return json.loads(value)
        return None


class CalendarSourceDB(Base):
    """Database model for calendar sources."""

    __tablename__ = "calendar_sources"

    id = Column(String, primary_key=True, index=True)
    type = Column(String, nullable=False)  # 'google' or 'proton'
    name = Column(String, nullable=False)
    enabled = Column(Boolean, default=True, nullable=False)
    ical_url = Column(Text, nullable=True)  # For Google Calendar share links
    api_key = Column(Text, nullable=True)  # For API-based sources
    color = Column(String, nullable=True)  # Hex color code for calendar events
    show_time = Column(Boolean, default=True, nullable=False)  # Show event times in calendar


class ConfigDB(Base):
    """Database model for application configuration."""

    __tablename__ = "config"

    key = Column(String, primary_key=True, index=True)
    value = Column(Text, nullable=True)
    value_type = Column(String, nullable=False, default="string")  # string, int, float, bool, json


class KeyboardMappingDB(Base):
    """Database model for keyboard mappings."""

    __tablename__ = "keyboard_mappings"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    keyboard_type = Column(String, nullable=False)  # '7-button' or 'standard'
    key_code = Column(String, nullable=False)  # e.g., 'KEY_1', 'KEY_RIGHT'
    action = Column(String, nullable=False)  # e.g., 'calendar_next_month'

    __table_args__ = ({"sqlite_autoincrement": True},)


class WebServiceDB(Base):
    """Database model for web services."""

    __tablename__ = "web_services"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    url = Column(Text, nullable=False)
    enabled = Column(Boolean, default=True, nullable=False)
    display_order = Column(Integer, default=0, nullable=False)  # Order for display/switching
    fullscreen = Column(Boolean, default=False, nullable=False)  # Prefer fullscreen mode


class PluginTypeDB(Base):
    """Database model for plugin types."""

    __tablename__ = "plugin_types"

    type_id = Column(String, primary_key=True, index=True)  # e.g., 'google', 'local', 'iframe'
    plugin_type = Column(String, nullable=False)  # 'calendar', 'image', 'service'
    name = Column(String, nullable=False)  # Human-readable name
    description = Column(Text, nullable=True)  # Plugin type description
    version = Column(String, nullable=True)  # Plugin type version
    common_config_schema = Column(JSONEncodedDict, nullable=True)  # Common config schema (JSON)
    enabled = Column(Boolean, default=True, nullable=False)  # Whether plugin type is enabled
    error_message = Column(Text, nullable=True)  # Error message if plugin failed to load
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class PluginDB(Base):
    """Database model for plugin instances."""

    __tablename__ = "plugins"

    id = Column(String, primary_key=True, index=True)  # Plugin instance ID
    type_id = Column(String, nullable=False, index=True)  # Plugin type ID (e.g., 'google', 'local')
    plugin_type = Column(
        String, nullable=False, index=True
    )  # Plugin category ('calendar', 'image', 'service')
    name = Column(String, nullable=False)  # Instance name
    version = Column(String, nullable=True)  # Plugin version (optional)
    enabled = Column(Boolean, default=True, nullable=False)  # Whether plugin instance is enabled
    config = Column(JSONEncodedDict, nullable=True)  # Instance-specific config (JSON)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
