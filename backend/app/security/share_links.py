"""Share links: upload-only guest tokens for one Local photos folder (calvin-mwqo).

Stored like the API keys: one JSON file (mode 0600) next to ``admin-auth.json``,
never in the database, so the records stay out of ``GET /api/config`` and of
the SQLite file that plugins touch.

A token is ``<link id>.<HMAC-SHA256(key, link id)>``. The links file only holds
a SHA-256 of the token; the HMAC key lives in its own 0600 file. That keeps the
token out of the links file while still letting the owner re-show the URL and
QR code at any time: the server derives the token again from the key. Revoking
deletes the record, so the token stops matching even though it can still be
derived. Tokens are never logged; only the link id and name are.
"""

from __future__ import annotations

import base64
import builtins
import hashlib
import hmac
import json
import os
import secrets
import threading
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from loguru import logger

from app.utils.photo_folders import InvalidFolder, normalize_folder

__all__ = [
    "DuplicateLinkName",
    "InvalidFolder",
    "ShareLinkStore",
    "get_share_link_store",
    "normalize_folder",
]

MAX_NAME_LEN = 40
LAST_USED_INTERVAL = 60  # seconds between last_used_at writes from page loads
_KEY_BYTES = 32
_FILE_VERSION = 1


class DuplicateLinkName(ValueError):  # noqa: N818 - mirrors DuplicateKeyName
    """A link with this name (case-insensitive) already exists."""


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _iso(epoch: int | float) -> str:
    return datetime.fromtimestamp(epoch, UTC).isoformat().replace("+00:00", "Z")


def _public(entry: dict[str, Any], now: float) -> dict[str, Any]:
    """The shape the admin API returns: never the hash, never the uploads' devices."""
    last_used = entry.get("last_used_at")
    expires = entry.get("expires_at")
    return {
        "id": entry["id"],
        "name": entry["name"],
        "folder": entry["folder"],
        "createdAt": _iso(entry["created_at"]),
        "lastUsedAt": _iso(last_used) if last_used is not None else None,
        "expiresAt": _iso(expires) if expires is not None else None,
        "expired": expires is not None and now >= expires,
        "uploadCount": len(entry.get("uploads", [])),
    }


def _public_upload(upload: dict[str, Any]) -> dict[str, Any]:
    return {
        "imageId": upload["image_id"],
        "path": upload["path"],
        "uploadedAt": _iso(upload["uploaded_at"]),
    }


