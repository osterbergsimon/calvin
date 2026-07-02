"""Declarative plugin loader.

Discovers `BasePlugin` subclasses that declare a `metadata = PluginMetadata(...)`
class attribute — in the built-in plugin packages and in installed plugin
directories — and keeps a `type_id -> class` registry. Registration,
instantiation, and config handling all derive from the class; plugins define
no module-level hooks.
"""

import importlib
import importlib.util
import pkgutil
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

from loguru import logger

from app.plugins.base import BasePlugin, PluginType
from app.plugins.definitions import CURRENT_PLUGIN_API_VERSION, PluginMetadata
from app.plugins.protocols import BackendPlugin, CalendarPlugin, ImagePlugin, ServicePlugin
from app.services.plugin_installer import plugin_installer

_FAMILY_BASES: tuple[tuple[type[BasePlugin], PluginType], ...] = (
    (CalendarPlugin, PluginType.CALENDAR),
    (ImagePlugin, PluginType.IMAGE),
    (ServicePlugin, PluginType.SERVICE),
    (BackendPlugin, PluginType.BACKEND),
)


def _plugin_family(cls: type[BasePlugin]) -> PluginType | None:
    """Derive the plugin family from the class's protocol base."""
    for base, plugin_type in _FAMILY_BASES:
        if issubclass(cls, base):
            return plugin_type
    return None


