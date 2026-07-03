"""Service for managing keyboard mappings."""

from app.database import database
from app.models.db_models import KeyboardMappingDB


class KeyboardMappingService:
    """Service for managing keyboard key-to-action mappings (single unified keyboard)."""

    def __init__(self):
        self._cache: dict[str, str] | None = None

    async def get_mappings(self) -> dict[str, str]:
        """Return the full key-code -> action map."""
        if self._cache is not None:
            return self._cache
        rows = await KeyboardMappingDB.objects.all()
        mappings = {row.key_code: row.action for row in rows}
        self._cache = mappings
        return mappings

    async def set_mappings(self, mappings: dict[str, str]) -> None:
        """Replace the entire map atomically."""
        async with database.transaction():
            existing = await KeyboardMappingDB.objects.all()
            for row in existing:
                await row.delete()
            for key_code, action in mappings.items():
                await KeyboardMappingDB.objects.create(key_code=key_code, action=action)
        self._cache = dict(mappings)

    async def set_mapping(self, key_code: str, action: str) -> None:
        """Upsert a single binding."""
        row = await KeyboardMappingDB.objects.get_or_none(key_code=key_code)
        if row:
            row.action = action
            await row.update()
        else:
            await KeyboardMappingDB.objects.create(key_code=key_code, action=action)
        if self._cache is None:
            rows = await KeyboardMappingDB.objects.all()
            self._cache = {r.key_code: r.action for r in rows}
        self._cache[key_code] = action

    async def remove_mapping(self, key_code: str) -> None:
        """Delete a single binding if present."""
        row = await KeyboardMappingDB.objects.get_or_none(key_code=key_code)
        if row:
            await row.delete()
        if self._cache is not None:
            self._cache.pop(key_code, None)

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
