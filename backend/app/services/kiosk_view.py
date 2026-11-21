"""Viewer-aware presence projection (calvin-0xns, design §7).

A *gated* screen is a paired screen, or any screen while the household mode is
``required``. On a gated screen only the screen itself and an admin see the
presence fields: the hold, the manual "Screen now" and the display-check job
with its run id. Everyone else gets the same dashboard config without them.

The mode is read from the household config table on every call, never from a
merged per-screen config, so a screen's own layer cannot switch it off.
"""

from typing import Literal

PairingMode = Literal["optional", "required"]
PAIRING_MODE_KEY = "kioskPairing"

# The presence fields of a config answer (Global Constraints). ``powerHold`` is
# the kiosk list's spelling of the same fact.
PRESENCE_KEYS: tuple[str, ...] = (
    "screenHold",
    "screen_hold",
    "screenNow",
    "screen_now",
    "displayCheck",
    "display_check",
    "powerHold",
)

# What the kiosk list hides on a gated row, besides the layer's screenNow.
LIST_PRESENCE_KEYS: tuple[str, ...] = ("powerHold", "screenPower", "displayCheckActive")
SCREEN_NOW_KEYS: tuple[str, ...] = ("screenNow", "screen_now")


def strip_presence(payload: dict) -> None:
    """Remove exactly :data:`PRESENCE_KEYS` from ``payload``, in place."""
    for key in PRESENCE_KEYS:
        payload.pop(key, None)


def strip_list_row(row: dict) -> None:
    """Remove the list's presence fields from one row, in place."""
    for key in LIST_PRESENCE_KEYS:
        row.pop(key, None)
    overrides = row.get("overrides")
    if isinstance(overrides, dict):
        for key in SCREEN_NOW_KEYS:
            overrides.pop(key, None)


def strip_layer_presence(layer: dict) -> None:
    """Remove the presence keys a raw override layer may carry, in place."""
    for key in SCREEN_NOW_KEYS:
        layer.pop(key, None)


def is_gated(paired: bool, mode: PairingMode) -> bool:
    """A paired screen, or any screen while the household mode is required."""
    return paired or mode == "required"


def can_see_presence(
    *,
    admin: bool,
    principal: str | None,
    kiosk_id: str,
    paired: bool,
    mode: PairingMode,
) -> bool:
    """True for an admin, the screen itself, or any screen that is not gated."""
    if admin:
        return True
    if principal is not None and principal == kiosk_id:
        return True
    return not is_gated(paired, mode)


async def pairing_mode() -> PairingMode:
    """The household choice, ``"optional"`` unless the table says ``"required"``."""
    from app.services.config_service import config_service

    value = await config_service.get_value(PAIRING_MODE_KEY)
    return "required" if value == "required" else "optional"
