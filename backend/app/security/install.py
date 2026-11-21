"""One-call security installation shared by ``app.main`` and the test app (CLV-9).

The pieces land incrementally (route policy in Task 3, auth router in Task 4,
Host/Origin middleware in Task 5); callers only ever call this function.
"""

import logging
import re
from typing import Any

from fastapi import FastAPI
from loguru import logger


def apply_startup_admin_password() -> None:
    """Apply ``CALVIN_ADMIN_PASSWORD`` and log the one-time setup code (CLV-61)."""
    from app.config import settings
    from app.security.admin_auth import PasswordTooShort, get_admin_store
    from app.security.setup_code import announce_setup_code

    if settings.admin_password:
        try:
            get_admin_store().apply_env_password(settings.admin_password)
        except PasswordTooShort:
            logger.error("CALVIN_ADMIN_PASSWORD is shorter than 8 characters; ignoring it")
        else:
            logger.info("Admin password set from CALVIN_ADMIN_PASSWORD")
    # Never leaves the code in the log once a password exists (announce clears it).
    announce_setup_code()


# A share-link token is the path segment after /share/ or /api/guest/
# (calvin-mwqo); it must never reach a log line. Neither must a one-time
# pending-claim id carried as ``claim=`` after a share target redirect.
SHARE_PATH_PATTERN = re.compile(r"(/share/|/api/guest/)[^/?#\s\"']+")
CLAIM_QUERY_PATTERN = re.compile(r"(?<![A-Za-z0-9_-])claim=[^&#\s\"']+")


def redact_share_tokens(text: str) -> str:
    return CLAIM_QUERY_PATTERN.sub(
        "claim=[redacted]", SHARE_PATH_PATTERN.sub(r"\1[redacted]", text)
    )


def redact_log_text(text: str) -> str:
    """Redact share tokens and anything shaped like a Calvin secret.

    The uvicorn access log has its own non-propagating handler, so it never
    passes through loguru's patcher; this is the one helper both paths use. It
    covers a ``clv_pair_`` install code in ``?pair=`` and a ``clv_kiosk_``
    secret alike (calvin-0xns).
    """
    from app.security.api_keys import SECRET_PATTERN

    return redact_share_tokens(SECRET_PATTERN.sub("clv_[redacted]", text))


class ShareTokenRedactor(logging.Filter):
    """stdlib filter for uvicorn's access log, which logs every request path."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.args, tuple):
            record.args = tuple(
                redact_log_text(arg) if isinstance(arg, str) else arg for arg in record.args
            )
        if isinstance(record.msg, str):
            record.msg = redact_log_text(record.msg)
        return True


def redact_secrets(record: Any) -> None:
    """Loguru patcher: blank anything shaped like an API key or share token in every log line."""
    record["message"] = redact_log_text(record["message"])


def install_security(app: FastAPI) -> None:
    """Install the admin-auth pieces on ``app``."""
    logger.configure(patcher=redact_secrets)
    access_log = logging.getLogger("uvicorn.access")
    if not any(isinstance(f, ShareTokenRedactor) for f in access_log.filters):
        access_log.addFilter(ShareTokenRedactor())
    from app.api.routes.auth import router as auth_router
    from app.security.guest_gate import GuestGateMiddleware
    from app.security.host_origin import HostOriginMiddleware

    # Added first, so it runs inside the Host/Origin check (the last added
    # middleware is the outermost one).
    app.add_middleware(GuestGateMiddleware)
    app.add_middleware(HostOriginMiddleware)
    app.include_router(auth_router, prefix="/api", tags=["auth"])
