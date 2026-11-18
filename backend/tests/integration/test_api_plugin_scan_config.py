"""POST /api/plugins/{plugin_id}/scan: a scan that sees the form's config.

Homey switch tiles plan Task 2.5 (HIGH RISK, secret handling). The form's
config can hold a key, so the route is admin-only, uses the config for this
one call (secrets left blank are filled from storage, never for a changed
address), and answers only ``{options: [{value, label}], error?}`` strings:
never the config, never exception text, never in a log line.
"""

import time
from typing import Any

import pytest
from loguru import logger

from app.plugins.definitions import PluginMetadata
from app.plugins.loader import plugin_loader
from app.plugins.protocols import ServicePlugin
from app.security.admin_auth import SessionKind, get_admin_store, lock_kiosk_sessions

pytestmark = [pytest.mark.integration, pytest.mark.no_admin_login]

PASSWORD = "test-admin-password"
COOKIE = "calvin_admin"
STORED = "stored-key-0000-secret"
TYPED = "typed-key-1111-secret"
OTHER = "other-type-key-2222-secret"
URL = "/api/plugins/{id}/scan"

SCHEMA = {
    "host": {"type": "string", "label": "Address"},
    "api_key": {"type": "password", "label": "Key"},
    "devices": {"type": "string", "label": "Devices"},
}


class FakeScanPlugin(ServicePlugin):
    metadata = PluginMetadata(type_id="fake-scan", name="Fake Scan", instance_config_schema=SCHEMA)
    seen: list[tuple[str, dict[str, Any]]] = []
    result: Any = None
    raise_error: BaseException | None = None

    async def fetch(self, start_date=None, end_date=None):
        return {"items": []}

    @classmethod
    async def scan_options_with_config(cls, field_key: str, config: dict[str, Any]):
        cls.seen.append((field_key, dict(config)))
        if cls.raise_error is not None:
            raise cls.raise_error
        return cls.result


class OtherTypePlugin(ServicePlugin):
    metadata = PluginMetadata(
        type_id="fake-other", name="Fake Other", instance_config_schema=SCHEMA
    )

    async def fetch(self, start_date=None, end_date=None):
        return {"items": []}


class NoHookPlugin(ServicePlugin):
    metadata = PluginMetadata(type_id="fake-nohook", name="No Hook")

    async def fetch(self, start_date=None, end_date=None):
        return {"items": []}


@pytest.fixture(autouse=True)
def _types(monkeypatch):
    for cls in (FakeScanPlugin, OtherTypePlugin, NoHookPlugin):
        monkeypatch.setitem(plugin_loader._types, cls.metadata.type_id, cls)
    FakeScanPlugin.seen = []
    FakeScanPlugin.raise_error = None
    FakeScanPlugin.result = {
        "options": [
            {"value": "a", "label": "A", "config": {"api_key": STORED}},
            {"value": 7, "label": "Seven"},
            {"value": "b"},
            {"label": "no value"},
            "junk",
        ],
        "token": STORED,
    }
    from app.security import admin_auth

    admin_auth._kiosk_locks.clear()
    yield
    admin_auth._kiosk_locks.clear()


@pytest.fixture
async def stored_instance():
    """Stored instances of the scanned type and of another type, both with a key."""
    from app.models.db_models import PluginDB

    rows = [
        await PluginDB.objects.create(
            id="fake-scan-1",
            type_id="fake-scan",
            plugin_type="service",
            name="Fake",
            enabled=True,
            config={"host": "http://hub-a.invalid", "api_key": STORED},
        ),
        await PluginDB.objects.create(
            id="fake-other-1",
            type_id="fake-other",
            plugin_type="service",
            name="Other",
            enabled=True,
            config={"host": "http://hub-a.invalid", "api_key": OTHER},
        ),
    ]
    yield
    for row in rows:
        await row.delete()


def _login(client) -> None:
    response = client.post("/api/auth/login", json={"password": PASSWORD})
    assert response.status_code == 200, response.text


def _scan(client, body=None, plugin_id="fake-scan", **kwargs):
    if body is None:
        body = {"field": "devices", "config": {"host": "http://hub-a.invalid", "api_key": TYPED}}
    return client.post(URL.format(id=plugin_id), json=body, **kwargs)


