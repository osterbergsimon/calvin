"""A screen may write a small allowlist of its own settings without admin (F2, settings-scope §7.9).

Why this is safe enough to ship, and what it does not protect against
---------------------------------------------------------------------
A kiosk has no credential: its identity is the id in ``?kiosk=<id>``, which the
server already trusts for that kiosk's own routes. ``GET /api/kiosks/{id}/config``
registers and updates the same row from the same bare id, and any caller may
already write the *household* ``showUI`` through ``POST /api/config``
(``CONFIG_DISPLAY_KEYS``), which every screen inherits. A partial write of one
purely presentational key into one screen's layer is therefore not a new
capability: anyone who knows a screen's id can hide that screen's controls,
exactly as they can hide every screen's controls today. The allowlist keeps the
blast radius to that: device-physical keys (rotation, display schedule,
timeout, power, update) stay admin-only, and the layer can never be replaced or
have keys removed without admin.

"Own kiosk" vs "other kiosk" is therefore not enforced server-side; the explicit
test below pins that down so the trade-off stays visible.
"""

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.no_admin_login

ADMIN_PASSWORD = "test-admin-password"
KIOSK = "kitchen-3f9a2c"


def _login(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"password": ADMIN_PASSWORD})
    assert response.status_code == 200, response.text


def _seed_layer(client: TestClient, overrides: dict, kiosk_id: str = KIOSK) -> None:
    """Create a screen with an admin-written layer, then sign out again."""
    _login(client)
    response = client.put(f"/api/kiosks/{kiosk_id}/overrides", json={"overrides": overrides})
    assert response.status_code == 200, response.text
    assert client.post("/api/auth/logout").status_code == 200


def _layer(client: TestClient, kiosk_id: str = KIOSK) -> dict:
    response = client.get(f"/api/kiosks/{kiosk_id}/overrides")
    assert response.status_code == 200, response.text
    return response.json()["overrides"]


def _error_code(response) -> str | None:
    detail = response.json().get("detail")
    return detail.get("code") if isinstance(detail, dict) else None


# --- the dashboard's ⋯ Hide controls toggle -------------------------------


@pytest.mark.integration
def test_a_screen_hides_its_own_controls_without_admin(test_client: TestClient):
    _seed_layer(test_client, {"showUI": True, "orientation": "portrait", "displayName": "Kitchen"})

    response = test_client.patch(
        f"/api/kiosks/{KIOSK}/overrides", json={"overrides": {"showUI": False}}
    )

    assert response.status_code == 200, response.text
    assert response.json()["overrides"] == {
        "showUI": False,
        "orientation": "portrait",
        "displayName": "Kitchen",
    }
    assert _layer(test_client)["showUI"] is False


@pytest.mark.integration
def test_the_non_admin_write_merges_and_never_replaces_the_layer(test_client: TestClient):
    """Only the keys sent change; every other key (and the internal flag) stays."""
    _seed_layer(
        test_client,
        {
            "showUI": True,
            "orientation": "portrait",
            "hotCornerSize": 48,
            "_agentUpdateRequested": True,
        },
    )

    assert (
        test_client.patch(
            f"/api/kiosks/{KIOSK}/overrides", json={"overrides": {"showUI": False}}
        ).status_code
        == 200
    )
    # A second write still sees the same layer: nothing was dropped on the way.
    assert (
        test_client.patch(
            f"/api/kiosks/{KIOSK}/overrides", json={"overrides": {"showUI": True}}
        ).status_code
        == 200
    )

    assert _layer(test_client) == {
        "showUI": True,
        "orientation": "portrait",
        "hotCornerSize": 48,
        "_agentUpdateRequested": True,
    }


@pytest.mark.integration
def test_an_empty_non_admin_write_changes_nothing(test_client: TestClient):
    """A partial write can add no keys; it can never be used to delete them."""
    _seed_layer(test_client, {"showUI": False, "orientation": "portrait"})

    response = test_client.patch(f"/api/kiosks/{KIOSK}/overrides", json={"overrides": {}})

    assert response.status_code == 200, response.text
    assert _layer(test_client) == {"showUI": False, "orientation": "portrait"}


# --- what stays admin-only ------------------------------------------------


@pytest.mark.integration
def test_a_key_outside_the_allowlist_is_refused(test_client: TestClient):
    _seed_layer(test_client, {"showUI": True, "orientation": "landscape"})

    response = test_client.patch(
        f"/api/kiosks/{KIOSK}/overrides", json={"overrides": {"orientation": "portrait"}}
    )

    assert response.status_code == 403
    assert _error_code(response) == "override_needs_admin"
    assert _layer(test_client)["orientation"] == "landscape"


@pytest.mark.integration
def test_a_mixed_request_is_refused_as_a_whole(test_client: TestClient):
    """A request that also carries an admin key changes nothing at all."""
    _seed_layer(test_client, {"showUI": True})

    response = test_client.patch(
        f"/api/kiosks/{KIOSK}/overrides",
        json={"overrides": {"showUI": False, "orientation": "portrait"}},
    )

    assert response.status_code == 403
    assert _error_code(response) == "override_needs_admin"
    assert _layer(test_client) == {"showUI": True}


