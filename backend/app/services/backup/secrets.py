"""Find and strip secret values in plugin configs."""

from typing import Any

from app.api.routes.plugins.config import SENSITIVE_FIELDS

_SENSITIVE = [f.lower() for f in SENSITIVE_FIELDS]


def is_secret_key(key: str, schema: dict[str, Any] | None = None) -> bool:
    """Same name rule as mask_sensitive_config, plus schema password fields."""
    field = (schema or {}).get(key)
    if isinstance(field, dict) and field.get("type") == "password":
        return True
    lowered = key.lower()
    return any(s in lowered for s in _SENSITIVE)


def strip_secrets(
    config: dict[str, Any], schema: dict[str, Any] | None = None, _prefix: str = ""
) -> tuple[dict[str, Any], list[str]]:
    """Return a copy of ``config`` with secret values blanked, and the dotted field names."""
    stripped: dict[str, Any] = {}
    fields: list[str] = []
    for key, value in config.items():
        if is_secret_key(key, schema if not _prefix else None):
            stripped[key] = ""
            if value not in (None, ""):
                fields.append(f"{_prefix}{key}")
        elif isinstance(value, dict):
            stripped[key], nested = strip_secrets(value, None, f"{_prefix}{key}.")
            fields.extend(nested)
        else:
            stripped[key] = value
    return stripped, fields
