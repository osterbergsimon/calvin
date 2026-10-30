"""API keys: bearer secrets for apps and scripts that act without the admin password (CLV-32).

Keys live in one JSON file (mode 0600) next to ``admin-auth.json``, never in the
database, for the same reason the admin secret does: it stays out of
``GET /api/config`` and out of the SQLite file that backups and plugins touch.
Only a SHA-256 of the secret is stored. The secret is 32 random bytes, so a
fast hash is enough: there is nothing to brute-force, unlike a password.
"""

import hashlib
import hmac
import json
import os
import re
import secrets
import threading
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from loguru import logger

SECRET_PREFIX = "clv_"
SECRET_BYTES = 32
PREFIX_LEN = 8
SCOPES = ("read", "admin", "host")
SCOPE_RANK = {"read": 0, "admin": 1, "host": 2}
MAX_NAME_LEN = 40
LAST_USED_INTERVAL = 60  # seconds between last_used_at writes, per key
_FILE_VERSION = 1

# Anything shaped like a key; used to keep secrets out of log lines.
SECRET_PATTERN = re.compile(r"clv_[A-Za-z0-9_-]{16,}")


class DuplicateKeyName(ValueError):  # noqa: N818 - mirrors PasswordTooShort naming
    """An active key already has this name (case-insensitive)."""


def _hash(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def _iso(epoch: int | float) -> str:
    return datetime.fromtimestamp(epoch, UTC).isoformat().replace("+00:00", "Z")


def _public(entry: dict[str, Any]) -> dict[str, Any]:
    """The shape the API returns: never the hash."""
    last_used = entry.get("last_used_at")
    return {
        "id": entry["id"],
        "name": entry["name"],
        "scope": entry["scope"],
        "prefix": entry["prefix"],
        "createdAt": _iso(entry["created_at"]),
        "lastUsedAt": _iso(last_used) if last_used is not None else None,
    }


class ApiKeyStore:
    """Reads the file on demand, so revoking takes effect on the very next request."""

    def __init__(self, path: Path):
        self.path = Path(path)
        self._lock = threading.Lock()

    # -- file handling ---------------------------------------------------

    def _load(self) -> list[dict[str, Any]]:
        try:
            raw = self.path.read_text()
        except FileNotFoundError:
            return []
        except OSError as exc:
            logger.error(f"Could not read API key file {self.path}: {exc}")
            return []
        try:
            data = json.loads(raw)
            keys = data["keys"]
            if not isinstance(keys, list):
                raise ValueError("keys is not a list")
            for entry in keys:
                entry["id"], entry["name"], entry["hash"], entry["prefix"]  # noqa: B018
                if entry["scope"] not in SCOPES:
                    raise ValueError("unknown scope")
                float(entry["created_at"])
        except (ValueError, KeyError, TypeError) as exc:
            logger.error(f"Corrupt API key file {self.path}: {exc}")
            return []
        return keys

    def _write(self, keys: list[dict[str, Any]]) -> None:
        """Write atomically (temp file in the same dir + ``os.replace``), mode 0600."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self.path.with_name(f".{self.path.name}.{secrets.token_hex(8)}.tmp")
        payload = json.dumps({"version": _FILE_VERSION, "keys": keys})
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

    # -- management ------------------------------------------------------

    def list(self) -> list[dict[str, Any]]:
        """Active keys, newest first."""
        entries = sorted(self._load(), key=lambda e: e["created_at"], reverse=True)
        return [_public(entry) for entry in entries]

    def create(
        self, name: str, scope: str, now: int | float | None = None
    ) -> tuple[dict[str, Any], str]:
        """Mint a key. Returns ``(public record, secret)``; the secret exists nowhere else."""
        if scope not in SCOPES:
            raise ValueError(f"Unknown scope {scope!r}")
        secret = SECRET_PREFIX + secrets.token_urlsafe(SECRET_BYTES)
        created = time.time() if now is None else now
        with self._lock:
            keys = self._load()
            if any(entry["name"].casefold() == name.casefold() for entry in keys):
                raise DuplicateKeyName(name)
            entry = {
                "id": secrets.token_hex(8),
                "name": name,
                "scope": scope,
                "prefix": secret[:PREFIX_LEN],
                "hash": _hash(secret),
                "created_at": created,
                "last_used_at": None,
            }
            keys.append(entry)
            self._write(keys)
        return _public(entry), secret

    def revoke(self, key_id: str) -> bool:
        with self._lock:
            keys = self._load()
            remaining = [entry for entry in keys if entry["id"] != key_id]
            if len(remaining) == len(keys):
                return False
            self._write(remaining)
        return True

    # -- authentication --------------------------------------------------

    def authenticate(self, secret: str, now: int | float | None = None) -> dict[str, Any] | None:
        """Return the key's public record for a valid secret, else ``None``.

        ``last_used_at`` is rewritten at most once a minute per key, so a busy
        client does not turn every request into a disk write.
        """
        if not secret:
            return None
        candidate = _hash(secret)
        keys = self._load()
        match = None
        for entry in keys:
            # No early exit: every stored hash is compared.
            if hmac.compare_digest(candidate, entry["hash"]):
                match = entry
        if match is None:
            return None
        current = time.time() if now is None else now
        last_used = match.get("last_used_at")
        if last_used is None or current - last_used >= LAST_USED_INTERVAL:
            with self._lock:
                fresh = self._load()
                for entry in fresh:
                    if entry["id"] == match["id"]:
                        entry["last_used_at"] = current
                        self._write(fresh)
                        match = entry
                        break
        return _public(match)


_store: ApiKeyStore | None = None


def get_api_key_store() -> ApiKeyStore:
    """Process-wide store next to ``settings.admin_auth_path`` (re-read per call, like the admin store)."""
    global _store
    from app.config import settings

    path = Path(settings.admin_auth_path).with_name("api-keys.json")
    if _store is None or _store.path != path:
        _store = ApiKeyStore(path)
    return _store
