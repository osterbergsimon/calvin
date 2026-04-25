"""Theme helper functions for plugin management."""

import json
import logging
from pathlib import Path
from typing import Any

from app.models.db_models import PluginTypeDB
from app.plugins.base import PluginType

logger = logging.getLogger(__name__)


def _load_builtin_themes() -> dict[str, Any]:
    """Load built-in themes from JSON file."""
    # Path: backend/app/api/routes/plugins/themes.py -> backend/data/themes/builtin.json
    # __file__ is at backend/app/api/routes/plugins/themes.py
    # .parent = backend/app/api/routes/plugins/
    # .parent.parent = backend/app/api/routes/
    # .parent.parent.parent = backend/app/api/
    # .parent.parent.parent.parent = backend/app/
    # .parent.parent.parent.parent.parent = backend/
    backend_dir = Path(__file__).parent.parent.parent.parent.parent
    themes_file = backend_dir / "data" / "themes" / "builtin.json"

    # Try alternative path if first doesn't work (for when running from different locations)
    if not themes_file.exists():
        # Try relative to current working directory
        cwd_themes = Path.cwd() / "data" / "themes" / "builtin.json"
        if cwd_themes.exists():
            themes_file = cwd_themes
        else:
            logger.warning(
                f"Built-in themes file not found at {themes_file} or {cwd_themes}, "
                "using empty themes"
            )
            return {}

    try:
        with open(themes_file, encoding="utf-8") as f:
            themes = json.load(f)
            # Ensure is_builtin is True for all loaded themes
            for theme_id, theme_data in themes.items():
                theme_data["is_builtin"] = True
            return themes
    except (json.JSONDecodeError, Exception) as e:
        logger.error(f"Failed to load built-in themes from {themes_file}: {e}")
        return {}


# Built-in themes (loaded from JSON file)
BUILTIN_THEMES = _load_builtin_themes()


async def _register_theme_in_db(manifest: dict[str, Any]) -> None:
    """
    Register a theme in PluginTypeDB (like other plugins).

    Args:
        manifest: Theme manifest dictionary
    """
    theme_id = manifest.get("id")
    if not theme_id:
        return

    db_type = await PluginTypeDB.objects.get_or_none(type_id=theme_id)

    if not db_type:
        # Create new theme entry in database
        await PluginTypeDB.objects.create(
            type_id=theme_id,
            plugin_type=PluginType.THEME.value,
            name=manifest.get("name", theme_id),
            description=manifest.get("description"),
            version=manifest.get("version", "1.0.0"),
            common_config_schema={},  # Themes don't have config schemas
            enabled=True,  # Themes are enabled by default
            error_message=None,
        )
    else:
        # Update existing theme entry
        db_type.name = manifest.get("name", theme_id)
        db_type.description = manifest.get("description")
        db_type.version = manifest.get("version", "1.0.0")
        db_type.plugin_type = PluginType.THEME.value
        db_type.error_message = None
        await db_type.save_with_timestamp()


async def _unregister_theme_from_db(theme_id: str) -> None:
    """
    Remove a theme from PluginTypeDB.

    Args:
        theme_id: Theme identifier
    """
    db_type = await PluginTypeDB.objects.get_or_none(type_id=theme_id)

    if db_type and db_type.plugin_type == PluginType.THEME.value:
        await db_type.delete()
