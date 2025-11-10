"""Plugin registry service for loading and managing plugins from database."""

import json
from typing import Any

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.db_models import CalendarSourceDB, WebServiceDB
from app.plugins.base import PluginType
from app.plugins.calendar.google import GoogleCalendarPlugin
from app.plugins.calendar.ical import ICalCalendarPlugin
from app.plugins.image.local import LocalImagePlugin
from app.plugins.manager import plugin_manager
from app.plugins.protocols import CalendarPlugin, ImagePlugin, ServicePlugin
from app.plugins.service.iframe import IframeServicePlugin


class PluginRegistry:
    """Registry service for loading and managing plugins from database."""

    def __init__(self):
        """Initialize plugin registry."""
        self._initialized = False

    async def load_plugins_from_db(self) -> None:
        """Load all plugins from database and register them."""
        # Load calendar plugins
        await self._load_calendar_plugins()

        # Load image plugins
        await self._load_image_plugins()

        # Load service plugins
        await self._load_service_plugins()

        # Initialize all plugins
        if not self._initialized:
            await plugin_manager.initialize_all()
            self._initialized = True

    async def _load_calendar_plugins(self) -> None:
        """Load calendar plugins from database."""
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(CalendarSourceDB))
            db_sources = result.scalars().all()

            for db_source in db_sources:
                # Check if plugin already registered
                existing = plugin_manager.get_plugin(db_source.id)
                if existing:
                    continue

                # Create plugin based on type
                if db_source.type == "google":
                    plugin = GoogleCalendarPlugin(
                        plugin_id=db_source.id,
                        name=db_source.name,
                        ical_url=db_source.ical_url or "",
                        enabled=db_source.enabled,
                    )
                elif db_source.type == "proton" or db_source.type == "ical":
                    plugin = ICalCalendarPlugin(
                        plugin_id=db_source.id,
                        name=db_source.name,
                        ical_url=db_source.ical_url or "",
                        enabled=db_source.enabled,
                    )
                else:
                    # Default to iCal for unknown types
                    plugin = ICalCalendarPlugin(
                        plugin_id=db_source.id,
                        name=db_source.name,
                        ical_url=db_source.ical_url or "",
                        enabled=db_source.enabled,
                    )

                # Configure plugin with additional settings
                await plugin.configure({
                    "color": db_source.color,
                    "show_time": db_source.show_time,
                })

                # Register plugin
                plugin_manager.register(plugin)

    async def _load_image_plugins(self) -> None:
        """Load image plugins from database."""
        # For now, we'll create a default local image plugin
        # In the future, we can load multiple image plugins from database
        from app.config import settings

        default_plugin_id = "local-images"
        existing = plugin_manager.get_plugin(default_plugin_id)
        if not existing:
            plugin = LocalImagePlugin(
                plugin_id=default_plugin_id,
                name="Local Images",
                image_dir=settings.image_dir,
                thumbnail_dir=settings.image_cache_dir / "thumbnails",
                enabled=True,
            )
            plugin_manager.register(plugin)

    async def _load_service_plugins(self) -> None:
        """Load service plugins from database."""
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(WebServiceDB).order_by(WebServiceDB.display_order))
            db_services = result.scalars().all()

            for db_service in db_services:
                # Check if plugin already registered
                existing = plugin_manager.get_plugin(db_service.id)
                if existing:
                    continue

                # Create iframe service plugin
                plugin = IframeServicePlugin(
                    plugin_id=db_service.id,
                    name=db_service.name,
                    url=db_service.url,
                    enabled=db_service.enabled,
                    fullscreen=db_service.fullscreen,
                )

                # Configure plugin with additional settings
                await plugin.configure({
                    "display_order": db_service.display_order,
                })

                # Register plugin
                plugin_manager.register(plugin)

    async def register_calendar_plugin(
        self,
        plugin_id: str,
        name: str,
        plugin_type: str,
        config: dict[str, Any],
    ) -> CalendarPlugin:
        """
        Register a new calendar plugin.

        Args:
            plugin_id: Unique identifier for the plugin
            name: Human-readable name
            plugin_type: Plugin type ('google', 'ical', 'proton', etc.)
            config: Plugin configuration

        Returns:
            Registered calendar plugin
        """
        # Create plugin based on type
        ical_url = config.get("ical_url", "")
        enabled = config.get("enabled", True)

        if plugin_type == "google":
            plugin = GoogleCalendarPlugin(
                plugin_id=plugin_id,
                name=name,
                ical_url=ical_url,
                enabled=enabled,
            )
        else:
            # Default to iCal for other types
            plugin = ICalCalendarPlugin(
                plugin_id=plugin_id,
                name=name,
                ical_url=ical_url,
                enabled=enabled,
            )

        # Configure plugin
        await plugin.configure(config)

        # Register plugin
        plugin_manager.register(plugin)

        # Initialize plugin
        await plugin.initialize()

        return plugin

    async def register_image_plugin(
        self,
        plugin_id: str,
        name: str,
        plugin_type: str,
        config: dict[str, Any],
    ) -> ImagePlugin:
        """
        Register a new image plugin.

        Args:
            plugin_id: Unique identifier for the plugin
            name: Human-readable name
            plugin_type: Plugin type ('local', etc.)
            config: Plugin configuration

        Returns:
            Registered image plugin
        """
        # For now, only support local image plugin
        if plugin_type != "local":
            raise ValueError(f"Unsupported image plugin type: {plugin_type}")

        from pathlib import Path

        image_dir = Path(config.get("image_dir", ""))
        thumbnail_dir = config.get("thumbnail_dir")
        if thumbnail_dir:
            thumbnail_dir = Path(thumbnail_dir)
        enabled = config.get("enabled", True)

        plugin = LocalImagePlugin(
            plugin_id=plugin_id,
            name=name,
            image_dir=image_dir,
            thumbnail_dir=thumbnail_dir,
            enabled=enabled,
        )

        # Register plugin
        plugin_manager.register(plugin)

        # Initialize plugin
        await plugin.initialize()

        return plugin

    async def register_service_plugin(
        self,
        plugin_id: str,
        name: str,
        plugin_type: str,
        config: dict[str, Any],
    ) -> ServicePlugin:
        """
        Register a new service plugin.

        Args:
            plugin_id: Unique identifier for the plugin
            name: Human-readable name
            plugin_type: Plugin type ('iframe', etc.)
            config: Plugin configuration

        Returns:
            Registered service plugin
        """
        # For now, only support iframe service plugin
        if plugin_type != "iframe":
            raise ValueError(f"Unsupported service plugin type: {plugin_type}")

        url = config.get("url", "")
        enabled = config.get("enabled", True)
        fullscreen = config.get("fullscreen", False)

        plugin = IframeServicePlugin(
            plugin_id=plugin_id,
            name=name,
            url=url,
            enabled=enabled,
            fullscreen=fullscreen,
        )

        # Configure plugin
        await plugin.configure(config)

        # Register plugin
        plugin_manager.register(plugin)

        # Initialize plugin
        await plugin.initialize()

        return plugin

    async def unregister_plugin(self, plugin_id: str) -> bool:
        """
        Unregister a plugin.

        Args:
            plugin_id: Plugin ID to unregister

        Returns:
            True if unregistered, False if not found
        """
        plugin = plugin_manager.get_plugin(plugin_id)
        if plugin:
            await plugin.cleanup()
        return plugin_manager.unregister(plugin_id)


# Global plugin registry instance
plugin_registry = PluginRegistry()

