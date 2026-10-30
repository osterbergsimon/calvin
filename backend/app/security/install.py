"""One-call security installation shared by ``app.main`` and the test app (CLV-9).

The pieces land incrementally (route policy in Task 3, auth router in Task 4,
Host/Origin middleware in Task 5); callers only ever call this function.
"""

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


def redact_secrets(record: Any) -> None:
    """Loguru patcher: blank anything shaped like an API key in every log line."""
    from app.security.api_keys import SECRET_PATTERN

    record["message"] = SECRET_PATTERN.sub("clv_[redacted]", record["message"])


def install_security(app: FastAPI) -> None:
    """Install the admin-auth pieces on ``app``."""
    logger.configure(patcher=redact_secrets)
    from app.api.routes.auth import router as auth_router
    from app.security.host_origin import HostOriginMiddleware

    app.add_middleware(HostOriginMiddleware)
    app.include_router(auth_router, prefix="/api", tags=["auth"])
