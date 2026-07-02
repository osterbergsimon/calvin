"""Base plugin classes and types."""

import hashlib
from abc import ABC, abstractmethod
from collections.abc import Callable
from enum import Enum
from typing import TYPE_CHECKING, Any, ClassVar

if TYPE_CHECKING:
    from app.plugins.definitions import PluginMetadata


class PluginType(str, Enum):
    """Plugin type enumeration.

    `CALENDAR`, `IMAGE`, `SERVICE`, and `BACKEND` are the four plugin families
    that subclass `BasePlugin`.

    `THEME` is intentionally different: theme "plugins" are CSS bundles installed
    via `app.services.theme_installer`, not Python classes. The enum value exists
    so the management routes (`app.api.routes.plugins.themes`) can tag theme
    records uniformly with the same plugin-type column. There is no `BasePlugin`
    subclass for themes and no SDK helper.
    """

    CALENDAR = "calendar"
    IMAGE = "image"
    SERVICE = "service"
    THEME = "theme"
    BACKEND = "backend"


class BasePlugin(ABC):
    """Base class for all plugins.

    A concrete plugin is a single subclass of one of the family protocols
    (`CalendarPlugin`, `ImagePlugin`, `ServicePlugin`, `BackendPlugin`) that
    declares a `metadata = PluginMetadata(...)` class attribute. The loader
    discovers the class; registration, instantiation, config normalization,
    and config-update handling are all derived from `metadata` — plugins do
    not implement registration hooks.

    Instance config is declared once, in `metadata.instance_config_schema`.
    `configure()` normalizes incoming values against that schema and stores
    them in `self.config`; plugins read `self.config["key"]` and only override
    `configure()` when they need to react to a config change.
    """

    # Declarative contract; set by every concrete plugin class.
    metadata: ClassVar["PluginMetadata | None"] = None

    def __init__(self, plugin_id: str, name: str, enabled: bool = True):
        """
        Initialize plugin.

        Args:
            plugin_id: Unique identifier for the plugin instance
            name: Human-readable name
            enabled: Whether the plugin is enabled
        """
        self.plugin_id = plugin_id
        self.name = name
        self.enabled = enabled
        self.config: dict[str, Any] = {}
        self._running = False  # Runtime state: whether plugin is currently running

    @property
    @abstractmethod
    def plugin_type(self) -> PluginType:
        """Return the type of this plugin."""
        pass

    async def initialize(self) -> None:
        """Initialize the plugin (e.g., connect to services). Default: no-op."""

    async def cleanup(self) -> None:
        """Cleanup plugin resources (e.g., close connections). Default: no-op."""

    # ------------------------------------------------------------------
    # Config — declared once in metadata, normalized here
    # ------------------------------------------------------------------

    @classmethod
    def normalize_config(cls, config: dict[str, Any]) -> dict[str, Any]:
        """Normalize raw config values against `metadata.instance_config_schema`.

        Schema fields drive type conversion (`string`/`integer`/`number`/
        `boolean`) and defaults; keys not in the schema pass through with
        wrapper normalization only.
        """
        from app.plugins.utils.config import (
            extract_config_value,
            normalize_config_value,
            to_bool,
            to_float,
            to_int,
            to_str,
        )

        converters: dict[str, Callable[[Any], Any]] = {
            "string": to_str,
            "integer": to_int,
            "number": to_float,
            "boolean": to_bool,
        }
        schema = cls.metadata.instance_config_schema if cls.metadata else {}

        normalized: dict[str, Any] = {}
        for key, field in schema.items():
            converter = converters.get(field.get("type") or "")
            normalized[key] = extract_config_value(
                config, key, default=field.get("default"), converter=converter
            )
        for key, value in config.items():
            if key not in normalized:
                normalized[key] = normalize_config_value(value)
        return normalized

    async def configure(self, config: dict[str, Any]) -> None:
        """Apply configuration. Stores schema-normalized values in `self.config`.

        Plugins override this only to react to config changes, and should call
        `await super().configure(config)` first.
        """
        self.config = self.normalize_config(config)

    def get_config(self) -> dict[str, Any]:
        """Get current plugin configuration."""
        return dict(self.config)

    @classmethod
    async def validate_config(cls, config: dict[str, Any]) -> bool:
        """Validate config before an instance is created or updated.

        Default: schema-driven — every field whose ui.validation marks it
        required must be present and non-empty after normalization. Override
        for plugin-specific rules.
        """
        schema = cls.metadata.instance_config_schema if cls.metadata else {}
        normalized = cls.normalize_config(config)
        for key, field in schema.items():
            validation = (field.get("ui") or {}).get("validation") or {}
            if validation.get("required"):
                value = normalized.get(key)
                if value is None or (isinstance(value, str) and not value.strip()):
                    return False
        return True

    @classmethod
    def instance_id_for(cls, config: dict[str, Any]) -> str | None:
        """Derive a stable instance id from config, or None for the generic fallback.

        If `metadata.instance_identity` names config keys, the id is a hash of
        those values — the same identity always maps to the same instance.
        """
        metadata = cls.metadata
        if metadata is None or not metadata.instance_identity:
            return None
        normalized = cls.normalize_config(config)
        identity = "|".join(str(normalized.get(key) or "") for key in metadata.instance_identity)
        if not identity.strip("|"):
            return None
        digest = hashlib.md5(identity.encode(), usedforsecurity=False).hexdigest()[:8]
        return f"{metadata.type_id}-{digest}"

    # ------------------------------------------------------------------
    # Optional class-level operations (no instance required)
    # ------------------------------------------------------------------

    @classmethod
    async def test_connection(cls, config: dict[str, Any]) -> dict[str, Any] | None:
        """Test a (possibly unsaved) configuration.

        Returns None by default, indicating the plugin has no test path.
        """
        return None

    @classmethod
    async def scan_options(cls, field_key: str) -> dict[str, Any] | None:
        """Discover options for a config field (e.g. enumerate devices).

        Returns None by default, indicating the plugin has no scan path.
        """
        return None

    # ------------------------------------------------------------------
    # Optional hooks in the config-update flow
    # ------------------------------------------------------------------

    @classmethod
    def prepare_instance_config(
        cls, config: dict[str, Any], context: dict[str, Any]
    ) -> dict[str, Any]:
        """Adjust the config that will be persisted for an instance.

        `context` carries instance_name / instance_enabled / type_enabled.
        Default: unchanged.
        """
        return config

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def enable(self) -> None:
        """Enable the plugin."""
        self.enabled = True

    def disable(self) -> None:
        """Disable the plugin."""
        self.enabled = False

    def start(self) -> None:
        """
        Start the plugin (mark as running).

        This should be called after successful initialization.
        Plugins can override this to add custom start logic.
        """
        if not self.enabled:
            raise RuntimeError(f"Cannot start disabled plugin {self.plugin_id}")
        self._running = True

    def stop(self) -> None:
        """
        Stop the plugin (mark as not running).

        This should be called before cleanup.
        Plugins can override this to add custom stop logic.
        """
        self._running = False

    def is_running(self) -> bool:
        """
        Check if the plugin is currently running.

        Returns:
            True if plugin is running, False otherwise
        """
        return self._running

    @property
    def running(self) -> bool:
        """Property to access running state."""
        return self._running

    async def emit_event(
        self,
        event_type: str,
        event_data: dict[str, Any],
        wait_for_handlers: bool = False,
    ) -> dict[str, Any] | None:
        """
        Emit an event to all subscribed plugins.

        Plugins can use this method to publish events that other plugins can subscribe to.
        This enables plugin-to-plugin communication through the event system.

        Args:
            event_type: Type of event (e.g., 'image_processed', 'data_synced')
            event_data: Event payload (plugin-specific data)
            wait_for_handlers: If True, wait for all handlers to complete (fire-and-wait)
                              If False, return immediately (fire-and-forget, default)

        Returns:
            If wait_for_handlers=True: dict with handler results
            If wait_for_handlers=False: None (returns immediately)
        """
        # Lazy import to avoid circular dependencies
        from app.services.event_system import event_system

        return await event_system.emit_event(
            event_type=event_type,
            event_data=event_data,
            wait_for_handlers=wait_for_handlers,
        )

    def __repr__(self) -> str:
        """String representation of the plugin."""
        return (
            f"{self.__class__.__name__}(id={self.plugin_id}, name={self.name}, "
            f"enabled={self.enabled}, running={self._running})"
        )
