"""Uploaded plugins are validated in a child interpreter before the server loads them.

Task 8 of the admin auth plan (CLV-9): the server never imports a plugin that
writes a marker, calls ``sys.exit()`` or hangs at import time — the child does,
and the server only loads plugins after the child reports a clean result.
"""

import json
import os
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

from app.api.routes.plugins import management
from app.plugins import isolated_check
from app.plugins.definitions import CURRENT_PLUGIN_API_VERSION
from app.services import plugin_packages
from app.services.plugin_installer import plugin_installer


def _write_plugin_zip(
    tmp_path: Path, plugin_id: str, plugin_py: str, *, name: str | None = None
) -> Path:
    """Build a valid plugin package zip with the given ``plugin.py`` source."""
    plugin_dir = tmp_path / f"{plugin_id}_src"
    plugin_dir.mkdir()
    (plugin_dir / "plugin.json").write_text(
        json.dumps(
            {
                "id": plugin_id,
                "name": name or plugin_id,
                "version": "1.0.0",
                "type": "service",
                "api_version": CURRENT_PLUGIN_API_VERSION,
            }
        )
    )
    (plugin_dir / "plugin.py").write_text(plugin_py)

    zip_path = tmp_path / f"{plugin_id}.zip"
    with zipfile.ZipFile(zip_path, "w") as zipf:
        for file_path in plugin_dir.rglob("*"):
            if file_path.is_file():
                zipf.write(file_path, file_path.relative_to(plugin_dir))
    return zip_path


def _install(test_client, zip_path: Path):
    with open(zip_path, "rb") as zip_file:
        return test_client.post(
            "/api/plugins/install",
            files={"file": (zip_path.name, zip_file, "application/zip")},
        )


@pytest.fixture
def installed_ids():
    """Plugin ids to remove (and unload) after a test, whether it passed or not."""
    ids: list[str] = []
    yield ids
    for plugin_id in ids:
        try:
            plugin_installer.uninstall_plugin(plugin_id)
        except Exception:
            pass
        sys.modules.pop(f"installed_plugin_{plugin_id}", None)


def test_child_command_puts_backend_dir_on_sys_path(tmp_path):
    """The child must not depend on cwd or on how the backend was installed.

    ``-I`` drops the cwd and PYTHONPATH from ``sys.path``, so ``-m`` cannot find
    ``app`` in the runtime image (editable install whose .pth points at a build
    directory that no longer exists). The backend dir must be passed explicitly.
    """
    cmd = isolated_check._child_command(tmp_path)

    assert cmd[0] == sys.executable
    assert cmd[1] == "-I"
    assert "-m" not in cmd
    assert "sys.path.insert(0, sys.argv[1])" in cmd[3]
    assert Path(cmd[4]) == isolated_check.BACKEND_DIR
    # Plugin pip dependencies live on the data volume (calvin-26c) and travel
    # as their own argument; the bootstrap appends them after installed packages.
    assert Path(cmd[5]) == plugin_packages.plugin_packages_dir()
    assert "sys.path.append(plugin_packages)" in cmd[3]
    assert Path(cmd[6]) == tmp_path


def test_child_check_runs_without_cwd_or_installed_package(tmp_path):
    """The real child command works in an image-like environment.

    Reproduces what the runtime image does: the venv's editable install points at
    a build directory that does not exist, so ``app`` is importable only through
    the backend dir the child inserts. Every ``sys.path`` entry that provides an
    ``app`` package is dropped here, and the child runs from a foreign cwd.
    """
    plugin_id = "iso_container_plugin"
    plugin_dir = tmp_path / "plugins" / plugin_id
    plugin_dir.mkdir(parents=True)
    (plugin_dir / "plugin.json").write_text(
        json.dumps(
            {
                "id": plugin_id,
                "name": "Container Plugin",
                "version": "1.0.0",
                "type": "service",
                "api_version": CURRENT_PLUGIN_API_VERSION,
            }
        )
    )
    (plugin_dir / "plugin.py").write_text(
        f"""
from app.plugins.definitions import PluginMetadata
from app.plugins.protocols import ServicePlugin


class ContainerPlugin(ServicePlugin):
    metadata = PluginMetadata(type_id={plugin_id!r}, name="Container Plugin")
"""
    )

    cmd = isolated_check._child_command(plugin_dir)
    scrub = (
        "import os, sys; "
        "sys.path[:] = [p for p in sys.path "
        "if not (p and os.path.isdir(os.path.join(p, 'app')))]; "
    )
    hostile_cmd = [*cmd[:3], scrub + cmd[3], *cmd[4:]]

    completed = subprocess.run(
        hostile_cmd,
        cwd=tmp_path,
        env=isolated_check._child_env(),
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )

    assert completed.returncode == 0, completed.stderr
    payload = json.loads(completed.stdout.strip().splitlines()[-1])
    assert payload == {"errors": [], "type_ids": [plugin_id]}


