"""Shared fixtures for the MCP server tests (CLV-33)."""

import json
from contextlib import asynccontextmanager
from types import SimpleNamespace

import httpx
import pytest

from app.config import settings
from app.mcp_server.gateway import McpGateway
from app.security.admin_auth import api_key_limiter
from app.security.api_keys import get_api_key_store


@pytest.fixture(autouse=True)
def key_store(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "admin_auth_path", tmp_path / "admin-auth.json")
    api_key_limiter._failures.clear()
    api_key_limiter._lockouts.clear()
    return get_api_key_store()


@pytest.fixture
def secrets(key_store):
    """One secret per scope."""
    return {scope: key_store.create(f"{scope}-key", scope)[1] for scope in ("read", "admin", "host")}


def fake_ctx(scope: str | None):
    """What a tool sees: a request whose state holds the authenticated key."""
    key = None if scope is None else {"id": "k", "name": "k", "scope": scope}
    state = SimpleNamespace(api_key=key)
    return SimpleNamespace(request_context=SimpleNamespace(request=SimpleNamespace(state=state)))


@pytest.fixture
def gateway():
    return McpGateway()


@asynccontextmanager
async def client_for(gateway, secret: str | None = None):
    """An HTTP client on the gateway, with its transport running (same task as the test)."""
    headers = {"Authorization": f"Bearer {secret}"} if secret else {}
    async with gateway.lifespan():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=gateway),
            base_url="http://testserver",
            headers=headers,
        ) as client:
            yield client


def payload(result) -> object:
    """Parse a tool's compact-JSON text result."""
    return json.loads(result.content[0].text)
