"""Initial Ormar schema

Revision ID: 7b0d79d6ae0c
Revises:
Create Date: 2026-01-17 15:15:57.650722

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7b0d79d6ae0c"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create initial schema for Ormar models."""
    op.create_table(
        "config",
        sa.Column("key", sa.String(length=255), nullable=False),
        sa.Column("value", sa.Text(), nullable=True),
        sa.Column("value_type", sa.String(length=50), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )
    op.create_index(op.f("ix_config_key"), "config", ["key"], unique=False)
    op.create_table(
        "keyboard_mappings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("keyboard_type", sa.String(length=50), nullable=False),
        sa.Column("key_code", sa.String(length=100), nullable=False),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "plugin_types",
        sa.Column("type_id", sa.String(length=255), nullable=False),
        sa.Column("plugin_type", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("version", sa.String(length=50), nullable=True),
        sa.Column("common_config_schema", sa.JSON(none_as_null=True), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("type_id"),
    )
    op.create_index(op.f("ix_plugin_types_type_id"), "plugin_types", ["type_id"], unique=False)
    op.create_table(
        "plugins",
        sa.Column("id", sa.String(length=255), nullable=False),
        sa.Column("type_id", sa.String(length=255), nullable=False),
        sa.Column("plugin_type", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("version", sa.String(length=50), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("config", sa.JSON(none_as_null=True), nullable=True),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_plugins_id"), "plugins", ["id"], unique=False)
    op.create_index(op.f("ix_plugins_plugin_type"), "plugins", ["plugin_type"], unique=False)
    op.create_index(op.f("ix_plugins_type_id"), "plugins", ["type_id"], unique=False)


def downgrade() -> None:
    """Drop all tables."""
    op.drop_index(op.f("ix_plugins_type_id"), table_name="plugins")
    op.drop_index(op.f("ix_plugins_plugin_type"), table_name="plugins")
    op.drop_index(op.f("ix_plugins_id"), table_name="plugins")
    op.drop_table("plugins")
    op.drop_index(op.f("ix_plugin_types_type_id"), table_name="plugin_types")
    op.drop_table("plugin_types")
    op.drop_table("keyboard_mappings")
    op.drop_index(op.f("ix_config_key"), table_name="config")
    op.drop_table("config")
