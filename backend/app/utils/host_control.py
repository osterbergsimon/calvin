"""Guard for actions that act on the machine Calvin runs on (calvin-hhok).

Reboot, systemd restarts, the update script and the X11/Raspberry Pi display
commands all run as the owner of the machine. A dev backend on a desktop must
never do that: logind happily reboots without a polkit prompt for the active
session. ``require_host_control`` refuses the action with a structured 409 when
``CALVIN_HOST_CONTROL`` resolves to off; ``host_control_enabled`` is for the
startup paths (scheduler, orientation sync) that skip instead of answering HTTP.
"""

from fastapi import HTTPException
from loguru import logger

from app.config import settings

HOST_CONTROL_DISABLED_CODE = "host_control_disabled"


def host_control_enabled() -> bool:
    """True when Calvin is allowed to act on its host machine."""
    return bool(settings.host_control)


def require_host_control(action: str) -> None:
    """Refuse a host action unless Calvin owns the machine.

    Raises HTTP 409 with a ``host_control_disabled`` detail the UI can show
    verbatim; the command behind the route is never reached.
    """
    if host_control_enabled():
        return
    if settings.deployment == "docker":
        # A container can never drive its host: the machine Calvin acts on is
        # outside the container, so CALVIN_HOST_CONTROL=1 would be a lie here.
        message = (
            f"{action} is not available in a container deployment. "
            "Calvin in a container cannot control the host machine; "
            "run Calvin natively on the host to enable this."
        )
    else:
        message = (
            f"{action} is disabled on this deployment. "
            "Set CALVIN_HOST_CONTROL=1 if Calvin owns this machine."
        )
    logger.info("Host action blocked (CALVIN_HOST_CONTROL is off): {}", action)
    raise HTTPException(
        status_code=409,
        detail={"code": HOST_CONTROL_DISABLED_CODE, "message": message},
    )
