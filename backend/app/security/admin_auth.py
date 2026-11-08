"""Admin secret store: scrypt password hash and stateless session cookies (CLV-9).

The secret lives in one JSON file (mode 0600) next to the kiosk signing key, never
in the database or in ``GET /api/config``. Deleting the file is the documented
recovery path: it also discards ``server_secret``, so every old cookie dies.
"""

import hashlib
import hmac
import json
import math
import os
import secrets
import time
from collections import deque
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path

from loguru import logger

COOKIE_NAME = "calvin_admin"

# Session lifetimes (calvin-q4o8). Both are measured from the last use, not from
# sign-in: using Calvin renews the session, leaving it alone lets it lapse.
# A kiosk is a wall screen anyone can walk up to, so its session is minutes;
# a phone or desktop is the owner's own, so it lasts about a month.
KIOSK_IDLE_SECONDS = 300
DEVICE_SESSION_SECONDS = 30 * 24 * 3600
# A session is only re-signed when its last use is at least this old, so an
# ordinary burst of requests does not rewrite the cookie every time.
_KIOSK_RENEW_AFTER = 10
_DEVICE_RENEW_AFTER = 24 * 3600
_COOKIE_VERSION = "v2"
_CLOCK_SKEW = 60
MIN_PASSWORD_LEN = 8

_SCRYPT_N = 16384
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_DKLEN = 32
_SCRYPT_SALT_BYTES = 16
_SERVER_SECRET_BYTES = 32
_FILE_VERSION = 1


class SessionKind(StrEnum):
    """Which lifetime a signed session gets. Part of the signed cookie."""

    DEVICE = "d"
    KIOSK = "k"


@dataclass(frozen=True)
class Session:
    kind: SessionKind
    kiosk_id: str | None
    issued_at: int
    last_active: int

    @property
    def idle_limit(self) -> int:
        return KIOSK_IDLE_SECONDS if self.kind is SessionKind.KIOSK else DEVICE_SESSION_SECONDS


def cookie_max_age(kind: SessionKind) -> int:
    """The browser-side lifetime that matches a session kind's idle limit."""
    return KIOSK_IDLE_SECONDS if kind is SessionKind.KIOSK else DEVICE_SESSION_SECONDS


# kiosk id -> when its screen last went to sleep. In memory on purpose: a restart
# loses it, but a kiosk session still lapses on its own 5-minute idle limit.
_kiosk_locks: dict[str, int] = {}


def lock_kiosk_sessions(kiosk_id: str, now: int | None = None) -> None:
    """End every session of this kiosk issued or used up to now (screen went to sleep)."""
    _kiosk_locks[kiosk_id] = int(time.time() if now is None else now)


class PasswordTooShort(ValueError):  # noqa: N818 - name is part of the CLV-9 plan contract
    """Raised when a admin password is shorter than ``MIN_PASSWORD_LEN``."""


