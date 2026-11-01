"""Add display_stack column to the kiosks table.

The display agent knows whether it drives the panel through X11, Wayland or cog
and already reports its version on the config poll. Storing the stack lets
Settings › Screens say what each kiosk actually runs (calvin-2ibz).

Revision ID: a4d7e2c9b813
Revises: c7a2b3d4e5f6
Create Date: 2026-11-01
"""

import sqlalchemy as sa

from alembic import op

revision = "a4d7e2c9b813"
down_revision = "c7a2b3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("kiosks", sa.Column("display_stack", sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column("kiosks", "display_stack")
