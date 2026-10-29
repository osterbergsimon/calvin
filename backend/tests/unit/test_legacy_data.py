"""One-time copy of the old checkout data dir (backend/data) into a moved data dir.

Models an old dev-compose install (setup.sh --mode dev): DB, IMAGE_DIR and
PLUGIN_DIR were on the volume, but uploads (stored image_dir ./data/images),
installed themes and the kiosk key were written into the bind-mounted checkout.
"""

from pathlib import Path

import pytest

from app.config import Settings
from app.utils.legacy_data import MARKER, migrate_legacy_data


@pytest.fixture
def layout(monkeypatch, tmp_path):
    for name in ("DATABASE_URL", "IMAGE_DIR", "PLUGIN_DIR", "PLUGINS_DIR", "THEMES_DIR"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.delenv("KIOSK_SIGNING_KEY_PATH", raising=False)
    monkeypatch.delenv("BACKUP_DIR", raising=False)
    legacy = tmp_path / "checkout" / "backend" / "data"
    (legacy / "images" / "thumbnails").mkdir(parents=True)
    (legacy / "images" / "photo.jpg").write_bytes(b"jpg")
    (legacy / "images" / "thumbnails" / "photo.jpg").write_bytes(b"thumb")
    (legacy / "themes" / "dusk").mkdir(parents=True)
    (legacy / "themes" / "dusk" / "theme.json").write_text("{}")
    (legacy / "themes" / "builtin.json").write_text("{}")  # shipped, not data
    (legacy / "kiosk-signing.key").write_text("ab" * 32)
    volume = tmp_path / "volume"
    monkeypatch.setenv("CALVIN_DATA_DIR", str(volume))
    return legacy, volume, Settings(_env_file=None)


def test_copies_legacy_files_into_new_data_dir(layout):
    legacy, volume, s = layout
    copied = migrate_legacy_data(s, legacy)
    assert (volume / "images" / "photo.jpg").read_bytes() == b"jpg"
    assert (volume / "images" / "thumbnails" / "photo.jpg").read_bytes() == b"thumb"
    assert (volume / "themes" / "dusk" / "theme.json").exists()
    assert not (volume / "themes" / "builtin.json").exists()
    assert (volume / "kiosk-signing.key").read_text() == "ab" * 32
    assert (volume / MARKER).exists()
    assert copied
    # Originals stay where they were.
    assert (legacy / "images" / "photo.jpg").exists()


def test_never_overwrites_and_runs_once(layout):
    legacy, volume, s = layout
    (volume / "kiosk-signing.key").write_text("cd" * 32)
    (volume / "images").mkdir(parents=True, exist_ok=True)
    (volume / "images" / "photo.jpg").write_bytes(b"new")
    migrate_legacy_data(s, legacy)
    assert (volume / "kiosk-signing.key").read_text() == "cd" * 32
    assert (volume / "images" / "photo.jpg").read_bytes() == b"new"

    # A file deleted after the migration is not brought back.
    (volume / "themes" / "dusk" / "theme.json").unlink()
    assert migrate_legacy_data(s, legacy) == []
    assert not (volume / "themes" / "dusk" / "theme.json").exists()


def test_follows_per_path_overrides(layout, monkeypatch, tmp_path):
    legacy, _volume, _ = layout
    monkeypatch.setenv("IMAGE_DIR", str(tmp_path / "share"))
    s = Settings(_env_file=None)
    migrate_legacy_data(s, legacy)
    assert (tmp_path / "share" / "photo.jpg").exists()


def test_noop_when_data_dir_is_the_legacy_dir(layout, monkeypatch):
    legacy, _volume, _ = layout
    monkeypatch.setenv("CALVIN_DATA_DIR", str(legacy))
    s = Settings(_env_file=None)
    assert migrate_legacy_data(s, legacy) == []
    assert not (legacy / MARKER).exists()


def test_noop_without_legacy_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("CALVIN_DATA_DIR", str(tmp_path / "volume"))
    s = Settings(_env_file=None)
    assert migrate_legacy_data(s, Path(tmp_path / "missing")) == []