def test_bad_plugin_never_imported_in_server(test_client, tmp_path, installed_ids):
    """A plugin whose import fails validation runs only in the child."""
    plugin_id = "iso_bad_metadata"
    installed_ids.append(plugin_id)
    marker = tmp_path / "imported.marker"
    plugin_py = f"""
import os
from pathlib import Path

Path({json.dumps(str(marker))}).write_text(str(os.getpid()))

from app.plugins.definitions import PluginMetadata
from app.plugins.protocols import ServicePlugin


class BadMetadata(ServicePlugin):
    metadata = PluginMetadata(
        type_id={plugin_id!r},
        name="Bad Metadata",
        display_schema={{"kind": "no-such-renderer"}},
    )
"""

    response = _install(test_client, _write_plugin_zip(tmp_path, plugin_id, plugin_py))

    assert response.status_code == 400, response.text
    assert "display_schema.kind" in response.json()["detail"]

    # The marker proves the child imported it — and the pid proves the server
    # was not the process that did.
    assert marker.is_file()
    assert marker.read_text() != str(os.getpid())

    assert f"installed_plugin_{plugin_id}" not in sys.modules
    assert not plugin_installer.get_plugin_path(plugin_id).exists()


def test_plugin_calling_sys_exit(test_client, tmp_path, installed_ids):
    """A plugin that calls sys.exit() at import is reported, not loaded."""
    plugin_id = "iso_sys_exit"
    installed_ids.append(plugin_id)
    plugin_py = """
import sys

sys.exit(3)
"""

    response = _install(test_client, _write_plugin_zip(tmp_path, plugin_id, plugin_py))

    assert response.status_code == 400, response.text
    assert "SystemExit" in response.json()["detail"]
    assert not plugin_installer.get_plugin_path(plugin_id).exists()

    # The server survived the plugin's exit call.
    assert test_client.get("/api/health").status_code == 200


def test_hanging_plugin_times_out(test_client, tmp_path, installed_ids, monkeypatch):
    """A plugin that hangs at import hits the child's timeout, not the server's."""
    plugin_id = "iso_hanging"
    installed_ids.append(plugin_id)

    # The install route uses the 60 s default; two seconds keeps the test quick.
    monkeypatch.setattr(
        management,
        "run_isolated_plugin_check",
        lambda plugin_id: isolated_check.run_isolated_plugin_check(plugin_id, timeout=2),
    )
    plugin_py = """
import time

time.sleep(10)
"""

    response = _install(test_client, _write_plugin_zip(tmp_path, plugin_id, plugin_py))

    assert response.status_code == 400, response.text
    assert "timed out" in response.json()["detail"]
    assert not plugin_installer.get_plugin_path(plugin_id).exists()


def test_good_plugin_still_installs(test_client, tmp_path, installed_ids):
    """A clean plugin installs, loads in-process and appears in the plugin list."""
    plugin_id = "iso_good_plugin"
    installed_ids.append(plugin_id)
    plugin_py = f'''
"""A clean plugin."""
from app.plugins.definitions import PluginMetadata
from app.plugins.protocols import ServicePlugin


class GoodPlugin(ServicePlugin):
    metadata = PluginMetadata(type_id={plugin_id!r}, name="Good Plugin")

    async def fetch(self, start_date=None, end_date=None):
        return {{"ok": True}}
'''

    response = _install(test_client, _write_plugin_zip(tmp_path, plugin_id, plugin_py))

    assert response.status_code == 200, response.text
    assert response.json()["manifest"]["id"] == plugin_id

    # The server still loads a validated plugin in-process.
    assert f"installed_plugin_{plugin_id}" in sys.modules

    listed = test_client.get("/api/plugins")
    assert listed.status_code == 200
    assert plugin_id in [plugin["id"] for plugin in listed.json()["plugins"]]
