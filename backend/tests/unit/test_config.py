"""Settings env-binding tests."""

from pathlib import Path

from app.config import Settings


def test_plugins_dir_honors_plugin_dir_env(monkeypatch, tmp_path):
    # Deploy configs (docker compose, calvin.env) set PLUGIN_DIR. The setting
    # must honor it so container plugin installs don't fall back to
    # ./data/plugins inside the bind-mounted repo — root-owned files there break
    # a host-run backend with Errno 13 on reinstall. (calvin-0ds)
    target = tmp_path / "vol-plugins"
    monkeypatch.delenv("PLUGINS_DIR", raising=False)
    monkeypatch.setenv("PLUGIN_DIR", str(target))
    assert Settings(_env_file=None).plugins_dir == target


def test_plugins_dir_honors_plugins_dir_env(monkeypatch, tmp_path):
    # The convention-following PLUGINS_DIR (field name uppercased) also works.
    target = tmp_path / "alt-plugins"
    monkeypatch.delenv("PLUGIN_DIR", raising=False)
    monkeypatch.setenv("PLUGINS_DIR", str(target))
    assert Settings(_env_file=None).plugins_dir == target


def test_plugins_dir_defaults_when_unset(monkeypatch):
    monkeypatch.delenv("PLUGIN_DIR", raising=False)
    monkeypatch.delenv("PLUGINS_DIR", raising=False)
    assert Settings(_env_file=None).plugins_dir == Path("data/plugins")