class PluginLoader:
    """Discovers plugin classes and keeps the type registry."""

    def __init__(self):
        """Initialize plugin loader."""
        self._types: dict[str, type[BasePlugin]] = {}
        # module name -> type_ids registered from it (for unload on uninstall)
        self._module_types: dict[str, set[str]] = {}
        self._loaded_modules: set[str] = set()
        # installed plugin id -> human-readable load error (for install-time surfacing)
        self._load_errors: dict[str, str] = {}

    # ------------------------------------------------------------------
    # Discovery
    # ------------------------------------------------------------------

    def register_module(self, module: ModuleType) -> list[str]:
        """Discover and register all plugin classes declared in a module.

        A plugin class is a `BasePlugin` subclass that declares its own
        `metadata` attribute (inherited metadata doesn't count — that's how a
        subclass can reuse an implementation under a new type_id).

        Returns:
            The type_ids registered from this module.
        """
        registered: list[str] = []
        for obj in list(vars(module).values()):
            if not (isinstance(obj, type) and issubclass(obj, BasePlugin)):
                continue
            metadata = obj.__dict__.get("metadata")
            if metadata is None:
                continue
            if not isinstance(metadata, PluginMetadata):
                raise TypeError(
                    f"{obj.__name__}.metadata must be a PluginMetadata instance "
                    f"(got {type(metadata).__name__})"
                )
            family = _plugin_family(obj)
            if family is None:
                raise TypeError(
                    f"{obj.__name__} must subclass one of the plugin family protocols "
                    "(CalendarPlugin, ImagePlugin, ServicePlugin, BackendPlugin)"
                )
            type_id = metadata.type_id
            existing = self._types.get(type_id)
            if existing is not None and existing is not obj:
                logger.error(
                    "Duplicate plugin type_id {!r}: {} conflicts with {} — keeping the first",
                    type_id,
                    obj.__name__,
                    existing.__name__,
                )
                continue
            self._types[type_id] = obj
            self._module_types.setdefault(module.__name__, set()).add(type_id)
            registered.append(type_id)
        if registered:
            self._loaded_modules.add(module.__name__)
        return registered

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
                for _, module_name, is_pkg in pkgutil.iter_modules([str(package_path)]):
                    full_module_name = f"{package_name}.{module_name}"
                    if is_pkg:
                        self.load_plugins_from_package(full_module_name)
                        continue
                    if full_module_name in self._loaded_modules:
                        continue
                    try:
                        module = importlib.import_module(full_module_name)
                        registered = self.register_module(module)
                        if registered:
                            logger.info(
                                "Registered plugin module {} (types: {})",
                                full_module_name,
                                ", ".join(registered),
                            )
                    except Exception:
                        logger.exception("Error loading plugin module {}", full_module_name)

        except Exception:
            logger.exception("Error loading plugins from package {}", package_name)

    def load_installed_plugins(self) -> None:
        """
        Load plugins from the installed plugins directory.

        Installed plugins are stored in data/plugins/{plugin_id}/ and contain a
        plugin.py declaring the plugin class. The manifest's `api_version` must
        match the host's supported version — stale plugins are skipped loudly.
        """
        installed_plugins = plugin_installer.get_installed_plugins()

        # Ensure backend directory is in sys.path so plugins can import from app.*
        # Find backend directory (where this file is located: backend/app/plugins/loader.py)
        backend_dir = Path(__file__).parent.parent.parent
        backend_dir_str = str(backend_dir)
        if backend_dir_str not in sys.path:
            sys.path.insert(0, backend_dir_str)

        for plugin_manifest in installed_plugins:
            plugin_id = plugin_manifest["id"]
            plugin_path = plugin_installer.get_plugin_path(plugin_id)
            plugin_py = plugin_path / "plugin.py"

            if not plugin_py.exists():
                logger.warning("plugin.py not found for installed plugin {}", plugin_id)
                continue

            api_version = plugin_manifest.get("api_version")
            if api_version != CURRENT_PLUGIN_API_VERSION:
                message = (
                    f"api_version {api_version!r} is not supported (host supports "
                    f"{CURRENT_PLUGIN_API_VERSION}). Reinstall the plugin from the "
                    "plugin repository."
                )
                self._load_errors[plugin_id] = message
                logger.error("Skipping installed plugin {}: {}", plugin_id, message)
                continue

            module_name = f"installed_plugin_{plugin_id}"
            if module_name in self._loaded_modules:
                continue

            try:
                # Add plugin directory to Python path so the plugin can load
                # its own bundled modules
                plugin_dir_str = str(plugin_path)
                if plugin_dir_str not in sys.path:
                    sys.path.insert(0, plugin_dir_str)

                spec = importlib.util.spec_from_file_location(module_name, plugin_py)
                if spec and spec.loader:
                    module = importlib.util.module_from_spec(spec)
                    sys.modules[module_name] = module
                    spec.loader.exec_module(module)

                    registered = self.register_module(module)
                    if registered:
                        self._load_errors.pop(plugin_id, None)
                        logger.info(
                            "Registered installed plugin {} (types: {})",
                            plugin_id,
                            ", ".join(registered),
                        )
                    else:
                        logger.warning(
                            "Installed plugin {} declares no plugin class "
                            "(a BasePlugin subclass with a `metadata` attribute)",
                            plugin_id,
                        )

            except Exception as exc:
                self._load_errors[plugin_id] = f"{type(exc).__name__}: {exc}"
                logger.exception("Error loading installed plugin {}", plugin_id)

    def unload_installed_plugin(self, plugin_id: str) -> None:
        """Remove an installed plugin's classes and module (on uninstall)."""
        module_name = f"installed_plugin_{plugin_id}"
        for type_id in self._module_types.pop(module_name, set()):
            self._types.pop(type_id, None)
        self._loaded_modules.discard(module_name)
        self._load_errors.pop(plugin_id, None)
        sys.modules.pop(module_name, None)

    def get_load_error(self, plugin_id: str) -> str | None:
        """Get the recorded load error for an installed plugin, if any."""
        return self._load_errors.get(plugin_id)

    def installed_plugin_type_ids(self, plugin_id: str) -> set[str]:
        """Get the type_ids registered by an installed plugin's module."""
        return set(self._module_types.get(f"installed_plugin_{plugin_id}", set()))

    def load_all_plugins(self) -> None:
        """Load all plugins from the plugins package and installed plugins."""
        # Built-in plugins live in the host repo; everything else is installed
        # from the calvin-plugins repository.
        self.load_plugins_from_package("app.plugins.calendar")
        self.load_plugins_from_package("app.plugins.image")
        self.load_plugins_from_package("app.plugins.service")

        self.load_installed_plugins()

    # ------------------------------------------------------------------
    # Registry access
    # ------------------------------------------------------------------

    def get_plugin_class(self, type_id: str) -> type[BasePlugin] | None:
        """Get the plugin class registered for a type_id."""
        return self._types.get(type_id)

    def get_plugin_types(self) -> list[PluginMetadata]:
        """
        Get all registered plugin types with runtime fields filled.

        Returns:
            List of plugin metadata, with `plugin_class` and `plugin_type` set.
        """
        plugin_types: list[PluginMetadata] = []
        for cls in self._types.values():
            metadata = cls.metadata
            if metadata is None:
                continue
            plugin_types.append(
                metadata.model_copy(
                    update={"plugin_class": cls, "plugin_type": _plugin_family(cls)}
                )
            )
        return plugin_types

    def create_plugin_instance(
        self,
        plugin_id: str,
        type_id: str,
        name: str,
        config: dict[str, Any],
    ) -> BasePlugin | None:
        """
        Create a plugin instance for a registered type.

        The instance is constructed with the standard (plugin_id, name, enabled)
        signature; callers apply config via `await instance.configure(config)`.

        Args:
            plugin_id: Unique identifier for the plugin instance
            type_id: Plugin type ID (e.g., 'google', 'local')
            name: Human-readable name
            config: Plugin configuration dictionary (only `enabled` is read here)

        Returns:
            Plugin instance or None if the type is not registered
        """
        cls = self._types.get(type_id)
        if cls is None:
            return None
        return cls(plugin_id=plugin_id, name=name, enabled=bool(config.get("enabled", False)))


# Global plugin loader instance
plugin_loader = PluginLoader()
