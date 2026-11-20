"""Route policy: default-deny admin gate over every state-changing route (CLV-9)."""

import re

import pytest
from fastapi.routing import APIRoute

from app.main import app as main_app
from app.security.admin_auth import get_admin_store
from app.security.route_policy import (
    ADMIN_READS,
    GUEST_ROUTES,
    KIOSK_SELF_WRITE_KEYS,
    PUBLIC_WRITES,
    UNSAFE_METHODS,
)

pytestmark = pytest.mark.no_admin_login


def _fill(path: str) -> str:
    """Replace path params with a harmless value so the router matches."""
    return re.sub(r"\{[^}]+\}", "x", path)


def _route_index(app) -> set[tuple[str, str]]:
    index: set[tuple[str, str]] = set()
    for route in app.routes:
        if isinstance(route, APIRoute):
            for method in route.methods:
                index.add((method.upper(), route.path_format))
    return index


def _policy_route_index() -> set[tuple[str, str]]:
    """Templates the policy tables may name."""
    return _route_index(main_app)


def _error_code(response) -> str | None:
    try:
        detail = response.json().get("detail")
    except (ValueError, AttributeError):
        return None
    if isinstance(detail, dict):
        return detail.get("code")
    return None


def test_every_unsafe_route_needs_admin(test_client):
    unprotected: list[tuple[str, str, int]] = []
    for route in test_client.app.routes:
        if not isinstance(route, APIRoute):
            continue
        for method in sorted(route.methods & UNSAFE_METHODS):
            path = route.path_format
            if (method, path) in PUBLIC_WRITES:
                continue
            if (method, path) in GUEST_ROUTES:
                # Only a valid share token opens these; a bad one is a 404.
                response = test_client.request(method, _fill(path), json={})
                if response.status_code not in (303, 404):
                    unprotected.append((method, path, response.status_code))
                continue
            response = test_client.request(method, _fill(path), json={})
            if response.status_code != 401 or _error_code(response) != "admin_required":
                unprotected.append((method, path, response.status_code))
    assert unprotected == []


@pytest.mark.parametrize("path", sorted(ADMIN_READS))
def test_admin_reads_need_admin(test_client, path):
    response = test_client.get(_fill(path))
    assert response.status_code == 401
    assert _error_code(response) == "admin_required"


def test_public_writes_allowed_logged_out(test_client):
    response = test_client.post("/api/images/next")
    assert response.status_code != 401


def test_dashboard_reads_public(test_client):
    for path in ("/api/config", "/api/health", "/api/kiosks/new-kiosk/config"):
        response = test_client.get(path)
        assert response.status_code != 401, path


def test_unconfigured_says_setup_required(test_client):
    get_admin_store().reset()
    response = test_client.post("/api/calendar/sources", json={})
    assert response.status_code == 401
    assert _error_code(response) == "setup_required"


@pytest.mark.parametrize("key,value", [("themeMode", "dark"), ("typeTheme", "marquee")])
def test_config_display_key_without_admin(test_client, key, value):
    response = test_client.post("/api/config", json={key: value})
    assert response.status_code == 200


def test_config_dangerous_key_without_admin(test_client):
    response = test_client.post("/api/config", json={"gitBranch": "main"})
    assert response.status_code == 401
    assert _error_code(response) == "admin_required"


def test_config_mixed_request_rejected_as_a_whole(test_client):
    response = test_client.post("/api/config", json={"themeMode": "dark", "gitBranch": "main"})
    assert response.status_code == 401
    assert _error_code(response) == "admin_required"


def test_kiosk_self_write_is_patch_only_and_keeps_put_admin_only(test_client):
    """F2: a screen's partial write is open; replacing its layer is not."""
    assert ("PATCH", "/api/kiosks/{kiosk_id}/overrides") in PUBLIC_WRITES
    assert ("PUT", "/api/kiosks/{kiosk_id}/overrides") not in PUBLIC_WRITES
    assert "showUI" in KIOSK_SELF_WRITE_KEYS

    # The whole layer still needs admin on the logged-out client.
    replaced = test_client.put("/api/kiosks/kitchen/overrides", json={"overrides": {}})
    assert replaced.status_code == 401
    assert _error_code(replaced) == "admin_required"


def test_policy_tables_reference_real_routes():
    index = _policy_route_index()
    missing_writes = sorted(entry for entry in PUBLIC_WRITES if entry not in index)
    missing_reads = sorted(path for path in ADMIN_READS if ("GET", path) not in index)
    assert missing_writes == []
    assert missing_reads == []


def test_host_routes_match_the_routes_that_call_require_host_control():
    """A new host-acting route must be added to HOST_ROUTES, or API keys of lesser scope reach it."""
    import inspect

    from app.security.route_policy import HOST_ROUTES

    guarded = {
        (method, route.path_format)
        for route in main_app.routes
        if isinstance(route, APIRoute)
        and "require_host_control(" in inspect.getsource(route.endpoint)
        for method in route.methods
    }
    assert guarded == set(HOST_ROUTES)


def test_the_app_gates_guest_bodies_before_routing():
    """Share tokens are checked in ASGI middleware, before a form is parsed (calvin-mwqo)."""
    from app.security.guest_gate import GuestGateMiddleware
    from app.security.host_origin import HostOriginMiddleware

    classes = [middleware.cls for middleware in main_app.user_middleware]
    assert GuestGateMiddleware in classes
    # Host/Origin stays outermost: it is added after the gate.
    assert classes.index(HostOriginMiddleware) < classes.index(GuestGateMiddleware)


