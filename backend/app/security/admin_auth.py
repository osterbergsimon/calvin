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
from pathlib import Path

from loguru import logger

COOKIE_NAME = "calvin_admin"
COOKIE_MAX_AGE = 34560000  # 400 days, the browser cap
MIN_PASSWORD_LEN = 8

_SCRYPT_N = 16384
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_DKLEN = 32
_SCRYPT_SALT_BYTES = 16
_SERVER_SECRET_BYTES = 32
_FILE_VERSION = 1


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

    def _cookie_mac(self, issued_at: int, generation: int, server_secret: bytes) -> str:
        message = f"{issued_at}.{generation}".encode()
        return hmac.new(server_secret, message, hashlib.sha256).hexdigest()

    def issue_cookie(self, now: int | None = None) -> str:
        """Return ``"{issued_at}.{generation}.{hex_hmac}"`` for this store."""
        data = self._load()
        if data is None:
            raise RuntimeError("Admin auth is not configured")
        issued_at = int(time.time() if now is None else now)
        generation = int(data["generation"])
        mac = self._cookie_mac(issued_at, generation, bytes.fromhex(data["server_secret"]))
        return f"{issued_at}.{generation}.{mac}"

    def verify_cookie(self, value: str | None, now: int | None = None) -> bool:
        """Verify signature, generation and 400-day age. False on anything doubtful."""
        if not value:
            return False
        data = self._load()
        if data is None:
            return False
        parts = value.split(".")
        if len(parts) != 3:
            return False
        try:
            issued_at = int(parts[0])
            generation = int(parts[1])
            server_secret = bytes.fromhex(data["server_secret"])
            current_generation = int(data["generation"])
        except (ValueError, KeyError, TypeError):
            return False
        if generation != current_generation:
            return False
        current_time = int(time.time() if now is None else now)
        if current_time - issued_at > COOKIE_MAX_AGE:
            return False
        expected = self._cookie_mac(issued_at, generation, server_secret)
        return hmac.compare_digest(expected, parts[2])


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
