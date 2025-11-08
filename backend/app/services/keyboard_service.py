"""Keyboard service with platform support."""

import platform

from app.utils.keyboard import get_keyboard_handler

IS_LINUX = platform.system() == "Linux"


class KeyboardService:
    """Keyboard service for handling keyboard input."""

    def __init__(self, device_path: str | None = None):
        """Initialize keyboard service."""
        self.device_path = device_path
        self.handler = get_keyboard_handler(device_path)
        self.mappings: dict[str, str] = {}
        self.is_available = self.handler.is_available

    def set_mappings(self, mappings: dict[str, str]):
        """Set keyboard key mappings."""
        self.mappings = mappings

    def get_mappings(self) -> dict[str, str]:
        """Get current keyboard mappings."""
        return self.mappings

    def is_keyboard_available(self) -> bool:
        """Check if keyboard is available."""
        return self.is_available

    def get_status(self) -> dict:
        """Get keyboard service status."""
        return {
            "available": self.is_available,
            "platform": platform.system(),
            "device_path": self.device_path,
            "mappings_count": len(self.mappings),
        }
