"""Dynamic plugin loader using pluggy."""

import importlib
import importlib.util
import pkgutil
import sys
from pathlib import Path
from typing import Any

from app.plugins.hooks import plugin_manager
from app.services.plugin_installer import plugin_installer


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
                                # Check if module has hook implementations
                                # (register_plugin_types or create_plugin_instance)
                                has_hooks = hasattr(module, "register_plugin_types") or hasattr(
                                    module, "create_plugin_instance"
                                )
                                if has_hooks:
                                    # Register the module with pluggy
                                    # so it can discover hook implementations
                                    try:
                                        plugin_manager.register(module)
                                        self._loaded_modules.add(full_module_name)
                                        print(f"Registered plugin module: {full_module_name}")
                                    except ValueError:
                                        # Already registered
                                        # (e.g., if module is imported multiple times)
                                        pass
                            except Exception as e:
                                print(f"Error loading plugin module {full_module_name}: {e}")

                # Also load subpackages
                for _, module_name, is_pkg in pkgutil.iter_modules([str(package_path)]):
                    if is_pkg:
                        full_module_name = f"{package_name}.{module_name}"
                        self.load_plugins_from_package(full_module_name)

        except Exception as e:
            print(f"Error loading plugins from package {package_name}: {e}")

    def load_installed_plugins(self) -> None:
        """
        Load plugins from the installed plugins directory.

        Installed plugins are stored in data/plugins/{plugin_id}/ and contain
        a plugin.py file with pluggy hooks.
        """
        installed_plugins = plugin_installer.get_installed_plugins()

        for plugin_manifest in installed_plugins:
            plugin_id = plugin_manifest["id"]
            plugin_path = plugin_installer.get_plugin_path(plugin_id)
            plugin_py = plugin_path / "plugin.py"

            if not plugin_py.exists():
                print(f"Warning: plugin.py not found for installed plugin {plugin_id}")
                continue

            try:
                # Add plugin directory to Python path temporarily
                plugin_dir_str = str(plugin_path)
                if plugin_dir_str not in sys.path:
                    sys.path.insert(0, plugin_dir_str)

                # Import the plugin module
                # Use a unique module name to avoid conflicts
                module_name = f"installed_plugin_{plugin_id}"

                # Load the plugin.py file as a module
                spec = importlib.util.spec_from_file_location(module_name, plugin_py)
                if spec and spec.loader:
                    module = importlib.util.module_from_spec(spec)
                    sys.modules[module_name] = module
                    spec.loader.exec_module(module)

                    # Register with pluggy if it has hooks
                    has_hooks = hasattr(module, "register_plugin_types") or hasattr(
                        module, "create_plugin_instance"
                    )
                    if has_hooks:
                        try:
                            plugin_manager.register(module)
                            self._loaded_modules.add(module_name)
                            print(f"Registered installed plugin: {plugin_id}")
                        except ValueError:
                            # Already registered
                            pass

            except Exception as e:
                print(f"Error loading installed plugin {plugin_id}: {e}")
                import traceback

                traceback.print_exc()

    def load_all_plugins(self) -> None:
        """Load all plugins from the plugins package and installed plugins."""
        # Load built-in plugins from calendar, image, and service subpackages
        self.load_plugins_from_package("app.plugins.calendar")
        self.load_plugins_from_package("app.plugins.image")
        self.load_plugins_from_package("app.plugins.service")

        # Load installed plugins
        self.load_installed_plugins()

    def get_plugin_types(self) -> list[dict[str, Any]]:
        """
        Get all registered plugin types.

        Returns:
            List of plugin type dictionaries with error information if loading failed
        """
        plugin_types = []
        results = plugin_manager.hook.register_plugin_types()
        for result in results:
            if result:
                try:
                    plugin_types.extend(result if isinstance(result, list) else [result])
                except Exception as e:
                    # If a plugin's register_plugin_types hook raises an exception,
                    # we can't include it but we should log the error
                    import logging

                    logger = logging.getLogger(__name__)
                    logger.error(f"Error getting plugin types from hook result: {e}", exc_info=True)
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
