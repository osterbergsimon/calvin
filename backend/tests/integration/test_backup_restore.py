"""Backup → restore round trip through the API (calvin-8gx).

A populated install is exported, then torn down to a fresh state (plugin
package uninstalled, instances deleted, config and kiosks changed), then
restored. The restored setup must export to the same data as the original.
"""

import asyncio
import io
import json
import zipfile

import pytest

from app.models.db_models import PluginDB
from app.plugins.definitions import CURRENT_PLUGIN_API_VERSION
from app.plugins.manager import plugin_manager
from app.services.plugin_installer import plugin_installer
from app.services.theme_installer import theme_installer

pytestmark = pytest.mark.integration

PLUGIN_ID = "backup_fixture_plugin"

PLUGIN_PY = f'''"""Backup round-trip fixture plugin."""
from app.plugins.definitions import PluginMetadata
from app.plugins.protocols import ServicePlugin
from app.plugins.sdk.schema import password_field, text_field


class BackupFixturePlugin(ServicePlugin):
    metadata = PluginMetadata(
        type_id="{PLUGIN_ID}",
        name="Backup Fixture",
        description="Plugin with a secret field",
        supports_multiple_instances=True,
        instance_config_schema={{
            "host": text_field("Host", required=True),
            "api_token": password_field("API token", required=True),
        }},
        display_schema={{"kind": "status", "item": {{"label": "OK", "value_path": "$.ok"}}}},
    )

    async def fetch(self, start_date=None, end_date=None):
        return {{"ok": True}}
'''


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _plugin_zip(tmp_path, version="1.0.0"):
    src = tmp_path / f"src-{version}"
    src.mkdir()
    (src / "plugin.json").write_text(
        json.dumps(
            {
                "id": PLUGIN_ID,
                "name": "Backup Fixture",
                "version": version,
                "type": "service",
                "api_version": CURRENT_PLUGIN_API_VERSION,
            }
        )
    )
    (src / "plugin.py").write_text(PLUGIN_PY)
    zip_path = tmp_path / f"{PLUGIN_ID}-{version}.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        for f in src.rglob("*"):
            zf.write(f, f.relative_to(src))
    return zip_path


@pytest.fixture(autouse=True)
def isolated_dirs(tmp_path, monkeypatch):
    """Keep plugin/theme packages and backup files out of the real data dir."""
    from app.config import settings

    env = tmp_path / "backup-env"
    plugins, themes, backups = env / "plugins", env / "themes", env / "backups"
    for d in (plugins, themes, backups):
        d.mkdir(parents=True)
    monkeypatch.setattr(plugin_installer, "plugins_dir", plugins)
    monkeypatch.setattr(theme_installer, "themes_dir", themes)
    monkeypatch.setattr(settings, "backup_dir", backups)
    monkeypatch.setattr(settings, "kiosk_signing_key_path", env / "kiosk-signing.key")
    yield
    from app.plugins.loader import plugin_loader

    plugin_loader.unload_installed_plugin(PLUGIN_ID)


def _populate(client, tmp_path):
    with open(_plugin_zip(tmp_path), "rb") as f:
        r = client.post("/api/plugins/install", files={"file": ("p.zip", f, "application/zip")})
    assert r.status_code == 200, r.text
    r = client.put(f"/api/plugins/{PLUGIN_ID}", json={"enabled": True})
    assert r.status_code == 200, r.text

    created = {}
    for type_id, name, config in [
        ("ical", "Family", {"ical_url": "https://example.com/family.ics"}),
        ("iframe", "Grafana", {"url": "https://grafana.example.com"}),
        (PLUGIN_ID, "Pantry", {"host": "pantry.lan", "api_token": "s3cret-token"}),
    ]:
        r = client.post(
            f"/api/plugins/{type_id}/instances",
            json={"name": name, "enabled": True, "config": config},
        )
        assert r.status_code == 200, r.text
        created[type_id] = r.json()["instance"]["id"]

    r = client.post("/api/config", json={"timeFormat": "12h", "weekStartDay": 0})
    assert r.status_code == 200, r.text
    r = client.put("/api/keyboard/mappings/KEY_9", json={"action": "mode_settings"})
    assert r.status_code == 200, r.text
    r = client.put(
        "/api/kiosks/hallway-3f9a2c/overrides", json={"overrides": {"orientation": "portrait"}}
    )
    assert r.status_code == 200, r.text
    return created


