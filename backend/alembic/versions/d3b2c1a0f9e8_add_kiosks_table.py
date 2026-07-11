"""Add kiosks table (per-device registry + sparse overrides).

Keystone for the per-kiosk settings model (calvin-dd9.2). Stores one row per
known kiosk: stable id, reported hostname, last-seen, the device-config version
the display-agent last applied, and a sparse per-kiosk config overrides blob
(the latter two consumed by dd9.3).

Revision ID: d3b2c1a0f9e8
Revises: c2a1d0e5f6a7
Create Date: 2026-07-11
"""

import sqlalchemy as sa

from alembic import op

revision = "d3b2c1a0f9e8"
down_revision = "c2a1d0e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "kiosks",
        sa.Column("id", sa.String(length=255), nullable=False),
        sa.Column("hostname", sa.String(length=255), nullable=True),
        sa.Column("last_seen", sa.DateTime(), nullable=False),
        sa.Column("last_applied_version", sa.String(length=64), nullable=True),
        sa.Column("overrides", sa.JSON(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_kiosks_id", "kiosks", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_kiosks_id", table_name="kiosks")
    op.drop_table("kiosks")
