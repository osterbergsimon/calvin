"""MCP endpoint authentication and the per-tool scope ladder (CLV-33)."""

import pytest

from app.mcp_server import tools
from app.mcp_server.tools import TOOL_SCOPES
from app.security.api_keys import SCOPE_RANK

from .conftest import client_for, fake_ctx

INIT = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
        "protocolVersion": "2025-03-26",
        "capabilities": {},
        "clientInfo": {"name": "t", "version": "0"},
    },
}
HEADERS = {"Accept": "application/json, text/event-stream"}


async def test_no_key_is_401(gateway):
    async with client_for(gateway) as client:
        response = await client.post("/api/mcp", json=INIT, headers=HEADERS)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "api_key_required"
    assert response.headers["www-authenticate"].startswith("Bearer")


async def test_cookie_is_not_accepted(gateway):
    async with client_for(gateway) as client:
        response = await client.post(
            "/api/mcp", json=INIT, headers=HEADERS, cookies={"calvin_admin": "x"}
        )
    assert response.status_code == 401


async def test_bad_key_is_401(gateway):
    async with client_for(gateway, "clv_" + "x" * 43) as client:
        response = await client.post("/api/mcp", json=INIT, headers=HEADERS)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_api_key"


async def test_revoked_key_is_401(gateway, key_store):
    record, secret = key_store.create("temp", "read")
    key_store.revoke(record["id"])
    async with client_for(gateway, secret) as client:
        response = await client.post("/api/mcp", json=INIT, headers=HEADERS)
    assert response.status_code == 401


async def test_valid_key_initializes(gateway, secrets):
    async with client_for(gateway, secrets["read"]) as client:
        response = await client.post("/api/mcp", json=INIT, headers=HEADERS)
    assert response.status_code == 200
    assert response.json()["result"]["serverInfo"]["name"] == "Calvin"


async def test_repeated_bad_keys_are_rate_limited(gateway):
    async with client_for(gateway, "clv_" + "y" * 43) as client:
        codes = [
            (await client.post("/api/mcp", json=INIT, headers=HEADERS)).status_code
            for _ in range(7)
        ]
    assert 429 in codes


EXPECTED = {
    "get_status": "read",
    "list_calendar_sources": "read",
    "list_events": "read",
    "list_photos": "read",
    "list_pages": "read",
    "list_kiosks": "read",
    "list_plugins": "read",
    "add_calendar_source": "admin",
    "remove_calendar_source": "admin",
    "upload_photo": "admin",
    "set_kiosk_override": "admin",
    "refresh_calendars": "admin",
    "display_power": "host",
}


def test_tool_scope_table_is_exactly_the_agreed_list():
    assert TOOL_SCOPES == EXPECTED


MINIMAL_ARGS = {
    "list_events": {},
    "add_calendar_source": {"name": "n", "ical_url": "https://x.test/a.ics"},
    "remove_calendar_source": {"source_id": "s"},
    "upload_photo": {"filename": "a.png", "data_base64": "AAAA"},
    "set_kiosk_override": {"kiosk_id": "k", "orientation": "portrait"},
    "display_power": {"state": "off"},
}


TOO_LOW = [
    (name, key_scope)
    for name, needed in sorted(EXPECTED.items())
    for key_scope in SCOPE_RANK
    if SCOPE_RANK[key_scope] < SCOPE_RANK[needed]
]


@pytest.mark.parametrize(("name", "key_scope"), TOO_LOW)
async def test_scope_matrix_rejects_above_scope_before_any_work(name, key_scope, monkeypatch):
    needed = EXPECTED[name]

    def boom(*args, **kwargs):  # any service call before the scope check is a bug
        raise AssertionError("tool did work before checking scope")

    monkeypatch.setattr("app.utils.host_control.host_control_enabled", boom)
    monkeypatch.setattr("app.services.kiosk_registry.set_overrides", boom)
    monkeypatch.setattr("app.services.display_power_service.display_power_service", boom)
    func = getattr(tools, name)
    with pytest.raises(tools.ToolError, match=f"{needed} scope"):
        await func(ctx=fake_ctx(key_scope), **MINIMAL_ARGS.get(name, {}))


@pytest.mark.parametrize("name", sorted(EXPECTED))
async def test_no_key_on_the_request_is_rejected(name):
    func = getattr(tools, name)
    with pytest.raises(tools.ToolError, match="API key"):
        await func(ctx=fake_ctx(None), **MINIMAL_ARGS.get(name, {}))