def _export(client, **params):
    r = client.get("/api/backup/export", params=params)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/zip"
    return r.content


def _doc(zip_bytes):
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        return json.loads(zf.read("backup.json"))


def _normalized(doc):
    data = doc["data"]
    return {
        "config": sorted((c["key"], c["value"], c["value_type"]) for c in data["config"]),
        "keyboard": sorted((k["key_code"], k["action"]) for k in data["keyboard_mappings"]),
        "types": sorted(
            (t["type_id"], t["enabled"], json.dumps(t["common_config_schema"], sort_keys=True))
            for t in data["plugin_types"]
        ),
        "instances": sorted(
            (
                i["id"],
                i["type_id"],
                i["name"],
                i["enabled"],
                json.dumps(i["config"], sort_keys=True),
                i["display_order"],
            )
            for i in data["plugin_instances"]
        ),
        "kiosks": sorted(
            (k["id"], json.dumps(k["overrides"], sort_keys=True)) for k in data["kiosks"]
        ),
    }


def _restore(client, zip_bytes, **form):
    return client.post(
        "/api/backup/restore",
        files={"file": ("backup.zip", zip_bytes, "application/zip")},
        data=form,
    )


def _tear_down_to_fresh(client, created):
    """Make the install look fresh: no custom plugin, no instances, changed settings."""
    r = client.delete(f"/api/plugins/installed/{PLUGIN_ID}")
    assert r.status_code == 200, r.text
    for type_id, instance_id in created.items():
        if type_id != PLUGIN_ID:
            assert client.delete(f"/api/plugins/instances/{instance_id}").status_code == 200
    client.post("/api/config", json={"timeFormat": "24h"})
    client.put("/api/kiosks/hallway-3f9a2c/overrides", json={"overrides": {}})
    client.delete("/api/keyboard/mappings/KEY_9")
    assert not (plugin_installer.plugins_dir / PLUGIN_ID).exists()


def test_export_carries_format_header_and_packages(test_client, tmp_path):
    _populate(test_client, tmp_path)
    zip_bytes = _export(test_client)
    doc = _doc(zip_bytes)
    assert doc["format"] == "calvin-backup"
    assert doc["format_version"] == 1
    assert doc["calvin_version"]
    assert [p["id"] for p in doc["packages"]["plugins"]] == [PLUGIN_ID]
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        assert f"packages/plugins/{PLUGIN_ID}/plugin.py" in zf.namelist()
        assert "signing-key" not in zf.namelist()
    keys = {c["key"] for c in doc["data"]["config"]}
    assert not any(k.startswith("backup_") for k in keys)


def test_round_trip_restores_populated_setup(test_client, tmp_path):
    created = _populate(test_client, tmp_path)
    original = _export(test_client)

    _tear_down_to_fresh(test_client, created)
    assert _normalized(_doc(_export(test_client))) != _normalized(_doc(original))

    r = _restore(test_client, original, mode="replace")
    assert r.status_code == 200, r.text
    result = r.json()
    assert result["applied"] is True
    assert PLUGIN_ID in result["plan"]["packages"]["install"]

    assert (plugin_installer.plugins_dir / PLUGIN_ID / "plugin.py").exists()
    restored = _doc(_export(test_client))
    assert _normalized(restored) == _normalized(_doc(original))

    # The reinstalled plugin's instance is live, not just a DB row.
    pantry = plugin_manager.get_plugin(created[PLUGIN_ID])
    assert pantry is not None and pantry.enabled
    assert pantry.config["api_token"] == "s3cret-token"

    # A safety backup of the pre-restore state was written.
    from app.config import settings

    assert any(p.name.startswith("pre-restore-") for p in settings.backup_dir.iterdir())


