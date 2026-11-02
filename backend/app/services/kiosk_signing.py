"""HMAC-SHA256 signing for the kiosk bundle manifest (calvin-5vw)."""

import hashlib
import hmac
import json
import os
import secrets
from pathlib import Path

from loguru import logger

ALG = "hmac-sha256"


def load_or_create_key(path: Path) -> bytes:
    """Return the 32-byte signing key at ``path``, creating it (0600) if absent."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        raw = path.read_text().strip()
        try:
            return bytes.fromhex(raw)
        except ValueError as exc:
            raise ValueError(f"kiosk signing key at {path} is not valid hex") from exc
    try:
        hex_key = secrets.token_hex(32)
        os.write(fd, hex_key.encode())
    finally:
        os.close(fd)
    logger.info(f"Generated kiosk manifest signing key at {path}")
    return bytes.fromhex(hex_key)


def canonical(manifest: dict) -> bytes:
    """Deterministic bytes for signing: sorted keys, no whitespace."""
    return json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()


def sign(manifest: dict, key: bytes) -> str:
    return hmac.new(key, canonical(manifest), hashlib.sha256).hexdigest()


def verify(manifest_without_sig: dict, signature: str, key: bytes) -> bool:
    return hmac.compare_digest(sign(manifest_without_sig, key), signature)
