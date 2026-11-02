"""Secret config values: which keys are secret, and keeping them server-side.

Secret values are never sent to the frontend. Responses carry ``""`` for a
secret plus a ``has_value`` flag, and an update that sends a secret back empty,
null or in the legacy ``x***y`` masked form keeps the stored value
(audit S4, calvin-ua2).
"""

import re
from typing import Any

# Used only when a key has no schema entry (unknown plugin, legacy rows).
SECRET_KEY_NAMES = frozenset(
    {
        "email_password",
        "password",
        "api_key",
        "api_token",
        "secret",
        "token",
        "access_token",
        "refresh_token",
        "client_secret",
        "ical_url",
    }
)

# Fields naming where a secret is sent. A stored secret is only reused while
# these are unchanged, else one request could make Calvin send it to any host.
_ENDPOINT_KEY_RE = re.compile(r"(url|uri|host|server|endpoint|domain|port)", re.IGNORECASE)

# The old masking produced "***" or first char + "***" + last char.
_MASKED_RE = re.compile(r"^.?\*{3}.?$", re.DOTALL)


def is_secret_field(schema_entry: Any) -> bool:
    """True if a config schema entry declares a password/secret field."""
    if not isinstance(schema_entry, dict):
        return False
    ui = schema_entry.get("ui")
    return schema_entry.get("type") == "password" or (
        isinstance(ui, dict) and ui.get("component") == "password"
    )


def secret_keys(schema: dict[str, Any] | None, config: dict[str, Any] | None = None) -> set[str]:
    """
    Secret keys for a config: schema ``password`` fields, plus config keys the
    schema doesn't describe whose name is a well-known secret name.
    """
    schema = schema or {}
    keys = {key for key, entry in schema.items() if is_secret_field(entry)}
    keys.update(
        key for key in (config or {}) if key not in schema and key.lower() in SECRET_KEY_NAMES
    )
    return keys


def _type_schema(type_id: str) -> dict[str, Any]:
    from app.plugins.loader import plugin_loader

    cls = plugin_loader.get_plugin_class(type_id)
    metadata = getattr(cls, "metadata", None)
    schema: dict[str, Any] = {}
    if metadata is not None:
        schema.update(getattr(metadata, "common_config_schema", None) or {})
        schema.update(getattr(metadata, "instance_config_schema", None) or {})
    return schema


def secret_keys_for_type(type_id: str, config: dict[str, Any] | None = None) -> set[str]:
    """Secret keys for a plugin type's instance and common config."""
    return secret_keys(_type_schema(type_id), config)


def endpoint_keys(schema: dict[str, Any] | None, config: dict[str, Any] | None = None) -> set[str]:
    """Keys that say where a secret goes: url/host/server/port-like names, or url-typed fields."""
    keys = {key for key in (config or {}) if _ENDPOINT_KEY_RE.search(key)}
    for key, entry in (schema or {}).items():
        if not isinstance(entry, dict):
            continue
        ui = entry.get("ui")
        ui = ui if isinstance(ui, dict) else {}
        validation = ui.get("validation")
        validation = validation if isinstance(validation, dict) else {}
        if _ENDPOINT_KEY_RE.search(key) or "url" in (entry.get("type"), validation.get("type")):
            keys.add(key)
    return keys


def endpoint_keys_for_type(type_id: str, config: dict[str, Any] | None = None) -> set[str]:
    """Endpoint keys for a plugin type's instance and common config."""
    return endpoint_keys(_type_schema(type_id), config)


class SecretEndpointChangedError(ValueError):
    """A stored secret was about to be reused for a different endpoint."""


def check_secret_endpoint(
    incoming: dict[str, Any],
    stored: dict[str, Any],
    secrets: set[str],
    endpoints: set[str],
) -> None:
    """
    Refuse to keep a stored secret (sent back blank/masked) when the same
    request changes an endpoint field: the caller must re-enter the secret.

    Raises:
        SecretEndpointChangedError: naming the secret and endpoint keys involved
    """
    # A secret is kept when it is stored and the request doesn't replace it
    # (absent, blank or masked).
    kept = sorted(
        key
        for key in secrets
        if stored.get(key) and (key not in incoming or is_unchanged_secret(incoming[key]))
    )
    if not kept:
        return
    changed = sorted(
        key
        for key in endpoints
        if key in incoming
        and not is_unchanged_secret(incoming[key])
        and str(incoming[key]).strip()
        != str(stored.get(key) if stored.get(key) is not None else "").strip()
    )
    if changed:
        raise SecretEndpointChangedError(
            f"Re-enter {', '.join(kept)}: the stored value is not reused when "
            f"{', '.join(changed)} changes"
        )


def is_unchanged_secret(value: Any) -> bool:
    """True for a value that means "keep the stored secret"."""
    if value is None:
        return True
    if not isinstance(value, str):
        return False
    return value.strip() == "" or bool(_MASKED_RE.match(value))


def redact_secrets(
    config: dict[str, Any], keys: set[str]
) -> tuple[dict[str, Any], dict[str, bool]]:
    """
    Blank the secret values in a config for a response.

    Returns:
        (config with secrets set to ``""``, ``{secret_key: has_value}``)
    """
    redacted = dict(config)
    has_value: dict[str, bool] = {}
    for key in keys:
        if key in redacted:
            has_value[key] = not is_unchanged_secret(redacted[key])
            redacted[key] = ""
    return redacted, has_value


def drop_unchanged_secrets(incoming: dict[str, Any], keys: set[str]) -> dict[str, Any]:
    """Remove secrets sent back empty, null or masked so they don't overwrite."""
    return {
        key: value
        for key, value in incoming.items()
        if not (key in keys and is_unchanged_secret(value))
    }


def keep_stored_secrets(
    incoming: dict[str, Any], stored: dict[str, Any], keys: set[str]
) -> dict[str, Any]:
    """Fill secrets sent back empty, null or masked from the stored config."""
    merged = dict(incoming)
    for key in keys:
        if key in merged and is_unchanged_secret(merged[key]) and key in stored:
            merged[key] = stored[key]
    return merged
