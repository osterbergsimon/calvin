"""Service for managing keyboard mappings."""

from app.database import database
from app.models.db_models import KeyboardMappingDB


class KeyboardMappingService:
    """Service for managing keyboard key-to-action mappings."""

    def __init__(self):
        """Initialize keyboard mapping service."""
        self._cache: dict[str, dict[str, str]] = {}

    async def get_mappings(self, keyboard_type: str) -> dict[str, str]:
        """
        Get keyboard mappings for a specific keyboard type.

        Args:
            keyboard_type: '7-button' or 'standard'

        Returns:
            Dictionary mapping key codes to actions
        """
        cache_key = f"mappings_{keyboard_type}"
        if cache_key in self._cache:
            return self._cache[cache_key]

        mappings_db = await KeyboardMappingDB.objects.filter(keyboard_type=keyboard_type).all()

        mappings = {item.key_code: item.action for item in mappings_db}
        self._cache[cache_key] = mappings
        return mappings

    async def get_all_mappings(self) -> dict[str, dict[str, str]]:
        """
        Get all keyboard mappings for all keyboard types.

        Returns:
            Dictionary with keyboard types as keys and mappings as values
        """
        mappings_db = await KeyboardMappingDB.objects.all()

        all_mappings = {}
        for item in mappings_db:
            if item.keyboard_type not in all_mappings:
                all_mappings[item.keyboard_type] = {}
            all_mappings[item.keyboard_type][item.key_code] = item.action

        return all_mappings

    async def set_mappings(self, keyboard_type: str, mappings: dict[str, str]) -> None:
        """
        Set keyboard mappings for a specific keyboard type.

        Args:
            keyboard_type: '7-button' or 'standard'
            mappings: Dictionary mapping key codes to actions
        """
        # Wrap all operations in a transaction to ensure atomicity
        # If any operation fails, all changes are rolled back
        async with database.transaction():
            # Delete existing mappings for this keyboard type
            existing_mappings = await KeyboardMappingDB.objects.filter(
                keyboard_type=keyboard_type
            ).all()
            for mapping in existing_mappings:
                await mapping.delete()

            # Add new mappings
            for key_code, action in mappings.items():
                await KeyboardMappingDB.objects.create(
                    keyboard_type=keyboard_type,
                    key_code=key_code,
                    action=action,
                )

        # Update cache only after successful transaction commit
        cache_key = f"mappings_{keyboard_type}"
        self._cache[cache_key] = mappings.copy()

    async def set_mapping(self, keyboard_type: str, key_code: str, action: str) -> None:
        """
        Set a single keyboard mapping.

        Args:
            keyboard_type: '7-button' or 'standard'
            key_code: Key code (e.g., 'KEY_1')
            action: Action name (e.g., 'calendar_next_month')
        """
        mapping = await KeyboardMappingDB.objects.get_or_none(
            keyboard_type=keyboard_type, key_code=key_code
        )

        if mapping:
            mapping.action = action
            await mapping.update()
        else:
            await KeyboardMappingDB.objects.create(
                keyboard_type=keyboard_type,
                key_code=key_code,
                action=action,
            )

        # Update cache
        cache_key = f"mappings_{keyboard_type}"
        if cache_key in self._cache:
            self._cache[cache_key][key_code] = action
        else:
            self._cache[cache_key] = {key_code: action}

    async def get_available_actions(self) -> list[str]:
        """
        Get list of available keyboard actions.

        Returns:
            List of action names
        """
        return [
            # Mode selection buttons (4 buttons)
            "mode_calendar",
            "mode_photos",
            "mode_web_services",
            "mode_spare",
            # Screen and region navigation
            "screen_next",
            "screen_prev",
            "screen_1",
            "screen_2",
            "screen_3",
            "screen_4",
            "screen_5",
            "screen_6",
            "screen_7",
            "region_next",
            "region_prev",
            # Generic context-aware buttons (4 buttons)
            "generic_next",
            "generic_prev",
            "generic_expand_close",
            "generic_refresh",
            # Legacy/Advanced actions
            "mode_settings",
            "mode_cycle",
            "calendar_next_month",
            "calendar_prev_month",
            "calendar_expand_today",
            "calendar_collapse",
            "calendar_enter_fullscreen",
            "calendar_exit_fullscreen",
            "images_next",
            "images_prev",
            "photos_enter_fullscreen",
            "photos_exit_fullscreen",
            "web_service_next",
            "web_service_prev",
            "web_service_close",
            "web_service_enter_fullscreen",
            "none",
        ]


# Global keyboard mapping service instance
keyboard_mapping_service = KeyboardMappingService()
