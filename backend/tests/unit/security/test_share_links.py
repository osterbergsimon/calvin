"""Share link store: hashed tokens, re-showable URLs, revoke, expiry, uploads (calvin-mwqo)."""

import json
import os
import stat

import pytest

from app.security.share_links import (
    DuplicateLinkName,
    InvalidFolder,
    ShareLinkStore,
    normalize_folder,
)


@pytest.fixture
def store(tmp_path):
    return ShareLinkStore(tmp_path / "share-links.json")


def test_create_returns_token_and_public_record(store):
    link, token = store.create("Grandma", "Guests", now=100)
    assert len(token) >= 40
    assert link["name"] == "Grandma"
    assert link["folder"] == "Guests"
    assert link["uploadCount"] == 0
    assert link["lastUsedAt"] is None
    assert link["expiresAt"] is None
    assert "hash" not in link and "token" not in link


def test_file_holds_only_a_hash_and_is_private(store):
    _, token = store.create("Grandma", "Guests")
    raw = store.path.read_text()
    assert token not in raw
    assert stat.S_IMODE(os.stat(store.path).st_mode) == 0o600
    # The derivation key lives in its own file, never in the links file.
    assert store.key_path.exists()
    assert stat.S_IMODE(os.stat(store.key_path).st_mode) == 0o600
    assert store.key_path.read_text() not in raw


def test_token_can_be_shown_again(store):
    link, token = store.create("Grandma", "Guests")
    assert store.token_for(link["id"]) == token
    # A fresh store object (process restart) derives the same token.
    assert ShareLinkStore(store.path).token_for(link["id"]) == token


def test_token_for_unknown_link_is_none(store):
    assert store.token_for("nope") is None


def test_authenticate_valid_wrong_and_revoked(store):
    link, token = store.create("Grandma", "Guests")
    assert store.authenticate(token)["id"] == link["id"]
    assert store.authenticate(token + "x") is None
    assert store.authenticate("") is None
    assert store.authenticate("garbage") is None
    assert store.revoke(link["id"]) is not None
    assert store.authenticate(token) is None
    assert store.token_for(link["id"]) is None


def test_tokens_from_another_install_do_not_work(tmp_path):
    first = ShareLinkStore(tmp_path / "a" / "share-links.json")
    second = ShareLinkStore(tmp_path / "b" / "share-links.json")
    _, token = first.create("Grandma", "Guests")
    assert second.authenticate(token) is None


def test_expiry(store):
    link, token = store.create("Party", "Party", expires_at=1000, now=100)
    assert link["expiresAt"] is not None
    assert store.authenticate(token, now=999) is not None
    assert store.authenticate(token, now=1000) is None
    # Still listed so the owner sees it expired.
    assert store.list(now=2000)[0]["expired"] is True


def test_expiry_must_be_in_the_future(store):
    with pytest.raises(ValueError):
        store.create("Party", "Party", expires_at=50, now=100)


def test_duplicate_name_case_insensitive(store):
    store.create("Grandma", "Guests")
    with pytest.raises(DuplicateLinkName):
        store.create("grandma", "Other")


def test_rename(store):
    link, token = store.create("Grandma", "Guests")
    renamed = store.rename(link["id"], "Nana")
    assert renamed["name"] == "Nana"
    assert store.authenticate(token)["name"] == "Nana"
    assert store.rename("missing", "x") is None
    other, _ = store.create("Uncle", "Guests")
    with pytest.raises(DuplicateLinkName):
        store.rename(other["id"], "nana")


def test_list_newest_first(store):
    store.create("one", "Guests", now=100)
    store.create("two", "Guests", now=200)
    assert [link["name"] for link in store.list()] == ["two", "one"]


@pytest.mark.parametrize(
    "raw, expected",
    [("Guests", "Guests"), ("  Party 2026 ", "Party 2026"), ("a_b-c", "a_b-c")],
)
def test_normalize_folder_accepts(raw, expected):
    assert normalize_folder(raw) == expected


@pytest.mark.parametrize(
    "raw", ["", "  ", "../x", "a/b", "a\\b", ".hidden", "thumbnails", "Thumbnails", "x" * 41]
)
def test_normalize_folder_rejects(raw):
    with pytest.raises(InvalidFolder):
        normalize_folder(raw)