def _code(response) -> str | None:
    detail = response.json().get("detail")
    return detail.get("code") if isinstance(detail, dict) else None


# --- who may call it -------------------------------------------------------


def test_anonymous_post_scan_is_401_admin_required(test_client):
    response = _scan(test_client)
    assert response.status_code == 401
    assert _code(response) == "admin_required"
    assert FakeScanPlugin.seen == []
    assert TYPED not in response.text


def test_read_scope_key_is_refused(test_client):
    _login(test_client)
    created = test_client.post("/api/auth/keys", json={"name": "reader", "scope": "read"})
    assert created.status_code == 201, created.text
    secret = created.json()["secret"]
    test_client.cookies.clear()

    response = _scan(test_client, headers={"Authorization": f"Bearer {secret}"})
    assert response.status_code == 403
    assert _code(response) == "insufficient_scope"
    assert FakeScanPlugin.seen == []


def test_kiosk_screen_without_login_is_refused(test_client):
    # A kiosk screen names itself in the query; that is not a credential.
    response = test_client.post(
        URL.format(id="fake-scan") + "?kiosk=hall-1",
        json={"field": "devices", "config": {"api_key": TYPED}},
    )
    assert response.status_code == 401
    assert FakeScanPlugin.seen == []


def test_idle_kiosk_session_is_refused(test_client):
    value = get_admin_store().issue_cookie(SessionKind.KIOSK, "hall-1", now=int(time.time()) - 900)
    test_client.cookies.set(COOKIE, value)
    response = _scan(test_client)
    assert response.status_code == 401
    assert FakeScanPlugin.seen == []


def test_locked_kiosk_session_is_refused(test_client):
    value = get_admin_store().issue_cookie(SessionKind.KIOSK, "hall-1", now=int(time.time()) - 5)
    lock_kiosk_sessions("hall-1")
    test_client.cookies.set(COOKIE, value)
    response = _scan(test_client)
    assert response.status_code == 401
    assert FakeScanPlugin.seen == []


def test_live_kiosk_admin_session_is_allowed(test_client):
    # An admin who signed in at the wall screen is an admin, like on every route.
    value = get_admin_store().issue_cookie(SessionKind.KIOSK, "hall-1")
    test_client.cookies.set(COOKIE, value)
    response = _scan(test_client)
    assert response.status_code == 200, response.text


def test_cross_site_post_is_refused(test_client):
    _login(test_client)
    response = _scan(
        test_client, headers={"Origin": "https://evil.example", "Sec-Fetch-Site": "cross-site"}
    )
    assert response.status_code == 403
    assert FakeScanPlugin.seen == []


def test_foreign_host_is_refused(test_client):
    _login(test_client)
    response = _scan(test_client, headers={"Host": "evil.example"})
    assert response.status_code == 400
    assert FakeScanPlugin.seen == []


# --- secrets ---------------------------------------------------------------


async def test_blank_secret_filled_from_stored_instance(test_client, stored_instance):
    _login(test_client)
    response = _scan(
        test_client,
        {
            "field": "devices",
            "config": {"host": "http://hub-a.invalid", "api_key": ""},
            "instance_id": "fake-scan-1",
        },
    )
    assert response.status_code == 200, response.text
    assert FakeScanPlugin.seen == [("devices", {"host": "http://hub-a.invalid", "api_key": STORED})]
    assert STORED not in response.text


async def test_changed_host_with_blank_secret_is_400_and_not_called(test_client, stored_instance):
    _login(test_client)
    response = _scan(
        test_client,
        {
            "field": "devices",
            "config": {"host": "http://somewhere-else.invalid", "api_key": ""},
            "instance_id": "fake-scan-1",
        },
    )
    assert response.status_code == 400
    assert FakeScanPlugin.seen == []
    assert STORED not in response.text


async def test_instance_of_another_type_lends_no_secret(test_client, stored_instance):
    _login(test_client)
    response = _scan(
        test_client,
        {
            "field": "devices",
            "config": {"host": "http://hub-a.invalid", "api_key": ""},
            "instance_id": "fake-other-1",
        },
    )
    assert response.status_code == 200, response.text
    assert FakeScanPlugin.seen == [("devices", {"host": "http://hub-a.invalid", "api_key": ""})]
    assert OTHER not in response.text