def test_replace_removes_instances_not_in_backup(test_client, tmp_path):
    _populate(test_client, tmp_path)
    original = _export(test_client)
    r = test_client.post(
        "/api/plugins/iframe/instances",
        json={"name": "Extra", "enabled": True, "config": {"url": "https://extra.example.com"}},
    )
    extra_id = r.json()["instance"]["id"]

    assert _restore(test_client, original, mode="replace").status_code == 200
    ids = {i["id"] for i in _doc(_export(test_client))["data"]["plugin_instances"]}
    assert extra_id not in ids
    assert plugin_manager.get_plugin(extra_id) is None


def test_merge_keeps_instances_not_in_backup(test_client, tmp_path):
    _populate(test_client, tmp_path)
    original = _export(test_client)
    r = test_client.post(
        "/api/plugins/iframe/instances",
        json={"name": "Extra", "enabled": True, "config": {"url": "https://extra.example.com"}},
    )
    extra_id = r.json()["instance"]["id"]

    assert _restore(test_client, original, mode="merge").status_code == 200
    ids = {i["id"] for i in _doc(_export(test_client))["data"]["plugin_instances"]}
    assert extra_id in ids


def test_preview_reports_plan_and_writes_nothing(test_client, tmp_path):
    created = _populate(test_client, tmp_path)
    original = _export(test_client)
    _tear_down_to_fresh(test_client, created)
    before = _normalized(_doc(_export(test_client)))

    r = test_client.post(
        "/api/backup/preview",
        files={"file": ("backup.zip", original, "application/zip")},
        data={"mode": "replace"},
    )
    assert r.status_code == 200, r.text
    plan = r.json()
    assert plan["format_version"] == 1
    assert plan["packages"]["install"] == [PLUGIN_ID]
    assert set(plan["instances"]["create"]) == set(created.values())
    assert plan["counts"]["plugin_instances"] == len(_doc(original)["data"]["plugin_instances"])

    assert _normalized(_doc(_export(test_client))) == before
    assert not (plugin_installer.plugins_dir / PLUGIN_ID).exists()


def test_restore_rejects_backup_from_newer_calvin(test_client, tmp_path):
    _populate(test_client, tmp_path)
    original = _export(test_client)
    doc = _doc(original)
    doc["format_version"] = 99
    before = _normalized(_doc(_export(test_client)))

    for endpoint in ("/api/backup/preview", "/api/backup/restore"):
        r = test_client.post(
            endpoint,
            files={"file": ("backup.json", json.dumps(doc).encode(), "application/json")},
        )
        assert r.status_code == 400
        assert "newer" in r.json()["detail"].lower()
    assert _normalized(_doc(_export(test_client))) == before


def test_restore_rejects_file_that_is_not_a_backup(test_client):
    r = _restore(test_client, b'{"hello": "world"}')
    assert r.status_code == 400
    assert "not a calvin backup" in r.json()["detail"].lower()
    r = _restore(test_client, b"garbage bytes")
    assert r.status_code == 400


def test_restore_accepts_bare_json_document(test_client, tmp_path):
    created = _populate(test_client, tmp_path)
    doc = _doc(_export(test_client, include_packages="false"))
    client = test_client
    client.delete(f"/api/plugins/instances/{created['iframe']}")

    r = client.post(
        "/api/backup/restore",
        files={"file": ("seed.json", json.dumps(doc).encode(), "application/json")},
        data={"mode": "merge"},
    )
    assert r.status_code == 200, r.text
    assert plugin_manager.get_plugin(created["iframe"]) is not None