@pytest.mark.integration
@pytest.mark.parametrize(
    "key", ["orientation", "orientationFlipped", "applyDisplayRotation", "displayTimeout"]
)
def test_device_physical_keys_stay_admin_only(test_client: TestClient, key):
    _seed_layer(test_client, {"showUI": True})
    value = {"orientation": "portrait", "displayTimeout": 60}.get(key, True)

    response = test_client.patch(f"/api/kiosks/{KIOSK}/overrides", json={"overrides": {key: value}})

    assert response.status_code == 403, response.text
    assert key not in _layer(test_client)


@pytest.mark.integration
def test_the_allowlist_never_holds_a_device_physical_key():
    """Guard: extending the allowlist must not reach a key the device acts on."""
    from app.security.route_policy import KIOSK_SELF_WRITE_KEYS
    from app.services.kiosk_registry import DEVICE_PHYSICAL_KEYS

    assert KIOSK_SELF_WRITE_KEYS.isdisjoint(DEVICE_PHYSICAL_KEYS)


@pytest.mark.integration
def test_every_allowlisted_key_is_typed():
    """Guard: an allowlisted key must be declared in ConfigUpdate, so values are checked."""
    from app.schemas.config_update import ConfigUpdate
    from app.security.route_policy import KIOSK_SELF_WRITE_KEYS

    assert KIOSK_SELF_WRITE_KEYS <= set(ConfigUpdate.model_fields)


# --- validation -----------------------------------------------------------


@pytest.mark.integration
def test_a_bad_value_is_a_400_and_changes_nothing(test_client: TestClient):
    _seed_layer(test_client, {"showUI": True})

    response = test_client.patch(
        f"/api/kiosks/{KIOSK}/overrides", json={"overrides": {"showUI": "maybe"}}
    )

    assert response.status_code == 400, response.text
    assert _layer(test_client) == {"showUI": True}


@pytest.mark.integration
def test_an_oversized_admin_write_is_a_400(test_client: TestClient):
    """The size cap is shared with PUT; a non-admin body can't reach it, since
    only a boolean allowlisted key is open and the key check runs first."""
    _login(test_client)

    response = test_client.patch(
        f"/api/kiosks/{KIOSK}/overrides",
        json={"overrides": {"showUI": True, "big": "x" * (64 * 1024)}},
    )

    assert response.status_code == 400, response.text


@pytest.mark.integration
def test_an_unknown_screen_is_a_404(test_client: TestClient):
    response = test_client.patch(
        "/api/kiosks/nobody-here/overrides", json={"overrides": {"showUI": False}}
    )

    assert response.status_code == 404
    assert test_client.get("/api/kiosks/nobody-here/overrides").status_code == 404


@pytest.mark.integration
def test_a_malformed_id_is_a_400(test_client: TestClient):
    response = test_client.patch(
        "/api/kiosks/bad%20id/overrides", json={"overrides": {"showUI": False}}
    )

    assert response.status_code == 400


@pytest.mark.integration
def test_a_missing_overrides_body_is_refused(test_client: TestClient):
    assert test_client.patch(f"/api/kiosks/{KIOSK}/overrides", json={}).status_code == 422


# --- the threat, pinned down ----------------------------------------------


@pytest.mark.integration
def test_a_caller_that_knows_another_screen_id_can_hide_its_controls(test_client: TestClient):
    """Accepted threat (see this module's docstring): the kiosk id is not a secret.

    Anyone on the LAN can read ``GET /api/kiosks`` and write the household
    ``showUI`` through ``POST /api/config`` already, so this is not an
    escalation. Pinned here so a future change to kiosk identity stays visible.
    """
    _seed_layer(test_client, {"showUI": True}, kiosk_id="hallway")

    response = test_client.patch(
        "/api/kiosks/hallway/overrides", json={"overrides": {"showUI": False}}
    )

    assert response.status_code == 200, response.text
    assert _layer(test_client, kiosk_id="hallway")["showUI"] is False


# --- admin unchanged ------------------------------------------------------


@pytest.mark.integration
def test_admin_put_still_replaces_the_whole_layer(test_client: TestClient):
    _login(test_client)

    assert (
        test_client.put(
            f"/api/kiosks/{KIOSK}/overrides",
            json={"overrides": {"showUI": True, "orientation": "portrait"}},
        ).status_code
        == 200
    )
    assert (
        test_client.put(
            f"/api/kiosks/{KIOSK}/overrides", json={"overrides": {"showUI": False}}
        ).status_code
        == 200
    )

    assert _layer(test_client) == {"showUI": False}


@pytest.mark.integration
def test_admin_patch_merges_any_declared_key(test_client: TestClient):
    _login(test_client)
    assert (
        test_client.put(
            f"/api/kiosks/{KIOSK}/overrides", json={"overrides": {"showUI": True}}
        ).status_code
        == 200
    )

    response = test_client.patch(
        f"/api/kiosks/{KIOSK}/overrides", json={"overrides": {"orientation": "portrait"}}
    )

    assert response.status_code == 200, response.text
    assert _layer(test_client) == {"showUI": True, "orientation": "portrait"}
