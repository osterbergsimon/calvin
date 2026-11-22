"""The production HTTPException handlers keep the exception's headers.

The 429s from the plugin action route and the API-key limiter set
``Retry-After``; a handler that rebuilds the response must not drop it.
"""

import pytest
from fastapi import HTTPException
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.requests import Request

from app.main import (
    fastapi_http_exception_handler,
    general_exception_handler,
    http_exception_handler,
)

pytestmark = pytest.mark.unit


def _request() -> Request:
    return Request({"type": "http", "method": "POST", "path": "/api/x", "headers": []})


@pytest.mark.parametrize(
    ("handler", "exc_cls"),
    [
        (fastapi_http_exception_handler, HTTPException),
        (http_exception_handler, StarletteHTTPException),
    ],
)
async def test_handler_keeps_exception_headers(handler, exc_cls):
    exc = exc_cls(status_code=429, detail={"code": "rate_limited"}, headers={"Retry-After": "1"})
    response = await handler(_request(), exc)
    assert response.status_code == 429
    assert response.headers["Retry-After"] == "1"


@pytest.mark.parametrize(
    ("handler", "exc_cls"),
    [
        (fastapi_http_exception_handler, HTTPException),
        (http_exception_handler, StarletteHTTPException),
    ],
)
async def test_handler_without_headers_still_works(handler, exc_cls):
    response = await handler(_request(), exc_cls(status_code=404, detail="nope"))
    assert response.status_code == 404
    assert "retry-after" not in response.headers


async def test_500_handler_carries_hardening_headers():
    # ServerErrorMiddleware answers outside every middleware, so the handler
    # itself must add them.
    response = await general_exception_handler(_request(), RuntimeError("boom"))
    assert response.status_code == 500
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "same-origin"
    assert "camera=()" in response.headers["permissions-policy"]
