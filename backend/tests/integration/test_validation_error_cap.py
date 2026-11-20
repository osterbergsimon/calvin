"""The generic 422 answer is bounded (calvin-6tp4).

A request with thousands of bad keys used to get a 422 body and log line that
echoed every error's full ``loc``. The handler now returns at most
``MAX_VALIDATION_ERRORS`` errors, trims each string ``loc`` part and ``msg``,
and says how many errors were dropped. Route-specific 422s that build their own
``errors`` key are untouched.
"""

from __future__ import annotations

import pytest
from loguru import logger
from pydantic import BaseModel, ConfigDict

from app.main import (
    MAX_VALIDATION_ERRORS,
    MAX_VALIDATION_LOC_PART,
    MAX_VALIDATION_MSG,
    _bounded_validation_errors,
    validation_exception_handler,
)


class StrictBody(BaseModel):
    """Extra keys are refused, so each bad key becomes its own validation error."""

    model_config = ConfigDict(extra="forbid")

    step: str


@pytest.fixture
def strict_client():
    """A tiny app wired to the real handler, without the host's admin policy."""
    from fastapi import FastAPI
    from fastapi.exceptions import RequestValidationError
    from fastapi.testclient import TestClient

    api = FastAPI()
    api.add_exception_handler(RequestValidationError, validation_exception_handler)

    @api.post("/strict")
    async def strict(body: StrictBody):
        return {"ok": True}

    return TestClient(api, raise_server_exceptions=False)


@pytest.fixture
def log_lines():
    lines: list[str] = []
    sink_id = logger.add(lambda message: lines.append(str(message)), level="DEBUG")
    yield lines
    logger.remove(sink_id)


def test_many_validation_errors_are_capped_and_counted(strict_client, log_lines):
    body = {"step": "start"}
    body.update({f"badKey{i:04d}": i for i in range(50)})

    response = strict_client.post("/strict", json=body)

    assert response.status_code == 422
    payload = response.json()
    assert payload["body"] == "Validation error"
    assert isinstance(payload["detail"], list)
    assert len(payload["detail"]) == MAX_VALIDATION_ERRORS
    assert payload["truncated"] is True
    assert payload["errorCount"] == 50

    logged = "".join(log_lines)
    assert "Validation error" in logged
    # Only the bounded list reaches the log, not all fifty errors.
    assert logged.count("badKey") == MAX_VALIDATION_ERRORS
    assert "50" in logged


def test_a_long_loc_part_is_cut_to_the_limit(strict_client):
    long_key = "x" * 200
    response = strict_client.post("/strict", json={"step": "start", long_key: 1})

    assert response.status_code == 422
    errors = response.json()["detail"]
    assert errors
    for error in errors:
        assert all(
            not isinstance(part, str) or len(part) <= MAX_VALIDATION_LOC_PART
            for part in error["loc"]
        )
    assert any(long_key[:MAX_VALIDATION_LOC_PART] in error["loc"] for error in errors)


def test_a_small_validation_error_keeps_the_existing_shape(strict_client):
    response = strict_client.post("/strict", json={})

    assert response.status_code == 422
    payload = response.json()
    assert set(payload) == {"detail", "body"}
    assert payload["body"] == "Validation error"
    assert len(payload["detail"]) == 1
    assert set(payload["detail"][0]) == {"type", "loc", "msg"}
    assert payload["detail"][0]["loc"] == ["body", "step"]


def test_the_answer_and_log_do_not_leak_input_or_ctx(strict_client, log_lines):
    secret = "hunter2-very-secret"
    response = strict_client.post("/strict", json={"step": {"password": secret}})

    assert response.status_code == 422
    payload = response.json()
    assert secret not in response.text
    for error in payload["detail"]:
        assert set(error) == {"type", "loc", "msg"}
    assert secret not in "".join(log_lines)


def test_int_loc_parts_are_kept():
    errors = _bounded_validation_errors([{"type": "x", "loc": ("body", "items", 0), "msg": "y"}])

    assert errors[0]["loc"] == ["body", "items", 0]


def test_a_long_message_is_trimmed():
    """The msg cap covers messages longer than a pydantic field error."""
    long_msg = "m" * (MAX_VALIDATION_MSG + 50)

    (error,) = _bounded_validation_errors(
        [{"type": "value_error", "loc": ("body", "x"), "msg": long_msg}]
    )

    assert len(error["msg"]) == MAX_VALIDATION_MSG
