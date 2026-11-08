"""Admin secret store: scrypt password hash, file handling, signed cookies (CLV-9)."""

import stat
from pathlib import Path

import pytest

from app.security.admin_auth import (
    DEVICE_SESSION_SECONDS,
    KIOSK_IDLE_SECONDS,
    AdminAuthStore,
    PasswordTooShort,
    SessionKind,
    lock_kiosk_sessions,
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


def test_device_session_lasts_30_days_from_last_use(store: AdminAuthStore):
    store.set_password("correct horse")
    value = store.issue_cookie(now=1000)
    assert DEVICE_SESSION_SECONDS == 30 * 24 * 3600
    assert store.verify_cookie(value, now=1000 + DEVICE_SESSION_SECONDS) is True
    assert store.verify_cookie(value, now=1000 + DEVICE_SESSION_SECONDS + 1) is False


def test_device_session_is_renewed_while_in_use(store: AdminAuthStore):
    store.set_password("correct horse")
    value = store.issue_cookie(now=1000)
    day = 24 * 3600
    renewed = store.renew_cookie(value, now=1000 + 20 * day)
    assert renewed is not None
    # 40 days after sign-in, but only 20 after the last use.
    assert store.verify_cookie(renewed, now=1000 + 40 * day) is True
    assert store.verify_cookie(value, now=1000 + 40 * day) is False


def test_kiosk_session_ends_after_5_minutes_without_touch(store: AdminAuthStore):
    store.set_password("correct horse")
    value = store.issue_cookie(SessionKind.KIOSK, "hall", now=1000)
    assert KIOSK_IDLE_SECONDS == 300
    assert store.verify_cookie(value, now=1000 + 300) is True
    assert store.verify_cookie(value, now=1000 + 301) is False


def test_kiosk_session_is_renewed_by_touch_but_not_once_idle(store: AdminAuthStore):
    store.set_password("correct horse")
    value = store.issue_cookie(SessionKind.KIOSK, "hall", now=1000)
    touched = store.renew_cookie(value, now=1250)
    assert touched is not None
    assert store.verify_cookie(touched, now=1250 + 300) is True
    # A cookie that already went idle cannot be revived by a late touch.
    assert store.renew_cookie(value, now=1000 + 301) is None


def test_session_kind_cannot_be_edited_into_a_longer_one(store: AdminAuthStore):
    store.set_password("correct horse")
    value = store.issue_cookie(SessionKind.KIOSK, "hall", now=1000)
    parts = value.split(".")
    assert parts[1] == "k"
    parts[1] = "d"
    assert store.verify_cookie(".".join(parts), now=1000 + 3600) is False


def test_the_old_400_day_cookie_is_refused(store: AdminAuthStore):
    """A pre-session-kinds cookie is "{issued_at}.{generation}.{mac}": never accepted."""
    import hashlib
    import hmac

    store.set_password("correct horse")
    data = store._load()
    assert data is not None
    mac = hmac.new(bytes.fromhex(data["server_secret"]), b"1000.1", hashlib.sha256).hexdigest()
    assert store.verify_cookie(f"1000.1.{mac}", now=1001) is False


def test_screen_sleep_ends_that_kiosks_sessions_only(store: AdminAuthStore):
    store.set_password("correct horse")
    hall = store.issue_cookie(SessionKind.KIOSK, "hall", now=1000)
    den = store.issue_cookie(SessionKind.KIOSK, "den", now=1000)
    phone = store.issue_cookie(now=1000)
    lock_kiosk_sessions("hall", now=1100)
    assert store.verify_cookie(hall, now=1101) is False
    assert store.verify_cookie(den, now=1101) is True
    assert store.verify_cookie(phone, now=1101) is True
    # Signing in again after the sleep works.
    assert store.verify_cookie(store.issue_cookie(SessionKind.KIOSK, "hall", now=1200), now=1201)


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
