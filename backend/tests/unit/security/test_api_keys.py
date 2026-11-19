"""API key store: hashing, uniqueness, revocation and the last-used throttle (CLV-32)."""

import json
import os
import stat

import pytest

from app.security.api_keys import (
    PERMISSIONS,
    SECRET_PREFIX,
    ApiKeyStore,
    DuplicateKeyName,
    is_limited,
)


@pytest.fixture
def store(tmp_path):
    return ApiKeyStore(tmp_path / "api-keys.json")


def test_create_returns_secret_once_and_prefix(store):
    record, secret = store.create("Home Assistant", "read")
    assert secret.startswith(SECRET_PREFIX)
    assert len(secret) >= len(SECRET_PREFIX) + 43  # 32 bytes, urlsafe
    assert record["prefix"] == secret[:8]
    assert record["scope"] == "read"
    assert record["lastUsedAt"] is None
    assert "secret" not in record and "hash" not in record


def test_file_holds_only_a_hash(store):
    record, secret = store.create("HA", "admin")
    raw = store.path.read_text()
    assert secret not in raw
    assert json.loads(raw)["keys"][0]["hash"] != secret
    assert stat.S_IMODE(os.stat(store.path).st_mode) == 0o600


def test_list_never_exposes_hash_newest_first(store):
    store.create("one", "read", now=100)
    store.create("two", "read", now=200)
    listed = store.list()
    assert [k["name"] for k in listed] == ["two", "one"]
    assert all(
        set(k)
        == {"id", "name", "scope", "prefix", "createdAt", "lastUsedAt", "permissions", "limited"}
        for k in listed
    )


def test_duplicate_name_case_insensitive(store):
    store.create("Home Assistant", "read")
    with pytest.raises(DuplicateKeyName):
        store.create("home assistant", "admin")


def test_revoked_name_can_be_reused(store):
    record, _ = store.create("HA", "read")
    assert store.revoke(record["id"]) is True
    store.create("HA", "read")


def test_authenticate_valid_wrong_and_revoked(store):
    record, secret = store.create("HA", "admin")
    assert store.authenticate(secret)["id"] == record["id"]
    assert store.authenticate(secret + "x") is None
    assert store.authenticate("clv_nope") is None
    assert store.authenticate("") is None
    store.revoke(record["id"])
    assert store.authenticate(secret) is None


def test_revoke_unknown_returns_false(store):
    assert store.revoke("nope") is False


def test_missing_or_corrupt_file_means_no_keys(store):
    assert store.list() == []
    store.path.write_text("{not json")
    assert store.list() == []
    assert store.authenticate("clv_x") is None


def test_last_used_written_at_most_once_a_minute(store):
    record, secret = store.create("HA", "read", now=1000)
    store.authenticate(secret, now=1010)
    first = store.path.read_text()
    assert store.list()[0]["lastUsedAt"] is not None
    store.authenticate(secret, now=1030)
    assert store.path.read_text() == first  # throttled: no write
    store.authenticate(secret, now=1071)
    assert store.path.read_text() != first


# -- permissions (calvin-2ifv) ------------------------------------------------


def _old_entry(key_id: str, name: str, scope: str = "read") -> dict:
    return {
        "id": key_id,
        "name": name,
        "scope": scope,
        "prefix": "clv_abcd",
        "hash": "0" * 64,
        "created_at": 1000.0,
        "last_used_at": None,
    }


def _released_load(raw: str) -> list:
    """The validation the released backend runs on the key file (api_keys._load, v1)."""
    data = json.loads(raw)
    keys = data["keys"]
    if not isinstance(keys, list):
        raise ValueError("keys is not a list")
    for entry in keys:
        entry["id"], entry["name"], entry["hash"], entry["prefix"]  # noqa: B018
        if entry["scope"] not in ("read", "admin", "host"):
            raise ValueError("unknown scope")
        float(entry["created_at"])
    return keys


def test_permission_names():
    assert PERMISSIONS == {"screens.power": "Turn screens on and off"}


def test_old_file_loads_unchanged(store):
    _, secret = store.create("HA", "read", now=1000)
    store.authenticate(secret, now=1010)
    before = store.path.read_bytes()
    listed = store.list()
    assert listed[0]["permissions"] == []
    assert listed[0]["limited"] is False
    record = store.authenticate(secret, now=1020)  # throttled: no write
    assert record["limited"] is False and not is_limited(record)
    assert store.path.read_bytes() == before
    assert "permissions" not in json.loads(before)["keys"][0]


def test_create_limited_key(store):
    record, secret = store.create("Homey", "read", permissions=["screens.power"])
    assert record["limited"] is True
    assert record["permissions"] == ["screens.power"]
    assert record["scope"] == "read"
    stored = json.loads(store.path.read_text())["keys"][0]
    assert stored["scope"] == "read"
    assert stored["permissions"] == ["screens.power"]
    assert is_limited(store.authenticate(secret))


@pytest.mark.parametrize(
    ("scope", "permissions"),
    [
        ("admin", ["screens.power"]),
        ("host", ["screens.power"]),
        ("read", []),
        ("read", ["photos.upload"]),
    ],
)
def test_create_limited_refuses_other_scope_and_unknown(store, scope, permissions):
    with pytest.raises(ValueError):
        store.create("Homey", scope, permissions=permissions)
    assert store.list() == []


def test_unknown_permission_is_ignored_not_fatal(store):
    secret = "clv_" + "a" * 43
    from app.security.api_keys import _hash

    future = {**_old_entry("f1", "Future"), "hash": _hash(secret)}
    future["permissions"] = ["screens.power", "future.thing"]
    store.path.write_text(json.dumps({"version": 1, "keys": [future, _old_entry("o1", "Old")]}))
    listed = {k["id"]: k for k in store.list()}
    assert listed["f1"]["permissions"] == ["screens.power"]
    assert listed["f1"]["limited"] is True
    assert listed["o1"]["limited"] is False
    store.authenticate(secret)  # rewrites last_used_at
    stored = {k["id"]: k for k in json.loads(store.path.read_text())["keys"]}
    assert stored["f1"]["permissions"] == ["screens.power", "future.thing"]
    assert stored["f1"]["last_used_at"] is not None


@pytest.mark.parametrize("bad", ["screens.power", [1], {"screens.power": True}, None])
def test_malformed_permissions_fail_closed(store, bad):
    entry = {**_old_entry("b1", "Bad"), "permissions": bad}
    store.path.write_text(json.dumps({"version": 1, "keys": [entry, _old_entry("o1", "Old")]}))
    listed = {k["id"]: k for k in store.list()}
    assert listed["b1"]["limited"] is True
    assert listed["b1"]["permissions"] == []
    assert listed["o1"]["limited"] is False


def test_new_file_loads_with_released_validation(store):
    store.create("Homey", "read", permissions=["screens.power"])
    store.create("HA", "admin")
    keys = _released_load(store.path.read_text())
    assert len(keys) == 2
    assert {k["scope"] for k in keys} == {"read", "admin"}
