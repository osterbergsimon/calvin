"""Add plugin type display order

Revision ID: 1b2c3d4e5f6a
Revises: 7b0d79d6ae0c
Create Date: 2026-04-26 00:00:00.000000

"""

import json
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "1b2c3d4e5f6a"
down_revision: str | Sequence[str] | None = "7b0d79d6ae0c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

APP_MANAGED_CONFIG_FIELD_KEYS = {
    "common_config_schema",
    "config",
    "created_at",
    "display_order",
    "display_schema",
    "enabled",
    "id",
    "instance_config_schema",
    "instance_label",
    "name",
    "plugin_id",
    "plugin_type",
    "running",
    "statusbar_schema",
    "supports_multiple_instances",
    "type",
    "type_id",
    "ui_actions",
    "ui_sections",
    "updated_at",
}


def _load_schema(raw: object) -> dict:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw:
        try:
            loaded = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        return loaded if isinstance(loaded, dict) else {}
    return {}


def _parse_display_order(value: object) -> int:
    if isinstance(value, dict):
        value = value.get("value", value.get("default", 0))
    try:
        return int(value) if value not in (None, "") else 0
    except (TypeError, ValueError):
        return 0


def upgrade() -> None:
    """Move plugin type display_order out of common_config_schema."""
    op.add_column(
        "plugin_types",
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
    )

    connection = op.get_bind()
    rows = connection.execute(
        sa.text("SELECT type_id, common_config_schema FROM plugin_types")
    ).mappings()

    for row in rows:
        schema = _load_schema(row["common_config_schema"])
        display_order = _parse_display_order(schema.get("display_order", 0))
        cleaned_schema = {
            key: value for key, value in schema.items() if key not in APP_MANAGED_CONFIG_FIELD_KEYS
        }
        connection.execute(
            sa.text(
                "UPDATE plugin_types "
                "SET display_order = :display_order, common_config_schema = :schema "
                "WHERE type_id = :type_id"
            ),
            {
                "type_id": row["type_id"],
                "display_order": display_order,
                "schema": json.dumps(cleaned_schema),
            },
        )


def downgrade() -> None:
    """Move display_order back into common_config_schema before dropping the column."""
    connection = op.get_bind()
    rows = connection.execute(
        sa.text("SELECT type_id, display_order, common_config_schema FROM plugin_types")
    ).mappings()

    for row in rows:
        schema = _load_schema(row["common_config_schema"])
        schema["display_order"] = row["display_order"] or 0
        connection.execute(
            sa.text(
                "UPDATE plugin_types SET common_config_schema = :schema WHERE type_id = :type_id"
            ),
            {"type_id": row["type_id"], "schema": json.dumps(schema)},
        )

    op.drop_column("plugin_types", "display_order")
