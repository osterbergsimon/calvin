"""Bearer API keys through the route policy, on a stub app (CLV-32).

The stub app mounts the real auth router and the real ``enforce_route_policy``
and Host/Origin middleware, but its "host" routes are harmless stand-ins, so no
test here can reach a real reboot/restart handler.
"""

import pytest
from fastapi import Depends, FastAPI, Request
from fastapi.testclient import TestClient
from loguru import logger

from app.config import settings
from app.security.admin_auth import get_admin_store
from app.security.api_keys import get_api_key_store
from app.security.install import install_security
from app.security.route_policy import ADMIN_READS, HOST_ROUTES, enforce_route_policy

PASSWORD = "test-admin-password"
ADMIN_READ_PATH = "/api/backup/files"  # in ADMIN_READS
HOST_PATH = "/api/system/reboot"  # in HOST_ROUTES only
DISPLAY_PATH = "/api/system/display/power/on"  # in HOST_ROUTES and PUBLIC_WRITES
SCREEN_POWER_PATH = "/api/kiosks/{kiosk_id}/screen-power"  # in PERMISSION_ROUTES
SCREEN_POWER = "/api/kiosks/kitchen/screen-power"


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "admin_auth_path", tmp_path / "admin-auth.json")
    monkeypatch.setattr(settings, "host_control", True)
    get_admin_store().set_password(PASSWORD)
    from app.security.admin_auth import api_key_limiter, login_limiter

    for limiter in (login_limiter, api_key_limiter):
        limiter._failures.clear()
        limiter._lockouts.clear()

    app = FastAPI(dependencies=[Depends(enforce_route_policy)])

    @app.get("/api/public")
    async def public():
        return {"ok": True}

    @app.get("/api/backup/export")
    async def backup_export():
        return {"ok": True}

    @app.get(ADMIN_READ_PATH)
    async def admin_read():
        return {"ok": True}

    @app.post("/api/calendar/sources")
    async def unsafe():
        return {"ok": True}

    @app.post("/api/images/next")  # a PUBLIC_WRITES route
    async def public_write():
        return {"ok": True}

    @app.post(DISPLAY_PATH)  # host-acting AND a viewer write
    async def display_on():
        from app.utils.host_control import require_host_control

        require_host_control("Turning the display on")
        return {"ok": True}

    @app.post("/api/config")
    async def config_write(request: Request, body: dict):
        from app.security.route_policy import CONFIG_DISPLAY_KEYS, admin_error, is_admin

        if not is_admin(request) and not body.keys() <= CONFIG_DISPLAY_KEYS:
            raise admin_error(True)
        return {"ok": True}

    @app.put(SCREEN_POWER_PATH)  # stand-in for the screen-power route (calvin-2ifv)
    async def screen_power_put(kiosk_id: str):
        return {"ok": True}

    @app.get(SCREEN_POWER_PATH)
    async def screen_power_get(kiosk_id: str):
        return {"ok": True}

    @app.post(HOST_PATH)
    async def host_route():
        from app.utils.host_control import require_host_control

        require_host_control("Rebooting")
        return {"ok": True}

    install_security(app)
    return TestClient(app)


def _session(client: TestClient) -> None:
    assert client.post("/api/auth/login", json={"password": PASSWORD}).status_code == 200


def _make_key(client: TestClient, scope: str) -> str:
    return _make_key_named(client, scope, f"k-{scope}")


def _make_key_named(client: TestClient, scope: str, name: str) -> str:
    _session(client)
    response = client.post("/api/auth/keys", json={"name": name, "scope": scope})
    assert response.status_code == 201, response.text
    client.cookies.clear()
    return response.json()["secret"]


