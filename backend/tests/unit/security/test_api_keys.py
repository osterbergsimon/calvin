"""API key store: hashing, uniqueness, revocation and the last-used throttle (CLV-32)."""

import json
import os
import stat

import pytest

from app.security.api_keys import SECRET_PREFIX, ApiKeyStore, DuplicateKeyName


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
        set(k) == {"id", "name", "scope", "prefix", "createdAt", "lastUsedAt"} for k in listed
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
