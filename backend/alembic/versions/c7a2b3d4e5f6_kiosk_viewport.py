"""Add viewport column to the kiosks table.

Kiosks report their CSS viewport (`window.innerWidth`/`innerHeight`) on the
existing config poll. The layout editor previews a screen at its real aspect
ratio instead of a fixed 16:9/9:16 box (CLV-36).

Revision ID: c7a2b3d4e5f6
Revises: 8f3a1c5d7e20
Create Date: 2026-10-30
"""

import sqlalchemy as sa

from alembic import op

revision = "c7a2b3d4e5f6"
down_revision = "8f3a1c5d7e20"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("kiosks", sa.Column("viewport", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("kiosks", "viewport")
