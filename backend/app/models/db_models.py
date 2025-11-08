"""Database models for calendar sources and configuration."""

from sqlalchemy import Boolean, Column, Integer, String, Text

from app.database import Base


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