def test_plugin_action_route_is_a_public_write():
    assert ("POST", "/api/plugins/{plugin_id}/actions/{action}") in PUBLIC_WRITES


def test_only_fetch_and_actions_are_public_plugin_writes():
    plugin_writes = {e for e in PUBLIC_WRITES if e[1].startswith("/api/plugins")}
    assert plugin_writes == {
        ("POST", "/api/plugins/{plugin_id}/fetch"),
        ("POST", "/api/plugins/{plugin_id}/actions/{action}"),
    }


def test_plugin_action_template_matches_a_real_route():
    assert ("POST", "/api/plugins/{plugin_id}/actions/{action}") in _policy_route_index()


def test_post_scan_is_not_public():
    # The scan's body can hold a key typed into the form (homey switch tiles
    # Task 2.5): admin-only by the default-deny policy, never a viewer write.
    assert ("POST", "/api/plugins/{plugin_id}/scan") not in PUBLIC_WRITES
    assert ("POST", "/api/plugins/{plugin_id}/scan") in _policy_route_index()


def test_get_scan_still_admin_read():
    assert "/api/plugins/{plugin_id}/scan" in ADMIN_READS


def test_post_scan_logged_out_is_admin_required(test_client):
    response = test_client.post(
        "/api/plugins/x/scan", json={"field": "devices", "config": {"api_key": "typed"}}
    )
    assert response.status_code == 401
    assert _error_code(response) == "admin_required"


# -- API key permissions (calvin-2ifv) --------------------------------------


def test_permission_routes_reference_real_routes():
    from app.security.route_policy import PERMISSION_ROUTES

    index = _policy_route_index()
    missing = sorted(
        entry for routes in PERMISSION_ROUTES.values() for entry in routes if entry not in index
    )
    assert missing == []


def test_permission_routes_are_never_public_or_host_routes():
    from app.security.route_policy import HOST_ROUTES, PERMISSION_ROUTES

    for routes in PERMISSION_ROUTES.values():
        assert not routes & PUBLIC_WRITES
        assert not routes & HOST_ROUTES
        assert not routes & GUEST_ROUTES


def test_screens_power_opens_exactly_the_screen_power_route():
    """Pin: widening what the home automation key can do must be a deliberate change."""
    from app.security.api_keys import PERMISSIONS
    from app.security.route_policy import PERMISSION_ROUTES

    assert set(PERMISSION_ROUTES) == set(PERMISSIONS) == {"screens.power"}
    assert PERMISSION_ROUTES["screens.power"] == {
        ("PUT", "/api/kiosks/{kiosk_id}/screen-power"),
        ("GET", "/api/kiosks/{kiosk_id}/screen-power"),
    }


def test_screen_power_put_is_not_a_public_write(test_client):
    assert ("PUT", "/api/kiosks/{kiosk_id}/screen-power") not in PUBLIC_WRITES
    response = test_client.put("/api/kiosks/kitchen/screen-power", json={"power": "off"})
    assert response.status_code == 401
    assert _error_code(response) == "admin_required"


def test_limited_key_refused_on_every_other_unsafe_route(test_client):
    from app.security.route_policy import PERMISSION_ROUTES

    response = test_client.post("/api/auth/login", json={"password": "test-admin-password"})
    assert response.status_code == 200
    created = test_client.post(
        "/api/auth/keys",
        json={"name": "Homey", "scope": "read", "permissions": ["screens.power"]},
    )
    assert created.status_code == 201, created.text
    headers = {"Authorization": f"Bearer {created.json()['secret']}"}
    test_client.cookies.clear()
    opened = PERMISSION_ROUTES["screens.power"]
    reached: list[tuple[str, str, int]] = []
    for route in test_client.app.routes:
        if not isinstance(route, APIRoute):
            continue
        for method in sorted(route.methods & UNSAFE_METHODS):
            route_id = (method, route.path_format)
            if route_id in PUBLIC_WRITES or route_id in GUEST_ROUTES or route_id in opened:
                continue
            response = test_client.request(
                method, _fill(route.path_format), json={}, headers=headers
            )
            if response.status_code != 403 or _error_code(response) != "insufficient_scope":
                reached.append((*route_id, response.status_code))
    assert reached == []


# -- KIOSK_ROUTES: only the screen itself acts on a gated screen (calvin-0xns) --


def test_kiosk_routes_reference_real_routes():
    from app.security.route_policy import KIOSK_ROUTES

    index = _policy_route_index()
    missing = sorted(entry for entry in KIOSK_ROUTES if entry not in index)
    assert missing == []
    assert KIOSK_ROUTES == {
        ("POST", "/api/kiosks/{kiosk_id}/screen-sleep"),
        ("POST", "/api/kiosks/{kiosk_id}/display-check"),
    }


def test_kiosk_routes_not_host_or_permission():
    from app.security.route_policy import HOST_ROUTES, KIOSK_ROUTES, PERMISSION_ROUTES

    opened = {entry for routes in PERMISSION_ROUTES.values() for entry in routes}
    assert not KIOSK_ROUTES & HOST_ROUTES
    assert not KIOSK_ROUTES & opened


def test_kiosk_routes_stay_public_writes():
    from app.security.route_policy import KIOSK_ROUTES

    assert KIOSK_ROUTES <= PUBLIC_WRITES
