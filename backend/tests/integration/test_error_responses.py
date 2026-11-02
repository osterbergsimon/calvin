"""Server faults return a generic coded body, never exception text (calvin-225, S9)."""

from __future__ import annotations

import json

import pytest
from loguru import logger

SECRET = "db-password-hunter2"


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


def test_calendar_sources_failure_is_coded_and_generic(main_client, monkeypatch, log_lines):
    from app.services import plugin_calendar_service

    async def boom():
        raise RuntimeError(f"sqlite failure, secret is {SECRET}")

    monkeypatch.setattr(plugin_calendar_service, "get_sources", boom)

    response = main_client.get("/api/calendar/sources")

    assert response.status_code == 500
    assert response.json()["detail"] == {
        "code": "calendar_sources_failed",
        "message": "Could not load calendar sources. Check the server logs for details.",
    }
    assert SECRET not in response.text
    logged = "".join(log_lines)
    assert "calendar_sources_failed" in logged
    assert SECRET in logged  # the traceback is in the server log, not dropped


def test_plugin_list_failure_is_coded_and_generic(main_client, monkeypatch, log_lines):
    from app.services.plugin_installer import plugin_installer

    def boom():
        raise OSError(f"cannot read plugins dir: {SECRET}")

    monkeypatch.setattr(plugin_installer, "get_installed_plugins", boom)

    response = main_client.get("/api/plugins/installed")

    assert response.status_code == 500
    detail = response.json()["detail"]
    assert detail["code"] == "plugin_list_failed"
    assert SECRET not in response.text
    assert SECRET in "".join(log_lines)


def test_internal_error_helper_logs_traceback_and_hides_it(log_lines):
    from app.utils.errors import internal_error

    error = RuntimeError(f"secret {SECRET}")
    try:
        raise error
    except RuntimeError as exc:
        response_error = internal_error(
            "thing_failed", "Could not do the thing. Check the server logs.", error=exc
        )

    assert response_error.status_code == 500
    assert response_error.detail == {
        "code": "thing_failed",
        "message": "Could not do the thing. Check the server logs.",
    }
    assert SECRET not in json.dumps(response_error.detail)
    assert SECRET in "".join(log_lines)
