"""Security settings endpoints: the admin trusted-origin allowlist."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.config_service import config_service
from app.services.csp import validate_origin

router = APIRouter()

_CONFIG_KEY = "security_allowed_origins"


class AllowedOriginsBody(BaseModel):
    origins: list[str]


@router.get("/security/allowed-origins")
async def get_allowed_origins():
    """Return the configured trusted origins."""
    stored = await config_service.get_value(_CONFIG_KEY, [])
    return {"origins": stored if isinstance(stored, list) else []}


@router.put("/security/allowed-origins")
async def put_allowed_origins(body: AllowedOriginsBody):
    """Validate + replace the trusted-origin allowlist (all-or-nothing)."""
    normalized: list[str] = []
    for entry in body.origins:
        try:
            origin = validate_origin(entry)
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=422, detail=f"Invalid origin '{entry}': {exc}")
        if origin not in normalized:
            normalized.append(origin)
    await config_service.set_value(_CONFIG_KEY, normalized, value_type="json")
    return {"origins": normalized}


_SEALED_KEY = "sealed_mode"


class SealedModeBody(BaseModel):
    model_config = {"strict": True}
    sealed_mode: bool


@router.get("/security/sealed-mode")
async def get_sealed_mode_setting():
    """Return whether sealed mode (self-only CSP lockdown) is on."""
    stored = await config_service.get_value(_SEALED_KEY, False)
    return {"sealed_mode": bool(stored)}


@router.put("/security/sealed-mode")
async def put_sealed_mode_setting(body: SealedModeBody):
    """Enable or disable sealed mode."""
    await config_service.set_value(_SEALED_KEY, body.sealed_mode, value_type="bool")
    return {"sealed_mode": body.sealed_mode}
