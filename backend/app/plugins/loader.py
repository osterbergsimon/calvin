"""Dynamic plugin loader using pluggy."""

import importlib
import pkgutil
from pathlib import Path
from typing import Any

from app.plugins.hooks import PluginHookSpec, hookimpl, plugin_manager


class PluginLoader:
    """Dynamic plugin loader using pluggy."""

    def __init__(self):
        """Initialize plugin loader."""
        self._loaded_modules: set[str] = set()

    def load_plugins_from_package(self, package_name: str) -> None:
        """
        Load all plugins from a package.

        Args:
            package_name: Package name (e.g., 'app.plugins.calendar')
        """
        try:
            package = importlib.import_module(package_name)
            package_path = Path(package.__file__).parent if package.__file__ else None

            if package_path:
                # Load all modules in the package
                for _, module_name, is_pkg in pkgutil.iter_modules([str(package_path)]):
                    if not is_pkg:
                        full_module_name = f"{package_name}.{module_name}"
                        if full_module_name not in self._loaded_modules:
                            try:
                                module = importlib.import_module(full_module_name)
                                # Register the module as a plugin if it has hook implementations
                                if hasattr(module, "plugin_manager"):
                                    plugin_manager.register(module)
                                    self._loaded_modules.add(full_module_name)
                                    print(f"Loaded plugin module: {full_module_name}")
                            except Exception as e:
                                print(f"Error loading plugin module {full_module_name}: {e}")

                # Also load subpackages
                for _, module_name, is_pkg in pkgutil.iter_modules([str(package_path)]):
                    if is_pkg:
                        full_module_name = f"{package_name}.{module_name}"
                        self.load_plugins_from_package(full_module_name)

        except Exception as e:
            print(f"Error loading plugins from package {package_name}: {e}")

    def load_all_plugins(self) -> None:
        """Load all plugins from the plugins package."""
        # Load plugins from calendar, image, and service subpackages
        self.load_plugins_from_package("app.plugins.calendar")
        self.load_plugins_from_package("app.plugins.image")
        self.load_plugins_from_package("app.plugins.service")

    def get_plugin_types(self) -> list[dict[str, Any]]:
        """
        Get all registered plugin types.

        Returns:
            List of plugin type dictionaries
        """
        plugin_types = []
        results = plugin_manager.hook.register_plugin_types()
        for result in results:
            if result:
                plugin_types.extend(result if isinstance(result, list) else [result])
        return plugin_types

    def create_plugin_instance(
        self,
        plugin_id: str,
        type_id: str,
        name: str,
        config: dict[str, Any],
    ) -> Any:
        """
        Create a plugin instance using pluggy hooks.

        Args:
            plugin_id: Unique identifier for the plugin instance
            type_id: Plugin type ID (e.g., 'google', 'local')
            name: Human-readable name
            config: Plugin configuration dictionary

        Returns:
            Plugin instance or None if not found
        """
        results = plugin_manager.hook.create_plugin_instance(
            plugin_id=plugin_id,
            type_id=type_id,
            name=name,
            config=config,
        )
        # Return the first non-None result
        for result in results:
            if result is not None:
                return result
        return None


# Global plugin loader instance
plugin_loader = PluginLoader()

