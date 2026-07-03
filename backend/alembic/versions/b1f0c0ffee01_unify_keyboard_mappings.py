"""Unify keyboard mappings: keep active type's rows, drop keyboard_type.

Revision ID: b1f0c0ffee01
Revises: 7b0d79d6ae0c
Create Date: 2026-07-03
"""

import sqlalchemy as sa

from alembic import op

revision = "b1f0c0ffee01"
down_revision = "7b0d79d6ae0c"
branch_labels = None
depends_on = None


def _active_keyboard_type(conn) -> str:
    """Read the active keyboard type from the config table; default '7-button'."""
    try:
        row = conn.execute(
            sa.text("SELECT value FROM config WHERE key = 'keyboard_type'")
        ).fetchone()
    except Exception:
        return "7-button"
    if not row or row[0] is None:
        return "7-button"
    # config values are stored serialized; strip JSON quotes if present.
    value = str(row[0]).strip().strip('"')
    return value or "7-button"


def upgrade() -> None:
    conn = op.get_bind()
    active = _active_keyboard_type(conn)

    # Keep only the active type's rows. If the active type has no rows,
    # fall back to whatever rows exist (do not wipe the table).
    count = conn.execute(
        sa.text("SELECT COUNT(*) FROM keyboard_mappings WHERE keyboard_type = :t"),
        {"t": active},
    ).scalar()
    if count and count > 0:
        conn.execute(
            sa.text("DELETE FROM keyboard_mappings WHERE keyboard_type != :t"),
            {"t": active},
        )

    with op.batch_alter_table("keyboard_mappings") as batch_op:
        batch_op.drop_column("keyboard_type")


def downgrade() -> None:
    with op.batch_alter_table("keyboard_mappings") as batch_op:
        batch_op.add_column(
            sa.Column(
                "keyboard_type", sa.String(length=50), nullable=False, server_default="7-button"
            )
        )
