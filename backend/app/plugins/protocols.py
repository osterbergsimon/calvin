"""Plugin protocols/interfaces for each plugin type."""

from abc import abstractmethod
from datetime import datetime
from typing import Any

from app.models.calendar import CalendarEvent
from app.plugins.base import BasePlugin, PluginType


class CalendarPlugin(BasePlugin):
    """Protocol for calendar source plugins."""

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
    """Protocol for image source plugins."""

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


class ServicePlugin(BasePlugin):
    """Protocol for service plugins (webhooks, APIs, iframes, etc.)."""

    @property
    def plugin_type(self) -> PluginType:
        """Return service plugin type."""
        return PluginType.SERVICE

    @abstractmethod
    async def get_content(self) -> dict[str, Any]:
        """
        Get service content for display.

        Returns:
            Dictionary with content information:
            - type: Content type ('iframe', 'api', 'webhook', etc.)
            - url: URL for iframe or API endpoint
            - data: Additional data for rendering
            - config: Display configuration
        """
        pass

    async def handle_webhook(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        """
        Handle incoming webhook (optional - not all services support webhooks).

        Args:
            payload: Webhook payload

        Returns:
            Response dictionary or None if webhook not supported
        """
        return None

    async def handle_api_request(self, method: str, path: str, data: dict[str, Any] | None = None) -> dict[str, Any] | None:
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

