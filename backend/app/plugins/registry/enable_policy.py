"""When a plugin type may be switched on by the host (install, startup, instance paths).

The explicit toggle (``PUT /plugins/{id}``) refuses to enable a type that declares
``browser_origins`` while sealed mode is on. The host's own enable paths follow the
same rule, so an install never leaves a silently browser-blocked widget on: the
type stays off and the reason is recorded in its ``error_message`` and the log.
"""

from loguru import logger

from app.models.db_models import PluginTypeDB
from app.plugins.loader import plugin_loader
from app.services.csp import get_sealed_mode

SEALED_REASON = (
    "Not turned on: it declares browser_origins and sealed mode is on. "
    "Turn sealed mode off (Settings → Security) to enable it."
)


async def sealed_block_reason(type_info) -> str | None:
    """Why ``type_info`` may not be switched on right now, or None."""
    if type_info is not None and getattr(type_info, "browser_origins", None):
        if await get_sealed_mode():
            return SEALED_REASON
    return None


async def initial_enabled(type_info) -> tuple[bool, str | None]:
    """(enabled, reason) for a type row that is about to be created."""
    reason = await sealed_block_reason(type_info)
    if reason:
        logger.warning("Plugin type {} left off: {}", type_info.type_id, reason)
    return reason is None, reason


async def turn_type_on(type_id: str) -> bool:
    """Switch an existing, off type on unless sealed mode forbids it.

    Returns whether the type is on afterwards. A type already on is left alone.
    """
    db_type = await PluginTypeDB.objects.get_or_none(type_id=type_id)
    if db_type is None or db_type.enabled:
        return db_type is not None
    type_info = next((t for t in plugin_loader.get_plugin_types() if t.type_id == type_id), None)
    reason = await sealed_block_reason(type_info)
    if reason:
        logger.warning("Plugin type {} left off: {}", type_id, reason)
        db_type.error_message = reason
        await db_type.save_with_timestamp()
        return False
    db_type.enabled = True
    # The reason recorded while it was blocked is stale once it is on.
    if db_type.error_message == SEALED_REASON:
        db_type.error_message = None
    await db_type.save_with_timestamp()
    return True


def keeps_reason(db_type) -> bool:
    """A refresh of a type's row must not erase the sealed-mode reason while it is off."""
    return not db_type.enabled and db_type.error_message == SEALED_REASON
