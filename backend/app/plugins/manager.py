"""Plugin manager for registering and managing plugins."""

from loguru import logger

from app.plugins.base import BasePlugin, PluginType
from app.plugins.protocols import BackendPlugin

# Loguru automatically includes module/function info in logs


class PluginManager:
    """Manages plugin registration and lifecycle."""

    def __init__(self):
        """Initialize plugin manager."""
        self._plugins: dict[str, BasePlugin] = {}
        self._plugins_by_type: dict[PluginType, list[BasePlugin]] = {
            PluginType.CALENDAR: [],
            PluginType.IMAGE: [],
            PluginType.SERVICE: [],
            PluginType.BACKEND: [],
        }

    def register(self, plugin: BasePlugin) -> None:
        """
        Register a plugin.

        Args:
            plugin: Plugin instance to register
        """
        if plugin.plugin_id in self._plugins:
            raise ValueError(f"Plugin with ID '{plugin.plugin_id}' already registered")

        self._plugins[plugin.plugin_id] = plugin
        # Ensure plugin type list exists
        if plugin.plugin_type not in self._plugins_by_type:
            self._plugins_by_type[plugin.plugin_type] = []
        self._plugins_by_type[plugin.plugin_type].append(plugin)

        # Register backend plugin scheduled tasks if applicable
        if isinstance(plugin, BackendPlugin) and plugin.enabled:
            # Schedule registration will happen in start_plugin()
            pass

    def unregister(self, plugin_id: str) -> bool:
        """
        Unregister a plugin.

        Note: Plugins should be stopped before unregistering to ensure proper cleanup
        of scheduled tasks and workers. Call stop_plugin() first for backend plugins.

        Args:
            plugin_id: ID of plugin to unregister

        Returns:
            True if unregistered, False if not found
        """
        if plugin_id not in self._plugins:
            return False

        plugin = self._plugins[plugin_id]
        del self._plugins[plugin_id]
        if plugin.plugin_type in self._plugins_by_type:
            try:
                self._plugins_by_type[plugin.plugin_type].remove(plugin)
            except ValueError:
                # Plugin not in list, that's fine
                pass
        return True

    def get_plugin(self, plugin_id: str) -> BasePlugin | None:
        """
        Get a plugin by ID.

        Args:
            plugin_id: Plugin ID

        Returns:
            Plugin instance or None if not found
        """
        return self._plugins.get(plugin_id)

    def get_plugins(
        self, plugin_type: PluginType | None = None, enabled_only: bool = True
    ) -> list[BasePlugin]:
        """
        Get plugins, optionally filtered by type and enabled status.

        Args:
            plugin_type: Optional plugin type filter
            enabled_only: If True, only return enabled plugins

        Returns:
            List of plugin instances
        """
        if plugin_type:
            plugins = self._plugins_by_type.get(plugin_type, [])
        else:
            plugins = list(self._plugins.values())

        if enabled_only:
            plugins = [p for p in plugins if p.enabled]

        return plugins

    async def initialize_all(self) -> None:
        """Initialize all registered plugins."""
        from app.services.backend_scheduler import backend_plugin_scheduler

        for plugin in self._plugins.values():
            if plugin.enabled:
                try:
                    await plugin.initialize()

                    # Start background worker if backend plugin
                    if isinstance(plugin, BackendPlugin):
                        try:
                            await plugin.start_worker()
                        except NotImplementedError:
                            # Plugin doesn't implement start_worker, that's fine
                            pass
                        except Exception as e:
                            logger.warning(
                                f"Error starting worker for backend plugin {plugin.plugin_id}: {e}",
                                exc_info=True,
                            )

                    # Mark as running after successful initialization
                    plugin.start()

                    # Register scheduled tasks if backend plugin
                    if isinstance(plugin, BackendPlugin):
                        try:
                            await backend_plugin_scheduler.register_plugin_tasks(plugin)
                        except Exception as e:
                            logger.error(
                                f"Error registering scheduled tasks for backend plugin "
                                f"{plugin.plugin_id}: {e}",
                                exc_info=True,
                            )
                except Exception:
                    logger.exception("Error initializing plugin {}", plugin.plugin_id)
                    # Plugin failed to initialize, so it's not running
                    plugin.stop()

    async def cleanup_all(self) -> None:
        """Cleanup all registered plugins."""
        from app.services.backend_scheduler import backend_plugin_scheduler

        for plugin in self._plugins.values():
            try:
                # Unregister scheduled tasks if backend plugin
                if isinstance(plugin, BackendPlugin):
                    try:
                        await backend_plugin_scheduler.unregister_plugin_tasks(plugin.plugin_id)
                    except Exception as e:
                        logger.warning(
                            f"Error unregistering scheduled tasks for backend plugin "
                            f"{plugin.plugin_id}: {e}",
                            exc_info=True,
                        )

                # Stop plugin before cleanup
                plugin.stop()

                # Stop background worker if backend plugin
                if isinstance(plugin, BackendPlugin):
                    try:
                        await plugin.stop_worker()
                    except NotImplementedError:
                        # Plugin doesn't implement stop_worker, that's fine
                        pass
                    except Exception as e:
                        logger.warning(
                            f"Error stopping worker for backend plugin {plugin.plugin_id}: {e}",
                            exc_info=True,
                        )

                await plugin.cleanup()
            except Exception:
                logger.exception("Error cleaning up plugin {}", plugin.plugin_id)

    async def start_plugin(self, plugin_id: str) -> bool:
        """
        Start a plugin (if enabled).

        Args:
            plugin_id: ID of plugin to start

        Returns:
            True if started, False if not found or not enabled
        """
        from app.services.backend_scheduler import backend_plugin_scheduler

        plugin = self.get_plugin(plugin_id)
        if not plugin or not plugin.enabled:
            return False

        try:
            if not plugin.is_running():
                await plugin.initialize()

                # Start background worker if backend plugin
                if isinstance(plugin, BackendPlugin):
                    try:
                        await plugin.start_worker()
                    except NotImplementedError:
                        # Plugin doesn't implement start_worker, that's fine
                        pass
                    except Exception as e:
                        logger.warning(
                            f"Error starting worker for backend plugin {plugin_id}: {e}",
                            exc_info=True,
                        )

                plugin.start()

                # Register scheduled tasks if backend plugin
                if isinstance(plugin, BackendPlugin):
                    try:
                        await backend_plugin_scheduler.register_plugin_tasks(plugin)
                    except Exception as e:
                        logger.error(
                            f"Error registering scheduled tasks for backend plugin "
                            f"{plugin_id}: {e}",
                            exc_info=True,
                        )

            return True
        except Exception:
            logger.exception("Error starting plugin {}", plugin_id)
            plugin.stop()
            return False

    async def stop_plugin(self, plugin_id: str) -> bool:
        """
        Stop a plugin.

        Args:
            plugin_id: ID of plugin to stop

        Returns:
            True if stopped, False if not found
        """
        from app.services.backend_scheduler import backend_plugin_scheduler

        plugin = self.get_plugin(plugin_id)
        if not plugin:
            return False

        try:
            if plugin.is_running():
                # Unregister scheduled tasks if backend plugin
                if isinstance(plugin, BackendPlugin):
                    try:
                        await backend_plugin_scheduler.unregister_plugin_tasks(plugin_id)
                    except Exception as e:
                        logger.warning(
                            f"Error unregistering scheduled tasks for backend plugin "
                            f"{plugin_id}: {e}",
                            exc_info=True,
                        )

                plugin.stop()

                # Stop background worker if backend plugin
                if isinstance(plugin, BackendPlugin):
                    try:
                        await plugin.stop_worker()
                    except NotImplementedError:
                        # Plugin doesn't implement stop_worker, that's fine
                        pass
                    except Exception as e:
                        logger.warning(
                            f"Error stopping worker for backend plugin {plugin_id}: {e}",
                            exc_info=True,
                        )

                await plugin.cleanup()
            return True
        except Exception:
            logger.exception("Error stopping plugin {}", plugin_id)
            return False

    def get_plugin_count(self, plugin_type: PluginType | None = None) -> int:
        """
        Get count of plugins, optionally filtered by type.

        Args:
            plugin_type: Optional plugin type filter

        Returns:
            Number of plugins
        """
        if plugin_type:
            return len(self._plugins_by_type.get(plugin_type, []))
        return len(self._plugins)


# Global plugin manager instance
plugin_manager = PluginManager()
