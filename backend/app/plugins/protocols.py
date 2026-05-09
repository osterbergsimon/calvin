"""
Plugin protocols/interfaces for each plugin type.

This module defines the well-defined interface between core and plugins.
Core code MUST ONLY use methods defined in these protocols.
Plugins MUST implement all abstract methods and CAN implement optional methods.

Protocol Design Principles:
- MUST methods: Abstract methods that plugins MUST implement
- CAN methods: Non-abstract methods with default implementations that plugins CAN override
- No ad-hoc method checking: Core code should never use hasattr() or
  getattr() to access plugin functionality
- Type safety: Use isinstance() checks to ensure plugins conform to protocols
"""

from abc import abstractmethod
from datetime import datetime
from pathlib import Path
from typing import Any

from app.models.calendar import CalendarEvent
from app.plugins.base import BasePlugin, PluginType


class CalendarPlugin(BasePlugin):
    """
    Protocol for calendar source plugins.

    MUST implement:
    - fetch_events()
    - validate_config()
    """

    @property
    def plugin_type(self) -> PluginType:
        """Return calendar plugin type."""
        return PluginType.CALENDAR

    @abstractmethod
    async def fetch_events(
        self,
        start_date: datetime,
        end_date: datetime,
    ) -> list[CalendarEvent]:
        """
        Fetch calendar events for a date range.

        Args:
            start_date: Start date for events (timezone-aware)
            end_date: End date for events (timezone-aware)

        Returns:
            List of calendar events
        """
        pass

    @abstractmethod
    async def validate_config(self, config: dict[str, Any]) -> bool:
        """
        Validate plugin configuration.

        Args:
            config: Configuration dictionary

        Returns:
            True if configuration is valid
        """
        pass


class ImagePlugin(BasePlugin):
    """
    Protocol for image source plugins.

    MUST implement:
    - get_images()
    - get_image()
    - get_image_data()
    - scan_images()
    - validate_config()

    CAN implement (optional):
    - upload_image()
    - delete_image()
    - get_thumbnail_path()
    """

    @property
    def plugin_type(self) -> PluginType:
        """Return image plugin type."""
        return PluginType.IMAGE

    @abstractmethod
    async def get_images(self) -> list[dict[str, Any]]:
        """
        Get list of all available images.

        Returns:
            List of image metadata dictionaries with keys:
            - id: Unique image identifier
            - filename: Image filename
            - path: Image path/URL
            - width: Image width in pixels
            - height: Image height in pixels
            - size: File size in bytes
            - format: Image format (jpg, png, etc.)
            - source: Plugin ID that provided this image
        """
        pass

    @abstractmethod
    async def get_image(self, image_id: str) -> dict[str, Any] | None:
        """
        Get image metadata by ID.

        Args:
            image_id: Image identifier

        Returns:
            Image metadata dictionary or None if not found
        """
        pass

    @abstractmethod
    async def get_image_data(self, image_id: str) -> bytes | None:
        """
        Get image file data by ID.

        Args:
            image_id: Image identifier

        Returns:
            Image file data as bytes or None if not found
        """
        pass

    @abstractmethod
    async def scan_images(self) -> list[dict[str, Any]]:
        """
        Scan for new/updated images.

        Returns:
            List of image metadata dictionaries
        """
        pass

    async def upload_image(self, file_data: bytes, filename: str) -> dict[str, Any] | None:
        """
        Upload an image (optional - not all plugins support upload).

        Args:
            file_data: Image file data as bytes
            filename: Original filename

        Returns:
            Image metadata dictionary or None if upload not supported
        """
        return None

    async def delete_image(self, image_id: str) -> bool:
        """
        Delete an image (optional - not all plugins support deletion).

        Args:
            image_id: Image identifier

        Returns:
            True if deleted, False if deletion not supported or failed
        """
        return False

    def get_thumbnail_path(self, image_id: str) -> Path | None:
        """
        Get thumbnail file path for an image (optional - not all plugins support thumbnails).

        Args:
            image_id: Image identifier

        Returns:
            Path to thumbnail file or None if thumbnail not available
        """
        return None


