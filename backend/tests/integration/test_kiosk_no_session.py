"""The kiosk path must keep working with no admin session and no setup (CLV-9)."""

from pathlib import Path

import pytest

from app.security.admin_auth import get_admin_store
from app.services import kiosk_bundle

pytestmark = pytest.mark.no_admin_login

REPO_ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture(autouse=True)
def _kiosk_bundle_root(monkeypatch):
    monkeypatch.setattr(kiosk_bundle.settings, "kiosk_bundle_dir", REPO_ROOT)
    get_admin_store().reset()


def test_new_kiosk_config_registers_without_session(test_client):
    response = test_client.get("/api/kiosks/no-session-kiosk/config")
    assert response.status_code == 200
    assert isinstance(response.json(), dict)


def test_kiosk_manifest_is_public(test_client):
    response = test_client.get("/api/kiosks/agent/manifest")
    assert response.status_code == 200
    assert "version" in response.json()


def test_kiosk_installer_scripts_are_public(test_client):
    assert test_client.get("/api/kiosks/install.sh").status_code == 200
    assert test_client.get("/api/kiosks/installer/setup-kiosk.sh").status_code == 200


def test_kiosk_agent_files_are_public(test_client):
    response = test_client.get("/api/kiosks/agent/files/calvin_display_agent.py")
    assert response.status_code == 200


def test_kiosk_overrides_need_admin(test_client):
    response = test_client.put("/api/kiosks/no-session-kiosk/overrides", json={"overrides": {}})
    assert response.status_code == 401


def test_screen_now_override_needs_admin(test_client):
    """Turning a screen on/off now writes the admin-only overrides route."""
    response = test_client.put(
        "/api/kiosks/no-session-kiosk/overrides",
        json={"overrides": {"screenNow": {"power": "off", "setAt": "2026-11-01T20:00:00Z"}}},
    )
    assert response.status_code == 401