def test_new_instance_uses_typed_secret(test_client):
    _login(test_client)
    response = _scan(test_client)
    assert response.status_code == 200, response.text
    assert FakeScanPlugin.seen == [("devices", {"host": "http://hub-a.invalid", "api_key": TYPED})]
    assert TYPED not in response.text


def test_response_has_only_value_label_strings(test_client):
    _login(test_client)
    response = _scan(test_client)
    assert response.status_code == 200, response.text
    assert response.json() == {
        "options": [
            {"value": "a", "label": "A"},
            {"value": "7", "label": "Seven"},
            {"value": "b", "label": "b"},
        ]
    }


def test_plugin_error_text_is_passed_as_plain_string(test_client):
    FakeScanPlugin.result = {"options": [], "error": "Couldn't reach the hub."}
    _login(test_client)
    response = _scan(test_client)
    assert response.json() == {"options": [], "error": "Couldn't reach the hub."}


def test_plugin_exception_gives_generic_error(test_client):
    FakeScanPlugin.raise_error = RuntimeError(f"boom with {TYPED}")
    lines: list[str] = []
    sink = logger.add(lambda m: lines.append(str(m)), level="DEBUG")
    try:
        _login(test_client)
        response = _scan(test_client)
    finally:
        logger.remove(sink)
    assert response.status_code == 200
    body = response.json()
    assert body["options"] == []
    assert body["error"]
    assert "boom" not in response.text
    assert TYPED not in response.text
    assert not [line for line in lines if TYPED in line or "boom" in line]


def test_config_never_logged(test_client, monkeypatch):
    lines: list[str] = []
    sink = logger.add(lambda m: lines.append(str(m)), level="DEBUG")
    try:
        _login(test_client)
        _scan(test_client)
        # A refused call logs its HTTP error; it must not carry the body either.
        _scan(test_client, {"field": "devices", "config": {"api_key": TYPED}, "extra": TYPED})
    finally:
        logger.remove(sink)
    assert not [line for line in lines if TYPED in line]


def test_type_without_hook_returns_unsupported(test_client):
    _login(test_client)
    response = _scan(test_client, plugin_id="fake-nohook")
    assert response.status_code == 200
    body = response.json()
    assert body["options"] == []
    assert body["error"]


def test_unknown_type_is_404(test_client):
    _login(test_client)
    response = _scan(test_client, plugin_id="no-such-type")
    assert response.status_code == 404


@pytest.mark.parametrize(
    "body",
    [
        {"config": {"api_key": TYPED}},
        {"field": 5, "config": {"api_key": TYPED}},
        {"field": "x" * 65, "config": {"api_key": TYPED}},
        {"field": "devices", "config": [TYPED]},
        {"field": "devices", "config": {"api_key": TYPED}, "instance_id": 5},
        {"field": "devices", "config": {"api_key": TYPED}, "extra": TYPED},
    ],
)
def test_bad_body_is_422_without_values(test_client, body):
    _login(test_client)
    response = _scan(test_client, body)
    assert response.status_code == 422
    assert _code(response) == "invalid_scan_body"
    assert TYPED not in response.text
    assert FakeScanPlugin.seen == []


def test_storage_failure_is_generic_500_with_no_traceback(test_client, monkeypatch):
    # Filling secrets reads storage; if that fails, the error must not reach the
    # global handler, whose traceback prints local values (the config).
    from app.services.config_service import config_service

    async def broken(*_args, **_kwargs):
        raise RuntimeError("database is locked")

    _login(test_client)
    monkeypatch.setattr(config_service, "get_value", broken)
    lines: list[str] = []
    sink = logger.add(lambda m: lines.append(str(m)), level="DEBUG", diagnose=True)
    try:
        response = _scan(test_client)
    finally:
        logger.remove(sink)
    assert response.status_code == 500
    assert _code(response) == "scan_failed"
    assert TYPED not in response.text
    assert "locked" not in response.text
    assert not [line for line in lines if TYPED in line]
    assert FakeScanPlugin.seen == []
