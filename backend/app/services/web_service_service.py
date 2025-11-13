"""Web service management service."""

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.db_models import PluginDB
from app.models.web_service import WebService, WebServiceCreate, WebServiceUpdate


class WebServiceService:
    """Service for managing web services."""

    def __init__(self):
        """Initialize web service service."""
        self._services: list[WebService] = []

    async def get_services(self) -> list[WebService]:
        """
        Get all web services, ordered by display_order.

        Returns:
            List of web services
        """
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(PluginDB).where(PluginDB.plugin_type == "service")
            )
            db_plugins = result.scalars().all()
            print(f"[WebServiceService] Found {len(db_plugins)} service plugin instances in database")

            services = []
            from app.plugins.loader import plugin_loader
            
            # Get plugin types to access display_schema
            plugin_types = plugin_loader.get_plugin_types()
            plugin_types_by_id = {t.get("type_id"): t for t in plugin_types}
            
            for db_plugin in db_plugins:
                print(f"[WebServiceService] Processing service: id={db_plugin.id}, type_id={db_plugin.type_id}, name={db_plugin.name}, enabled={db_plugin.enabled}")
                config = db_plugin.config or {}
                # Get URL from config
                url = config.get("url", "")
                # If no URL in config, try to get it from the plugin instance using protocol methods
                if not url:
                    from app.plugins.manager import plugin_manager
                    from app.plugins.protocols import ServicePlugin
                    plugin = plugin_manager.get_plugin(db_plugin.id)
                    if plugin and isinstance(plugin, ServicePlugin):
                        # Use protocol-defined method to get content
                        import asyncio
                        try:
                            content = await plugin.get_content()
                            url = content.get("url", "")
                        except Exception:
                            # If async call fails, fall back to config
                            plugin_config = plugin.get_config()
                            url = plugin_config.get("url", "") if plugin_config else ""
                
                # Get display_schema from plugin type metadata
                type_id = db_plugin.type_id
                display_schema = None
                if type_id and type_id in plugin_types_by_id:
                    display_schema = plugin_types_by_id[type_id].get("display_schema")
                
                service = WebService(
                    id=db_plugin.id,
                    name=db_plugin.name,
                    url=url,
                    enabled=db_plugin.enabled,
                    display_order=config.get("display_order", 0),
                    fullscreen=config.get("fullscreen", False),
                    type_id=type_id,
                    display_schema=display_schema,
                )
                print(f"[WebServiceService] Created service: id={service.id}, name={service.name}, enabled={service.enabled}, url={service.url[:50] if service.url else 'None'}...")
                services.append(service)

            # Sort by display_order (fallback if SQL ordering didn't work)
            services.sort(key=lambda s: (s.display_order, s.name))
            self._services = services
            print(f"[WebServiceService] Returning {len(services)} services: {[s.id for s in services]}")
            return services

    async def get_service(self, service_id: str) -> WebService | None:
        """
        Get a web service by ID.

        Args:
            service_id: Service ID

        Returns:
            Web service or None if not found
        """
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(PluginDB).where(PluginDB.id == service_id, PluginDB.plugin_type == "service")
            )
            db_plugin = result.scalar_one_or_none()

            if db_plugin:
                config = db_plugin.config or {}
                return WebService(
                    id=db_plugin.id,
                    name=db_plugin.name,
                    url=config.get("url", ""),
                    enabled=db_plugin.enabled,
                    display_order=config.get("display_order", 0),
                    fullscreen=config.get("fullscreen", False),
                )
            return None

    async def add_service(self, service: WebServiceCreate) -> WebService:
        """
        Add a new web service.

        Args:
            service: Web service to add

        Returns:
            Created web service
        """
        from app.plugins.registry import plugin_registry

        # Generate ID if not provided
        service_id = f"iframe-service-{hash(service.url) % 10000}-{len(self._services)}"

        # Ensure name is set - use URL if name is empty
        service_name = service.name.strip() if service.name else service.url[:50] if service.url else "Web Service"

        # Register plugin using unified system
        plugin = await plugin_registry.register_plugin(
            plugin_id=service_id,
            type_id="iframe",
            name=service_name,
            config={
                "url": service.url,
                "fullscreen": service.fullscreen,
                "display_order": service.display_order,
            },
            enabled=service.enabled,
        )

        # Get service info from plugin using protocol-defined methods
        config = plugin.get_config()
        content = await plugin.get_content()
        
        return WebService(
            id=plugin.plugin_id,
            name=plugin.name,
            url=content.get("url", config.get("url", "")),
            enabled=plugin.enabled,
            display_order=config.get("display_order", 0),
            fullscreen=config.get("fullscreen", False),
        )

    async def update_service(self, service_id: str, updates: WebServiceUpdate) -> WebService | None:
        """
        Update a web service.

        Args:
            service_id: Service ID
            updates: Updates to apply

        Returns:
            Updated web service or None if not found
        """
        from app.plugins.manager import plugin_manager
        from app.plugins.protocols import ServicePlugin
        from app.database import AsyncSessionLocal
        from app.models.db_models import PluginDB
        from sqlalchemy import select

        # Get plugin
        plugin = plugin_manager.get_plugin(service_id)
        if not plugin or not isinstance(plugin, ServicePlugin):
            return None

        # Update plugin configuration using protocol-defined methods
        config = plugin.get_config() or {}
        if updates.name is not None:
            plugin.name = updates.name
        if updates.url is not None:
            config["url"] = updates.url
        if updates.enabled is not None:
            config["enabled"] = updates.enabled
            if updates.enabled:
                plugin.enable()
            else:
                plugin.disable()
        if updates.display_order is not None:
            config["display_order"] = updates.display_order
        if updates.fullscreen is not None:
            config["fullscreen"] = updates.fullscreen

        await plugin.configure(config)

        # Update in database
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(PluginDB).where(PluginDB.id == service_id)
            )
            db_plugin = result.scalar_one_or_none()
            if db_plugin:
                if updates.name is not None:
                    db_plugin.name = updates.name
                if updates.enabled is not None:
                    db_plugin.enabled = updates.enabled
                db_plugin.config = config
                await session.commit()
                await session.refresh(db_plugin)

        # Get service info from plugin using protocol-defined methods
        content = await plugin.get_content()
        
        return WebService(
            id=plugin.plugin_id,
            name=plugin.name,
            url=content.get("url", config.get("url", "")),
            enabled=plugin.enabled,
            display_order=config.get("display_order", 0),
            fullscreen=config.get("fullscreen", False),
        )

    async def remove_service(self, service_id: str) -> bool:
        """
        Remove a web service.

        Args:
            service_id: Service ID

        Returns:
            True if removed, False if not found
        """
        from app.plugins.registry import plugin_registry

        # Unregister plugin using unified system
        return await plugin_registry.unregister_plugin(service_id)

    async def get_enabled_services(self) -> list[WebService]:
        """
        Get all enabled web services, ordered by display_order.

        Returns:
            List of enabled web services
        """
        all_services = await self.get_services()
        return [s for s in all_services if s.enabled]


# Global web service instance
web_service_service = WebServiceService()
