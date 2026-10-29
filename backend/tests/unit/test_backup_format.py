"""Backup document validation, versioning and secret handling (calvin-8gx)."""

import pytest

from app.services.backup import format as fmt
from app.services.backup.secrets import strip_secrets


def _doc(version=fmt.FORMAT_VERSION, **data):
    return {
        "format": fmt.FORMAT_NAME,
        "format_version": version,
        "created_at": "2026-10-29T10:00:00Z",
        "calvin_version": "0.1.0",
        "data": {
            "config": [],
            "keyboard_mappings": [],
            "plugin_types": [],
            "plugin_instances": [],
            "kiosks": [],
            **data,
        },
    }


@pytest.mark.unit
def test_current_version_document_loads():
    doc = fmt.load_document(_doc(config=[{"key": "a", "value": "1", "value_type": "int"}]))
    assert doc.format_version == fmt.FORMAT_VERSION
    assert doc.data.config[0].key == "a"


@pytest.mark.unit
def test_newer_version_is_rejected():
    with pytest.raises(fmt.BackupError, match="newer"):
        fmt.load_document(_doc(version=fmt.FORMAT_VERSION + 1))


@pytest.mark.unit
@pytest.mark.parametrize(
    "raw",
    [{}, {"format": "something-else", "format_version": 1}, {"format": "calvin-backup"}, []],
)
def test_non_backup_is_rejected(raw):
    with pytest.raises(fmt.BackupError, match="(?i)not a calvin backup"):
        fmt.load_document(raw)


@pytest.mark.unit
def test_older_version_is_migrated(monkeypatch):
    def v0_to_v1(raw):
        raw["data"]["config"] = [
            {"key": k, "value": v, "value_type": "string"}
            for k, v in raw["data"].pop("settings").items()
        ]
        return raw

    monkeypatch.setitem(fmt.MIGRATIONS, fmt.FORMAT_VERSION - 1, v0_to_v1)
    raw = _doc(version=fmt.FORMAT_VERSION - 1)
    raw["data"].pop("config")
    raw["data"]["settings"] = {"time_format": "12h"}
    doc = fmt.load_document(raw)
    assert doc.format_version == fmt.FORMAT_VERSION
    assert [(c.key, c.value) for c in doc.data.config] == [("time_format", "12h")]


@pytest.mark.unit
def test_older_version_without_migration_is_rejected():
    with pytest.raises(fmt.BackupError, match="(?i)too old|no migration"):
        fmt.load_document(_doc(version=0))


@pytest.mark.unit
def test_unknown_fields_are_ignored():
    raw = _doc(kiosks=[{"id": "k1", "hostname": "h", "overrides": {}, "future_column": 1}])
    raw["something_new"] = True
    assert fmt.load_document(raw).data.kiosks[0].id == "k1"


@pytest.mark.unit
def test_strip_secrets_by_name_and_schema():
    schema = {"pin": {"type": "password"}, "host": {"type": "string"}}
    config = {"host": "x", "pin": "1234", "api_key": "k", "nested": {"refresh_token": "t"}}
    stripped, fields = strip_secrets(config, schema)
    assert stripped == {"host": "x", "pin": "", "api_key": "", "nested": {"refresh_token": ""}}
    assert sorted(fields) == ["api_key", "nested.refresh_token", "pin"]
    assert config["pin"] == "1234"  # input untouched