class ShareLinkStore:
    """Reads the file on demand, so revoking takes effect on the very next request."""

    def __init__(self, path: Path):
        self.path = Path(path)
        self.key_path = self.path.with_name("share-links.key")
        self._lock = threading.Lock()

    # -- files -----------------------------------------------------------

    def _write_private(self, path: Path, payload: str) -> None:
        """Write atomically (temp file in the same dir + ``os.replace``), mode 0600."""
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = path.with_name(f".{path.name}.{secrets.token_hex(8)}.tmp")
        fd = os.open(tmp_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(fd, "w") as handle:
                handle.write(payload)
            os.chmod(tmp_path, 0o600)
            os.replace(tmp_path, path)
        except BaseException:
            tmp_path.unlink(missing_ok=True)
            raise
        os.chmod(path, 0o600)

    def _key(self) -> bytes:
        try:
            return bytes.fromhex(self.key_path.read_text().strip())
        except FileNotFoundError:
            pass
        except (OSError, ValueError) as exc:
            logger.error(f"Unreadable share link key {self.key_path}: {exc}")
            raise
        key = secrets.token_bytes(_KEY_BYTES)
        self._write_private(self.key_path, key.hex())
        return key

    def _load(self) -> list[dict[str, Any]]:
        try:
            raw = self.path.read_text()
        except FileNotFoundError:
            return []
        except OSError as exc:
            logger.error(f"Could not read share link file {self.path}: {exc}")
            return []
        try:
            data = json.loads(raw)
            links = data["links"]
            if not isinstance(links, list):
                raise ValueError("links is not a list")
            for entry in links:
                entry["id"], entry["name"], entry["folder"], entry["hash"]  # noqa: B018
                float(entry["created_at"])
                if not isinstance(entry.setdefault("uploads", []), list):
                    raise ValueError("uploads is not a list")
        except (ValueError, KeyError, TypeError) as exc:
            logger.error(f"Corrupt share link file {self.path}: {exc}")
            return []
        return links

    def _write(self, links: list[dict[str, Any]]) -> None:
        self._write_private(self.path, json.dumps({"version": _FILE_VERSION, "links": links}))

    # -- tokens ----------------------------------------------------------

    def _derive(self, link_id: str) -> str:
        mac = hmac.new(self._key(), link_id.encode(), hashlib.sha256).digest()
        return f"{link_id}.{base64.urlsafe_b64encode(mac).rstrip(b'=').decode()}"

    def token_for(self, link_id: str) -> str | None:
        """The token of an existing link (to re-show its URL/QR), else ``None``."""
        if not any(entry["id"] == link_id for entry in self._load()):
            return None
        return self._derive(link_id)

    def authenticate(self, token: str, now: float | None = None) -> dict[str, Any] | None:
        """The link record for a valid, unexpired token, else ``None``."""
        if not token or "." not in token:
            return None
        current = time.time() if now is None else now
        candidate = _hash(token)
        match = None
        for entry in self._load():
            # No early exit: every stored hash is compared.
            if hmac.compare_digest(candidate, entry["hash"]):
                match = entry
        if match is None:
            return None
        expires = match.get("expires_at")
        if expires is not None and current >= expires:
            return None
        return _public(match, current)

    # -- management ------------------------------------------------------

    def list(self, now: float | None = None) -> builtins.list[dict[str, Any]]:
        current = time.time() if now is None else now
        entries = sorted(self._load(), key=lambda e: e["created_at"], reverse=True)
        return [_public(entry, current) for entry in entries]

    def get(self, link_id: str, now: float | None = None) -> dict[str, Any] | None:
        current = time.time() if now is None else now
        for entry in self._load():
            if entry["id"] == link_id:
                return _public(entry, current)
        return None

    def create(
        self,
        name: str,
        folder: str,
        expires_at: float | None = None,
        now: float | None = None,
    ) -> tuple[dict[str, Any], str]:
        """Mint a link. Returns ``(public record, token)``."""
        created = time.time() if now is None else now
        folder = normalize_folder(folder)
        if expires_at is not None and expires_at <= created:
            raise ValueError("expires_at must be in the future")
        with self._lock:
            links = self._load()
            if any(entry["name"].casefold() == name.casefold() for entry in links):
                raise DuplicateLinkName(name)
            link_id = secrets.token_hex(8)
            token = self._derive(link_id)
            entry = {
                "id": link_id,
                "name": name,
                "folder": folder,
                "hash": _hash(token),
                "created_at": created,
                "expires_at": expires_at,
                "last_used_at": None,
                "uploads": [],
            }
            links.append(entry)
            self._write(links)
        return _public(entry, created), token

    def rename(self, link_id: str, name: str) -> dict[str, Any] | None:
        with self._lock:
            links = self._load()
            target = next((entry for entry in links if entry["id"] == link_id), None)
            if target is None:
                return None
            if any(
                entry["id"] != link_id and entry["name"].casefold() == name.casefold()
                for entry in links
            ):
                raise DuplicateLinkName(name)
            target["name"] = name
            self._write(links)
        return _public(target, time.time())

    def revoke(self, link_id: str) -> dict[str, Any] | None:
        """Delete the link. Returns its record plus ``uploads`` (for optional cleanup)."""
        with self._lock:
            links = self._load()
            target = next((entry for entry in links if entry["id"] == link_id), None)
            if target is None:
                return None
            self._write([entry for entry in links if entry["id"] != link_id])
        record = _public(target, time.time())
        record["uploads"] = [_public_upload(upload) for upload in target["uploads"]]
        return record

    # -- uploads ---------------------------------------------------------

    def record_upload(
        self,
        link_id: str,
        path: str,
        image_id: str,
        device: str,
        now: float | None = None,
    ) -> None:
        current = time.time() if now is None else now
        with self._lock:
            links = self._load()
            for entry in links:
                if entry["id"] == link_id:
                    entry["uploads"].append(
                        {
                            "path": path,
                            "image_id": image_id,
                            "device": _hash(device),
                            "uploaded_at": current,
                        }
                    )
                    entry["last_used_at"] = current
                    self._write(links)
                    return

    def uploads_for(self, link_id: str, device: str) -> builtins.list[dict[str, Any]]:
        """This device's uploads through this link, newest first."""
        device_hash = _hash(device)
        for entry in self._load():
            if entry["id"] == link_id:
                mine = [u for u in entry["uploads"] if u["device"] == device_hash]
                mine.sort(key=lambda u: u["uploaded_at"], reverse=True)
                return [_public_upload(upload) for upload in mine]
        return []

    def remove_upload(self, link_id: str, image_id: str, device: str) -> dict[str, Any] | None:
        """Forget one of this device's uploads; returns it so the caller deletes the file."""
        device_hash = _hash(device)
        with self._lock:
            links = self._load()
            for entry in links:
                if entry["id"] != link_id:
                    continue
                for upload in entry["uploads"]:
                    if upload["image_id"] == image_id and upload["device"] == device_hash:
                        entry["uploads"].remove(upload)
                        self._write(links)
                        return _public_upload(upload)
        return None

    def touch(self, link_id: str, now: float | None = None) -> None:
        """Note a page load as use, at most once a minute per link."""
        current = time.time() if now is None else now
        with self._lock:
            links = self._load()
            for entry in links:
                if entry["id"] == link_id:
                    last = entry.get("last_used_at")
                    if last is None or current - last >= LAST_USED_INTERVAL:
                        entry["last_used_at"] = current
                        self._write(links)
                    return


_store: ShareLinkStore | None = None


def get_share_link_store() -> ShareLinkStore:
    """Process-wide store next to ``settings.admin_auth_path`` (re-read per call)."""
    global _store
    from app.config import settings

    path = Path(settings.admin_auth_path).with_name("share-links.json")
    if _store is None or _store.path != path:
        _store = ShareLinkStore(path)
    return _store