class AdminAuthStore:
    """One admin password plus the state needed to sign session cookies.

    Reads the file on demand, so deleting or replacing it (recovery, tests)
    takes effect without restarting the process.
    """

    def __init__(self, path: Path):
        self.path = Path(path)

    # -- file handling ---------------------------------------------------

    def _load(self) -> dict | None:
        """Return the parsed file, or ``None`` when missing or unreadable."""
        try:
            raw = self.path.read_text()
        except FileNotFoundError:
            return None
        except OSError as exc:
            logger.error(f"Could not read admin auth file {self.path}: {exc}")
            return None
        try:
            data = json.loads(raw)
            if not isinstance(data, dict):
                raise ValueError("top-level value is not an object")
            scrypt = data["scrypt"]
            bytes.fromhex(scrypt["salt"])
            bytes.fromhex(scrypt["hash"])
            int(scrypt["n"])
            int(scrypt["r"])
            int(scrypt["p"])
            bytes.fromhex(data["server_secret"])
            int(data["generation"])
        except (ValueError, KeyError, TypeError) as exc:
            logger.error(f"Corrupt admin auth file {self.path}: {exc}")
            return None
        return data

    def _write(self, data: dict) -> None:
        """Write atomically (temp file in the same dir + ``os.replace``), mode 0600."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self.path.with_name(f".{self.path.name}.{secrets.token_hex(8)}.tmp")
        payload = json.dumps(data)
        fd = os.open(tmp_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(fd, "w") as handle:
                handle.write(payload)
            os.chmod(tmp_path, 0o600)
            os.replace(tmp_path, self.path)
        except BaseException:
            tmp_path.unlink(missing_ok=True)
            raise
        os.chmod(self.path, 0o600)

    # -- password --------------------------------------------------------

    def is_configured(self) -> bool:
        return self._load() is not None

    def set_password(self, password: str) -> None:
        """Set the password, bump the generation and invalidate other sessions."""
        if len(password) < MIN_PASSWORD_LEN:
            raise PasswordTooShort(f"Admin password must be at least {MIN_PASSWORD_LEN} characters")
        previous = self._load()
        if previous is not None:
            server_secret = bytes.fromhex(previous["server_secret"])
            generation = int(previous["generation"]) + 1
        else:
            server_secret = secrets.token_bytes(_SERVER_SECRET_BYTES)
            generation = 1
        salt = secrets.token_bytes(_SCRYPT_SALT_BYTES)
        digest = hashlib.scrypt(
            password.encode(),
            salt=salt,
            n=_SCRYPT_N,
            r=_SCRYPT_R,
            p=_SCRYPT_P,
            dklen=_SCRYPT_DKLEN,
        )
        self._write(
            {
                "version": _FILE_VERSION,
                "scrypt": {
                    "salt": salt.hex(),
                    "n": _SCRYPT_N,
                    "r": _SCRYPT_R,
                    "p": _SCRYPT_P,
                    "hash": digest.hex(),
                },
                "server_secret": server_secret.hex(),
                "generation": generation,
            }
        )

    def verify_password(self, password: str) -> bool:
        """Constant-time password check. False when unconfigured or corrupt."""
        data = self._load()
        if data is None:
            return False
        scrypt = data["scrypt"]
        try:
            expected = bytes.fromhex(scrypt["hash"])
            candidate = hashlib.scrypt(
                password.encode(),
                salt=bytes.fromhex(scrypt["salt"]),
                n=int(scrypt["n"]),
                r=int(scrypt["r"]),
                p=int(scrypt["p"]),
                dklen=len(expected),
            )
        except (ValueError, KeyError, TypeError) as exc:
            logger.error(f"Corrupt admin auth file {self.path}: {exc}")
            return False
        return hmac.compare_digest(candidate, expected)

    def apply_env_password(self, password: str) -> None:
        """Make ``CALVIN_ADMIN_PASSWORD`` win, without bumping for an unchanged value."""
        if not password:
            return
        if self.is_configured() and self.verify_password(password):
            return
        self.set_password(password)

    def reset(self) -> None:
        """Delete the secret file (tests and the documented forgot-password recovery)."""
        self.path.unlink(missing_ok=True)

    # -- cookies ---------------------------------------------------------

    def _cookie_mac(self, body: str, server_secret: bytes) -> str:
        return hmac.new(server_secret, body.encode(), hashlib.sha256).hexdigest()

    def issue_cookie(
        self,
        kind: SessionKind = SessionKind.DEVICE,
        kiosk_id: str | None = None,
        now: int | None = None,
    ) -> str:
        """Return a signed session cookie for ``kind`` (the kind is inside the signature)."""
        data = self._load()
        if data is None:
            raise RuntimeError("Admin auth is not configured")
        stamp = int(time.time() if now is None else now)
        return self._sign(data, kind, kiosk_id, stamp, stamp)

    def _sign(
        self, data: dict, kind: SessionKind, kiosk_id: str | None, issued_at: int, last_active: int
    ) -> str:
        # Hex keeps the id free of the "." separator (kiosk ids may contain dots).
        kid = kiosk_id.encode().hex() if kiosk_id else "-"
        body = f"{_COOKIE_VERSION}.{kind.value}.{kid}.{issued_at}.{last_active}.{int(data['generation'])}"
        return f"{body}.{self._cookie_mac(body, bytes.fromhex(data['server_secret']))}"

    def read_session(self, value: str | None, now: int | None = None) -> Session | None:
        """The live session behind a cookie, or ``None`` on anything doubtful.

        Doubtful covers a bad signature, an old generation, a cookie in the
        retired 400-day format, an idle session past its limit, and a kiosk
        session ended by that screen going to sleep.
        """
        if not value:
            return None
        data = self._load()
        if data is None:
            return None
        parts = value.split(".")
        if len(parts) != 7 or parts[0] != _COOKIE_VERSION:
            return None
        try:
            kind = SessionKind(parts[1])
            kiosk_id = None if parts[2] == "-" else bytes.fromhex(parts[2]).decode()
            issued_at = int(parts[3])
            last_active = int(parts[4])
            generation = int(parts[5])
            server_secret = bytes.fromhex(data["server_secret"])
            current_generation = int(data["generation"])
        except (ValueError, KeyError, TypeError):
            return None
        if generation != current_generation:
            return None
        body = ".".join(parts[:6])
        if not hmac.compare_digest(self._cookie_mac(body, server_secret), parts[6]):
            return None
        session = Session(kind, kiosk_id, issued_at, last_active)
        current_time = int(time.time() if now is None else now)
        if last_active > current_time + _CLOCK_SKEW:
            return None
        if current_time - last_active > session.idle_limit:
            return None
        if kind is SessionKind.KIOSK and kiosk_id is not None:
            locked_at = _kiosk_locks.get(kiosk_id)
            if locked_at is not None and last_active <= locked_at:
                return None
        return session

    def verify_cookie(self, value: str | None, now: int | None = None) -> bool:
        """True for a live session. False on anything doubtful."""
        return self.read_session(value, now) is not None

    def renew_cookie(
        self, value: str | None, now: int | None = None, *, force: bool = False
    ) -> str | None:
        """A fresh cookie with last use = now, or ``None`` when no renewal is due.

        Only a live session renews; a lapsed one stays lapsed. ``force`` renews
        regardless of age (an explicit touch from a kiosk page).
        """
        session = self.read_session(value, now)
        data = self._load()
        if session is None or data is None:
            return None
        current_time = int(time.time() if now is None else now)
        due = _KIOSK_RENEW_AFTER if session.kind is SessionKind.KIOSK else _DEVICE_RENEW_AFTER
        if not force and current_time - session.last_active < due:
            return None
        return self._sign(data, session.kind, session.kiosk_id, session.issued_at, current_time)


class LoginRateLimiter:
    """In-memory per-IP login throttle (spec §4).

    Five failures inside ``window`` seconds lock the IP out for
    ``base_cooldown`` seconds; each further lockout doubles the cooldown up to
    ``max_cooldown``. Restarting the process clears it, which is acceptable:
    the password is scrypt-hashed, so a restart is not a cheap bypass.
    """

    def __init__(
        self,
        max_failures: int = 5,
        window: int = 60,
        base_cooldown: int = 60,
        max_cooldown: int = 900,
    ):
        self.max_failures = max_failures
        self.window = window
        self.base_cooldown = base_cooldown
        self.max_cooldown = max_cooldown
        self._failures: dict[str, deque[float]] = {}
        self._lockouts: dict[str, tuple[float, int]] = {}

    def check(self, ip: str, now: float | None = None) -> int:
        """Return 0 when allowed, else the whole seconds the caller must wait."""
        current = time.time() if now is None else now
        lockout = self._lockouts.get(ip)
        if lockout is not None:
            locked_until, _ = lockout
            if current < locked_until:
                return max(1, math.ceil(locked_until - current))
        return 0

    def record_failure(self, ip: str, now: float | None = None) -> None:
        """Record one wrong password; lock the IP out at the threshold."""
        current = time.time() if now is None else now
        failures = self._failures.setdefault(ip, deque())
        failures.append(current)
        while failures and current - failures[0] > self.window:
            failures.popleft()
        if len(failures) >= self.max_failures:
            _, previous_lockouts = self._lockouts.get(ip, (0.0, 0))
            lockouts = previous_lockouts + 1
            cooldown = min(self.base_cooldown * (2 ** (lockouts - 1)), self.max_cooldown)
            self._lockouts[ip] = (current + cooldown, lockouts)
            # Start counting a fresh window after this lockout; the lockout
            # itself is what blocks requests until it expires.
            failures.clear()

    def record_success(self, ip: str) -> None:
        """A good password clears the failure history but keeps the lockout count."""
        self._failures.pop(ip, None)


login_limiter = LoginRateLimiter()
# Failed bearer attempts (CLV-32): same policy, own buckets, so a script with a
# stale key cannot lock the owner out of the password form.
api_key_limiter = LoginRateLimiter()
# Unknown share-link tokens (calvin-mwqo): own buckets again, so guessing at
# guest links never locks out the admin form or API keys.
guest_token_limiter = LoginRateLimiter()


_store: AdminAuthStore | None = None


def get_admin_store() -> AdminAuthStore:
    """Process-wide store bound to ``settings.admin_auth_path``.

    The path is re-read on every call so the tests (and an operator who moves
    ``CALVIN_DATA_DIR``) get the store for the current setting.
    """
    global _store
    from app.config import settings

    path = Path(settings.admin_auth_path)
    if _store is None or _store.path != path:
        _store = AdminAuthStore(path)
    return _store
