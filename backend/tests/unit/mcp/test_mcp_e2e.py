"""One real MCP client session over the ASGI gateway (CLV-33)."""

import json

import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

from .conftest import client_for

EXPECTED_TOOLS = {
    "get_status",
    "list_calendar_sources",
    "list_events",
    "list_photos",
    "list_pages",
    "list_kiosks",
    "list_plugins",
    "add_calendar_source",
    "remove_calendar_source",
    "upload_photo",
    "set_kiosk_override",
    "refresh_calendars",
    "display_power",
}


async def test_client_lists_tools_and_calls_a_read_tool(gateway, secrets, monkeypatch):
    async def fake_pages():
        return {
            "activeScreenId": "screen-home",
            "screens": [
                {
                    "id": "screen-home",
                    "name": "Home",
                    "layout": {"regions": [{"kind": "calendar", "serviceId": None}]},
                }
            ],
        }

    monkeypatch.setattr("app.mcp_server.tools._dashboard_screens", fake_pages)

    async with client_for(gateway, secrets["read"]) as http:
        async with streamable_http_client("http://testserver/api/mcp", http_client=http) as (
            read,
            write,
            _,
        ):
            async with ClientSession(read, write) as session:
                await session.initialize()
                listed = await session.list_tools()
                assert {t.name for t in listed.tools} == EXPECTED_TOOLS

                result = await session.call_tool("list_pages", {})
                assert not result.isError
                data = json.loads(result.content[0].text)
                assert data["activePageId"] == "screen-home"
                assert data["pages"][0]["name"] == "Home"

                # Above the key's scope: a clear tool error, not a transport failure.
                denied = await session.call_tool("display_power", {"state": "off"})
                assert denied.isError
                assert "host scope" in denied.content[0].text


async def test_main_app_mounts_the_endpoint_and_requires_a_key():
    from app.main import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as http:
        for path in ("/api/mcp", "/api/mcp/"):
            response = await http.post(
                path,
                json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
                headers={"Accept": "application/json, text/event-stream"},
            )
            assert response.status_code == 401, path
