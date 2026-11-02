"""Persistent plugin package target: ordering, version keying and stamps (calvin-26c)."""

import hashlib
import json
import sys
from pathlib import Path

from app.services import plugin_packages
from app.services.plugin_installer import PluginInstaller
from app.services.plugin_packages import (
    dependency_stamp,
    ensure_plugin_packages_dir,
    ensure_plugin_packages_on_path,
    plugin_dependency_lines,
    plugin_packages_dir,
    python_version_key,
    write_dependency_stamp,
)


def _write_manifest(plugins_dir: Path, name: str, manifest: dict) -> None:
    plugin_dir = plugins_dir / name
    plugin_dir.mkdir(parents=True)
    (plugin_dir / "plugin.json").write_text(json.dumps(manifest), encoding="utf-8")


class TestVersionKey:
    def test_key_is_major_minor(self):
        assert python_version_key((3, 13, 1, "final", 0)) == "3.13"

    def test_key_defaults_to_running_interpreter(self):
        assert python_version_key() == f"{sys.version_info[0]}.{sys.version_info[1]}"

    def test_target_is_keyed_by_version(self, tmp_path):
        assert (
            plugin_packages_dir(tmp_path, "3.12") == tmp_path / "python" / "3.12" / "site-packages"
        )
        assert plugin_packages_dir(tmp_path, "3.13") != plugin_packages_dir(tmp_path, "3.12")

    def test_stamp_lives_beside_site_packages(self, tmp_path):
        target = plugin_packages_dir(tmp_path, "3.12")
        assert plugin_packages.dependency_stamp_path(
            version_key="3.12", data_dir=tmp_path
        ).parent == (target.parent)
        assert not str(
            plugin_packages.dependency_stamp_path(version_key="3.12", data_dir=tmp_path)
        ).startswith(str(target))


class TestPathOrdering:
    def test_target_is_appended_after_installed_packages(self, tmp_path, monkeypatch):
        image_site = tmp_path / "image-venv" / "site-packages"
        image_site.mkdir(parents=True)
        target = ensure_plugin_packages_dir(tmp_path / "python" / "3.12" / "site-packages")
        monkeypatch.setattr(sys, "path", ["/app", str(image_site)])

        assert ensure_plugin_packages_on_path(target) == target

        # Image packages must still win: the target is last, not first.
        assert sys.path[-1] == str(target)
        assert sys.path.index(str(target)) > sys.path.index(str(image_site))

    def test_entry_is_not_duplicated(self, tmp_path, monkeypatch):
        target = ensure_plugin_packages_dir(tmp_path / "python" / "3.12" / "site-packages")
        monkeypatch.setattr(sys, "path", ["/app"])

        ensure_plugin_packages_on_path(target)
        ensure_plugin_packages_on_path(target)

        assert sys.path.count(str(target)) == 1
        assert sys.path[-1] == str(target)

    def test_prepended_entry_is_moved_to_the_end(self, tmp_path, monkeypatch):
        """A PYTHONPATH-style prepend must not let a plugin shadow core deps."""
        target = ensure_plugin_packages_dir(tmp_path / "python" / "3.12" / "site-packages")
        image_site = str(tmp_path / "image-site-packages")
        monkeypatch.setattr(sys, "path", [str(target), "/app", image_site])

        ensure_plugin_packages_on_path(target)

        assert sys.path[-1] == str(target)
        assert sys.path.index(str(target)) > sys.path.index(image_site)

    def test_missing_target_is_a_no_op(self, tmp_path, monkeypatch):
        monkeypatch.setattr(sys, "path", ["/app"])
        missing = tmp_path / "python" / "3.12" / "site-packages"

        assert ensure_plugin_packages_on_path(missing) is None
        assert sys.path == ["/app"]


class TestDependencyStamp:
    def test_lines_are_sorted_and_skip_plugins_without_deps(self, tmp_path):
        _write_manifest(tmp_path, "beta", {"dependencies": {"packages": ["z"]}})
        _write_manifest(tmp_path, "alpha", {"dependencies": {"packages": ["x==1", "y"]}})
        _write_manifest(tmp_path, "empty", {"dependencies": {"packages": []}})
        _write_manifest(tmp_path, "absent", {})

        assert plugin_dependency_lines(tmp_path) == ["alpha\tx==1\ty", "beta\tz"]

    def test_lines_skip_malformed_manifests(self, tmp_path):
        _write_manifest(tmp_path, "good", {"dependencies": {"packages": ["x"]}})
        (tmp_path / "broken").mkdir()
        (tmp_path / "broken" / "plugin.json").write_text("{not json", encoding="utf-8")

        assert plugin_dependency_lines(tmp_path) == ["good\tx"]

    def test_stamp_is_sha256_of_the_joined_lines(self, tmp_path):
        _write_manifest(tmp_path, "demo", {"dependencies": {"packages": ["six", "packaging"]}})

        expected = hashlib.sha256(b"demo\tsix\tpackaging").hexdigest()
        assert dependency_stamp(plugin_dependency_lines(tmp_path)) == expected

    def test_write_stamp_records_the_current_dependency_set(self, tmp_path, monkeypatch):
        monkeypatch.setattr(plugin_packages.settings, "data_dir", tmp_path)
        plugins = tmp_path / "plugins"
        _write_manifest(plugins, "demo", {"dependencies": {"packages": ["six"]}})
        ensure_plugin_packages_dir()

        digest = write_dependency_stamp(plugins)

        stamp = plugin_packages.dependency_stamp_path()
        assert digest == hashlib.sha256(b"demo\tsix").hexdigest()
        assert stamp.read_text(encoding="utf-8").strip() == digest

    def test_write_stamp_is_a_no_op_without_a_target(self, tmp_path, monkeypatch):
        monkeypatch.setattr(plugin_packages.settings, "data_dir", tmp_path)
        plugins = tmp_path / "plugins"
        _write_manifest(plugins, "demo", {"dependencies": {"packages": ["six"]}})

        assert write_dependency_stamp(plugins) is None
        assert not (tmp_path / "python").exists()


