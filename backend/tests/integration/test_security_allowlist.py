"""Integration tests for the security allowed-origins API."""

import pytest
from fastapi.testclient import TestClient


@pytest.mark.integration
class TestAllowedOriginsApi:
    def test_get_defaults_to_empty(self, test_client: TestClient):
        response = test_client.get("/api/security/allowed-origins")
        assert response.status_code == 200
        assert response.json() == {"origins": []}

    def test_put_valid_persists_and_normalizes(self, test_client: TestClient):
        response = test_client.put(
            "/api/security/allowed-origins",
            json={"origins": ["HTTPS://Grafana.Lab:3000", "grafana.lab", "grafana.lab"]},
        )
        assert response.status_code == 200
        assert response.json() == {"origins": ["https://grafana.lab:3000", "grafana.lab"]}

        persisted = test_client.get("/api/security/allowed-origins")
        assert persisted.json() == {"origins": ["https://grafana.lab:3000", "grafana.lab"]}

    def test_put_cidr_is_rejected_and_persists_nothing(self, test_client: TestClient):
        response = test_client.put(
            "/api/security/allowed-origins",
            json={"origins": ["grafana.lab", "10.0.0.0/24"]},
        )
        assert response.status_code == 422
        assert "10.0.0.0/24" in response.text

        after = test_client.get("/api/security/allowed-origins")
        assert after.json() == {"origins": []}
