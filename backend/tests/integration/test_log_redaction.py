"""Secrets stay out of logs and error responses (audit S9, calvin-ua2)."""

import httpx
import pytest
from loguru import logger

from app.api.routes.plugins.config import mask_sensitive_config
from app.services.remote_image_cache import RemoteImageCache
from app.utils.redact import redact_url

SECRET = "hunter2-very-secret"


@pytest.fixture
def main_client(test_client):
    """The real app, with its global exception handlers (test_client's app has none)."""
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def log_lines():
    lines: list[str] = []
    sink_id = logger.add(lambda message: lines.append(str(message)), level="DEBUG")
    yield lines
    logger.remove(sink_id)


def test_validation_error_log_omits_request_body_and_input(main_client, log_lines):
    response = main_client.post(
        "/api/config", json={"gitBranch": f"$(echo {SECRET})", "password": SECRET}
    )

    assert response.status_code == 422
    logged = "".join(log_lines)
    assert "Validation error" in logged
    assert SECRET not in logged


def test_unhandled_exception_returns_generic_message(main_client, monkeypatch):
    from app.api.routes import config as config_routes

    async def boom():
        raise RuntimeError(f"db password is {SECRET}")

    monkeypatch.setattr(config_routes, "build_global_config", boom)

    response = main_client.get("/api/config")

    assert response.status_code == 500
    assert SECRET not in response.text
    assert response.json()["detail"] == "Internal server error"


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        (f"https://img.example.com/a.jpg?key={SECRET}", "https://img.example.com/a.jpg?…"),
        (f"https://user:{SECRET}@img.example.com/a.jpg", "https://img.example.com/a.jpg"),
        ("https://img.example.com/a.jpg", "https://img.example.com/a.jpg"),
    ],
)
def test_redact_url_strips_query_and_userinfo(url, expected):
    assert redact_url(url) == expected


async def test_remote_image_errors_do_not_log_url_secrets(tmp_path, log_lines, monkeypatch):
    cache = RemoteImageCache(cache_dir=tmp_path)

    async def failing_get(self, url, **kwargs):
        raise httpx.ConnectError(f"connection failed for {url}")

    monkeypatch.setattr(httpx.AsyncClient, "get", failing_get)

    assert await cache.get_or_fetch(f"https://img.example.com/a.jpg?key={SECRET}") is None
    assert log_lines
    assert SECRET not in "".join(log_lines)


def test_log_masking_shows_no_characters_of_the_secret():
    masked = mask_sensitive_config({"api_key": "abcdef", "url": "http://x"})

    assert masked == {"api_key": "***", "url": "http://x"}
