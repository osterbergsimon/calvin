"""Plugin/theme id validation and directory containment (audit S1, calvin-ua2).

An unvalidated id used to be joined straight onto the plugins/themes dir, so
``..`` (or ``%2E%2E`` over HTTP) resolved to the data dir and uninstall would
``rmtree`` it. These tests pin the id pattern and the "never delete a dir
Calvin didn't install" rule.
"""

import json

import pytest

from app.plugins.definitions import CURRENT_PLUGIN_API_VERSION
from app.services.plugin_installer import PluginInstaller
from app.services.theme_installer import ThemeInstaller
from app.services.validation import validate_plugin_id

BAD_IDS = [
    "..",
    ".",
    "",
    "../x",
    "a/b",
    "a\\b",
    "/etc",
    "-leading-dash",
    "_leading_underscore",
    "UpperCase",
    "has space",
    "a" * 65,
    "x\n",
    "x\x00",
]


@pytest.mark.parametrize("bad_id", BAD_IDS)
def test_validate_plugin_id_rejects_unsafe_ids(bad_id):
    with pytest.raises(ValueError):
        validate_plugin_id(bad_id)


@pytest.mark.parametrize("good_id", ["mealie", "yr_weather", "image-processor", "a", "a" * 64])
def test_validate_plugin_id_accepts_real_ids(good_id):
    assert validate_plugin_id(good_id) == good_id


@pytest.fixture
def installer(tmp_path):
    plugins_dir = tmp_path / "data" / "plugins"
    plugins_dir.mkdir(parents=True)
    inst = PluginInstaller()
    inst.plugins_dir = plugins_dir
    return inst


@pytest.fixture
def themes(tmp_path):
    themes_dir = tmp_path / "data" / "themes"
    themes_dir.mkdir(parents=True)
    inst = ThemeInstaller()
    inst.themes_dir = themes_dir
    return inst


@pytest.mark.parametrize("bad_id", ["..", "../x", "a/b", "/etc"])
def test_get_plugin_path_rejects_traversal(installer, bad_id):
    with pytest.raises(ValueError):
        installer.get_plugin_path(bad_id)


@pytest.mark.parametrize("bad_id", ["..", "../x", "a/b", "/etc"])
def test_get_theme_path_rejects_traversal(themes, bad_id):
    with pytest.raises(ValueError):
        themes.get_theme_path(bad_id)


def test_uninstall_dotdot_does_not_delete_data_dir(installer, tmp_path):
    sentinel = tmp_path / "data" / "calvin.db"
    sentinel.write_text("db")

    with pytest.raises(ValueError):
        installer.uninstall_plugin("..")

    assert sentinel.exists()


def test_uninstall_refuses_dir_without_manifest(installer):
    """A dir Calvin didn't install (no plugin.json) is never rmtree'd."""
    foreign = installer.plugins_dir / "foreign"
    foreign.mkdir()
    (foreign / "keep.txt").write_text("keep")

    with pytest.raises(ValueError):
        installer.uninstall_plugin("foreign")

    assert (foreign / "keep.txt").exists()


def test_uninstall_theme_refuses_dir_without_manifest(themes):
    foreign = themes.themes_dir / "foreign"
    foreign.mkdir()
    (foreign / "keep.txt").write_text("keep")

    with pytest.raises(ValueError):
        themes.uninstall_theme("foreign")

    assert (foreign / "keep.txt").exists()


def test_uninstall_theme_dotdot_does_not_delete_data_dir(themes, tmp_path):
    sentinel = tmp_path / "data" / "calvin.db"
    sentinel.write_text("db")

    with pytest.raises(ValueError):
        themes.uninstall_theme("..")

    assert sentinel.exists()


def _write_plugin(dir_, plugin_id):
    dir_.mkdir(parents=True)
    (dir_ / "plugin.json").write_text(
        json.dumps(
            {
                "id": plugin_id,
                "name": "X",
                "version": "1.0.0",
                "type": "service",
                "api_version": CURRENT_PLUGIN_API_VERSION,
            }
        )
    )
    (dir_ / "plugin.py").write_text("# plugin")
    return dir_


def test_install_rejects_manifest_id_traversal(installer, tmp_path):
    src = _write_plugin(tmp_path / "src", "../escaped")

    with pytest.raises(ValueError):
        installer.install_plugin(src)

    assert not (installer.plugins_dir.parent / "escaped").exists()


def test_install_rejects_override_id_traversal(installer, tmp_path):
    src = _write_plugin(tmp_path / "src", "okay")

    with pytest.raises(ValueError):
        installer.install_plugin(src, plugin_id="../escaped")

    assert not (installer.plugins_dir.parent / "escaped").exists()


def test_install_from_repo_does_not_rmtree_dir_without_manifest(installer, tmp_path):
    repo = tmp_path / "repo"
    _write_plugin(repo / "okay", "okay")
    leftover = installer.plugins_dir / "okay"
    leftover.mkdir()
    (leftover / "keep.txt").write_text("keep")

    with pytest.raises(ValueError):
        installer.install_plugin_from_repo(repo, "okay")

    assert (leftover / "keep.txt").exists()


def test_install_theme_rejects_manifest_id_traversal(themes, tmp_path):
    src = tmp_path / "src"
    src.mkdir()
    (src / "theme.json").write_text(
        json.dumps({"id": "../escaped", "name": "X", "version": "1.0.0", "variables": {}})
    )

    with pytest.raises(ValueError):
        themes.install_theme(src)

    assert not (themes.themes_dir.parent / "escaped").exists()


def test_force_install_theme_does_not_rmtree_dir_without_manifest(themes, tmp_path):
    src = tmp_path / "src"
    src.mkdir()
    (src / "theme.json").write_text(
        json.dumps({"id": "okay", "name": "X", "version": "1.0.0", "variables": {}})
    )
    leftover = themes.themes_dir / "okay"
    leftover.mkdir()
    (leftover / "keep.txt").write_text("keep")

    with pytest.raises(ValueError):
        themes.install_theme(src, force=True)

    assert (leftover / "keep.txt").exists()


def test_loader_skips_installed_manifest_with_unsafe_id(make_good_and_bad, monkeypatch):
    """One bad manifest id must not abort loading every other installed plugin."""
    from app.plugins import loader as loader_module

    installer, good_id = make_good_and_bad
    monkeypatch.setattr(loader_module, "plugin_installer", installer)
    plugin_loader = loader_module.PluginLoader()

    plugin_loader.load_installed_plugins()

    assert f"installed_plugin_{good_id}" in plugin_loader._loaded_modules


@pytest.fixture
def make_good_and_bad(installer):
    import sys

    bad = installer.plugins_dir / "bad"
    _write_plugin(bad, "../bad")
    good_id = "test_id_safety_good"
    good = installer.plugins_dir / good_id
    _write_plugin(good, good_id)
    (good / "plugin.py").write_text(
        "from app.plugins.definitions import PluginMetadata\n"
        "from app.plugins.protocols import ServicePlugin\n\n\n"
        "class GoodPlugin(ServicePlugin):\n"
        f"    metadata = PluginMetadata(type_id='{good_id}', name='Good')\n\n"
        "    async def fetch(self, start_date=None, end_date=None):\n"
        "        return {}\n"
    )
    yield installer, good_id
    sys.modules.pop(f"installed_plugin_{good_id}", None)
