"""Ensure built-in themes are registered

Revision ID: 747053ae503f
Revises: 9e9bc098186d
Create Date: 2026-01-06 15:49:06.380318

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "747053ae503f"
down_revision: str | Sequence[str] | None = "9e9bc098186d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Register all built-in themes in plugin_types table."""
    import json
    from datetime import datetime
    from pathlib import Path

    # Load built-in themes from JSON file
    # Path: backend/alembic/versions -> backend/data/themes/builtin.json
    backend_dir = Path(__file__).parent.parent.parent.parent
    themes_file = backend_dir / "data" / "themes" / "builtin.json"

    if not themes_file.exists():
        print("Warning: Built-in themes file not found, skipping theme registration")
        return

    try:
        with open(themes_file, encoding="utf-8") as f:
            themes = json.load(f)
    except (json.JSONDecodeError, Exception) as e:
        print(f"Warning: Failed to load built-in themes: {e}")
        return

    # Get connection for data operations
    connection = op.get_bind()

    # Register each built-in theme
    for theme_id, theme_data in themes.items():
        theme_name = theme_data.get("name", theme_id)
        theme_description = theme_data.get("description", "")
        theme_version = theme_data.get("version", "1.0.0")

        # Check if theme already exists
        result = connection.execute(
            sa.text("SELECT type_id FROM plugin_types WHERE type_id = :theme_id"),
            {"theme_id": theme_id},
        )
        existing = result.fetchone()

        now = datetime.utcnow().isoformat()

        if existing:
            # Update existing theme to ensure it's correct
            connection.execute(
                sa.text("""
                    UPDATE plugin_types
                    SET plugin_type = :plugin_type, name = :name, description = :description,
                        version = :version, enabled = :enabled, error_message = NULL,
                        updated_at = :updated_at
                    WHERE type_id = :theme_id
                """),
                {
                    "plugin_type": "theme",
                    "name": theme_name,
                    "description": theme_description,
                    "version": theme_version,
                    "enabled": True,
                    "theme_id": theme_id,
                    "updated_at": now,
                },
            )
        else:
            # Insert new theme
            connection.execute(
                sa.text("""
                    INSERT INTO plugin_types (
                        type_id, plugin_type, name, description, version,
                        common_config_schema, enabled, error_message,
                        created_at, updated_at
                    )
                    VALUES (
                        :theme_id, :plugin_type, :name, :description, :version,
                        :common_config_schema, :enabled, :error_message,
                        :created_at, :updated_at
                    )
                """),
                {
                    "theme_id": theme_id,
                    "plugin_type": "theme",
                    "name": theme_name,
                    "description": theme_description,
                    "version": theme_version,
                    "common_config_schema": "{}",  # Themes don't have config schemas
                    "enabled": True,
                    "error_message": None,
                    "created_at": now,
                    "updated_at": now,
                },
            )

    connection.commit()
    print(f"Registered {len(themes)} built-in themes in database")


def downgrade() -> None:
    """Remove built-in themes from plugin_types table."""
    import json
    from pathlib import Path

    # Load built-in themes to know which ones to remove
    backend_dir = Path(__file__).parent.parent.parent.parent
    themes_file = backend_dir / "data" / "themes" / "builtin.json"

    if not themes_file.exists():
        return

    try:
        with open(themes_file, encoding="utf-8") as f:
            themes = json.load(f)
    except (json.JSONDecodeError, Exception):
        return

    connection = op.get_bind()

    # Remove built-in themes (only if they're actually built-in)
    for theme_id in themes.keys():
        connection.execute(
            sa.text("DELETE FROM plugin_types WHERE type_id = :theme_id AND plugin_type = 'theme'"),
            {"theme_id": theme_id},
        )

    connection.commit()
