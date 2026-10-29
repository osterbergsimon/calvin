"""One-call security installation shared by ``app.main`` and the test app (CLV-9).

The pieces land incrementally (route policy in Task 3, auth router in Task 4,
Host/Origin middleware in Task 5); callers only ever call this function.
"""

from fastapi import FastAPI
from loguru import logger


def apply_startup_admin_password() -> None:
    """Apply ``CALVIN_ADMIN_PASSWORD``, without bumping for an unchanged value."""
    from app.config import settings
    from app.security.admin_auth import PasswordTooShort, get_admin_store

    if not settings.admin_password:
        return
    try:
        get_admin_store().apply_env_password(settings.admin_password)
    except PasswordTooShort:
        logger.error("CALVIN_ADMIN_PASSWORD is shorter than 8 characters; ignoring it")
        return
    logger.info("Admin password set from CALVIN_ADMIN_PASSWORD")


def install_security(app: FastAPI) -> None:
    """Install the admin-auth pieces on ``app``."""
    from app.api.routes.auth import router as auth_router
    from app.security.host_origin import HostOriginMiddleware

    app.add_middleware(HostOriginMiddleware)
    app.include_router(auth_router, prefix="/api", tags=["auth"])
