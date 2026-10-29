"""Admin secret store: scrypt password hash, file handling, signed cookies (CLV-9)."""

import stat
from pathlib import Path

import pytest

from app.security.admin_auth import (
    COOKIE_MAX_AGE,
    AdminAuthStore,
    PasswordTooShort,
)


@pytest.fixture
def store(tmp_path: Path) -> AdminAuthStore:
    return AdminAuthStore(tmp_path / "admin-auth.json")


def test_not_configured_when_file_missing(store: AdminAuthStore):
    assert store.is_configured() is False


def test_set_and_verify_password(store: AdminAuthStore):
    store.set_password("correct horse")
    assert store.is_configured() is True
    assert store.verify_password("correct horse") is True
    assert store.verify_password("wrong pass") is False


def test_short_password_rejected(store: AdminAuthStore):
    with pytest.raises(PasswordTooShort):
        store.set_password("1234567")


def test_file_mode_is_0600(store: AdminAuthStore):
    store.set_password("correct horse")
    assert stat.S_IMODE(store.path.stat().st_mode) == 0o600


def test_file_has_no_plaintext(store: AdminAuthStore):
    store.set_password("correct horse")
    assert "correct horse" not in store.path.read_text()


def test_cookie_roundtrip(store: AdminAuthStore):
    store.set_password("correct horse")
    value = store.issue_cookie()
    assert store.verify_cookie(value) is True
    tampered = value[:-1] + ("0" if value[-1] != "0" else "1")
    assert store.verify_cookie(tampered) is False
    assert store.verify_cookie(None) is False
    assert store.verify_cookie("garbage") is False


def test_cookie_expires_after_400_days(store: AdminAuthStore):
    store.set_password("correct horse")
    value = store.issue_cookie(now=1000)
    assert store.verify_cookie(value, now=1000 + COOKIE_MAX_AGE) is True
    assert store.verify_cookie(value, now=1000 + COOKIE_MAX_AGE + 1) is False


def test_password_change_invalidates_old_cookies(store: AdminAuthStore):
    store.set_password("first-password")
    old = store.issue_cookie()
    store.set_password("another pass")
    assert store.verify_cookie(old) is False


def test_env_password_same_does_not_bump_generation(store: AdminAuthStore):
    store.set_password("pw-123456")
    cookie = store.issue_cookie()
    store.apply_env_password("pw-123456")
    assert store.verify_cookie(cookie) is True


def test_env_password_different_wins(store: AdminAuthStore):
    store.apply_env_password("new-pass-99")
    assert store.is_configured() is True
    assert store.verify_password("new-pass-99") is True


def test_corrupt_file_counts_as_not_configured(store: AdminAuthStore):
    store.path.write_text("{not json")
    assert store.is_configured() is False


def test_reset_deletes_file_and_kills_cookies(store: AdminAuthStore):
    store.set_password("correct horse")
    cookie = store.issue_cookie()
    store.reset()
    assert store.path.exists() is False
    assert store.is_configured() is False
    assert store.verify_cookie(cookie) is False