def test_backup_without_secrets_restores_instance_disabled(test_client, tmp_path):
    created = _populate(test_client, tmp_path)
    no_secrets = _export(test_client, include_secrets="false")
    doc = _doc(no_secrets)
    pantry = next(i for i in doc["data"]["plugin_instances"] if i["type_id"] == PLUGIN_ID)
    assert pantry["config"]["api_token"] == ""
    assert {"scope": "instance", "id": created[PLUGIN_ID], "field": "api_token"} in doc[
        "stripped_secrets"
    ]

    _tear_down_to_fresh(test_client, created)
    r = _restore(test_client, no_secrets, mode="replace")
    assert r.status_code == 200, r.text
    assert created[PLUGIN_ID] in r.json()["needs_credentials"]

    row = _run(PluginDB.objects.get_or_none(id=created[PLUGIN_ID]))
    assert row is not None
    assert row.enabled is False
    assert row.config["host"] == "pantry.lan"


def test_signing_key_is_opt_in_on_both_sides(test_client, tmp_path):
    from app.config import settings

    settings.kiosk_signing_key_path.write_text("ab" * 32)
    with_key = _export(test_client, include_signing_key="true")
    with zipfile.ZipFile(io.BytesIO(with_key)) as zf:
        assert zf.read("signing-key").decode().strip() == "ab" * 32

    settings.kiosk_signing_key_path.write_text("cd" * 32)
    assert _restore(test_client, with_key, mode="merge").status_code == 200
    assert settings.kiosk_signing_key_path.read_text().strip() == "cd" * 32

    r = _restore(test_client, with_key, mode="merge", restore_signing_key="true")
    assert r.status_code == 200
    assert settings.kiosk_signing_key_path.read_text().strip() == "ab" * 32


def test_stored_backups_and_schedule(test_client, tmp_path):
    r = test_client.post("/api/backup/files")
    assert r.status_code == 200, r.text
    name = r.json()["name"]
    files = test_client.get("/api/backup/files").json()["files"]
    assert name in [f["name"] for f in files]
    assert test_client.get(f"/api/backup/files/{name}").status_code == 200
    assert test_client.get("/api/backup/files/..%2Fsecret").status_code in (400, 404)

    r = test_client.put(
        "/api/backup/schedule", json={"enabled": True, "interval_hours": 12, "retention": 3}
    )
    assert r.status_code == 200, r.text
    assert test_client.get("/api/backup/schedule").json() == {
        "enabled": True,
        "interval_hours": 12,
        "retention": 3,
    }


def test_seed_restore_runs_once_per_file(test_client, tmp_path, monkeypatch):
    from app.services.backup import seed

    created = _populate(test_client, tmp_path)
    original = _export(test_client)
    seed_file = tmp_path / "seed.zip"
    seed_file.write_bytes(original)
    _tear_down_to_fresh(test_client, created)

    monkeypatch.setenv("CALVIN_RESTORE_FROM", str(seed_file))
    assert _run(seed.restore_on_start()) == "restored"
    assert plugin_manager.get_plugin(created["iframe"]) is not None

    test_client.delete(f"/api/plugins/instances/{created['iframe']}")
    assert _run(seed.restore_on_start()) == "already-applied"
    assert plugin_manager.get_plugin(created["iframe"]) is None


def test_seed_restore_picks_up_drop_in_file(test_client, tmp_path, monkeypatch):
    from app.config import settings
    from app.services.backup import seed

    monkeypatch.delenv("CALVIN_RESTORE_FROM", raising=False)
    assert _run(seed.restore_on_start()) == "none"
    created = _populate(test_client, tmp_path)
    (settings.backup_dir / "restore-on-start.zip").write_bytes(_export(test_client))
    test_client.delete(f"/api/plugins/instances/{created['iframe']}")
    assert _run(seed.restore_on_start()) == "restored"
    assert plugin_manager.get_plugin(created["iframe"]) is not None


def test_auto_backup_prunes_to_retention(test_client, tmp_path):
    from app.config import settings
    from app.services.backup import store

    for _ in range(4):
        _run(store.write_backup(kind="auto", retention=2))
    autos = sorted(p.name for p in settings.backup_dir.glob("auto-*.zip"))
    assert len(autos) == 2
    manual = _run(store.write_backup(kind="manual"))
    assert manual.exists()
    _run(store.write_backup(kind="auto", retention=1))
    assert manual.exists()
    assert len(list(settings.backup_dir.glob("auto-*.zip"))) == 1


