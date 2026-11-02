"""Find, strip and refill secret values in plugin configs."""

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


def _strip_value(value: Any, prefix: str) -> tuple[Any, list[str]]:
    if isinstance(value, dict):
        return strip_secrets(value, None, prefix)
    if isinstance(value, list):
        items, fields = [], []
        for i, item in enumerate(value):
            clean, nested = _strip_value(item, f"{prefix}{i}.")
            items.append(clean)
            fields.extend(nested)
        return items, fields
    return value, []


def strip_secrets(
    config: dict[str, Any], schema: dict[str, Any] | None = None, _prefix: str = ""
) -> tuple[dict[str, Any], list[str]]:
    """Return a copy of ``config`` with secret values blanked, and their dotted paths."""
    stripped: dict[str, Any] = {}
    fields: list[str] = []
    for key, value in config.items():
        if is_secret_key(key, schema if not _prefix else None):
            stripped[key] = ""
            if value not in (None, ""):
                fields.append(f"{_prefix}{key}")
        else:
            stripped[key], nested = _strip_value(value, f"{_prefix}{key}.")
            fields.extend(nested)
    return stripped, fields


def _step(container: Any, part: str) -> Any:
    if isinstance(container, dict):
        return container.get(part)
    if isinstance(container, list) and part.isdigit() and int(part) < len(container):
        return container[int(part)]
    return None


def refill_secrets(
    config: dict[str, Any], current: dict[str, Any] | None, paths: set[str]
) -> tuple[dict[str, Any], set[str]]:
    """Put the values at ``paths`` back from ``current`` where it has them.

    Returns the refilled config (a copy) and the paths still without a value.
    """
    import copy

    config = copy.deepcopy(config)
    missing: set[str] = set()
    for path in paths:
        parts = path.split(".")
        value: Any = current or {}
        for part in parts:
            value = _step(value, part)
        target: Any = config
        for part in parts[:-1]:
            target = _step(target, part)
        if value in (None, "") or target is None:
            missing.add(path)
            continue
        last = parts[-1]
        if isinstance(target, dict):
            target[last] = value
        elif isinstance(target, list) and last.isdigit() and int(last) < len(target):
            target[int(last)] = value
        else:
            missing.add(path)
    return config, missing