def _bearer(secret: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {secret}"}


# (scope, request, expected status with host control on)
MATRIX = [
    ("read", ("GET", "/api/public"), 200),
    ("read", ("GET", ADMIN_READ_PATH), 403),
    ("read", ("GET", "/api/backup/export"), 403),
    ("read", ("POST", "/api/calendar/sources"), 403),
    ("read", ("POST", "/api/images/next"), 200),
    ("read", ("POST", DISPLAY_PATH), 200),
    ("read", ("POST", HOST_PATH), 403),
    ("admin", ("GET", "/api/public"), 200),
    ("admin", ("GET", ADMIN_READ_PATH), 200),
    ("admin", ("POST", "/api/calendar/sources"), 200),
    ("admin", ("POST", "/api/images/next"), 200),
    ("admin", ("POST", HOST_PATH), 403),
    ("admin", ("POST", DISPLAY_PATH), 200),
    ("admin", ("GET", "/api/backup/export"), 200),
    ("host", ("GET", "/api/public"), 200),
    ("host", ("GET", ADMIN_READ_PATH), 200),
    ("host", ("POST", "/api/calendar/sources"), 200),
    ("host", ("POST", "/api/images/next"), 200),
    ("host", ("POST", HOST_PATH), 200),
]


@pytest.mark.parametrize(("scope", "request_line", "expected"), MATRIX)
def test_scope_matrix_host_control_on(client, scope, request_line, expected):
    secret = _make_key(client, scope)
    method, path = request_line
    response = client.request(method, path, headers=_bearer(secret))
    assert response.status_code == expected, response.text
    if expected == 403:
        assert response.json()["detail"]["code"] == "insufficient_scope"


def test_read_key_display_power_matches_anonymous(client, monkeypatch):
    secret = _make_key(client, "read")
    for enabled in (True, False):
        monkeypatch.setattr(settings, "host_control", enabled)
        anonymous = client.post(DISPLAY_PATH).status_code
        with_key = client.post(DISPLAY_PATH, headers=_bearer(secret)).status_code
        assert with_key == anonymous == (200 if enabled else 409)


def test_read_key_config_write_only_for_display_keys(client):
    secret = _make_key(client, "read")
    headers = _bearer(secret)
    assert client.post("/api/config", json={"showUI": True}, headers=headers).status_code == 200
    # The one-time CLV-49 display migration is a display-state write: the
    # dashboard may persist it without an admin session.
    assert (
        client.post(
            "/api/config", json={"displaySettingsMigrated": True}, headers=headers
        ).status_code
        == 200
    )
    refused = client.post("/api/config", json={"gitBranch": "x"}, headers=headers)
    assert refused.status_code in (401, 403)
    admin = _make_key_named(client, "admin", "second-admin")
    assert (
        client.post("/api/config", json={"gitBranch": "x"}, headers=_bearer(admin)).status_code
        == 200
    )


@pytest.mark.parametrize("scope", ["read", "admin", "host"])
def test_host_route_refused_for_every_key_when_host_control_off(client, monkeypatch, scope):
    secret = _make_key(client, scope)
    monkeypatch.setattr(settings, "host_control", False)
    response = client.post(HOST_PATH, headers=_bearer(secret))
    # read/admin are stopped by scope, host by the existing host-control guard.
    assert response.status_code == (409 if scope == "host" else 403)
    if scope == "host":
        assert response.json()["detail"]["code"] == "host_control_disabled"


def test_admin_session_cookie_still_works_unchanged(client):
    _session(client)
    assert client.post("/api/calendar/sources").status_code == 200


def test_anonymous_unchanged(client):
    assert client.get("/api/public").status_code == 200
    assert client.post("/api/calendar/sources").status_code == 401


@pytest.mark.parametrize("path", ["/api/public", ADMIN_READ_PATH, "/api/auth/status"])
def test_invalid_key_is_401_even_on_public_routes(client, path):
    response = client.get(path, headers=_bearer("clv_" + "x" * 43))
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "invalid_api_key"


def test_revoked_key_is_401_immediately(client):
    secret = _make_key(client, "admin")
    assert client.get(ADMIN_READ_PATH, headers=_bearer(secret)).status_code == 200
    _session(client)
    key_id = client.get("/api/auth/keys").json()["keys"][0]["id"]
    assert client.delete(f"/api/auth/keys/{key_id}").status_code == 204
    client.cookies.clear()
    response = client.get(ADMIN_READ_PATH, headers=_bearer(secret))
    assert response.status_code == 401


def test_bad_bearer_ignores_a_valid_cookie(client):
    _session(client)
    response = client.get("/api/public", headers=_bearer("clv_bad"))
    assert response.status_code == 401


def test_bearer_overrides_cookie_privileges(client):
    secret = _make_key(client, "read")
    _session(client)
    # The cookie would allow this; the (weaker) key presented wins.
    assert client.post("/api/calendar/sources", headers=_bearer(secret)).status_code == 403


def test_non_bearer_scheme_is_ignored(client):
    assert client.get("/api/public", headers={"Authorization": "Basic abc"}).status_code == 200


def test_query_param_key_is_not_accepted(client):
    secret = _make_key(client, "admin")
    assert client.post(f"/api/calendar/sources?api_key={secret}").status_code == 401


def test_bearer_skips_origin_check_but_cookie_does_not(client):
    secret = _make_key(client, "admin")
    hostile = {"Origin": "https://evil.example", "Sec-Fetch-Site": "cross-site"}
    response = client.post("/api/calendar/sources", headers={**hostile, **_bearer(secret)})
    assert response.status_code == 200
    _session(client)
    assert client.post("/api/calendar/sources", headers=hostile).status_code == 403


def test_bearer_still_gets_the_host_check(client):
    secret = _make_key(client, "admin")
    response = client.get("/api/public", headers={**_bearer(secret), "Host": "evil.example.com"})
    assert response.status_code == 400


# -- key management ---------------------------------------------------------


@pytest.mark.parametrize("scope", ["read", "admin", "host"])
def test_keys_cannot_manage_keys(client, scope):
    secret = _make_key(client, scope)
    headers = _bearer(secret)
    _session(client)
    key_id = client.get("/api/auth/keys").json()["keys"][0]["id"]
    client.cookies.clear()
    assert client.get("/api/auth/keys", headers=headers).status_code == 403
    assert (
        client.post(
            "/api/auth/keys", json={"name": "n", "scope": "read"}, headers=headers
        ).status_code
        == 403
    )
    assert client.delete(f"/api/auth/keys/{key_id}", headers=headers).status_code == 403
    # Still active afterwards.
    assert client.get("/api/public", headers=headers).status_code == 200


def test_keys_cannot_change_the_admin_password(client):
    secret = _make_key(client, "host")
    response = client.post(
        "/api/auth/password",
        json={"current": PASSWORD, "new": "another-password"},
        headers=_bearer(secret),
    )
    assert response.status_code == 403
    assert get_admin_store().verify_password(PASSWORD)


def test_management_needs_a_session(client):
    assert client.get("/api/auth/keys").status_code == 401
    assert client.post("/api/auth/keys", json={"name": "n", "scope": "read"}).status_code == 401
    assert client.delete("/api/auth/keys/x").status_code == 401


def test_create_list_revoke_contract(client):
    _session(client)
    created = client.post("/api/auth/keys", json={"name": " Home Assistant ", "scope": "read"})
    assert created.status_code == 201
    body = created.json()
    assert body["secret"].startswith("clv_")
    assert body["key"]["name"] == "Home Assistant"
    assert body["key"]["prefix"] == body["secret"][:8]
    assert set(body["key"]) == {
        "id",
        "name",
        "scope",
        "prefix",
        "createdAt",
        "lastUsedAt",
        "permissions",
        "limited",
    }
    assert body["key"]["limited"] is False

    listed = client.get("/api/auth/keys")
    assert listed.status_code == 200
    assert body["secret"] not in listed.text
    assert listed.json() == {"keys": [body["key"]]}

    assert client.delete(f"/api/auth/keys/{body['key']['id']}").status_code == 204
    assert client.get("/api/auth/keys").json() == {"keys": []}
    assert client.delete(f"/api/auth/keys/{body['key']['id']}").status_code == 404


def test_create_validation(client):
    _session(client)
    assert client.post("/api/auth/keys", json={"name": "a", "scope": "root"}).status_code == 422
    assert client.post("/api/auth/keys", json={"name": "  ", "scope": "read"}).status_code == 422
    assert (
        client.post("/api/auth/keys", json={"name": "x" * 41, "scope": "read"}).status_code == 422
    )
    assert client.post("/api/auth/keys", json={"name": "ok", "scope": "read"}).status_code == 201
    duplicate = client.post("/api/auth/keys", json={"name": "OK", "scope": "admin"})
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"]["code"] == "duplicate_name"


def test_host_key_refused_when_host_control_off(client, monkeypatch):
    _session(client)
    monkeypatch.setattr(settings, "host_control", False)
    response = client.post("/api/auth/keys", json={"name": "h", "scope": "host"})
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "host_control_disabled"
    assert client.get("/api/auth/keys").json() == {"keys": []}
    assert client.post("/api/auth/keys", json={"name": "a", "scope": "admin"}).status_code == 201


def test_password_change_does_not_revoke_keys(client):
    secret = _make_key(client, "admin")
    _session(client)
    changed = client.post(
        "/api/auth/password", json={"current": PASSWORD, "new": "brand-new-password"}
    )
    assert changed.status_code == 200
    client.cookies.clear()
    assert client.get(ADMIN_READ_PATH, headers=_bearer(secret)).status_code == 200


# -- abuse handling ---------------------------------------------------------


def test_failed_bearer_auth_is_rate_limited(client):
    bad = _bearer("clv_" + "y" * 43)
    for _ in range(5):
        assert client.get("/api/public", headers=bad).status_code == 401
    locked = client.get("/api/public", headers=bad)
    assert locked.status_code == 429
    assert locked.json()["detail"]["code"] == "rate_limited"
    assert "Retry-After" in locked.headers


def test_failed_key_attempts_do_not_lock_out_password_login(client):
    for _ in range(6):
        client.get("/api/public", headers=_bearer("clv_" + "y" * 43))
    assert client.post("/api/auth/login", json={"password": PASSWORD}).status_code == 200


def test_last_used_is_updated_but_throttled(client, monkeypatch):
    secret = _make_key(client, "read")
    store = get_api_key_store()
    assert store.list()[0]["lastUsedAt"] is None
    client.get("/api/public", headers=_bearer(secret))
    first = store.path.read_text()
    assert store.list()[0]["lastUsedAt"] is not None
    client.get("/api/public", headers=_bearer(secret))
    assert store.path.read_text() == first


def test_secret_never_reaches_the_logs(client):
    sink: list[str] = []
    handler = logger.add(lambda message: sink.append(str(message)), level="DEBUG")
    try:
        secret = _make_key(client, "admin")
        client.get("/api/public", headers=_bearer(secret))
        client.get("/api/public", headers=_bearer(secret + "tampered"))
        logger.info(f"accidentally formatted {secret}")
    finally:
        logger.remove(handler)
    joined = "\n".join(sink)
    assert secret not in joined
    assert "accidentally formatted" in joined


# -- policy tables ----------------------------------------------------------


def test_host_routes_are_real_unsafe_or_stream_free_system_routes():
    assert ("POST", "/api/system/reboot") in HOST_ROUTES
    assert ("POST", "/api/system/restart-backend") in HOST_ROUTES
    assert ADMIN_READ_PATH in ADMIN_READS


# -- limited keys (calvin-2ifv) ---------------------------------------------


def _make_limited_key(client: TestClient, name: str = "Homey") -> str:
    _session(client)
    response = client.post(
        "/api/auth/keys",
        json={"name": name, "scope": "read", "permissions": ["screens.power"]},
    )
    assert response.status_code == 201, response.text
    assert response.json()["key"]["limited"] is True
    assert response.json()["key"]["permissions"] == ["screens.power"]
    client.cookies.clear()
    return response.json()["secret"]


LIMITED_MATRIX = [
    (("GET", "/api/public"), 200),
    (("GET", ADMIN_READ_PATH), 403),
    (("GET", "/api/backup/export"), 403),
    (("POST", "/api/calendar/sources"), 403),
    (("POST", "/api/images/next"), 200),
    (("POST", DISPLAY_PATH), 200),  # what an anonymous caller gets
    (("POST", HOST_PATH), 403),
    (("PUT", SCREEN_POWER), 200),
    (("GET", SCREEN_POWER), 200),
]


@pytest.mark.parametrize(("request_line", "expected"), LIMITED_MATRIX)
def test_limited_key_matrix(client, request_line, expected):
    secret = _make_limited_key(client)
    method, path = request_line
    response = client.request(method, path, headers=_bearer(secret))
    assert response.status_code == expected, response.text
    if expected == 403:
        assert response.json()["detail"]["code"] == "insufficient_scope"


def test_screen_power_put_needs_the_permission(client):
    secret = _make_key(client, "read")
    response = client.put(SCREEN_POWER, headers=_bearer(secret))
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "insufficient_scope"
    anonymous = client.put(SCREEN_POWER)
    assert anonymous.status_code == 401
    assert anonymous.json()["detail"]["code"] == "admin_required"
    admin = _make_key_named(client, "admin", "admin-key")
    assert client.put(SCREEN_POWER, headers=_bearer(admin)).status_code == 200
    _session(client)
    assert client.put(SCREEN_POWER).status_code == 200


def test_limited_key_never_admin_even_if_the_file_says_so(client):
    secret = _make_limited_key(client)
    store = get_api_key_store()
    import json

    data = json.loads(store.path.read_text())
    data["keys"][0]["scope"] = "host"  # hand-edited
    store.path.write_text(json.dumps(data))
    headers = _bearer(secret)
    assert client.post("/api/calendar/sources", headers=headers).status_code == 403
    assert client.get(ADMIN_READ_PATH, headers=headers).status_code == 403
    assert client.post(HOST_PATH, headers=headers).status_code == 403
    # is_admin() is false for it: the display-keys-only config write applies.
    assert client.post("/api/config", json={"gitBranch": "x"}, headers=headers).status_code in (
        401,
        403,
    )
    assert client.put(SCREEN_POWER, headers=headers).status_code == 200


def test_limited_key_cannot_manage_keys(client):
    secret = _make_limited_key(client)
    headers = _bearer(secret)
    assert client.get("/api/auth/keys", headers=headers).status_code == 403
    created = client.post(
        "/api/auth/keys",
        json={"name": "n", "scope": "read", "permissions": ["screens.power"]},
        headers=headers,
    )
    assert created.status_code == 403  # refused by the policy before the session check


def test_screen_power_cookie_cross_site_refused(client):
    _session(client)
    hostile = {"Origin": "https://evil.example", "Sec-Fetch-Site": "cross-site"}
    assert client.put(SCREEN_POWER, headers=hostile).status_code == 403


def test_screen_power_foreign_host_refused(client):
    secret = _make_limited_key(client)
    response = client.put(SCREEN_POWER, headers={**_bearer(secret), "Host": "evil.example.com"})
    assert response.status_code == 400


@pytest.mark.parametrize(
    "body",
    [
        {"name": "x", "scope": "admin", "permissions": ["screens.power"]},
        {"name": "x", "scope": "host", "permissions": ["screens.power"]},
        {"name": "x", "scope": "read", "permissions": []},
        {"name": "x", "scope": "read", "permissions": ["photos.upload"]},
    ],
)
def test_create_limited_key_validation(client, body):
    _session(client)
    assert client.post("/api/auth/keys", json=body).status_code == 422
    assert client.get("/api/auth/keys").json() == {"keys": []}


def test_limited_key_creation_is_logged_without_the_secret(client):
    sink: list[str] = []
    handler = logger.add(lambda message: sink.append(str(message)), level="DEBUG")
    try:
        secret = _make_limited_key(client)
    finally:
        logger.remove(handler)
    joined = "\n".join(sink)
    assert "Homey" in joined and "screens.power" in joined
    assert secret not in joined
