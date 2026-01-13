"""Re-register built-in themes if missing

Revision ID: 2e2f87ec8be2
Revises: 25a02026bccc
Create Date: 2026-01-06 17:09:16.733565

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2e2f87ec8be2"
down_revision: str | Sequence[str] | None = "25a02026bccc"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Re-register built-in themes if they're missing from the database."""
    import json
    from datetime import datetime
    from pathlib import Path

    # Load built-in themes from JSON file
    # Path: backend/alembic/versions/ -> backend/data/themes/builtin.json
    # __file__ is at backend/alembic/versions/2e2f87ec8be2_*.py
    # .parent = backend/alembic/versions/
    # .parent.parent = backend/alembic/
    # .parent.parent.parent = backend/
    backend_dir = Path(__file__).parent.parent.parent
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

    # Check if plugin_types table exists
    inspector = sa.inspect(connection)
    existing_tables = inspector.get_table_names()
    if "plugin_types" not in existing_tables:
        print("Warning: plugin_types table does not exist, skipping theme registration")
        return

    # Register each built-in theme (idempotent - safe to run multiple times)
    registered_count = 0
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
                    "common_config_schema": "{}",
                    "enabled": True,
                    "error_message": None,
                    "created_at": now,
                    "updated_at": now,
                },
            )
        registered_count += 1

    connection.commit()
    print(f"Registered {registered_count} built-in themes in database")


def downgrade() -> None:
    """Downgrade schema - this migration is idempotent, downgrade does nothing."""
    # This migration only ensures themes exist, so downgrade is a no-op
    pass
