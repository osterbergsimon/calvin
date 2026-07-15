"""Integration tests for the sealed-mode plugin-enable guard."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient


def _fake_types():
    # PluginMetadata-shaped: has type_id + browser_origins; is NOT a theme.
    # Attributes beyond type_id/browser_origins/plugin_type are included so that
    # _update_plugin_type can proceed past the guard without raising AttributeError
    # in non-403 tests (the guard itself is the focus; downstream errors are fine
    # as long as they are not 403 and do not mention sealed mode).
    common = dict(
        common_config_schema={},
        instance_config_schema={},
        name="Fake",
        description="",
        version="0.1.0",
        ui_actions=[],
        ui_sections=[],
        supports_multiple_instances=False,
        instance_label=None,
        display_schema=None,
        statusbar_schema=None,
    )
    return [
        SimpleNamespace(
            type_id="castish", browser_origins=["cast.example.com"], plugin_type="service", **common
        ),
        SimpleNamespace(type_id="plain", browser_origins=[], plugin_type="service", **common),
    ]


@pytest.mark.integration
class TestSealedModeEnableGuard:
    def test_enabling_browser_origins_plugin_while_sealed_is_403(self, test_client: TestClient):
        with (
            patch(
                "app.api.routes.plugins.management.plugin_loader.get_plugin_types",
                return_value=_fake_types(),
            ),
            patch(
                "app.api.routes.plugins.management.get_sealed_mode",
                new=AsyncMock(return_value=True),
            ),
        ):
            resp = test_client.put("/api/plugins/castish", json={"enabled": True})
        assert resp.status_code == 403
        assert "sealed mode" in resp.json()["detail"].lower()

    def test_enabling_plugin_without_browser_origins_while_sealed_is_allowed(
        self, test_client: TestClient
    ):
        with (
            patch(
                "app.api.routes.plugins.management.plugin_loader.get_plugin_types",
                return_value=_fake_types(),
            ),
            patch(
                "app.api.routes.plugins.management.get_sealed_mode",
                new=AsyncMock(return_value=True),
            ),
        ):
            resp = test_client.put("/api/plugins/plain", json={"enabled": True})
        assert resp.status_code != 403

    def test_enabling_browser_origins_plugin_while_unsealed_is_allowed(
        self, test_client: TestClient
    ):
        with (
            patch(
                "app.api.routes.plugins.management.plugin_loader.get_plugin_types",
                return_value=_fake_types(),
            ),
            patch(
                "app.api.routes.plugins.management.get_sealed_mode",
                new=AsyncMock(return_value=False),
            ),
        ):
            resp = test_client.put("/api/plugins/castish", json={"enabled": True})
        assert resp.status_code != 403
