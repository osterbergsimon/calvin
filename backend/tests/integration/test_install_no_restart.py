"""Install → appears: no server restart required (plugin contract 1.0).

The old contract admitted a "restart required" limitation after install.
With declarative discovery the install route imports the plugin module,
registers its class, and writes the PluginTypeDB row — so the type must be
visible in GET /api/plugins immediately, and gone immediately after
uninstall.
"""

import json
import zipfile

import pytest

from app.plugins.definitions import CURRENT_PLUGIN_API_VERSION
from app.services.plugin_installer import plugin_installer

pytestmark = pytest.mark.integration

# NOTE: ids starting with "test_" are filtered out of GET /api/plugins,
# so the fixture plugin must not use that prefix.
PLUGIN_ID = "fresh_install_plugin"

PLUGIN_PY = f'''"""Install-no-restart fixture plugin."""
from app.plugins.definitions import PluginMetadata
from app.plugins.protocols import ServicePlugin


class FreshInstallPlugin(ServicePlugin):
    metadata = PluginMetadata(
        type_id="{PLUGIN_ID}",
        name="Fresh Install Plugin",
        description="Proves install-without-restart",
        instance_config_schema={{
            "url": {{"type": "string", "default": "", "ui": {{"validation": {{"required": True}}}}}},
        }},
        display_schema={{"kind": "status", "item": {{"label": "OK", "value_path": "$.ok"}}}},
    )

    async def fetch(self, start_date=None, end_date=None):
        return {{"ok": True}}
'''


@pytest.fixture
def plugin_zip(tmp_path):
    plugin_dir = tmp_path / PLUGIN_ID
    plugin_dir.mkdir()
    (plugin_dir / "plugin.json").write_text(
        json.dumps(
            {
                "id": PLUGIN_ID,
                "name": "Fresh Install Plugin",
                "version": "1.0.0",
                "type": "service",
                "api_version": CURRENT_PLUGIN_API_VERSION,
            }
        )
    )
    (plugin_dir / "plugin.py").write_text(PLUGIN_PY)
    zip_path = tmp_path / f"{PLUGIN_ID}.zip"
    with zipfile.ZipFile(zip_path, "w") as zipf:
        for file_path in plugin_dir.rglob("*"):
            if file_path.is_file():
                zipf.write(file_path, file_path.relative_to(plugin_dir))
    return zip_path


@pytest.fixture(autouse=True)
def _cleanup():
    yield
    try:
        plugin_installer.uninstall_plugin(PLUGIN_ID)
    except Exception:
        pass
    from app.plugins.loader import plugin_loader

    plugin_loader.unload_installed_plugin(PLUGIN_ID)


def _visible_type_ids(test_client) -> set[str]:
    response = test_client.get("/api/plugins")
    assert response.status_code == 200
    return {p["id"] for p in response.json()["plugins"]}


def test_installed_plugin_appears_without_restart(test_client, plugin_zip):
    assert PLUGIN_ID not in _visible_type_ids(test_client)

    with open(plugin_zip, "rb") as zip_file:
        response = test_client.post(
            "/api/plugins/install",
            files={"file": (plugin_zip.name, zip_file, "application/zip")},
        )
    if response.status_code == 404:
        pytest.skip("Plugin installation route not available in test client")
    assert response.status_code == 200, response.text
    assert response.json()["success"] is True

    # The same running app now serves the type — no restart happened.
    assert PLUGIN_ID in _visible_type_ids(test_client)

    # And the full metadata surface is live (schema-driven form + display).
    detail = test_client.get(f"/api/plugins/{PLUGIN_ID}")
    assert detail.status_code == 200
    body = detail.json()
    assert body["display_schema"]["kind"] == "status"


def test_uninstalled_plugin_disappears_without_restart(test_client, plugin_zip):
    with open(plugin_zip, "rb") as zip_file:
        response = test_client.post(
            "/api/plugins/install",
            files={"file": (plugin_zip.name, zip_file, "application/zip")},
        )
    if response.status_code == 404:
        pytest.skip("Plugin installation route not available in test client")
    assert response.status_code == 200
    assert PLUGIN_ID in _visible_type_ids(test_client)

    response = test_client.delete(f"/api/plugins/installed/{PLUGIN_ID}")
    assert response.status_code == 200, response.text

    assert PLUGIN_ID not in _visible_type_ids(test_client)
