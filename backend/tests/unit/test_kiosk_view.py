"""Presence projection and household pairing mode (calvin-0xns, Task 5)."""

import pytest

from app.services.kiosk_view import (
    PRESENCE_KEYS,
    can_see_presence,
    is_gated,
    pairing_mode,
    strip_presence,
)

pytestmark = pytest.mark.unit


@pytest.mark.parametrize(
    ("admin", "principal", "paired", "mode", "expected"),
    [
        # An admin sees everything, in every row, in every mode.
        (True, None, True, "required", True),
        (True, "other", False, "required", True),
        # The screen itself always sees its own presence.
        (False, "kitchen", True, "optional", True),
        (False, "kitchen", False, "required", True),
        # Optional and unpaired: as open as it is today.
        (False, None, False, "optional", True),
        (False, "other", False, "optional", True),
        # Paired, optional: only the screen itself and admin.
        (False, None, True, "optional", False),
        (False, "other", True, "optional", False),
        # Required, unpaired: only admin.
        (False, None, False, "required", False),
        (False, "other", False, "required", False),
        # Required, paired: only the screen itself.
        (False, "other", True, "required", False),
    ],
)
def test_can_see_presence_truth_table(admin, principal, paired, mode, expected):
    assert (
        can_see_presence(
            admin=admin,
            principal=principal,
            kiosk_id="kitchen",
            paired=paired,
            mode=mode,
        )
        is expected
    )


@pytest.mark.parametrize(
    ("paired", "mode", "expected"),
    [
        (True, "optional", True),
        (True, "required", True),
        (False, "optional", False),
        (False, "required", True),
    ],
)
def test_is_gated(paired, mode, expected):
    assert is_gated(paired, mode) is expected


def test_strip_presence_removes_exactly_the_presence_keys():
    payload = {
        "screenHold": {"power": "off"},
        "screen_hold": {"power": "off"},
        "screenNow": {"power": "off"},
        "screen_now": {"power": "off"},
        "displayCheck": {"id": "run"},
        "display_check": {"id": "run"},
        "powerHold": {"power": "off"},
        # Never touched.
        "orientation": "landscape",
        "dashboardLayout": {"version": 1},
        "lastSeen": "2026-11-19T10:00:00Z",
        "displayCheckActive": True,
    }
    strip_presence(payload)
    assert not set(PRESENCE_KEYS) & set(payload)
    assert {"orientation", "dashboardLayout", "lastSeen", "displayCheckActive"} <= set(payload)


def test_presence_keys_are_the_global_constraints_list():
    assert PRESENCE_KEYS == (
        "screenHold",
        "screen_hold",
        "screenNow",
        "screen_now",
        "displayCheck",
        "display_check",
        "powerHold",
    )


async def test_pairing_mode_defaults_to_optional(test_db):
    from app.services.config_service import config_service

    await config_service.delete_value("kioskPairing")
    assert await pairing_mode() == "optional"
    await config_service.set_value("kioskPairing", "sometimes")
    assert await pairing_mode() == "optional"
    await config_service.set_value("kioskPairing", "required")
    assert await pairing_mode() == "required"
    await config_service.delete_value("kioskPairing")
