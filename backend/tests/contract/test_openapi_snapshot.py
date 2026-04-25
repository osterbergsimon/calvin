"""Snapshot test for the FastAPI OpenAPI schema.

Catches accidental, unreviewed changes to the public API surface — the contract
the frontend (and any external consumer) relies on. Any route rename, shape
change, or status-code change shows up as a diff in PR review.

To accept a deliberate change, regenerate the snapshot:

    UPDATE_OPENAPI_SNAPSHOT=1 uv run pytest tests/contract/test_openapi_snapshot.py

The frontend `npm run gen:api` reads the same snapshot to produce typed
client helpers, so the snapshot is the single source of truth shared by both
sides.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

SNAPSHOT_PATH = Path(__file__).parent / "openapi.json"
UPDATE_ENV_VAR = "UPDATE_OPENAPI_SNAPSHOT"


def _load_app_openapi() -> dict:
    """Import the production FastAPI app and return its OpenAPI schema dict.

    Importing `app.main` does not start the lifespan or open a DB connection —
    it only registers routers and middleware, which is what we want to snapshot.
    """
    from app.main import app

    return app.openapi()


@pytest.mark.unit
def test_openapi_snapshot_matches() -> None:
    current = _load_app_openapi()
    serialized = json.dumps(current, indent=2, sort_keys=True) + "\n"

    if os.environ.get(UPDATE_ENV_VAR) == "1":
        SNAPSHOT_PATH.write_text(serialized, encoding="utf-8")
        pytest.skip(f"Updated OpenAPI snapshot at {SNAPSHOT_PATH}")

    if not SNAPSHOT_PATH.exists():
        pytest.fail(
            f"OpenAPI snapshot missing at {SNAPSHOT_PATH}. "
            f"Generate it once with `{UPDATE_ENV_VAR}=1 pytest`."
        )

    expected = SNAPSHOT_PATH.read_text(encoding="utf-8")
    if serialized != expected:
        pytest.fail(
            "OpenAPI schema has drifted from the checked-in snapshot.\n"
            "If the change is intentional, regenerate with:\n"
            f"    {UPDATE_ENV_VAR}=1 uv run pytest tests/contract/test_openapi_snapshot.py\n"
            "and commit the updated tests/contract/openapi.json plus the\n"
            "regenerated frontend/src/api/types.ts (`npm run gen:api`)."
        )
