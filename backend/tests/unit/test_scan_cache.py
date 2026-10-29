"""Scan cache lives under settings.plugins_dir and rejects unsafe ids."""

import pytest

from app.config import settings
from app.plugins.utils.scan_cache import load_scan_cache, save_scan_cache


@pytest.fixture(autouse=True)
def _plugins_dir(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "plugins_dir", tmp_path / "plugins")


def test_round_trip_under_plugins_dir(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    save_scan_cache("immich-1", [{"id": "a"}])
    assert (tmp_path / "plugins" / "immich-1" / "scan_cache.json").is_file()
    images, last_scan = load_scan_cache("immich-1")
    assert images == [{"id": "a"}]
    assert last_scan is not None


@pytest.mark.parametrize("bad_id", ["../escape", "a/b", "..", "", ".hidden", "x\\y"])
def test_unsafe_ids_are_refused(tmp_path, bad_id):
    save_scan_cache(bad_id, [{"id": "a"}])
    assert load_scan_cache(bad_id) == ([], None)
    assert not any(p.name == "scan_cache.json" for p in tmp_path.rglob("*"))
