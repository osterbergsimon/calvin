"""Plugin registration module that implements pluggy hooks."""

from typing import Any

from app.plugins.base import PluginType
from app.plugins.calendar.google import GoogleCalendarPlugin
from app.plugins.calendar.ical import ICalCalendarPlugin
from app.plugins.hooks import hookimpl, plugin_manager
from app.plugins.image.imap import ImapImagePlugin
from app.plugins.image.local import LocalImagePlugin
from app.plugins.image.picsum import PicsumImagePlugin
from app.plugins.image.unsplash import UnsplashImagePlugin
from app.plugins.service.iframe import IframeServicePlugin


class PluginRegistration:
    """Plugin registration class that implements pluggy hooks."""

    @hookimpl
    def register_plugin_types(self) -> list[dict[str, Any]]:
        """Register all plugin types."""
        return [
            # Calendar plugins
            {
                "type_id": "google",
                "plugin_type": PluginType.CALENDAR,
                "name": "Google Calendar",
                "description": "Google Calendar via iCal feed",
                "version": "1.0.0",
                "common_config_schema": {},
                "plugin_class": GoogleCalendarPlugin,
            },
            {
                "type_id": "ical",
                "plugin_type": PluginType.CALENDAR,
                "name": "iCal Feed",
                "description": "Generic iCal feed (Proton, Outlook, etc.)",
                "version": "1.0.0",
                "common_config_schema": {},
                "plugin_class": ICalCalendarPlugin,
            },
            {
                "type_id": "proton",
                "plugin_type": PluginType.CALENDAR,
                "name": "Proton Calendar",
                "description": "Proton Calendar via iCal feed",
                "version": "1.0.0",
                "common_config_schema": {},
                "plugin_class": ICalCalendarPlugin,
            },
            # Image plugins
            {
                "type_id": "local",
                "plugin_type": PluginType.IMAGE,
                "name": "Local Images",
                "description": "Local filesystem image storage",
                "version": "1.0.0",
                "common_config_schema": {
                    "image_dir": {
                        "type": "string",
                        "description": "Default image directory path",
                        "default": "",
                    },
                    "thumbnail_dir": {
                        "type": "string",
                        "description": "Thumbnail directory path (optional, defaults to image_dir/thumbnails)",
                        "default": "",
                    },
                },
                "plugin_class": LocalImagePlugin,
            },
            {
                "type_id": "unsplash",
                "plugin_type": PluginType.IMAGE,
                "name": "Unsplash",
                "description": "Popular photos from Unsplash. Requires an API key from https://unsplash.com/developers",
                "version": "1.0.0",
                "common_config_schema": {
                    "api_key": {
                        "type": "password",
                        "description": "Unsplash API key (required). Get one at https://unsplash.com/developers",
                        "default": "",
                    },
                    "category": {
                        "type": "string",
                        "description": "Photo category: popular, latest, or oldest",
                        "default": "popular",
                    },
                    "count": {
                        "type": "string",
                        "description": "Number of photos to fetch (1-100)",
                        "default": "30",
                    },
                },
                "plugin_class": UnsplashImagePlugin,
            },
            {
                "type_id": "picsum",
                "plugin_type": PluginType.IMAGE,
                "name": "Picsum Photos",
                "description": "Random high-quality images from Picsum Photos (no API key required)",
                "version": "1.0.0",
                "common_config_schema": {
                    "count": {
                        "type": "string",
                        "description": "Number of photos to fetch (1-100)",
                        "default": "30",
                    },
                },
                "plugin_class": PicsumImagePlugin,
            },
            {
                "type_id": "imap",
                "plugin_type": PluginType.IMAGE,
                "name": "Email (IMAP)",
                "description": "Download images from email attachments. Works with Gmail, Outlook, and any IMAP provider. Share photos from Android using Share → Email.",
                "version": "1.0.0",
                "common_config_schema": {
                    "email_address": {
                        "type": "string",
                        "description": "Email address to check for images",
                        "default": "",
                    },
                    "email_password": {
                        "type": "password",
                        "description": "Email password or app-specific password (for Gmail, use App Password)",
                        "default": "",
                    },
                    "imap_server": {
                        "type": "string",
                        "description": "IMAP server address (e.g., imap.gmail.com, imap-mail.outlook.com)",
                        "default": "imap.gmail.com",
                    },
                    "imap_port": {
                        "type": "string",
                        "description": "IMAP server port (usually 993 for SSL)",
                        "default": "993",
                    },
                    "check_interval": {
                        "type": "string",
                        "description": "How often to check for new emails (seconds, default: 300 = 5 minutes)",
                        "default": "300",
                    },
                    "mark_as_read": {
                        "type": "string",
                        "description": "Mark processed emails as read (true/false, default: true)",
                        "default": "true",
                    },
                },
                "plugin_class": ImapImagePlugin,
            },
            # Service plugins
            {
                "type_id": "iframe",
                "plugin_type": PluginType.SERVICE,
                "name": "Iframe Service",
                "description": "Web service displayed in iframe",
                "version": "1.0.0",
                "common_config_schema": {},
                "plugin_class": IframeServicePlugin,
            },
        ]

    @hookimpl
    def create_plugin_instance(
        self,
        plugin_id: str,
        type_id: str,
        name: str,
        config: dict[str, Any],
    ) -> Any:
        """Create a plugin instance based on type_id."""
        enabled = config.get("enabled", True)

        # Calendar plugins
        if type_id == "google":
            ical_url = config.get("ical_url", "")
            return GoogleCalendarPlugin(
                plugin_id=plugin_id,
                name=name,
                ical_url=ical_url,
                enabled=enabled,
            )
        elif type_id in ("ical", "proton"):
            ical_url = config.get("ical_url", "")
            return ICalCalendarPlugin(
                plugin_id=plugin_id,
                name=name,
                ical_url=ical_url,
                enabled=enabled,
            )
        # Image plugins
        elif type_id == "local":
            from pathlib import Path

            # Extract actual values from config (handle case where schema objects might be stored)
            image_dir = config.get("image_dir", "")
            thumbnail_dir = config.get("thumbnail_dir")
            
            # If image_dir is a dict (schema object), extract the default or actual value
            if isinstance(image_dir, dict):
                image_dir = image_dir.get("default", "") or image_dir.get("value", "")
            # Ensure it's a string
            image_dir = str(image_dir) if image_dir else ""
            
            # Use default directory if image_dir is empty
            if not image_dir:
                image_dir = "./data/images"
            
            # If thumbnail_dir is a dict (schema object), extract the default or actual value
            if isinstance(thumbnail_dir, dict):
                thumbnail_dir = thumbnail_dir.get("default", "") or thumbnail_dir.get("value", "")
            # Ensure it's a string or None
            thumbnail_dir = str(thumbnail_dir) if thumbnail_dir else None
            
            return LocalImagePlugin(
                plugin_id=plugin_id,
                name=name,
                image_dir=Path(image_dir),
                thumbnail_dir=Path(thumbnail_dir) if thumbnail_dir else None,
                enabled=enabled,
            )
        elif type_id == "unsplash":
            # Extract config values
            api_key = config.get("api_key", "")
            category = config.get("category", "popular")
            count = config.get("count", 30)
            
            # Handle schema objects
            if isinstance(api_key, dict):
                api_key = api_key.get("value") or api_key.get("default") or ""
            api_key = str(api_key) if api_key else None
            
            if isinstance(category, dict):
                category = category.get("value") or category.get("default") or "popular"
            category = str(category) if category else "popular"
            
            if isinstance(count, dict):
                count = count.get("value") or count.get("default") or 30
            try:
                count = int(count) if count else 30
            except (ValueError, TypeError):
                count = 30
            
            return UnsplashImagePlugin(
                plugin_id=plugin_id,
                name=name,
                api_key=api_key,
                category=category,
                count=count,
                enabled=enabled,
            )
        elif type_id == "picsum":
            # Extract config values
            count = config.get("count", 30)
            
            # Handle schema objects
            if isinstance(count, dict):
                count = count.get("value") or count.get("default") or 30
            try:
                count = int(count) if count else 30
            except (ValueError, TypeError):
                count = 30
            
            return PicsumImagePlugin(
                plugin_id=plugin_id,
                name=name,
                count=count,
                enabled=enabled,
            )
        elif type_id == "imap":
            # Extract config values
            email_address = config.get("email_address", "")
            email_password = config.get("email_password", "")
            imap_server = config.get("imap_server", "imap.gmail.com")
            imap_port = config.get("imap_port", 993)
            image_dir = config.get("image_dir")
            check_interval = config.get("check_interval", 300)
            mark_as_read = config.get("mark_as_read", True)

            # Handle schema objects
            if isinstance(email_address, dict):
                email_address = email_address.get("value") or email_address.get("default") or ""
            email_address = str(email_address) if email_address else ""

            if isinstance(email_password, dict):
                email_password = email_password.get("value") or email_password.get("default") or ""
            email_password = str(email_password) if email_password else ""

            if isinstance(imap_server, dict):
                imap_server = imap_server.get("value") or imap_server.get("default") or "imap.gmail.com"
            imap_server = str(imap_server) if imap_server else "imap.gmail.com"

            if isinstance(imap_port, dict):
                imap_port = imap_port.get("value") or imap_port.get("default") or 993
            try:
                imap_port = int(imap_port) if imap_port else 993
            except (ValueError, TypeError):
                imap_port = 993

            if isinstance(check_interval, dict):
                check_interval = check_interval.get("value") or check_interval.get("default") or 300
            try:
                check_interval = int(check_interval) if check_interval else 300
            except (ValueError, TypeError):
                check_interval = 300

            if isinstance(mark_as_read, dict):
                mark_as_read = mark_as_read.get("value") or mark_as_read.get("default") or True
            mark_as_read = (
                mark_as_read == "true"
                if isinstance(mark_as_read, str)
                else bool(mark_as_read)
            )

            return ImapImagePlugin(
                plugin_id=plugin_id,
                name=name,
                email_address=email_address,
                email_password=email_password,
                imap_server=imap_server,
                imap_port=imap_port,
                image_dir=image_dir,
                check_interval=check_interval,
                mark_as_read=mark_as_read,
                enabled=enabled,
            )
        # Service plugins
        elif type_id == "iframe":
            url = config.get("url", "")
            fullscreen = config.get("fullscreen", False)
            return IframeServicePlugin(
                plugin_id=plugin_id,
                name=name,
                url=url,
                enabled=enabled,
                fullscreen=fullscreen,
            )

        return None


# Register the plugin registration class
plugin_registration = PluginRegistration()
# Register with pluggy (only once - this happens when module is imported)
try:
    plugin_manager.register(plugin_registration)
except ValueError:
    # Already registered (e.g., if module is imported multiple times)
    pass