def test_uploads_are_tracked_per_device(store):
    link, _ = store.create("Grandma", "Guests")
    store.record_upload(link["id"], "Guests/a.jpg", "img-a", device="phone-1", now=10)
    store.record_upload(link["id"], "Guests/b.jpg", "img-b", device="phone-2", now=20)
    mine = store.uploads_for(link["id"], device="phone-1")
    assert [u["imageId"] for u in mine] == ["img-a"]
    listed = store.list()[0]
    assert listed["uploadCount"] == 2
    assert listed["lastUsedAt"] is not None
    # The device id itself is never stored, only a hash.
    assert "phone-1" not in store.path.read_text()


def test_remove_upload_only_for_own_device(store):
    link, _ = store.create("Grandma", "Guests")
    store.record_upload(link["id"], "Guests/a.jpg", "img-a", device="phone-1")
    assert store.remove_upload(link["id"], "img-a", device="phone-2") is None
    removed = store.remove_upload(link["id"], "img-a", device="phone-1")
    assert removed["path"] == "Guests/a.jpg"
    assert store.uploads_for(link["id"], device="phone-1") == []


def test_revoke_returns_uploads_for_cleanup(store):
    link, _ = store.create("Grandma", "Guests")
    store.record_upload(link["id"], "Guests/a.jpg", "img-a", device="phone-1")
    revoked = store.revoke(link["id"])
    assert [u["path"] for u in revoked["uploads"]] == ["Guests/a.jpg"]
    assert store.list() == []
    assert store.revoke(link["id"]) is None


def test_corrupt_file_reads_as_empty(store):
    store.path.write_text("{not json")
    assert store.list() == []
    store.path.write_text(json.dumps({"links": "nope"}))
    assert store.list() == []


def test_guests_see_all_defaults_on_and_can_be_changed(store):
    link, _ = store.create("Grandma", "Guests")
    assert link["guestsSeeAll"] is True
    own, _ = store.create("Party", "Party", guests_see_all=False)
    assert own["guestsSeeAll"] is False
    updated = store.update(link["id"], guests_see_all=False)
    assert updated["guestsSeeAll"] is False
    assert store.get(link["id"])["guestsSeeAll"] is False
    assert store.update("nope", guests_see_all=True) is None


def test_link_saved_before_the_setting_keeps_own_device_behaviour(store):
    link, _ = store.create("Grandma", "Guests")
    data = json.loads(store.path.read_text())
    del data["links"][0]["guests_see_all"]
    store.path.write_text(json.dumps(data))
    assert store.get(link["id"])["guestsSeeAll"] is False


def test_uploads_for_every_device_and_remove_any(store):
    link, _ = store.create("Grandma", "Guests")
    store.record_upload(link["id"], "Guests/a.jpg", "img-a", device="phone-1", now=10)
    store.record_upload(link["id"], "Guests/b.jpg", "img-b", device="phone-2", now=20)
    assert [u["imageId"] for u in store.uploads_for(link["id"])] == ["img-b", "img-a"]
    assert store.remove_upload(link["id"], "img-a")["path"] == "Guests/a.jpg"
    assert [u["imageId"] for u in store.uploads_for(link["id"])] == ["img-b"]


def test_pending_uploads_are_claimed_once(store):
    link, _ = store.create("Grandma", "Guests")
    store.record_upload(link["id"], "Guests/a.jpg", "img-a", device="pending:claim-1")
    assert store.claim_uploads(link["id"], "claim-1", device="phone-1") == 1
    assert [u["imageId"] for u in store.uploads_for(link["id"], device="phone-1")] == ["img-a"]
    # One time only: a second claim (from any device) finds nothing.
    assert store.claim_uploads(link["id"], "claim-1", device="phone-2") == 0
    assert store.uploads_for(link["id"], device="phone-2") == []


def test_a_device_id_is_not_a_claim(store):
    link, _ = store.create("Grandma", "Guests")
    store.record_upload(link["id"], "Guests/a.jpg", "img-a", device="phone-1")
    assert store.claim_uploads(link["id"], "phone-1", device="phone-2") == 0
    assert store.uploads_for(link["id"], device="phone-2") == []