def test_hand_written_minimal_seed_restores(test_client):
    """The smallest seed shown in docs/configuration/BACKUP_RESTORE.md works."""
    seed = {
        "format": "calvin-backup",
        "format_version": 1,
        "data": {
            "config": [{"key": "time_format", "value": "24h", "value_type": "string"}],
            "plugin_instances": [
                {
                    "id": "ical-family",
                    "type_id": "ical",
                    "name": "Family",
                    "enabled": True,
                    "config": {"ical_url": "https://example.com/family.ics"},
                }
            ],
        },
    }
    r = test_client.post(
        "/api/backup/restore",
        files={"file": ("seed.json", json.dumps(seed).encode(), "application/json")},
        data={"mode": "merge"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["instances"]["created"] == ["ical-family"]
    assert plugin_manager.get_plugin("ical-family") is not None


def test_theme_package_round_trip(test_client, tmp_path):
    from app.api.routes.plugins.themes import _register_theme_in_db

    src = tmp_path / "dusk_theme"
    src.mkdir()
    base = {
        "bg-0": "#eef1f4",
        "bg-1": "#ffffff",
        "bg-2": "#ffffff",
        "line": "#dde3e8",
        "line-soft": "#e8edf1",
        "ink": "#1b242b",
        "ink-2": "#5d6b75",
        "ink-3": "#636e77",
        "focus": "#e08a1e",
        "ok": "#2e9e6b",
        "warn": "#b38f00",
        "err": "#c0392b",
        "shadow": "rgba(0, 0, 0, 0.1)",
        "shadow-hover": "rgba(0, 0, 0, 0.15)",
    }
    manifest = {
        "id": "dusk_theme",
        "name": "Dusk",
        "version": "1.0.0",
        "theme_api": 2,
        "variables": dict(base),
        "dark_mode": {
            **base,
            "bg-0": "#101010",
            "bg-1": "#151c21",
            "bg-2": "#1d262d",
            "ink": "#eaf0f3",
            "ink-2": "#9aa7b0",
            "ink-3": "#818d96",
        },
    }
    (src / "theme.json").write_text(json.dumps(manifest))
    installed = theme_installer.install_theme(src)
    _run(_register_theme_in_db(installed))

    original = _export(test_client)
    doc = _doc(original)
    assert [t["id"] for t in doc["packages"]["themes"]] == ["dusk_theme"]

    assert test_client.delete("/api/plugins/installed/dusk_theme").status_code == 200
    assert not (theme_installer.themes_dir / "dusk_theme").exists()

    r = _restore(test_client, original, mode="replace")
    assert r.status_code == 200, r.text
    assert "dusk_theme" in r.json()["installed"]
    assert (theme_installer.themes_dir / "dusk_theme" / "theme.json").exists()
    types = {t["type_id"] for t in _doc(_export(test_client))["data"]["plugin_types"]}
    assert "dusk_theme" in types


def test_merge_without_secrets_keeps_existing_secrets(test_client, tmp_path):
    created = _populate(test_client, tmp_path)
    from app.services.config_service import config_service

    _run(config_service.set_value(f"plugin_{PLUGIN_ID}_config", json.dumps({"api_key": "type-k"})))
    no_secrets = _export(test_client, include_secrets="false")

    r = _restore(test_client, no_secrets, mode="merge")
    assert r.status_code == 200, r.text
    assert r.json()["needs_credentials"] == []
    row = _run(PluginDB.objects.get_or_none(id=created[PLUGIN_ID]))
    assert row.enabled is True
    assert row.config["api_token"] == "s3cret-token"
    stored = _run(config_service.get_value(f"plugin_{PLUGIN_ID}_config"))
    assert json.loads(stored)["api_key"] == "type-k"


def test_plugin_type_state_comes_from_backup(test_client, tmp_path):
    _populate(test_client, tmp_path)
    from app.models.db_models import PluginTypeDB

    async def _switch_type_off():
        row = await PluginTypeDB.objects.get(type_id="iframe")
        row.enabled = False
        await row.update()

    _run(_switch_type_off())  # type off while its instance stays on
    original = _export(test_client)
    types = {t["type_id"]: t["enabled"] for t in _doc(original)["data"]["plugin_types"]}
    assert types["iframe"] is False

    assert _restore(test_client, original, mode="merge").status_code == 200
    after = {t["type_id"]: t["enabled"] for t in _doc(_export(test_client))["data"]["plugin_types"]}
    assert after == types


def test_unavailable_plugin_instance_is_kept_disabled(test_client, tmp_path):
    created = _populate(test_client, tmp_path)
    doc = _doc(_export(test_client, include_packages="false"))
    _tear_down_to_fresh(test_client, created)

    r = test_client.post(
        "/api/backup/restore",
        files={"file": ("b.json", json.dumps(doc).encode(), "application/json")},
        data={"mode": "replace"},
    )
    assert r.status_code == 200, r.text
    assert created[PLUGIN_ID] in r.json()["instances"]["skipped"]
    row = _run(PluginDB.objects.get_or_none(id=created[PLUGIN_ID]))
    assert row is not None and row.enabled is False
    assert row.config["api_token"] == "s3cret-token"


def test_damaged_zip_is_rejected_without_leaking_temp_dirs(test_client, tmp_path, monkeypatch):
    import tempfile

    monkeypatch.setattr(tempfile, "tempdir", str(tmp_path / "tmp"))
    (tmp_path / "tmp").mkdir()
    _populate(test_client, tmp_path)
    good = bytearray(_export(test_client))
    # Corrupt the stored plugin.py bytes so its CRC check fails on extract.
    marker = good.find(b"packages/plugins/")
    good[marker + 200 : marker + 260] = b"\0" * 60
    r = _restore(test_client, bytes(good))
    assert r.status_code == 400
    assert list((tmp_path / "tmp").iterdir()) == []

    bad_key = io.BytesIO()
    with zipfile.ZipFile(bad_key, "w") as zf:
        zf.writestr("backup.json", json.dumps(_doc(_export(test_client))))
        zf.writestr("signing-key", b"\xff\xfe")
    assert _restore(test_client, bad_key.getvalue()).status_code == 400


def _room_name_seed() -> dict:
    return {
        "format": "calvin-backup",
        "format_version": 1,
        "data": {
            "config": [{"key": "displayName", "value": "Lounge", "value_type": "string"}],
            "kiosks": [
                {"id": "kitchen-1a2b3c", "hostname": "kitchen", "overrides": {}},
                {
                    "id": "office-4d5e6f",
                    "hostname": "office",
                    "overrides": {"displayName": "Office", "orientation": "portrait"},
                },
            ],
        },
    }


def _restore_room_name_seed(test_client, mode: str):
    return test_client.post(
        "/api/backup/restore",
        files={"file": ("seed.json", json.dumps(_room_name_seed()).encode(), "application/json")},
        data={"mode": mode},
    )


@pytest.mark.parametrize("mode", ["merge", "replace"])
def test_restore_moves_global_room_name_onto_unnamed_screens(test_client, mode):
    """calvin-al91: a backup from before CLV-111 still has the global room name.

    The restore runs the room-name migration itself, so unnamed screens get the
    name and the global key is cleared without a restart or a new screen.
    """
    from app.services import kiosk_registry as kr
    from app.services.config_service import config_service

    r = _restore_room_name_seed(test_client, mode)
    assert r.status_code == 200, r.text

    # A merge restore also adopts the global show-UI controls on screens with
    # no value of their own (calvin-hi6w); the name migration is what is tested.
    kitchen = dict(_run(kr.get_overrides("kitchen-1a2b3c")))
    kitchen.pop("showUI", None)
    assert kitchen == {"displayName": "Lounge"}
    office = dict(_run(kr.get_overrides("office-4d5e6f")))
    office.pop("showUI", None)
    assert office == {"displayName": "Office", "orientation": "portrait"}
    assert _run(config_service.get_value("displayName")) is None


def test_restore_succeeds_with_a_warning_when_room_name_migration_fails(test_client, monkeypatch):
    """The migration is best effort: the restore is already applied when it runs."""
    from app.services import kiosk_registry as kr

    async def boom() -> None:
        raise RuntimeError("database is locked")

    monkeypatch.setattr(kr, "migrate_global_room_name", boom)
    r = _restore_room_name_seed(test_client, "merge")

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["applied"] is True
    assert (
        "The backup's room name could not be copied to the screens; "
        "it will be retried at the next restart."
    ) in body["warnings"]


def _controls_seed() -> dict:
    return {
        "format": "calvin-backup",
        "format_version": 1,
        "data": {
            "config": [
                {"key": "show_ui", "value": "false", "value_type": "bool"},
                {"key": "clock_bar_show_in_kiosk", "value": "true", "value_type": "bool"},
                {"key": "tap_anywhere_reveal", "value": "true", "value_type": "bool"},
            ],
            "kiosks": [
                {"id": "kitchen-1a2b3c", "hostname": "kitchen", "overrides": {}},
                {
                    "id": "office-4d5e6f",
                    "hostname": "office",
                    "overrides": {"showUI": True, "orientation": "portrait"},
                },
            ],
        },
    }


@pytest.mark.parametrize("mode", ["merge", "replace"])
def test_restore_copies_global_controls_onto_screens(test_client, mode):
    """calvin-hi6w: a backup from before the per-screen controls keeps them.

    The restore runs the control migration itself, so screens with no value of
    their own get the global one without a restart or a new screen.
    """
    from app.services import kiosk_registry as kr
    from app.services.config_service import config_service

    r = test_client.post(
        "/api/backup/restore",
        files={"file": ("seed.json", json.dumps(_controls_seed()).encode(), "application/json")},
        data={"mode": mode},
    )
    assert r.status_code == 200, r.text

    assert _run(kr.get_overrides("kitchen-1a2b3c")) == {
        "showUI": False,
        "clockBarShowInKiosk": True,
        "tapAnywhereReveal": True,
    }
    assert _run(kr.get_overrides("office-4d5e6f")) == {
        "showUI": True,
        "orientation": "portrait",
        "clockBarShowInKiosk": True,
        "tapAnywhereReveal": True,
    }
    # Still the fallback for a screen that has no value of its own.
    assert _run(config_service.get_value("show_ui")) is False


def _migrated_controls_seed() -> dict:
    return {
        "format": "calvin-backup",
        "format_version": 1,
        "data": {
            "config": [
                {"key": "show_ui", "value": "false", "value_type": "bool"},
                {"key": "screenControlsMigrated", "value": "true", "value_type": "bool"},
            ],
            "kiosks": [
                {"id": "kitchen-1a2b3c", "hostname": "kitchen", "overrides": {}},
            ],
        },
    }


@pytest.mark.parametrize("mode", ["merge", "replace"])
def test_restore_does_not_refill_a_screen_reset_after_the_migration(test_client, mode):
    """calvin-hi6w: the done marker makes the control migration one-time.

    A backup taken after the migration carries the marker. Its screen has no
    controls of its own, so the restored global value is the fallback; the
    restore must not copy it back into an override.
    """
    from app.services import kiosk_registry as kr

    r = test_client.post(
        "/api/backup/restore",
        files={
            "file": (
                "seed.json",
                json.dumps(_migrated_controls_seed()).encode(),
                "application/json",
            )
        },
        data={"mode": mode},
    )
    assert r.status_code == 200, r.text

    assert _run(kr.get_overrides("kitchen-1a2b3c")) == {}
