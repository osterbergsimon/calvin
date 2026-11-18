"""Add power_hold and agent_features to the kiosks table.

``power_hold`` is a screen-power choice that holds until it is changed, set by
home automation or Settings through the screen-power route. It has its own
column, not the override layer, so a Settings save cannot wipe it and a backup
does not carry it. ``agent_features`` is what the display agent reports it
understands (``kfeat`` on its config poll), so Settings can tell which screens
cannot hold yet (calvin-2ifv).

Revision ID: b8e2f4a6c9d1
Revises: a7d4e1f8c2b9
Create Date: 2026-11-18
"""

import sqlalchemy as sa

from alembic import op

revision = "b8e2f4a6c9d1"
down_revision = "a7d4e1f8c2b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("kiosks", sa.Column("power_hold", sa.JSON(), nullable=True))
    op.add_column("kiosks", sa.Column("agent_features", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("kiosks", "agent_features")
    op.drop_column("kiosks", "power_hold")
