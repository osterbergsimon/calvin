"""ASGI front door for ``/api/mcp``: bearer-key auth, then the SDK's streamable HTTP transport.

The FastAPI route policy only covers FastAPI routes, so this endpoint authenticates
itself, with the same key store, rate limiter and error codes as the HTTP API. A key
is required for every request (no anonymous MCP, no cookie). The authenticated key is
placed on ``scope["state"]`` so each tool can check its own scope.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import HTTPException
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import Receive, Scope, Send

from app.mcp_server.tools import register_tools
from app.security.route_policy import _authenticate_bearer, bearer_secret

_INSTRUCTIONS = (
    "Calvin is a self-hosted dashboard (calendars, photos, web services) shown on kiosks. "
    "Tools are grouped by the API key scope they need: read, admin, host. "
    "A dashboard screen is called a page."
)


def build_server() -> FastMCP:
    """A fresh FastMCP with every Calvin tool registered."""
    server = FastMCP(
        "Calvin",
        instructions=_INSTRUCTIONS,
        stateless_http=True,
        json_response=True,
        # Calvin's HostOriginMiddleware already guards Host/Origin for the whole app.
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    )
    register_tools(server)
    return server


def _error(status: int, code: str, message: str, headers: dict[str, str] | None = None):
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message}},
        headers=headers,
    )


class McpGateway:
    """Authenticating ASGI app; ``lifespan()`` must be running to serve tool calls."""

    def __init__(self) -> None:
        self._server: FastMCP | None = None

    @asynccontextmanager
    async def lifespan(self) -> AsyncIterator[None]:
        """Start the transport's task group (a new server per start, so restarts are clean)."""
        server = build_server()
        server.streamable_http_app()  # creates the session manager
        async with server.session_manager.run():
            self._server = server
            try:
                yield
            finally:
                self._server = None

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return
        response = await self._handle(scope, receive, send)
        if response is not None:
            await response(scope, receive, send)

    async def _handle(self, scope: Scope, receive: Receive, send: Send) -> Any:
        request = Request(scope)
        if bearer_secret(request) is None:
            return _error(
                401,
                "api_key_required",
                "The MCP endpoint needs an API key: Authorization: Bearer clv_...",
                {"WWW-Authenticate": "Bearer"},
            )
        try:
            key = _authenticate_bearer(request)
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, dict) else {}
            headers = {"WWW-Authenticate": "Bearer", **(exc.headers or {})}
            return _error(
                exc.status_code,
                detail.get("code", "unauthorized"),
                detail.get("message", "Unauthorized"),
                headers,
            )
        server = self._server
        if server is None:
            return _error(503, "mcp_unavailable", "The MCP server is not running.")
        scope.setdefault("state", {})["api_key"] = key
        await server.session_manager.handle_request(scope, receive, send)
        return None


mcp_gateway = McpGateway()
