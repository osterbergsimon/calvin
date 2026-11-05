"""Add display_check column to the kiosks table.

The latest display-check run for a screen: what an admin asked for and what the
display agent reported back (calvin-29ws).

Revision ID: e5b8c1d2f3a4
Revises: a4d7e2c9b813
Create Date: 2026-11-05
"""

import sqlalchemy as sa

from alembic import op

revision = "e5b8c1d2f3a4"
down_revision = "a4d7e2c9b813"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("kiosks", sa.Column("display_check", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("kiosks", "display_check")
