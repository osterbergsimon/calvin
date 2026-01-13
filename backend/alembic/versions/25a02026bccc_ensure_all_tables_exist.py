"""Ensure all tables exist

Revision ID: 25a02026bccc
Revises: 747053ae503f
Create Date: 2026-01-06 16:51:07.677840

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "25a02026bccc"
down_revision: str | Sequence[str] | None = "747053ae503f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Ensure all required tables exist."""
    # Check which tables exist
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    # Create config table if it doesn't exist
    if "config" not in existing_tables:
        op.create_table(
            "config",
            sa.Column("key", sa.String(), nullable=False),
            sa.Column("value", sa.Text(), nullable=True),
            sa.Column("value_type", sa.String(), nullable=False, server_default="string"),
            sa.PrimaryKeyConstraint("key"),
        )
        op.create_index("ix_config_key", "config", ["key"], unique=False)

    # Create keyboard_mappings table if it doesn't exist
    if "keyboard_mappings" not in existing_tables:
        op.create_table(
            "keyboard_mappings",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("keyboard_type", sa.String(), nullable=False),
            sa.Column("key_code", sa.String(), nullable=False),
            sa.Column("action", sa.String(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )

    # Create plugin_types table if it doesn't exist
    if "plugin_types" not in existing_tables:
        op.create_table(
            "plugin_types",
            sa.Column("type_id", sa.String(), nullable=False),
            sa.Column("plugin_type", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("version", sa.String(), nullable=True),
            sa.Column("common_config_schema", sa.String(), nullable=True),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default="1"),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("type_id"),
        )
        op.create_index("ix_plugin_types_type_id", "plugin_types", ["type_id"], unique=False)

    # Create plugins table if it doesn't exist
    if "plugins" not in existing_tables:
        op.create_table(
            "plugins",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("type_id", sa.String(), nullable=False),
            sa.Column("plugin_type", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("version", sa.String(), nullable=True),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default="1"),
            sa.Column("config", sa.String(), nullable=True),
            sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_plugins_id", "plugins", ["id"], unique=False)
        op.create_index("ix_plugins_type_id", "plugins", ["type_id"], unique=False)
        op.create_index("ix_plugins_plugin_type", "plugins", ["plugin_type"], unique=False)


def downgrade() -> None:
    """Downgrade schema - this migration only creates tables, so downgrade does nothing."""
    # This migration is idempotent and only creates missing tables
    # Downgrade would require tracking which tables were created, which we don't do
    pass