class TestInstallerTarget:
    def test_pip_install_targets_the_persistent_dir(self, tmp_path, monkeypatch):
        monkeypatch.setattr(plugin_packages.settings, "data_dir", tmp_path)
        monkeypatch.setattr(sys, "path", list(sys.path))
        monkeypatch.setattr(
            "app.services.plugin_installer.shutil.which",
            lambda name: "/usr/bin/uv" if name == "uv" else None,
        )
        calls: list[list[str]] = []

        class Result:
            returncode = 0
            stdout = ""
            stderr = ""

        def fake_run(cmd, **kwargs):
            calls.append(cmd)
            return Result()

        monkeypatch.setattr("app.services.plugin_installer.subprocess.run", fake_run)

        install = PluginInstaller()
        install._install_pip_requirements({"id": "demo", "dependencies": {"packages": ["six"]}})

        target = plugin_packages_dir(tmp_path)
        assert len(calls) == 1
        cmd = calls[0]
        assert cmd[:4] == ["/usr/bin/uv", "pip", "install", "--target"]
        assert str(target) in cmd
        # CLAUDE.md gotcha: --python comes after `install`, never before it.
        assert cmd.index("install") < cmd.index("--python")
        assert cmd[-1] == "six"
        # The target is importable in this process right away, after image packages.
        assert sys.path[-1] == str(target)

    def test_uninstall_targets_the_persistent_dir_when_it_exists(self, tmp_path, monkeypatch):
        monkeypatch.setattr(plugin_packages.settings, "data_dir", tmp_path)
        ensure_plugin_packages_dir()
        monkeypatch.setattr(
            "app.services.plugin_installer.shutil.which",
            lambda name: "/usr/bin/uv" if name == "uv" else None,
        )

        cmd = PluginInstaller._resolve_uninstall_pip(plugin_packages_dir(tmp_path))

        assert cmd[:4] == ["/usr/bin/uv", "pip", "uninstall", "--target"]
        assert str(plugin_packages_dir(tmp_path)) in cmd

    def test_uninstall_uses_the_venv_without_a_target(self, monkeypatch):
        monkeypatch.setattr(
            "app.services.plugin_installer.shutil.which",
            lambda name: "/usr/bin/uv" if name == "uv" else None,
        )

        cmd = PluginInstaller._resolve_uninstall_pip()

        assert "--target" not in cmd
        assert cmd[:3] == ["/usr/bin/uv", "pip", "uninstall"]


def test_isolated_check_imports_a_dependency_from_the_target(
    tmp_path, monkeypatch, temp_plugins_dir
):
    """End-to-end: a plugin's dependency on the data volume imports in the child."""
    from app.plugins.isolated_check import run_isolated_plugin_check

    monkeypatch.setattr(plugin_packages.settings, "data_dir", tmp_path)
    target = ensure_plugin_packages_dir()
    (target / "persistent_demo_dep.py").write_text("VALUE = 'from target'\n", encoding="utf-8")

    plugin_dir = temp_plugins_dir / "demo"
    plugin_dir.mkdir()
    (plugin_dir / "plugin.json").write_text(
        json.dumps(
            {"id": "demo", "name": "Demo", "version": "1.0.0", "type": "service", "api_version": 1}
        ),
        encoding="utf-8",
    )
    (plugin_dir / "plugin.py").write_text(
        "import persistent_demo_dep\n"
        "from app.plugins.definitions import PluginMetadata\n"
        "from app.plugins.protocols import ServicePlugin\n\n\n"
        "class Demo(ServicePlugin):\n"
        "    metadata = PluginMetadata(type_id='demo', name='Demo')\n",
        encoding="utf-8",
    )

    assert run_isolated_plugin_check("demo") == []


def test_isolated_check_child_sees_the_target(tmp_path, monkeypatch):
    """The install check runs `python -I`, so the target must travel explicitly."""
    from app.plugins import isolated_check

    monkeypatch.setattr(plugin_packages.settings, "data_dir", tmp_path)

    cmd = isolated_check._child_command(tmp_path / "plugin")

    assert str(plugin_packages_dir(tmp_path)) in cmd
    assert "sys.path.append(plugin_packages)" in isolated_check.CHILD_BOOTSTRAP
