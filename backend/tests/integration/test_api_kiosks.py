"""Integration tests for the kiosk registry."""

import pytest
from fastapi.testclient import TestClient


@pytest.mark.integration
def test_kiosks_table_exists_and_lists_empty(test_client: TestClient):
    """The kiosks registry starts empty and is queryable (table created by migration)."""
    response = test_client.get("/api/kiosks")
    assert response.status_code == 200
    assert response.json() == {"kiosks": []}
