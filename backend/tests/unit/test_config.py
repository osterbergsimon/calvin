"""Settings env-binding tests."""

import pytest

from app.config import BACKEND_DIR, Settings

# Every env var that can move a writable path. Cleared so the developer's
# shell or a CI env can't leak into these tests.
PATH_ENV_VARS = (
    "CALVIN_DATA_DIR",
    "DATA_DIR",
    "DATABASE_URL",
    "LOG_DIR",
    "IMAGE_DIR",
    "IMAGE_CACHE_DIR",
    "PLUGIN_DIR",
    "PLUGINS_DIR",
    "THEMES_DIR",
    "KIOSK_SIGNING_KEY_PATH",
    "BACKUP_DIR",
    "CALVIN_HOST_CONTROL",
    "CALVIN_DEPLOYMENT",
)


@pytest.fixture(autouse=True)
def _clean_path_env(monkeypatch):
    for name in PATH_ENV_VARS:
        monkeypatch.delenv(name, raising=False)


def test_plugins_dir_honors_plugin_dir_env(monkeypatch, tmp_path):
    # Deploy configs (docker compose, calvin.env) set PLUGIN_DIR. The setting
    # must honor it so container plugin installs don't fall back to
    # ./data/plugins inside the bind-mounted repo — root-owned files there break
    # a host-run backend with Errno 13 on reinstall. (calvin-0ds)
    target = tmp_path / "vol-plugins"
    monkeypatch.setenv("PLUGIN_DIR", str(target))
    assert Settings(_env_file=None).plugins_dir == target


def test_plugins_dir_honors_plugins_dir_env(monkeypatch, tmp_path):
    # The convention-following PLUGINS_DIR (field name uppercased) also works.
    target = tmp_path / "alt-plugins"
    monkeypatch.setenv("PLUGINS_DIR", str(target))
    assert Settings(_env_file=None).plugins_dir == target


def test_default_data_dir_is_backend_data_regardless_of_cwd(monkeypatch, tmp_path):
    # A dev checkout or bare-metal install keeps its data in backend/data,
    # whatever directory the server is started from.
    monkeypatch.chdir(tmp_path)
    s = Settings(_env_file=None)
    assert s.data_dir == BACKEND_DIR / "data"
    assert s.data_dir.is_absolute()
    assert s.database_path == BACKEND_DIR / "data" / "db" / "calvin.db"
    assert s.plugins_dir == BACKEND_DIR / "data" / "plugins"


def test_every_writable_path_derives_from_calvin_data_dir(monkeypatch, tmp_path):
    root = tmp_path / "root"
    monkeypatch.setenv("CALVIN_DATA_DIR", str(root))
    s = Settings(_env_file=None)
    assert s.data_dir == root
    assert s.database_path == root / "db" / "calvin.db"
    assert s.database_url == f"sqlite:///{root / 'db' / 'calvin.db'}"
    assert s.log_dir == root / "logs"
    assert s.image_dir == root / "images"
    assert s.image_cache_dir == root / "image_cache"
    assert s.plugins_dir == root / "plugins"
    assert s.themes_dir == root / "themes"
    assert s.kiosk_signing_key_path == root / "kiosk-signing.key"
    assert s.backup_dir == root / "backups"


def test_individual_overrides_win_over_data_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("CALVIN_DATA_DIR", str(tmp_path / "root"))
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'elsewhere.db'}")
    monkeypatch.setenv("IMAGE_DIR", str(tmp_path / "pics"))
    monkeypatch.setenv("THEMES_DIR", str(tmp_path / "skins"))
    monkeypatch.setenv("BACKUP_DIR", str(tmp_path / "bak"))
    s = Settings(_env_file=None)
    assert s.database_path == tmp_path / "elsewhere.db"
    assert s.image_dir == tmp_path / "pics"
    assert s.themes_dir == tmp_path / "skins"
    assert s.backup_dir == tmp_path / "bak"
    # Not overridden: still under the root.
    assert s.plugins_dir == tmp_path / "root" / "plugins"


def test_relative_paths_resolve_against_backend_dir_not_cwd(monkeypatch, tmp_path):
    # Legacy configs used ./data/... relative to backend/ (the old cwd).
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("IMAGE_DIR", "./data/images")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./data/db/calvin.db")
    s = Settings(_env_file=None)
    assert s.image_dir == BACKEND_DIR / "data" / "images"
    assert s.database_path == BACKEND_DIR / "data" / "db" / "calvin.db"


def test_settings_creates_directories_only_under_data_dir(monkeypatch, tmp_path):
    root = tmp_path / "root"
    cwd = tmp_path / "cwd"
    cwd.mkdir()
    monkeypatch.chdir(cwd)
    monkeypatch.setenv("CALVIN_DATA_DIR", str(root))
    Settings(_env_file=None)
    assert list(cwd.iterdir()) == []
    assert (root / "db").is_dir()
    assert (root / "logs").is_dir()


def test_empty_override_counts_as_unset(monkeypatch, tmp_path):
    monkeypatch.setenv("CALVIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("BACKUP_DIR", "")
    monkeypatch.setenv("DATABASE_URL", "")
    s = Settings(_env_file=None)
    assert s.backup_dir == tmp_path / "backups"
    assert s.database_path == tmp_path / "db" / "calvin.db"


def test_empty_calvin_data_dir_uses_default(monkeypatch):
    # CALVIN_DATA_DIR= (set but blank) must not move the root to backend/.
    monkeypatch.setenv("CALVIN_DATA_DIR", "")
    s = Settings(_env_file=None)
    assert s.data_dir == BACKEND_DIR / "data"
    assert s.database_path == BACKEND_DIR / "data" / "db" / "calvin.db"


# --- CALVIN_HOST_CONTROL default rule (calvin-hhok) -------------------------
# Host actions (reboot, systemd restarts, xrandr/xset) are only safe when
# Calvin owns the machine: a native Pi/kiosk install that is not a dev checkout.
# Containers and developer desktops must default to off.


def _settings_for_host(monkeypatch, *, pi: bool, dev: bool, deployment: str = "native"):
    monkeypatch.setattr(Settings, "is_dev_mode", property(lambda self: dev))
    monkeypatch.setattr("app.utils.platform.is_raspberry_pi", lambda: pi)
    monkeypatch.setenv("CALVIN_DEPLOYMENT", deployment)
    return Settings(_env_file=None)


def test_host_control_on_by_default_for_native_pi(monkeypatch):
    s = _settings_for_host(monkeypatch, pi=True, dev=False)
    assert s.host_control is True


def test_host_control_off_by_default_on_a_desktop(monkeypatch):
    s = _settings_for_host(monkeypatch, pi=False, dev=False)
    assert s.host_control is False


def test_host_control_off_by_default_in_dev_mode(monkeypatch):
    s = _settings_for_host(monkeypatch, pi=True, dev=True)
    assert s.host_control is False


def test_host_control_off_by_default_in_a_container(monkeypatch):
    s = _settings_for_host(monkeypatch, pi=True, dev=False, deployment="docker")
    assert s.host_control is False


def test_host_control_env_can_enable_anywhere(monkeypatch):
    monkeypatch.setenv("CALVIN_HOST_CONTROL", "1")
    s = _settings_for_host(monkeypatch, pi=False, dev=True, deployment="docker")
    assert s.host_control is True


def test_host_control_env_can_disable_a_pi(monkeypatch):
    monkeypatch.setenv("CALVIN_HOST_CONTROL", "0")
    s = _settings_for_host(monkeypatch, pi=True, dev=False)
    assert s.host_control is False
