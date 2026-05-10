"""Plugin configuration endpoints and utilities."""

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from loguru import logger

from app.plugins.loader import plugin_loader
from app.services.config_service import config_service

router = APIRouter()

# Sensitive fields that should be masked in logs and never sent to frontend
SENSITIVE_FIELDS = {
    "email_password",
    "password",
    "api_key",
    "api_token",
    "secret",
    "token",
    "access_token",
    "refresh_token",
}


def normalize_plugin_config(config: dict[str, Any] | None) -> dict[str, Any]:
    """Normalize plugin config values at the API boundary."""
    normalized: dict[str, Any] = {}

    for key, value in (config or {}).items():
        if isinstance(value, dict):
            normalized[key] = value.get("value", value.get("default", ""))
        elif isinstance(value, Path):
            normalized[key] = str(value)
        elif value is None:
            normalized[key] = ""
        else:
            normalized[key] = str(value)

    return normalized


def normalize_plugin_config_for_frontend(config: dict[str, Any] | None) -> dict[str, Any]:
    """Normalize plugin config values while preserving JSON primitive types."""
    normalized: dict[str, Any] = {}

    for key, value in (config or {}).items():
        if isinstance(value, dict):
            normalized[key] = value.get("value", value.get("default", ""))
        elif isinstance(value, Path):
            normalized[key] = str(value)
        elif value is None:
            normalized[key] = ""
        else:
            normalized[key] = value

    return normalized


def mask_sensitive_config(
    config: dict[str, Any], mask_for_frontend: bool = False
) -> dict[str, Any]:
    """
    Mask sensitive configuration fields.

    Args:
        config: Configuration dictionary
        mask_for_frontend: If True, mask all sensitive fields. If False, only mask in logs.

    Returns:
        Configuration dictionary with sensitive fields masked
    """
    masked: dict[str, Any] = {}
    for key, value in config.items():
        # Check if this key should be masked
        should_mask = key.lower() in [f.lower() for f in SENSITIVE_FIELDS] or any(
            f.lower() in key.lower() for f in SENSITIVE_FIELDS
        )

        if should_mask:
            if mask_for_frontend:
                # For frontend, always mask
                if value:
                    # Mask the value, showing only first and last character if length > 2
                    if len(str(value)) > 2:
                        masked[key] = f"{str(value)[0]}***{str(value)[-1]}"
                    else:
                        masked[key] = "***"
                else:
                    masked[key] = ""
            else:
                # For logs, mask but keep structure
                if value:
                    # Mask the value, showing only first and last character if length > 2
                    if len(str(value)) > 2:
                        masked[key] = f"{str(value)[0]}***{str(value)[-1]}"
                    else:
                        masked[key] = "***"
                else:
                    masked[key] = ""
        else:
            if isinstance(value, dict):
                masked[key] = mask_sensitive_config(value, mask_for_frontend)
            else:
                masked[key] = value
    return masked


@router.get("/plugins/{plugin_id}/config")
async def get_plugin_config(plugin_id: str):
    """Get plugin type common configuration."""
    logger.debug(f"Getting config for plugin {plugin_id}")

    # Get plugin types from pluggy hooks
    plugin_types = plugin_loader.get_plugin_types()
    type_info = next((t for t in plugin_types if t.get("type_id") == plugin_id), None)

    if not type_info:
        raise HTTPException(status_code=404, detail="Plugin type not found")

    # Load actual config values from config service (not schema)
    config_key = f"plugin_{plugin_id}_config"
    config_json = await config_service.get_value(config_key)

    # Mask sensitive fields in raw config before logging
    if config_json:
        try:
            temp_config = json.loads(config_json)
            masked_temp = mask_sensitive_config(temp_config)
            logger.debug(f"Raw config from service: {json.dumps(masked_temp)}")
        except Exception:
            pass

    if config_json:
        try:
            config = normalize_plugin_config_for_frontend(json.loads(config_json))
            masked_parsed = mask_sensitive_config(config)
            logger.debug(f"Parsed config: {masked_parsed}")
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON: {e}")
            config = {}
    else:
        config = {}

    # Also check database common_config_schema for values that might not be in config_service
    # (e.g., display_order which is stored in common_config_schema)
    try:
        from app.models.db_models import PluginTypeDB

        db_type = await PluginTypeDB.objects.get_or_none(type_id=plugin_id)
        if db_type and db_type.common_config_schema:
            # Fall back to per-field defaults declared in common_config_schema for keys
            # that have not been explicitly saved via config_service. The DB stores the
            # *schema entry* (a dict with type/default/ui) rather than the value, so we
            # must extract `default` — passing the schema dict through breaks any
            # frontend renderer that expects a primitive value.
            db_schema = db_type.common_config_schema
            for key, schema_entry in db_schema.items():
                if key in config:
                    continue
                if isinstance(schema_entry, dict):
                    default_value = schema_entry.get("default")
                    declared_type = schema_entry.get("type")
                else:
                    default_value = schema_entry
                    declared_type = None
                if default_value is None:
                    continue
                # Coerce string-valued defaults that should be booleans
                # (legacy plugin metadata sometimes declared "default": "true").
                if declared_type == "boolean" and isinstance(default_value, str):
                    default_value = default_value.strip().lower() == "true"
                config[key] = default_value
    except Exception as e:
        logger.debug(f"Could not load schema from database for {plugin_id}: {e}")
        # Continue with config_service values only

    # Mask sensitive fields before returning
    return mask_sensitive_config(config, mask_for_frontend=True)
