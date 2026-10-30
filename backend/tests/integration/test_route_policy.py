"""Route policy: default-deny admin gate over every state-changing route (CLV-9)."""

import re

import pytest
from fastapi.routing import APIRoute

from app.main import app as main_app
from app.security.admin_auth import get_admin_store
from app.security.route_policy import (
    ADMIN_READS,
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


def test_config_display_key_without_admin(test_client):
    response = test_client.post("/api/config", json={"themeMode": "dark"})
    assert response.status_code == 200


def test_config_dangerous_key_without_admin(test_client):
    response = test_client.post("/api/config", json={"gitBranch": "main"})
    assert response.status_code == 401
    assert _error_code(response) == "admin_required"


def test_config_mixed_request_rejected_as_a_whole(test_client):
    response = test_client.post("/api/config", json={"themeMode": "dark", "gitBranch": "main"})
    assert response.status_code == 401
    assert _error_code(response) == "admin_required"


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