class ServicePlugin(BasePlugin):
    """
    Protocol for service plugins (dashboard cards, webhooks, APIs, iframes).

    MUST implement:
    - validate_config()

    SHOULD implement:
    - fetch_service_data() — the canonical data source for schema-driven dashboard
      rendering. Returns a JSON payload that the plugin's `display_schema` binds to.

    CAN implement (optional):
    - handle_webhook()
    - handle_api_request()
    """

    @property
    def plugin_type(self) -> PluginType:
        """Return service plugin type."""
        return PluginType.SERVICE

    async def handle_webhook(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        """
        Handle incoming webhook (optional - not all services support webhooks).

        Args:
            payload: Webhook payload

        Returns:
            Response dictionary or None if webhook not supported
        """
        return None

    async def handle_api_request(
        self, method: str, path: str, data: dict[str, Any] | None = None
    ) -> dict[str, Any] | None:
        """
        Handle API request (optional - not all services support API).

        Args:
            method: HTTP method (GET, POST, etc.)
            path: API path
            data: Request data (for POST, PUT, etc.)

        Returns:
            Response dictionary or None if API not supported
        """
        return None

    async def fetch_service_data(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> dict[str, Any] | None:
        """
        Fetch service data for display (optional - not all services support data fetching).

        This method is called by the core when fetching data via
        /api/plugins/{plugin_id}/data.
        Plugins should implement this on the resolved instance directly.

        Args:
            start_date: Optional start date (YYYY-MM-DD format, plugin-specific)
            end_date: Optional end date (YYYY-MM-DD format, plugin-specific)

        Returns:
            Dictionary with service data, or None if data fetching not supported.
            The dict can contain any plugin-specific data structure.
        """
        return None

    @abstractmethod
    async def validate_config(self, config: dict[str, Any]) -> bool:
        """
        Validate plugin configuration.

        Args:
            config: Configuration dictionary

        Returns:
            True if configuration is valid
        """
        pass


class BackendPlugin(BasePlugin):
    """
    Protocol for backend/infrastructure plugins.

    Backend plugins provide background functionality such as:
    - Scheduled tasks (cron-like jobs)
    - Background workers (long-running processes)
    - Service providers (provide services to other plugins)
    - Data processors (transform/process data)
    - Event publishers (emit events for other plugins to consume)

    Plugins can implement any combination of optional capabilities.

    MUST implement:
    - validate_config()

    CAN implement (optional):
    - get_schedule_config(), run_scheduled_task() - Scheduled tasks
    - start_worker(), stop_worker() - Background workers
    - provide_service(), get_provided_services() - Service providers
    - handle_event(), get_subscribed_events() - Event handlers (subscribe to events)
    - emit_event() - Event publisher (publish events, inherited from BasePlugin)
    """

    @property
    def plugin_type(self) -> PluginType:
        """Return backend plugin type."""
        return PluginType.BACKEND

    # Optional: Scheduled tasks
    async def get_schedule_config(self) -> dict[str, Any] | None:
        """Return schedule configuration if this plugin runs scheduled tasks.

        Returns dict with:
        - interval: int (seconds between runs, e.g., 300 for 5 minutes)
        - cron: str (cron expression, alternative to interval)
        - enabled: bool (whether scheduling is enabled)
        - max_concurrent: int (max concurrent executions, default: 1)

        Returns None if plugin doesn't support scheduled tasks.
        """
        return None

    async def run_scheduled_task(self) -> dict[str, Any]:
        """Execute scheduled task. Called by scheduler if get_schedule_config() returns config.

        Returns:
            Dictionary with execution result:
            - success: bool
            - message: str (optional)
            - data: dict (optional, plugin-specific data)
        """
        raise NotImplementedError("This plugin doesn't support scheduled tasks")

    # Optional: Background workers
    async def start_worker(self) -> None:
        """Start background worker. Called when plugin is enabled.

        This is for long-running background processes that don't fit
        into scheduled tasks.
        """
        pass

    async def stop_worker(self) -> None:
        """Stop background worker. Called when plugin is disabled."""
        pass

    # Optional: Service provider (for other plugins to use)
    async def provide_service(self, service_name: str, **kwargs) -> Any:
        """Provide service to other plugins. Return None if service not supported.

        Args:
            service_name: Name of service (e.g., 'get_weather_data', 'process_image')
            **kwargs: Service-specific arguments

        Returns:
            Service result (type depends on service), or None if not supported
        """
        return None

    async def get_provided_services(self) -> list[str]:
        """Return list of services this plugin provides.

        Returns:
            List of service names (e.g., ['get_weather_data', 'process_image'])
        """
        return []

    # Optional: Event handlers
    async def handle_event(
        self, event_type: str, event_data: dict[str, Any]
    ) -> dict[str, Any] | None:
        """Handle system events. Called when events matching this plugin's interests occur.

        Args:
            event_type: Type of event (e.g., 'image_uploaded', 'plugin_enabled')
            event_data: Event payload (plugin-specific)

        Returns:
            Dictionary with result, or None if event not handled
        """
        return None

    async def get_subscribed_events(self) -> list[str]:
        """Return list of event types this plugin subscribes to.

        Returns:
            List of event type strings (e.g., ['image_uploaded', 'config_changed'])
        """
        return []

    # Required: Basic validation
    @abstractmethod
    async def validate_config(self, config: dict[str, Any]) -> bool:
        """Validate plugin configuration.

        Args:
            config: Configuration dictionary

        Returns:
            True if configuration is valid
        """
        pass
