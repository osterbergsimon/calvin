"""One-time setup code that gates the first admin password (CLV-61).

While no admin password is configured, ``POST /api/auth/setup`` needs a code
that only someone with access to the server can read: Calvin writes it to a
``0600`` file next to ``admin-auth.json`` and logs it at startup. A restart
reuses the file's code, and once a password is set the code and its file are
discarded. ``CALVIN_SETUP_CODE`` pre-seeds it for headless installs;
``CALVIN_ADMIN_PASSWORD`` bypasses setup entirely (see ``install.py``).
"""

import hmac
import os
from pathlib import Path

from loguru import logger

# Unambiguous on a kiosk screen and easy to type: no 0/O, 1/I/L.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 8
CODE_FILE_NAME = "setup-code.txt"

_memory_code: str | None = None


def normalize_code(value: str) -> str:
    """Upper-case and drop separators, so ``abcd-efgh`` matches ``ABCDEFGH``."""
    return "".join(character for character in value.upper() if character.isalnum())


def format_code(code: str) -> str:
    """Group the code 4-4 for the log, the kiosk screen and the docs."""
    if len(code) == CODE_LENGTH:
        return f"{code[:4]}-{code[4:]}"
    return code


def setup_code_path() -> Path:
    """The code file sits next to ``admin-auth.json`` (same data dir)."""
    from app.config import settings

    return Path(settings.admin_auth_path).with_name(CODE_FILE_NAME)


def _read_file() -> str | None:
    path = setup_code_path()
    try:
        raw = path.read_text()
    except FileNotFoundError:
        return None
    except OSError as exc:
        logger.error(f"Could not read setup code file {path}: {exc}")
        return None
    code = normalize_code(raw)
    return code or None


def _write_file(code: str) -> None:
    path = setup_code_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            with os.fdopen(fd, "w") as handle:
                handle.write(format_code(code) + "\n")
            os.chmod(path, 0o600)
        except BaseException:
            path.unlink(missing_ok=True)
            raise
    except OSError as exc:
        logger.error(f"Could not write setup code file {path}: {exc}")


def _generate_code() -> str:
    import secrets

    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def invalidate_setup_code() -> None:
    """Forget the code and delete its file (setup is done, or was bypassed)."""
    global _memory_code
    _memory_code = None
    try:
        setup_code_path().unlink(missing_ok=True)
    except OSError as exc:
        logger.error(f"Could not delete setup code file {setup_code_path()}: {exc}")


def ensure_setup_code() -> str | None:
    """Return the active code, creating and persisting one when needed.

    ``None`` when an admin password already exists: setup is closed and there
    is nothing to reveal. ``CALVIN_SETUP_CODE`` always wins while unconfigured,
    so headless installs can pick their own code.
    """
    global _memory_code
    from app.config import settings
    from app.security.admin_auth import get_admin_store

    if get_admin_store().is_configured():
        invalidate_setup_code()
        return None

    preset = normalize_code(settings.setup_code or "")
    if preset:
        if preset != _memory_code:
            _memory_code = preset
            _write_file(preset)
        return _memory_code

    if _memory_code:
        return _memory_code

    stored = _read_file()
    if stored:
        _memory_code = stored
        return stored

    _memory_code = _generate_code()
    _write_file(_memory_code)
    return _memory_code


def current_setup_code() -> str | None:
    """The code that is valid right now, without generating a new one."""
    global _memory_code
    if _memory_code is None:
        _memory_code = _read_file()
    return _memory_code


def verify_setup_code(candidate: str | None) -> bool:
    """Constant-time comparison; separators and case don't matter."""
    expected = current_setup_code()
    if not expected or not candidate:
        return False
    return hmac.compare_digest(normalize_code(candidate), normalize_code(expected))


def announce_setup_code() -> None:
    """Log the one-time code prominently while setup is still open."""
    code = ensure_setup_code()
    if code:
        logger.warning("Calvin setup code: {}", format_code(code))
